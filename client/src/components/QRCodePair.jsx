import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

function QRCodePair({ sessionId }) {
  const [serverIp, setServerIp] = useState("");

  useEffect(() => {
    const host = `${window.location.protocol}//${window.location.hostname}:5000`;
    fetch(`${host}/api/server-ip`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.ip) {
          setServerIp(data.ip);
        }
      })
      .catch((err) => console.warn("Could not fetch server IP:", err));
  }, []);

  const hostName = serverIp || window.location.hostname;
  const mobileUrl = `${window.location.protocol}//${hostName}:5173/mobile?session=${encodeURIComponent(sessionId)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
      <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#e2e8f0', fontWeight: '500' }}>Scan to Control</h3>
      <div style={{ background: '#fff', padding: '12px', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', display: 'inline-block' }}>
        <QRCode value={mobileUrl} size={150} style={{ display: 'block' }} />
      </div>
      <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
        Session: <strong style={{ color: '#8b5cf6', fontSize: '1.1rem', letterSpacing: '1px' }}>{sessionId}</strong>
      </p>
      <div style={{ width: '100%', maxWidth: '360px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 12px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '0.75rem', color: '#94a3b8' }}>Type this URL on a phone connected to the same Wi-Fi:</p>
        <a href={mobileUrl} style={{ display: 'block', color: '#a78bfa', fontSize: '0.78rem', wordBreak: 'break-all' }}>{mobileUrl}</a>
      </div>
    </div>
  );
}

export default QRCodePair;
