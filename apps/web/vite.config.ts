import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // manifest.webmanifest et les icônes sont déjà dans public/, gérés à la main :
      // on ne demande au plugin que le service worker (shell + SWR sur /api/lyrics).
      manifest: false,
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Stale-while-revalidate : un morceau déjà écouté s'affiche hors
            // ligne immédiatement, mise à jour en tâche de fond si le réseau
            // répond (cf. tâche : cache des réponses /api/lyrics).
            urlPattern: ({ url }: { url: URL }) => url.pathname === '/api/lyrics',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lyrics-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  // Pas de SSR : le web component sous-jacent (Lit) ne s'y comporte pas
  // correctement (cf. readme d'@uimaxbai/am-lyrics). Build statique pur.
  build: {
    target: 'es2022',
  },
});
