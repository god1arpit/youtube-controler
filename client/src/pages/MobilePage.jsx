import { useEffect, useState, useRef } from "react";
import socket from "../services/socket";
import { apiUrl } from "../services/api";

// Curated high-fidelity YouTube tracks for Demo Mode
const DEMO_FEED_UPLOADS = [
  { id: "jfKfPfyJRdk", title: "lofi hip hop radio 🌌 beats to relax/study to", author: "Lofi Girl", duration: "LIVE", thumbnail: "https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg" },
  { id: "5qap5aO4i9A", title: "Lofi Hip Hop Mix 2024 ☕ beats to study, relax, sleep", author: "Lofi Girl", duration: "2:30:15", thumbnail: "https://img.youtube.com/vi/5qap5aO4i9A/hqdefault.jpg" },
  { id: "4xDzrJKXOOY", title: "Synthwave Radio 🌌 beats to chill/game to", author: "Lofi Girl", duration: "LIVE", thumbnail: "https://img.youtube.com/vi/4xDzrJKXOOY/hqdefault.jpg" },
  { id: "tntOCGkgt98", title: "Deep Focus Coding Beats 💻 Chill Programming Music", author: "Lofi Studio", duration: "3:01:24", thumbnail: "https://img.youtube.com/vi/tntOCGkgt98/hqdefault.jpg" },
];

const DEMO_FEED_LIKES = [
  { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up (Official Music Video)", author: "Rick Astley", duration: "3:34", thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
  { id: "9bZkp7q19f0", title: "PSY - GANGNAM STYLE(강남스타일) M/V", author: "officialpsy", duration: "4:12", thumbnail: "https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg" },
  { id: "hT_nvWreIhg", title: "OneRepublic - Counting Stars (Official Music Video)", author: "OneRepublic", duration: "4:43", thumbnail: "https://img.youtube.com/vi/hT_nvWreIhg/hqdefault.jpg" },
  { id: "kJQP7kiw5Fk", title: "Luis Fonsi - Despacito ft. Daddy Yankee", author: "LuisFonsiVEVO", duration: "4:41", thumbnail: "https://img.youtube.com/vi/kJQP7kiw5Fk/hqdefault.jpg" },
];

const MOOD_PRESETS = [
  { label: "Workout", emoji: "⚡", queries: ["Punjabi workout songs", "high energy hip hop", "gym motivation songs", "power workout music"] },
  { label: "Chill", emoji: "🌙", queries: ["lofi chill beats", "late night Punjabi songs", "chill R&B songs", "acoustic chill songs"] },
  { label: "Drive", emoji: "🚗", queries: ["Punjabi road trip songs", "Hindi travel songs", "upbeat driving songs", "desi party songs"] },
  { label: "Focus", emoji: "🎧", queries: ["deep focus instrumental", "lofi beats for studying", "calm coding music", "ambient focus music"] },
];

function MobilePage() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");

  const [playbackState, setPlaybackState] = useState(null);
  const [activeTab, setActiveTab] = useState("remote");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeMood, setActiveMood] = useState(null);
  const [isArtistShuffleLoading, setIsArtistShuffleLoading] = useState(false);
  const [audioOutput, setAudioOutput] = useState("laptop");
  const [phoneAudioTrack, setPhoneAudioTrack] = useState(null);

  // Google Authentication State
  const [authStatus, setAuthStatus] = useState({ authenticated: false, name: "", picture: "" });
  const [demoMode, setDemoMode] = useState(false);
  const [likedFeed, setLikedFeed] = useState([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);

  // Local drag state for timeline seeking to avoid slider jumping
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [localTimelineValue, setLocalTimelineValue] = useState(0);

  // Local drag state for volume to avoid volume slider lag
  const [localVolumeValue, setLocalVolumeValue] = useState(50);

  // Favorites State (stored in localStorage)
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("yt_remote_favorites") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("yt_remote_favorites", JSON.stringify(favorites));
  }, [favorites]);


  useEffect(() => {
    const activeVideo = playbackState?.video;
    if (audioOutput === "phone" && activeVideo?.id) {
      setPhoneAudioTrack((track) => (
        track?.id === activeVideo.id
          ? track
          : { id: activeVideo.id, startAt: Math.floor(playbackState.currentTime || 0) }
      ));
    }
  }, [audioOutput, playbackState?.video?.id]);

  const isFavorite = (videoId) => favorites.some((v) => v.id === videoId);

  const toggleFavorite = (video) => {
    if (!video || !video.id) return;
    setFavorites((prev) => {
      const exists = prev.some((v) => v.id === video.id);
      if (exists) {
        return prev.filter((v) => v.id !== video.id);
      } else {
        return [
          ...prev,
          {
            id: video.id,
            title: video.title,
            author: video.author,
            duration: video.duration || "Favorite",
            thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
          },
        ];
      }
    });
  };

  // Check auth status
  const checkAuthStatus = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(apiUrl(`/api/youtube/status?session=${encodeURIComponent(sessionId)}`));
      const data = await res.json();
      setAuthStatus(data);
    } catch (err) {
      console.warn("Could not check Mobile auth status:", err);
    }
  };

  const fetchLikedSongs = async () => {
    setIsLoadingFeed(true);
    try {
      const likedRes = await fetch(apiUrl(`/api/youtube/liked?session=${encodeURIComponent(sessionId)}`));
      const likedData = await likedRes.json();
      if (Array.isArray(likedData)) {
        setLikedFeed(likedData);
      }
    } catch (err) {
      console.error("Error fetching personal feeds:", err);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      socket.emit("join-room", sessionId);
      socket.emit("request-sync", sessionId);
      checkAuthStatus();

      socket.on("state-update", (state) => {
        setPlaybackState(state);
        if (!isDraggingTimeline) {
          setLocalTimelineValue(state.currentTime);
        }
        setLocalVolumeValue(state.volume);
      });

      // Listen for authentication success or logout
      socket.on("auth-success", (profile) => {
        if (profile) {
          setAuthStatus({ authenticated: true, name: profile.name, picture: profile.picture });
          setDemoMode(false);
        } else {
          setAuthStatus({ authenticated: false, name: "", picture: "" });
        }
      });

      // Periodic request sync
      const syncInterval = setInterval(() => {
        socket.emit("request-sync", sessionId);
      }, 5000);

      return () => {
        socket.off("state-update");
        socket.off("auth-success");
        clearInterval(syncInterval);
      };
    }
  }, [sessionId, isDraggingTimeline]);

  // Retrieve feeds when authenticated
  useEffect(() => {
    if (authStatus.authenticated) {
      fetchLikedSongs();
    }
  }, [authStatus.authenticated]);

  const sendCommand = (type, value = null) => {
    socket.emit("command", {
      roomId: sessionId,
      command: { type, value },
    });
  };

  const handleGoogleLogin = () => {
    const oauthUrl = apiUrl(`/auth/google?session=${encodeURIComponent(sessionId)}`);
    const width = 500;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      oauthUrl,
      "Google Login",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );
  };

  const handleGoogleLogout = async () => {
    try {
      await fetch(apiUrl(`/api/youtube/logout?session=${encodeURIComponent(sessionId)}`));
      setAuthStatus({ authenticated: false, name: "", picture: "" });
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  const handlePlayNow = (video) => {
    sendCommand("play-now", video);
    setActiveTab("remote");
  };

  const handleAddToQueue = (video) => {
    sendCommand("add-to-queue", video);
  };

  const switchAudioOutput = (output) => {
    if (output === "phone") {
      if (!currentVideo) {
        alert("Start a video before moving sound to your phone.");
        return;
      }
      setPhoneAudioTrack({ id: currentVideo.id, startAt: Math.floor(localTimelineValue) });
      sendCommand("mute");
    } else {
      setPhoneAudioTrack(null);
      sendCommand("unmute");
    }
    setAudioOutput(output);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(searchQuery)}`));
      const data = await res.json();
      if (Array.isArray(data)) {
        setSearchResults(data);
      } else {
        console.error("Search failed, invalid format:", data);
      }
    } catch (err) {
      console.error("Error searching YouTube:", err);
      alert("Failed to search YouTube. Check server status.");
    } finally {
      setIsSearching(false);
    }
  };

  const startMoodDJ = async (mood) => {
    setActiveMood(mood.label);
    try {
      const groups = await Promise.all(
        mood.queries.map(async (query) => {
          const response = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(query)}`));
          const videos = await response.json();
          return Array.isArray(videos) ? videos : [];
        })
      );

      const playlist = [];
      const seen = new Set();
      for (const videos of groups) {
        const choice = videos.find((video) => video.id && !seen.has(video.id));
        if (choice) {
          seen.add(choice.id);
          playlist.push(choice);
        }
      }

      if (!playlist.length) throw new Error("No matching tracks found");

      setSearchResults(playlist);
      setSearchQuery(`${mood.label} Mood DJ`);
      sendCommand("play-now", playlist[0]);
      playlist.slice(1).forEach((video) => sendCommand("add-to-queue", video));
      setActiveTab("remote");
    } catch (err) {
      console.error("Mood DJ failed:", err);
      alert("Mood DJ could not find tracks. Please try again.");
    } finally {
      setActiveMood(null);
    }
  };

  const shuffle = (items) => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  };

  const startArtistShuffle = async () => {
    const artist = searchQuery.trim();
    if (!artist) {
      alert("Enter an artist name first, for example Sidhu Moose Wala.");
      return;
    }

    setIsArtistShuffleLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(`${artist} official songs`)}`));
      const videos = await response.json();
      if (!Array.isArray(videos) || !videos.length) throw new Error("No artist songs found");

      const artistWords = artist.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
      const artistMatches = videos.filter((video) => {
        const text = `${video.title} ${video.author}`.toLowerCase();
        return artistWords.some((word) => text.includes(word));
      });
      const playlist = shuffle(artistMatches.length >= 2 ? artistMatches : videos).slice(0, 25);
      if (!playlist.length) throw new Error("No playable artist songs found");

      setSearchResults(playlist);
      sendCommand("play-now", playlist[0]);
      playlist.slice(1).forEach((video) => sendCommand("add-to-queue", video));
      setActiveTab("remote");
    } catch (err) {
      console.error("Artist Shuffle failed:", err);
      alert("Artist Shuffle could not find songs. Try a more specific artist name.");
    } finally {
      setIsArtistShuffleLoading(false);
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  if (!sessionId) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "20px",
          background: "#07090e",
          textAlign: "center",
        }}
      >
        <h1 style={{ color: "#ef4444" }}>No Session Found</h1>
        <p style={{ color: "#94a3b8" }}>Scan the QR Code on your laptop to connect.</p>
      </div>
    );
  }

  const isConnected = !!playbackState;
  const currentVideo = playbackState?.video;
  const duration = playbackState?.duration || 0;
  const status = playbackState?.status || "unstarted";
  const isPlaying = status === "playing";
  const isMuted = playbackState?.muted || false;
  const queue = playbackState?.queue || [];
  const currentQueueIndex = playbackState?.currentQueueIndex ?? -1;

  // Personalization feed mapping
  const isLinked = authStatus.authenticated;
  const feedList = isLinked ? likedFeed : DEMO_FEED_LIKES;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#090d16",
        color: "#f8fafc",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        maxWidth: "480px",
        margin: "0 auto",
        boxShadow: "0 0 40px rgba(0,0,0,0.8)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: "600" }}>YouTube Controller</h2>
          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Room ID: {sessionId}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: isConnected ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            padding: "4px 10px",
            borderRadius: "99px",
            border: isConnected ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: isConnected ? "#10b981" : "#ef4444",
            }}
          />
          <span style={{ fontSize: "0.75rem", fontWeight: "600", color: isConnected ? "#10b981" : "#ef4444" }}>
            {isConnected ? "Connected" : "Syncing..."}
          </span>
        </div>
      </div>

      {/* Tabs Menu */}
      <div
        style={{
          display: "flex",
          background: "rgba(255, 255, 255, 0.03)",
          borderRadius: "12px",
          padding: "4px",
          margin: "16px 0",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}
      >
        {["remote", "search", "my feed", "queue"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              background: activeTab === tab ? "#8b5cf6" : "transparent",
              border: "none",
              color: activeTab === tab ? "#fff" : "#94a3b8",
              padding: "10px 4px",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: "600",
              textTransform: "capitalize",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {tab}
            {tab === "queue" && queue.length > 0 && ` (${queue.length})`}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        
        {/* REMOTE TAB */}
        {activeTab === "remote" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "25px", flex: 1, justifyContent: "center" }}>
            {/* Now Playing Card */}
            {currentVideo ? (
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "20px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
                }}
              >
                <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                  <img
                    src={currentVideo.thumbnail}
                    alt={currentVideo.title}
                    style={{
                      width: "90px",
                      height: "55px",
                      borderRadius: "8px",
                      objectFit: "cover",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: "600",
                        color: "#fff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        lineHeight: "1.3",
                      }}
                    >
                      {currentVideo.title}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
                      {currentVideo.author}
                    </div>
                  </div>
                </div>

                {/* Timeline slider */}
                <div style={{ marginTop: "5px" }}>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={localTimelineValue}
                    onChange={(e) => {
                      setIsDraggingTimeline(true);
                      setLocalTimelineValue(Number(e.target.value));
                    }}
                    onMouseUp={() => {
                      setIsDraggingTimeline(false);
                      sendCommand("seek", localTimelineValue);
                    }}
                    onTouchEnd={() => {
                      setIsDraggingTimeline(false);
                      sendCommand("seek", localTimelineValue);
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.75rem",
                      color: "#64748b",
                      marginTop: "6px",
                    }}
                  >
                    <span>{formatTime(localTimelineValue)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "20px",
                  border: "1px dashed rgba(255,255,255,0.05)",
                  color: "#64748b",
                }}
              >
                No video playing. Search YouTube to begin.
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "14px", padding: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: "600" }}>AUDIO OUTPUT</span>
                <span style={{ fontSize: "0.75rem", color: audioOutput === "phone" ? "#34d399" : "#a78bfa" }}>
                  {audioOutput === "phone" ? "Playing on phone" : "Playing on laptop"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <button
                  onClick={() => switchAudioOutput("laptop")}
                  style={{ background: audioOutput === "laptop" ? "#8b5cf6" : "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", padding: "9px", cursor: "pointer", fontWeight: "600" }}
                >
                  💻 Laptop
                </button>
                <button
                  onClick={() => switchAudioOutput("phone")}
                  disabled={!currentVideo}
                  style={{ background: audioOutput === "phone" ? "#8b5cf6" : "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: currentVideo ? "#fff" : "#64748b", padding: "9px", cursor: currentVideo ? "pointer" : "not-allowed", fontWeight: "600" }}
                >
                  📱 Phone
                </button>
              </div>
              {phoneAudioTrack && (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: "0.75rem", color: "#94a3b8", textAlign: "center" }}>
                    If sound does not start automatically, tap Play in this player once.
                  </p>
                  <iframe
                    key={`${phoneAudioTrack.id}-${phoneAudioTrack.startAt}`}
                    title="Phone audio player"
                    src={`https://www.youtube.com/embed/${phoneAudioTrack.id}?autoplay=1&start=${phoneAudioTrack.startAt}&playsinline=1&rel=0`}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    style={{ width: "100%", aspectRatio: "16 / 9", border: "0", borderRadius: "10px", display: "block", background: "#000" }}
                  />
                </div>
              )}
            </div>

            {/* D-Pad controls */}
            <div style={{ display: "flex", justifyContent: "center", margin: "15px 0" }}>
              <div
                style={{
                  width: "220px",
                  height: "220px",
                  borderRadius: "50%",
                  background: "radial-gradient(circle, #1e1b4b 0%, #0f0e26 100%)",
                  boxShadow: "0 15px 35px rgba(0, 0, 0, 0.5), inset 0 2px 5px rgba(255, 255, 255, 0.05)",
                  border: "2px solid rgba(139, 92, 246, 0.2)",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Previous Video (Top) */}
                <button
                  onClick={() => sendCommand("prev")}
                  style={{
                    position: "absolute",
                    top: "12px",
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "1.4rem",
                    cursor: "pointer",
                    padding: "10px",
                  }}
                  title="Previous video"
                >
                  ⏮
                </button>

                {/* Seek Backward (Left) */}
                <button
                  onClick={() => sendCommand("seek", Math.max(localTimelineValue - 10, 0))}
                  style={{
                    position: "absolute",
                    left: "12px",
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "1.4rem",
                    cursor: "pointer",
                    padding: "10px",
                  }}
                  title="Rewind 10s"
                >
                  ⏪
                </button>

                {/* Play/Pause Button (Center) */}
                <button
                  onClick={() => sendCommand(isPlaying ? "pause" : "play")}
                  style={{
                    width: "75px",
                    height: "75px",
                    borderRadius: "50%",
                    border: "none",
                    background: isPlaying ? "#ef4444" : "#8b5cf6",
                    color: "#fff",
                    fontSize: "1.8rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isPlaying ? "0 0 20px rgba(239, 68, 68, 0.4)" : "0 0 20px rgba(139, 92, 246, 0.4)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>

                {/* Seek Forward (Right) */}
                <button
                  onClick={() => sendCommand("seek", Math.min(localTimelineValue + 10, duration))}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "1.4rem",
                    cursor: "pointer",
                    padding: "10px",
                  }}
                  title="Forward 10s"
                >
                  ⏩
                </button>

                {/* Next Video (Bottom) */}
                <button
                  onClick={() => sendCommand("next")}
                  style={{
                    position: "absolute",
                    bottom: "12px",
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "1.4rem",
                    cursor: "pointer",
                    padding: "10px",
                  }}
                  title="Next video"
                >
                  ⏭
                </button>
              </div>
            </div>

            {/* Volume controls */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.04)",
                padding: "14px 20px",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                gap: "15px",
              }}
            >
              <button
                onClick={() => sendCommand(isMuted ? "unmute" : "mute")}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.3rem",
                  color: isMuted ? "#ef4444" : "#8b5cf6",
                  cursor: "pointer",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isMuted || localVolumeValue === 0 ? "🔇" : localVolumeValue < 40 ? "🔈" : "🔊"}
              </button>

              <input
                type="range"
                min={0}
                max={100}
                value={localVolumeValue}
                onChange={(e) => {
                  setLocalVolumeValue(Number(e.target.value));
                  sendCommand("volume", Number(e.target.value));
                }}
                style={{ flex: 1 }}
              />

              <span style={{ fontSize: "0.85rem", color: "#64748b", minWidth: "32px", textAlign: "right" }}>
                {localVolumeValue}%
              </span>
            </div>
          </div>
        )}

        {/* SEARCH TAB */}
        {activeTab === "search" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.8rem", color: "#a78bfa", fontWeight: "700", letterSpacing: "0.4px", marginBottom: "8px" }}>MOOD DJ</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                {MOOD_PRESETS.map((mood) => (
                  <button
                    key={mood.label}
                    onClick={() => startMoodDJ(mood)}
                    disabled={Boolean(activeMood)}
                    style={{
                      background: activeMood === mood.label ? "#8b5cf6" : "rgba(139, 92, 246, 0.10)",
                      border: "1px solid rgba(139, 92, 246, 0.28)",
                      borderRadius: "10px",
                      padding: "10px",
                      color: "#e9d5ff",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                      cursor: activeMood ? "wait" : "pointer",
                    }}
                  >
                    {activeMood === mood.label ? "Building mix..." : `${mood.emoji} ${mood.label}`}
                  </button>
                ))}
              </div>
            </div>
            {/* Search Input */}
            <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search YouTube..."
                style={{
                  flex: 1,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  color: "#fff",
                  fontSize: "0.95rem",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={isSearching}
                style={{
                  background: "#8b5cf6",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0 16px",
                  color: "#fff",
                  fontSize: "0.95rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {isSearching ? "..." : "🔍"}
              </button>
            </form>
            <button
              onClick={startArtistShuffle}
              disabled={isArtistShuffleLoading || isSearching}
              style={{
                width: "100%",
                marginTop: "-8px",
                marginBottom: "16px",
                padding: "11px 14px",
                background: "linear-gradient(135deg, #7c3aed, #db2777)",
                border: "none",
                borderRadius: "10px",
                color: "#fff",
                fontSize: "0.9rem",
                fontWeight: "700",
                cursor: isArtistShuffleLoading || isSearching ? "wait" : "pointer",
              }}
            >
              {isArtistShuffleLoading ? "Finding and shuffling songs..." : "🎲 Play Artist in Random Order"}
            </button>

            {/* Results */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>
              {isSearching ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Searching YouTube...</div>
              ) : searchResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                  Search for songs, mixes, artists, etc.
                </div>
              ) : (
                searchResults.map((video) => (
                  <div
                    key={video.id}
                    style={{
                      display: "flex",
                      gap: "12px",
                      padding: "10px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.04)",
                      borderRadius: "12px",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ position: "relative", width: "80px", height: "45px", borderRadius: "6px", overflow: "hidden", flexShrink: 0 }}>
                      <img src={video.thumbnail} alt={video.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div
                        style={{
                          position: "absolute",
                          bottom: "2px",
                          right: "4px",
                          background: "rgba(0,0,0,0.8)",
                          padding: "1px 4px",
                          borderRadius: "3px",
                          fontSize: "0.7rem",
                          color: "#fff",
                        }}
                      >
                        {video.duration}
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: "500",
                          color: "#f1f5f9",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {video.title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                        {video.author}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <button
                        onClick={() => handlePlayNow(video)}
                        style={{
                          background: "#8b5cf6",
                          border: "none",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          color: "#fff",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Play
                      </button>
                      <button
                        onClick={() => handleAddToQueue(video)}
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "6px",
                          padding: "6px 8px",
                          color: "#e2e8f0",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        +Q
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* MY FEED TAB */}
        {activeTab === "my feed" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {/* If NOT linked and NOT in demo mode, show link unlock card */}
            {!isLinked && !demoMode ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  background: "rgba(255, 255, 255, 0.02)",
                  borderRadius: "20px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  textAlign: "center",
                  gap: "20px",
                  margin: "auto 0",
                }}
              >
                <div style={{ fontSize: "2.5rem" }}>🔒</div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#fff" }}>YouTube Personalization</h3>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#94a3b8", lineHeight: "1.6" }}>
                  Sign in with Google to view songs you have liked on YouTube, or activate Demo Mode to browse curated playlists.
                </p>

                <button
                  onClick={handleGoogleLogin}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    width: "100%",
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#e2e8f0",
                    fontSize: "0.9rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.15)";
                    e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.87-2.6-2.24-4.53-5.01-4.53z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </button>

                <div style={{ width: "100%", height: "1px", background: "rgba(255,255,255,0.06)", margin: "5px 0" }}></div>
                
                <button
                  onClick={() => setDemoMode(true)}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "1px solid rgba(139, 92, 246, 0.4)",
                    borderRadius: "12px",
                    padding: "12px",
                    color: "#a78bfa",
                    fontSize: "0.95rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  Activate Demo Mode
                </button>
              </div>
            ) : (
              // Linked or Demo mode content
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                {isLinked && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 16px",
                      borderRadius: "14px",
                      background: "rgba(16, 185, 129, 0.05)",
                      border: "1px solid rgba(16, 185, 129, 0.2)",
                      marginBottom: "15px",
                    }}
                  >
                    {authStatus.picture ? (
                      <img
                        src={authStatus.picture}
                        alt={authStatus.name}
                        style={{ width: "36px", height: "36px", borderRadius: "50%", border: "2px solid #10b981" }}
                      />
                    ) : (
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "600", fontSize: "1.1rem" }}>
                        {authStatus.name ? authStatus.name.charAt(0) : "Y"}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {authStatus.name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: "500" }}>Connected</div>
                    </div>
                    <button
                      onClick={handleGoogleLogout}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#ef4444",
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        fontWeight: "600",
                      }}
                    >
                      Unlink
                    </button>
                  </div>
                )}
                <div style={{ marginBottom: "15px", color: "#a78bfa", fontSize: "0.95rem", fontWeight: "600" }}>
                  {isLinked ? "Your Liked Songs" : "Demo Songs"}
                </div>

                {/* Demo Mode Notice */}
                {!isLinked && (
                  <div
                    style={{
                      background: "rgba(251, 191, 36, 0.05)",
                      border: "1px solid rgba(251, 191, 36, 0.15)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "0.75rem",
                      color: "#fbbf24",
                      marginBottom: "12px",
                      textAlign: "center",
                    }}
                  >
                    Showing Demo feeds. Connect your account on the PC to unlock.
                  </div>
                )}

                {/* Feed Video list */}
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>
                  {isLoadingFeed ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading feed...</div>
                  ) : feedList.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                      No videos found in this feed.
                    </div>
                  ) : (
                    feedList.map((video) => (
                      <div
                        key={video.id}
                        style={{
                          display: "flex",
                          gap: "12px",
                          padding: "10px",
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.04)",
                          borderRadius: "12px",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ position: "relative", width: "80px", height: "45px", borderRadius: "6px", overflow: "hidden", flexShrink: 0 }}>
                          <img src={video.thumbnail} alt={video.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <div
                            style={{
                              position: "absolute",
                              bottom: "2px",
                              right: "4px",
                              background: "rgba(0,0,0,0.8)",
                              padding: "1px 4px",
                              borderRadius: "3px",
                              fontSize: "0.7rem",
                              color: "#fff",
                            }}
                          >
                            {video.duration}
                          </div>
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "0.85rem",
                              fontWeight: "500",
                              color: "#f1f5f9",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {video.title}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                            {video.author}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                          <button
                            onClick={() => handlePlayNow(video)}
                            style={{
                              background: "#8b5cf6",
                              border: "none",
                              borderRadius: "6px",
                              padding: "6px 10px",
                              color: "#fff",
                              fontSize: "0.8rem",
                              fontWeight: "600",
                              cursor: "pointer",
                            }}
                          >
                            Play
                          </button>
                          <button
                            onClick={() => handleAddToQueue(video)}
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              borderRadius: "6px",
                              padding: "6px 8px",
                              color: "#e2e8f0",
                              fontSize: "0.8rem",
                              fontWeight: "600",
                              cursor: "pointer",
                            }}
                          >
                            +Q
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* QUEUE TAB */}
        {activeTab === "queue" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {queue.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                <button
                  onClick={() => sendCommand("clear-queue")}
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "8px",
                    padding: "6px 12px",
                    color: "#ef4444",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Clear Queue
                </button>
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" }}>
              {queue.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                  Queue is empty. Go to search to add videos.
                </div>
              ) : (
                queue.map((item, idx) => {
                  const isActive = idx === currentQueueIndex;
                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      onClick={() => sendCommand("play-from-queue", idx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        background: isActive ? "rgba(139, 92, 246, 0.12)" : "rgba(255, 255, 255, 0.02)",
                        border: isActive ? "1px solid rgba(139, 92, 246, 0.3)" : "1px solid rgba(255, 255, 255, 0.04)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ width: "20px", fontSize: "0.8rem", color: "#64748b", textAlign: "center" }}>
                        {idx + 1}
                      </div>

                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        style={{ width: "50px", height: "30px", borderRadius: "4px", objectFit: "cover" }}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            fontWeight: isActive ? "600" : "400",
                            color: isActive ? "#a78bfa" : "#f1f5f9",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.title}
                        </div>
                      </div>

                      {isActive ? (
                        <div style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: "600", marginRight: "4px" }}>
                          PLAYING
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sendCommand("remove-from-queue", idx);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#ef4444",
                            fontSize: "1.2rem",
                            cursor: "pointer",
                            padding: "0 6px",
                          }}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MobilePage;
