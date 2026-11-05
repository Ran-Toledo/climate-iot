import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// The SPA calls the API on its own origin (relative `/api/...` URLs), and
// this server forwards those requests to the backend.
// In Docker, API_PROXY_TARGET is the compose-network address
// (http://api:8000); for `npm run dev` it defaults to a backend you run
// yourself on localhost:8000.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'
const proxiedPaths = ['/api', '/health', '/docs', '/redoc', '/openapi.json']
const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  proxiedPaths.map((path) => [path, { target: apiTarget, changeOrigin: true }]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // No `host: true` -- the dev server listens on localhost only. The Docker
  // image's CMD passes `--host 0.0.0.0` because a container has to listen
  // on all of its own interfaces; docker-compose.yml then publishes that
  // port on the host's 127.0.0.1 only. Remote devices reach the frontend
  // through `tailscale serve` (HTTPS), never over the LAN or a plain-HTTP
  // tailnet IP -- see the root README's "Remote access" section.
  //
  // allowedHosts: Vite rejects (403) any request whose Host header isn't
  // localhost, a bare IP, or explicitly allowed here, as anti DNS-rebinding
  // protection. `tailscale serve` forwards the MagicDNS name (*.ts.net) as
  // the Host header, so it has to be allowed. Those names only ever resolve
  // inside your own private tailnet, so trusting the suffix doesn't reopen
  // what the check exists to prevent.
  server: { allowedHosts: ['.ts.net'], proxy },
  preview: { allowedHosts: ['.ts.net'], proxy },
})
