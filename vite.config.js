import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite serves the React app on port 5173 during development.
// The Express API listens on port 3001; we proxy /api there so the
// browser can call /api/... directly during dev without CORS pain.
export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
