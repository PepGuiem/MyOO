import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Paquetes del motor 3D. Van juntos en su propio archivo («three-*.js») que
 * solo descargan las páginas con 3D. Como no lleva código de la app, su nombre
 * (hash) no cambia entre despliegues y el navegador lo reutiliza de la caché.
 * Lo que estos paquetes usan por dentro (zustand, troika…) entra con ellos.
 */
const THREE_PACKAGES = /[\\/]node_modules[\\/](three|three-stdlib|@react-three[\\/][^\\/]+)[\\/]/;

/**
 * React y lo que comparte con el 3D (scheduler) y los ayudantes internos de
 * Vite/Rollup (ids que empiezan por «\0»). Hay que fijarlos en un paquete
 * propio: si no, Rollup los metería en «three» (lo arrastra todo lo que usa
 * un paquete manual) y el arranque tendría que descargar el 3D otra vez.
 */
const SHARED_PACKAGES = /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/;

// En desarrollo, las peticiones a /api se reenvían al backend NestJS.
// Así el navegador habla con un único origen y no hay problemas de CORS.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (THREE_PACKAGES.test(id)) return 'three';
          if (SHARED_PACKAGES.test(id)) return 'react';
          if (id.startsWith('\0') && !id.includes('node_modules')) return 'react';
          return undefined;
        },
      },
    },
  },
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
