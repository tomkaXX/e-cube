import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` must match the GitHub repository name for GitHub Pages
// (https://<user>.github.io/<repo>/). Change it if you rename the repo.
export default defineConfig({
  base: '/e-cube/',
  plugins: [react()],
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 900 },
});
