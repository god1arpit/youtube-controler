# YouTube Remote

## Google sign-in setup

1. In Google Cloud Console, enable **YouTube Data API v3** and configure the OAuth consent screen.
2. Create an OAuth 2.0 **Web application** client. Add `http://localhost:5000/auth/google/callback` to its Authorized redirect URIs for local development.
3. Copy `server/.env.example` to `server/.env`, then enter the client ID and secret. The callback value in `GOOGLE_REDIRECT_URI` must exactly match the Google Cloud setting.
4. Start the server (`cd server; npm start`) and client (`cd client; npm run dev`). Open the laptop view at `http://localhost:5173/laptop` and choose **Sign in with Google**.

For deployment, set `GOOGLE_REDIRECT_URI` to the public HTTPS callback URL registered in Google Cloud. If the client and API use different hosts, set `VITE_API_URL` while building the client.

## Phone control without QR scanning

Connect the phone and laptop to the same Wi-Fi. The laptop page shows a URL below the QR code; type that exact URL into the phone browser. When developing through `localhost`, set `VITE_LAN_HOST` in `client/.env.local` to the laptop's Wi-Fi IPv4 address, then restart Vite.
