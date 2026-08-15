import { useEffect, useState, useRef } from "react";
import socket from "../services/socket";
import QRCodePair from "../components/QRCodePair";
import { apiUrl } from "../services/api";

function LaptopPage() {
  const [sessionId] = useState(() =>
    Math.random().toString(36).substring(2, 8).toUpperCase()
  );

  const [queue, setQueue] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [isConnected, setIsConnected] = useState(false);
  const [videoTitle, setVideoTitle] = useState("No Video Loaded");
  const [authProfile, setAuthProfile] = useState(null);

  const playerRef = useRef(null);
  const queueRef = useRef([]);
  const currentQueueIndexRef = useRef(-1);

  // Sync refs with state to avoid stale closure issues in socket/interval callbacks
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentQueueIndexRef.current = currentQueueIndex;
  }, [currentQueueIndex]);

  // Sync state back to mobile remote
  const syncState = () => {
    const ytPlayer = playerRef.current;
    if (!ytPlayer || typeof ytPlayer.getPlayerState !== "function") return;

    try {
      const playerState = ytPlayer.getPlayerState();
      let status = "unstarted";
      if (playerState === 1) status = "playing";
      else if (playerState === 2) status = "paused";
      else if (playerState === 3) status = "buffering";
      else if (playerState === 0) status = "ended";

      const videoData = ytPlayer.getVideoData();
      let currentVideo = null;

      if (currentQueueIndexRef.current >= 0 && queueRef.current[currentQueueIndexRef.current]) {
        currentVideo = queueRef.current[currentQueueIndexRef.current];
      } else if (videoData && videoData.video_id) {
        currentVideo = {
          id: videoData.video_id,
          title: videoData.title || "Loaded Video",
          author: videoData.author || "YouTube",
          thumbnail: `https://img.youtube.com/vi/${videoData.video_id}/hqdefault.jpg`,
          duration: ytPlayer.getDuration() ? formatTime(ytPlayer.getDuration()) : "Unknown"
        };
      }

      if (currentVideo) {
        setVideoTitle(currentVideo.title);
      }

      socket.emit("state-update", {
        roomId: sessionId,
        state: {
          status,
          currentTime: ytPlayer.getCurrentTime() || 0,
          duration: ytPlayer.getDuration() || 0,
          volume: ytPlayer.getVolume() || 0,
          muted: ytPlayer.isMuted() || false,
          video: currentVideo,
          queue: queueRef.current,
          currentQueueIndex: currentQueueIndexRef.current,
        },
      });
    } catch (err) {
      console.error("Error in syncState:", err);
    }
  };

  const handleNextVideo = () => {
    const nextIdx = currentQueueIndexRef.current + 1;
    if (nextIdx < queueRef.current.length && playerRef.current) {
      setCurrentQueueIndex(nextIdx);
      playerRef.current.loadVideoById(queueRef.current[nextIdx].id);
    }
  };

  const handlePrevVideo = () => {
    const prevIdx = currentQueueIndexRef.current - 1;
    if (prevIdx >= 0 && playerRef.current) {
      setCurrentQueueIndex(prevIdx);
      playerRef.current.loadVideoById(queueRef.current[prevIdx].id);
    }
  };

  useEffect(() => {
    // Join room
    socket.emit("join-room", sessionId);
    setIsConnected(true);

    // Setup YouTube Iframe API
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }

    const initPlayer = () => {
      playerRef.current = new window.YT.Player("player", {
        height: "100%",
        width: "100%",
        videoId: "esS2W3jodHM", // Default: Good Luck Charm — KS Makhan
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          showinfo: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            setVideoTitle("Good Luck Charm - KS Makhan");
            syncState();
          },
          onStateChange: (event) => {
            if (event.data === 0) {
              // Video Ended -> play next in queue
              handleNextVideo();
            }
            syncState();
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    // Sockets Listeners
    socket.on("auth-success", (profile) => {
      setAuthProfile(profile);
    });

    const checkAuthStatus = async () => {
      try {
        const res = await fetch(apiUrl(`/api/youtube/status?session=${encodeURIComponent(sessionId)}`));
        const data = await res.json();
        if (data.authenticated) {
          setAuthProfile({ name: data.name, picture: data.picture });
        }
      } catch (err) {
        console.warn("Could not check auth status:", err);
      }
    };
    checkAuthStatus();

    socket.on("command", (cmd) => {
      const ytPlayer = playerRef.current;
      if (!ytPlayer || typeof ytPlayer.getPlayerState !== "function") return;

      switch (cmd.type) {
        case "play":
          ytPlayer.playVideo();
          break;
        case "pause":
          ytPlayer.pauseVideo();
          break;
        case "mute":
          ytPlayer.mute();
          break;
        case "unmute":
          ytPlayer.unMute();
          break;
        case "seek":
          ytPlayer.seekTo(cmd.value, true);
          break;
        case "volume":
          ytPlayer.setVolume(cmd.value);
          break;
        case "play-now":
          if (cmd.value) {
            setQueue([cmd.value]);
            setCurrentQueueIndex(0);
            ytPlayer.loadVideoById(cmd.value.id);
          }
          break;
        case "add-to-queue":
          if (cmd.value) {
            setQueue((prevQueue) => {
              const newQueue = [...prevQueue, cmd.value];
              if (currentQueueIndexRef.current === -1 || prevQueue.length === 0) {
                setCurrentQueueIndex(0);
                // Small delay to ensure state update registered
                setTimeout(() => {
                  if (playerRef.current) playerRef.current.loadVideoById(cmd.value.id);
                }, 50);
              }
              return newQueue;
            });
          }
          break;
        case "remove-from-queue":
          if (typeof cmd.value === "number") {
            const removeIdx = cmd.value;
            setQueue((prevQueue) => {
              const newQueue = prevQueue.filter((_, idx) => idx !== removeIdx);
              if (removeIdx === currentQueueIndexRef.current) {
                if (newQueue.length > 0) {
                  const nextIdx = Math.min(removeIdx, newQueue.length - 1);
                  setCurrentQueueIndex(nextIdx);
                  ytPlayer.loadVideoById(newQueue[nextIdx].id);
                } else {
                  setCurrentQueueIndex(-1);
                  ytPlayer.stopVideo();
                }
              } else if (removeIdx < currentQueueIndexRef.current) {
                setCurrentQueueIndex((prev) => prev - 1);
              }
              return newQueue;
            });
          }
          break;
        case "play-from-queue":
          if (typeof cmd.value === "number" && cmd.value >= 0 && cmd.value < queueRef.current.length) {
            setCurrentQueueIndex(cmd.value);
            ytPlayer.loadVideoById(queueRef.current[cmd.value].id);
          }
          break;
        case "clear-queue":
          setQueue([]);
          setCurrentQueueIndex(-1);
          ytPlayer.stopVideo();
          break;
        case "next":
          handleNextVideo();
          break;
        case "prev":
          handlePrevVideo();
          break;
        default:
          console.warn("Unknown command:", cmd);
      }
      setTimeout(syncState, 100);
    });

    socket.on("request-sync", () => {
      syncState();
    });

    // Periodic synchronization while playing
    const syncInterval = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getPlayerState === "function") {
        const state = playerRef.current.getPlayerState();
        if (state === 1) { // playing
          syncState();
        }
      }
    }, 1000);

    return () => {
      socket.off("command");
      socket.off("request-sync");
      socket.off("auth-success");
      clearInterval(syncInterval);
    };
  }, [sessionId]);

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const playQueueItem = (idx) => {
    if (playerRef.current) {
      setCurrentQueueIndex(idx);
      playerRef.current.loadVideoById(queue[idx].id);
      setTimeout(syncState, 100);
    }
  };

  const removeQueueItem = (idx, e) => {
    e.stopPropagation();
    setQueue((prevQueue) => {
      const newQueue = prevQueue.filter((_, i) => i !== idx);
      if (idx === currentQueueIndex) {
        if (newQueue.length > 0) {
          const nextIdx = Math.min(idx, newQueue.length - 1);
          setCurrentQueueIndex(nextIdx);
          if (playerRef.current) playerRef.current.loadVideoById(newQueue[nextIdx].id);
        } else {
          setCurrentQueueIndex(-1);
          if (playerRef.current) playerRef.current.stopVideo();
        }
      } else if (idx < currentQueueIndex) {
        setCurrentQueueIndex((prev) => prev - 1);
      }
      return newQueue;
    });
    setTimeout(syncState, 100);
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
      setAuthProfile(null);
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "radial-gradient(circle at 10% 20%, rgba(15, 23, 42, 1) 0%, rgba(9, 13, 22, 1) 90%)",
        color: "#f8fafc",
      }}
    >
      {/* Sidebar Panel */}
      <div
        style={{
          width: "360px",
          background: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255, 255, 255, 0.05)",
          padding: "30px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "30px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: isConnected ? "#10b981" : "#ef4444",
              boxShadow: isConnected ? "0 0 10px #10b981" : "0 0 10px #ef4444",
            }}
          />
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: "600", letterSpacing: "-0.5px" }}>
            RemoteSync <span style={{ color: "#8b5cf6" }}>YT</span>
          </h1>
        </div>

        <QRCodePair sessionId={sessionId} />

        {/* Google Authentication Control */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", fontWeight: "600" }}>
            YouTube Personalization
          </div>
          {authProfile ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                borderRadius: "14px",
                background: "rgba(16, 185, 129, 0.05)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              {authProfile.picture ? (
                <img
                  src={authProfile.picture}
                  alt={authProfile.name}
                  style={{ width: "36px", height: "36px", borderRadius: "50%", border: "2px solid #10b981" }}
                />
              ) : (
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "600", fontSize: "1rem" }}>
                  {authProfile.name.charAt(0)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {authProfile.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: "500" }}>Connected</div>
              </div>
              <button
                onClick={handleGoogleLogout}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  fontWeight: "500",
                }}
              >
                Unlink
              </button>
            </div>
          ) : (
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
          )}
        </div>

        <div style={{ marginTop: "10px" }}>
          <div
            style={{
              fontSize: "0.8rem",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "#64748b",
              marginBottom: "10px",
              fontWeight: "600",
            }}
          >
            Now Playing
          </div>
          <div
            style={{
              padding: "16px",
              borderRadius: "14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <div style={{ fontSize: "1rem", fontWeight: "500", color: "#f1f5f9", wordBreak: "break-word" }}>
              {videoTitle}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "4px" }}>
              {currentQueueIndex >= 0 && queue[currentQueueIndex]
                ? queue[currentQueueIndex].author
                : "Active Player"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", fontWeight: "600" }}>
              Instructions
            </span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#94a3b8", lineHeight: "1.5" }}>
            1. Scan the QR code with your phone.<br/>
            2. Keep this tab open on your laptop.<br/>
            3. Search, play, and adjust volume directly from your phone!
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          padding: "40px",
          display: "flex",
          flexDirection: "column",
          gap: "30px",
          overflowY: "auto",
        }}
      >
        {/* Video Player Frame */}
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "960px",
            aspectRatio: "16/9",
            borderRadius: "20px",
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
            background: "#000",
            animation: "pulseGlow 4s infinite ease-in-out",
            alignSelf: "center",
          }}
        >
          <div id="player" style={{ width: "100%", height: "100%" }}></div>
        </div>

        {/* Video Queue Section */}
        <div style={{ maxWidth: "960px", width: "100%", alignSelf: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "600", margin: 0 }}>Play Queue ({queue.length})</h2>
            {queue.length > 0 && (
              <button
                onClick={() => socket.emit("command", { roomId: sessionId, command: { type: "clear-queue" } })}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: "500",
                }}
              >
                Clear Queue
              </button>
            )}
          </div>

          {queue.length === 0 ? (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                borderRadius: "16px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px dashed rgba(255, 255, 255, 0.08)",
                color: "#64748b",
              }}
            >
              Queue is empty. Search and add videos from your mobile remote.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxHeight: "300px",
                overflowY: "auto",
                paddingRight: "6px",
              }}
            >
              {queue.map((item, idx) => {
                if (!item) return null;
                const isActive = idx === currentQueueIndex;
                return (
                  <div
                    key={`${item.id}-${idx}`}
                    onClick={() => playQueueItem(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "15px",
                      padding: "10px 15px",
                      borderRadius: "12px",
                      background: isActive ? "rgba(139, 92, 246, 0.15)" : "rgba(255, 255, 255, 0.02)",
                      border: isActive ? "1px solid rgba(139, 92, 246, 0.3)" : "1px solid rgba(255, 255, 255, 0.04)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ position: "relative", width: "80px", height: "45px", borderRadius: "6px", overflow: "hidden" }}>
                      <img src={item.thumbnail} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                        {item.duration}
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: isActive ? "600" : "400",
                          color: isActive ? "#a78bfa" : "#f1f5f9",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.title}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>{item.author}</div>
                    </div>

                    {isActive && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#10b981",
                          background: "rgba(16, 185, 129, 0.1)",
                          padding: "2px 8px",
                          borderRadius: "99px",
                          fontWeight: "600",
                          border: "1px solid rgba(16, 185, 129, 0.2)",
                        }}
                      >
                        PLAYING
                      </div>
                    )}

                    <button
                      onClick={(e) => removeQueueItem(idx, e)}
                      style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "none",
                        color: "#ef4444",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.1rem",
                        transition: "all 0.2s ease",
                      }}
                      title="Remove from queue"
                    >
                      &times;
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LaptopPage;
