import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    env: {
      VITE_SPOTIFY_CLIENT_ID: 'test-client-id',
      VITE_SPOTIFY_REDIRECT_URI: 'http://localhost:5173/callback',
    },
  },
});
