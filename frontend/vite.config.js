import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
  },
  // Expose all VITE_* env vars to the client bundle
  envPrefix: 'VITE_',
})
