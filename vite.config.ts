import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Écouter sur 0.0.0.0 pour accès réseau
    port: 5173,
  },
})
