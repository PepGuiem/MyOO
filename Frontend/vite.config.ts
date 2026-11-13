import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, las peticiones a /api se reenvían al backend NestJS.
// Así el navegador habla con un único origen y no hay problemas de CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // También los WebSocket (chats en tiempo real: /api/ws).
        ws: true,
      },
    },
  },
});
