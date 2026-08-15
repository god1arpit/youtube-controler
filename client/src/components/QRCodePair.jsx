import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { API_BASE_URL, MOBILE_ORIGIN } from "../services/api";

function QRCodePair({ sessionId }) {
  const [serverIp, setServerIp] = useState("");

  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname
  );

  useEffect(() => {
    // Local development only
    if (!isLocalhost) return;

    fetch(`${API_BASE_URL}/api/server-ip`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data?.ip) {
          setServerIp(data.ip);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch server IP:", err);
      });
  }, [isLocalhost]);

  let mobileUrl;

  if (isLocalhost && serverIp) {
    // Local development:
    // Phone and laptop must be on the same Wi-Fi.
    const protocol = window.location.protocol;
    const port = window.location.port || "5173";

    mobileUrl =
      `${protocol}//${serverIp}:${port}/mobile?session=${encodeURIComponent(
        sessionId
      )}`;
  } else {
    // Production:
    // Open the deployed Netlify frontend.
    mobileUrl =
      `${MOBILE_ORIGIN}/mobile?session=${encodeURIComponent(sessionId)}`;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "15px",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: "1.2rem",
          color: "#e2e8f0",
          fontWeight: "500",
        }}
      >
        Scan to Control
      </h3>

      <div
        style={{
          background: "#fff",
          padding: "12px",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          display: "inline-block",
        }}
      >
        <QRCode
          value={mobileUrl}
          size={150}
          style={{ display: "block" }}
        />
      </div>

      <p
        style={{
          margin: 0,
          fontSize: "0.9rem",
          color: "#94a3b8",
        }}
      >
        Session:{" "}
        <strong
          style={{
            color: "#8b5cf6",
            fontSize: "1.1rem",
            letterSpacing: "1px",
          }}
        >
          {sessionId}
        </strong>
      </p>

      <div
        style={{
          width: "100%",
          maxWidth: "360px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "10px",
          padding: "10px 12px",
        }}
      >
        <p
          style={{
            margin: "0 0 6px",
            fontSize: "0.75rem",
            color: "#94a3b8",
          }}
        >
          {isLocalhost
            ? "Scan this QR code from a phone connected to the same Wi-Fi:"
            : "Scan this QR code to open the remote controller:"}
        </p>

        <a
          href={mobileUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            color: "#a78bfa",
            fontSize: "0.78rem",
            wordBreak: "break-all",
          }}
        >
          {mobileUrl}
        </a>
      </div>
    </div>
  );
}

export default QRCodePair;
}

export default QRCodePair;
