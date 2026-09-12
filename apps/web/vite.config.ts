import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Pas de SSR : le web component sous-jacent (Lit) ne s'y comporte pas
  // correctement (cf. readme d'@uimaxbai/am-lyrics). Build statique pur.
  build: {
    target: 'es2022',
  },
});
