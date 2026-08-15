const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Manual dotenv parser (to avoid installing external packages)
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf8");
    envConfig.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value.trim();
      }
    });
    console.log("Loaded environment from .env");
  }
} catch (err) {
  console.warn("Could not load .env file:", err.message);
}

const socketHandler = require("./sockets/socketHandler");
const searchYouTube = require("./utils/youtubeSearch");

const app = express();
app.use(cors());
// Needed when the app is deployed behind an HTTPS reverse proxy.
app.set("trust proxy", 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// OAuth Session Cache: maps sessionId -> { accessToken, refreshToken, expiresAt, name, picture }
const userSessions = {};
// OAuth state is intentionally separate from the room id. A room id is short and
// guessable, so it must never be used directly as an OAuth CSRF token.
const pendingOAuthRequests = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getGoogleRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  
  const host = req.get("host") || "";
  // Force localhost redirect for raw local/private IP addresses
  if (/^(?:192\.168|172\.(?:1[6-9]|2\d|3[01])|10\.|127\.)/.test(host)) {
    return `http://localhost:5000/auth/google/callback`;
  }
  
  return `${req.protocol}://${host}/auth/google/callback`;
}

function cleanExpiredOAuthRequests() {
  const expiresBefore = Date.now() - OAUTH_STATE_TTL_MS;
  for (const [state, request] of pendingOAuthRequests) {
    if (request.createdAt < expiresBefore) pendingOAuthRequests.delete(state);
  }
}

// Helper to refresh access token if expired
async function getOrRefreshToken(sessionId) {
  const session = userSessions[sessionId];
  if (!session) return null;

  // If token is valid for at least 1 more minute, return it
  if (session.accessToken && session.expiresAt && session.expiresAt > Date.now() + 60000) {
    return session.accessToken;
  }

  // Attempt refresh if refresh token exists
  if (session.refreshToken) {
    try {
      console.log(`Refreshing access token for session: ${sessionId}`);
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) return null;

      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: session.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      });

      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        session.accessToken = refreshData.access_token;
        session.expiresAt = Date.now() + (refreshData.expires_in * 1000);
        return session.accessToken;
      } else {
        console.error("Refresh exchange returned error:", refreshData);
      }
    } catch (err) {
      console.error("Failed to refresh token:", err);
    }
  }

  return null;
}

// Helper to parse ISO 8601 duration (e.g. PT4M13S -> 4:13)
function parseISODuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "Unknown";
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;

  if (hours > 0) {
    return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

// Routes
app.get("/api/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  try {
    const results = await searchYouTube(query);
    res.json(results);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Failed to search YouTube" });
  }
});

// Initiates OAuth Flow
app.get("/auth/google", (req, res) => {
  const sessionId = req.query.session;
  if (!sessionId) {
    return res.status(400).send("Session ID is required");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.includes("your_client_id") || clientSecret.includes("your_client_secret")) {
    return res.send(`
      <html>
        <body style="font-family: 'Outfit', sans-serif; padding: 40px; background: #07090e; color: #f8fafc; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 500px;">
            <h2 style="color: #ef4444; margin-top: 0;">Google Credentials Missing</h2>
            <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6;">
              Please configure your Google Developer credentials in <strong>server/.env</strong> first:
            </p>
            <pre style="background: #111827; padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); text-align: left; overflow-x: auto; color: #a78bfa;">
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
            </pre>
            <p style="color: #64748b; font-size: 0.85rem; margin-top: 20px;">
              Restart the Node server after setting these variables.
            </p>
          </div>
        </body>
      </html>
    `);
  }

  cleanExpiredOAuthRequests();
  const redirectUri = getGoogleRedirectUri(req);
  const state = crypto.randomBytes(32).toString("base64url");
  pendingOAuthRequests.set(state, { sessionId, createdAt: Date.now() });
  const scope = [
    "openid",
    "profile",
    "email",
    "https://www.googleapis.com/auth/youtube.readonly",
  ].join(" ");
  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  res.redirect(oauthUrl);
});

// OAuth Callback Endpoint
app.get("/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Authentication error: ${error}`);
  }
  if (!code || !state || typeof state !== "string") {
    return res.status(400).send("Missing authentication code or session token.");
  }

  const oauthRequest = pendingOAuthRequests.get(state);
  pendingOAuthRequests.delete(state);
  if (!oauthRequest || oauthRequest.createdAt < Date.now() - OAUTH_STATE_TTL_MS) {
    return res.status(400).send("This sign-in request has expired. Please try again from the app.");
  }
  const sessionId = oauthRequest.sessionId;

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getGoogleRedirectUri(req);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      return res.status(400).send(`Google Token Exchange Error: ${tokenData.error_description || tokenData.error}`);
    }

    userSessions[sessionId] = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      name: "YouTube User",
      picture: "",
    };

    // Fetch profile picture/name
    try {
      const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();
      if (profile && !profile.error) {
        userSessions[sessionId].name = profile.name;
        userSessions[sessionId].picture = profile.picture;
      }
    } catch (pErr) {
      console.warn("Could not retrieve user info:", pErr.message);
    }

    // Broadcast success to all sockets in room
    io.to(sessionId).emit("auth-success", {
      name: userSessions[sessionId].name,
      picture: userSessions[sessionId].picture,
    });

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #07090e; color: #f8fafc; margin: 0; text-align: center;">
          <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); max-width: 400px; width: 85%;">
            <div style="width: 50px; height: 50px; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px auto; font-size: 1.5rem; color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2);">
              ✓
            </div>
            <h2 style="color: #10b981; margin-top: 0; font-weight: 600;">Sign-In Successful</h2>
            <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.5;">Your Google Account has been linked to your YouTube Remote control session!</p>
            <p style="color: #64748b; font-size: 0.8rem; margin-top: 25px;">This window will close automatically shortly.</p>
          </div>
          <script>
            setTimeout(() => { window.close(); }, 2500);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Callback OAuth exchange error:", err);
    res.status(500).send("Internal authentication exchange failure.");
  }
});

// Get Server Local IP Address for QR Code Pair
app.get("/api/server-ip", (req, res) => {
  const os = require("os");
  const interfaces = os.networkInterfaces();
  let fallbackIp = "localhost";

  const isVirtual = (name) => {
    const lower = name.toLowerCase();
    return (
      lower.includes("virtualbox") ||
      lower.includes("vmware") ||
      lower.includes("vbox") ||
      lower.includes("host-only") ||
      lower.includes("virtual") ||
      lower.includes("vethernet") ||
      lower.includes("vpn") ||
      lower.includes("loopback")
    );
  };

  // Phase 1: Prioritize Wi-Fi/Wireless interfaces
  for (const name of Object.keys(interfaces)) {
    if (isVirtual(name)) continue;
    const lowerName = name.toLowerCase();
    if (lowerName.includes("wi-fi") || lowerName.includes("wireless") || lowerName.includes("wlan")) {
      for (const net of interfaces[name]) {
        if (net.family === "IPv4" && !net.internal) {
          return res.json({ ip: net.address });
        }
      }
    }
  }

  // Phase 2: Fallback to physical Ethernet/LAN interfaces
  for (const name of Object.keys(interfaces)) {
    if (isVirtual(name)) continue;
    const lowerName = name.toLowerCase();
    if (lowerName.includes("ethernet") || lowerName.includes("lan")) {
      for (const net of interfaces[name]) {
        if (net.family === "IPv4" && !net.internal) {
          return res.json({ ip: net.address });
        }
      }
    }
  }

  // Phase 3: Final fallback
  for (const name of Object.keys(interfaces)) {
    if (isVirtual(name)) continue;
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        fallbackIp = net.address;
      }
    }
  }

  res.json({ ip: fallbackIp });
});

// Check Session Authentication Status
app.get("/api/youtube/status", async (req, res) => {
  const sessionId = req.query.session;
  if (!sessionId) return res.status(400).json({ error: "Missing session ID" });

  const session = userSessions[sessionId];
  if (session && session.accessToken) {
    const token = await getOrRefreshToken(sessionId);
    if (token) {
      return res.json({
        authenticated: true,
        name: session.name,
        picture: session.picture,
      });
    }
  }
  res.json({ authenticated: false });
});

// Logout / Unlink Google Session
app.get("/api/youtube/logout", (req, res) => {
  const sessionId = req.query.session;
  if (!sessionId) return res.status(400).json({ error: "Missing session ID" });

  if (userSessions[sessionId]) {
    delete userSessions[sessionId];
  }

  // Broadcast logout success to all sockets in room
  io.to(sessionId).emit("auth-success", null);

  res.json({ success: true });
});

// Get User's Subscription Feed uploads
app.get("/api/youtube/feed", async (req, res) => {
  const sessionId = req.query.session;
  if (!sessionId) return res.status(400).json({ error: "Missing session ID" });

  const token = await getOrRefreshToken(sessionId);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const apiRes = await fetch(
      "https://www.googleapis.com/youtube/v3/activities?mine=true&part=snippet,contentDetails&maxResults=25",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await apiRes.json();
    if (data.error) {
      return res.status(400).json({ error: data.error });
    }

    const videos = [];
    if (data.items) {
      for (const item of data.items) {
        if (item.snippet && item.contentDetails && item.contentDetails.upload) {
          const videoId = item.contentDetails.upload.videoId;
          videos.push({
            id: videoId,
            title: item.snippet.title || "Uploaded Video",
            author: item.snippet.channelTitle || "YouTube Channel",
            duration: "Upload Feed",
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          });
        }
      }
    }
    res.json(videos);
  } catch (err) {
    console.error("Error loading activities:", err);
    res.status(500).json({ error: "Failed to fetch activities feed" });
  }
});

// Get User's Liked Videos
app.get("/api/youtube/liked", async (req, res) => {
  const sessionId = req.query.session;
  if (!sessionId) return res.status(400).json({ error: "Missing session ID" });

  const token = await getOrRefreshToken(sessionId);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const apiRes = await fetch(
      "https://www.googleapis.com/youtube/v3/videos?myRating=like&part=snippet,contentDetails&maxResults=25",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await apiRes.json();
    if (data.error) {
      return res.status(400).json({ error: data.error });
    }

    const videos = [];
    if (data.items) {
      for (const item of data.items) {
        const videoId = item.id;
        let duration = "Unknown";
        if (item.contentDetails && item.contentDetails.duration) {
          duration = parseISODuration(item.contentDetails.duration);
        }
        videos.push({
          id: videoId,
          title: item.snippet?.title || "Liked Video",
          author: item.snippet?.channelTitle || "YouTube Channel",
          duration,
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        });
      }
    }
    res.json(videos);
  } catch (err) {
    console.error("Error loading liked videos:", err);
    res.status(500).json({ error: "Failed to fetch liked list" });
  }
});

socketHandler(io);

server.listen(5000, () => {
  console.log("Server running on port 5000");
});
