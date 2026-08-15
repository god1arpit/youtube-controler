// Backend API URL
// Local development:
//   VITE_API_URL=http://localhost:5000
//
// Production (Netlify):
//   VITE_API_URL=https://your-backend.onrender.com

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const API_BASE_URL = (
  configuredApiUrl ||
  `${window.location.protocol}//${window.location.hostname}:5000`
).replace(/\/$/, "");

// Detect localhost
const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(
  window.location.hostname
);

// For local QR/mobile connection:
// If laptop is opened on localhost, use VITE_LAN_HOST.
// Example:
// VITE_LAN_HOST=192.168.1.25
const mobileHost =
  isLocalhost && import.meta.env.VITE_LAN_HOST
    ? import.meta.env.VITE_LAN_HOST
    : window.location.hostname;

// Keep the current frontend port.
// Local: :5173
// Production Netlify: no port
const mobilePort = window.location.port
  ? `:${window.location.port}`
  : "";

export const MOBILE_ORIGIN =
  `${window.location.protocol}//${mobileHost}${mobilePort}`;

// Build API endpoint
export const apiUrl = (path) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
