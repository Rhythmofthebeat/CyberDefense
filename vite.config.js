import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, proxy /api and /auth to the local server.
// Auth is handled by the browser sending the JWT token — no hardcoded key needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api':  'http://localhost:4001',
      '/auth': 'http://localhost:4001',
    },
  },
})
