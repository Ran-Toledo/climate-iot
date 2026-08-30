import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Bind all interfaces, not just localhost, so `npm run dev` is reachable
  // from another device (phone, tablet) on the same network -- Vite prints
  // both the localhost and LAN URLs to use.
  server: { host: true },
})
