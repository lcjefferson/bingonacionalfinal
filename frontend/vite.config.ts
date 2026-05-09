import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Match root `.env.example` PORT (backend) — override with `BINGO_BACKEND_URL` when running `vite` */
const backendTarget = process.env.BINGO_BACKEND_URL ?? 'http://127.0.0.1:3005'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: backendTarget, changeOrigin: true },
      '/socket.io': { target: backendTarget, ws: true },
    },
  },
})
