import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built fixture works when served from any static root.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
