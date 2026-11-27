import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { handleYouTubeSearch } from './scripts/youtubeSearchCore.js';

function youtubeSearchPlugin() {
  const attachMiddleware = (server) => {
    server.middlewares.use('/api/yt-search', handleYouTubeSearch);
  };

  return {
    name: 'youtube-search-proxy',
    configureServer: attachMiddleware,
    configurePreviewServer: attachMiddleware,
  };
}

function sceneSavePlugin() {
  return {
    name: 'dev-scene-save',
    configureServer(server) {
      server.middlewares.use('/api/dev/save-scene', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const { name, schema } = JSON.parse(body || '{}');
            const safeName = String(name || 'scene')
              .replace(/[^a-zA-Z0-9_-]/g, '_')
              .toLowerCase();
            const scenesDir = path.resolve(process.cwd(), 'public', 'scenes');
            fs.mkdirSync(scenesDir, { recursive: true });
            const filePath = path.join(scenesDir, `${safeName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(schema, null, 2), 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `public/scenes/${safeName}.json` }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), youtubeSearchPlugin(), sceneSavePlugin()],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          ui: ['lucide-react', 'canvas-confetti'],
        },
      },
    },
  },
});
