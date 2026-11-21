import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone Player build (excludes Editor UI & Legacy Three.js)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-player',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'play.html'),
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          playcanvas: ['playcanvas'],
          ui: ['lucide-react', 'canvas-confetti'],
        },
      },
    },
  },
});
