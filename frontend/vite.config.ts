import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Bind all interfaces, not just localhost, so the dev/preview server is
  // reachable from another device (phone, tablet) on the same network --
  // Vite prints both the localhost and LAN URLs to use.
  //
  // allowedHosts: Vite rejects (403) any request whose Host header isn't
  // localhost, a bare IP, or explicitly allowed here, as anti DNS-rebinding
  // protection -- a LAN/Tailscale IP is auto-allowed, but a hostname like a
  // Tailscale MagicDNS name (*.ts.net) isn't, so it 403s even once
  // networking/CORS are otherwise fine. `.ts.net` names only ever resolve to
  // devices already inside your own private tailnet, so trusting the whole
  // suffix here doesn't reopen what the check exists to prevent.
  server: { host: true, allowedHosts: [".ts.net"] },
  preview: { host: true, allowedHosts: [".ts.net"] },
})
