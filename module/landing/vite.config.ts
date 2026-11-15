import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// L'application web (src/web) est servie par le serveur Node sous /visio-assets/app/, un chemin
// que le reverse proxy envoie déjà à la page d'accueil (/assets est pris par PlugNMeet).
export default defineConfig({
  root: 'src/web',
  base: '/visio-assets/app/',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  // `npm run dev` : Vite sert l'interface, le serveur Node (npm start) répond à l'API.
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
