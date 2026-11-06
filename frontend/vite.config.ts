import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// The SPA calls the API on its own origin (relative `/api/...` URLs), and
// the dev server forwards those requests to the backend. This proxy is for
// `npm run dev` / `npm run preview` only: the Docker image serves the build
// with nginx, which has the same proxy rules in nginx/default.conf.template.
// API_PROXY_TARGET defaults to a backend you run yourself on localhost:8000.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'
const proxiedPaths = ['/api', '/health', '/docs', '/redoc', '/openapi.json']
const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  proxiedPaths.map((path) => [path, { target: apiTarget, changeOrigin: true }]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // No `host: true` -- the dev server listens on localhost only. (In
  // Docker, nginx listens inside the container and docker-compose.yml
  // publishes it on the host's 127.0.0.1 only. Remote devices reach it
  // through `tailscale serve` (HTTPS) -- see the root README's "Remote
  // access" section.)
  //
  // allowedHosts: Vite rejects (403) any request whose Host header isn't
  // localhost, a bare IP, or explicitly allowed here, as anti DNS-rebinding
  // protection (nginx has the same allowlist). `tailscale serve` forwards the MagicDNS name (*.ts.net) as
  // the Host header, so it has to be allowed. Those names only ever resolve
  // inside your own private tailnet, so trusting the suffix doesn't reopen
  // what the check exists to prevent.
  server: { allowedHosts: ['.ts.net'], proxy },
  preview: { allowedHosts: ['.ts.net'], proxy },
})
