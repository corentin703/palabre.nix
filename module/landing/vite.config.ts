import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The web application (src/web) is served by the Node server under /visio-assets/app/, a path
// the reverse proxy already sends to the landing page (/assets belongs to PlugNMeet).
export default defineConfig({
  root: 'src/web',
  base: '/visio-assets/app/',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  // `npm run dev`: Vite serves the interface, the Node server (npm start) answers the API.
  server: {
    proxy: {
      '/visio-api': 'http://127.0.0.1:3000',
      '/visio-assets/logo': 'http://127.0.0.1:3000',
      '/visio-assets/custom.css': 'http://127.0.0.1:3000',
      '/admin/api': 'http://127.0.0.1:3000',
      '/admin/login': 'http://127.0.0.1:3000',
      '/admin/logout': 'http://127.0.0.1:3000',
    },
  },
});
