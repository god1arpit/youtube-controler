// Set VITE_API_URL when the API is not running at port 5000 on this host.
// Example: VITE_API_URL=https://api.example.com
export const API_BASE_URL = (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5000`).replace(/\/$/, "");

// When the laptop page is opened via localhost, a phone needs the laptop's LAN
// address instead. Set VITE_LAN_HOST (for example, 192.168.1.25) in .env.local.
const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const mobileHost = isLocalhost && import.meta.env.VITE_LAN_HOST
  ? import.meta.env.VITE_LAN_HOST
  : window.location.hostname;
const mobilePort = window.location.port ? `:${window.location.port}` : "";
export const MOBILE_ORIGIN = `${window.location.protocol}//${mobileHost}${mobilePort}`;

export const apiUrl = (path) => `${API_BASE_URL}${path}`;
