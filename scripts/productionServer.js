import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createKaraokeDownloadHandler } from './karaokeDownloadCore.js';

const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = resolve('dist');
const INDEX_FILE = join(DIST_DIR, 'index.html');
const ALLOWED_ORIGINS = (process.env.KARAOKE_CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const handleKaraokeDownload = createKaraokeDownloadHandler({ localhostOnly: false });

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

async function serveFile(res, filePath, isAsset) {
  const info = await stat(filePath);
  if (!info.isFile()) return false;
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  });
  await pipeline(createReadStream(filePath), res).catch(() => {});
  return true;
}

const server = createServer(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  if (url.pathname === '/api/karaoke-video') {
    await handleKaraokeDownload(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }

  const cleanRel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const candidate = resolve(DIST_DIR, cleanRel || 'index.html');
  if (candidate.startsWith(DIST_DIR)) {
    try {
      const ok = await serveFile(res, candidate, cleanRel.startsWith('assets/'));
      if (ok) return;
    } catch {
      // fall through to SPA index.html
    }
  }

  try {
    await serveFile(res, INDEX_FILE, false);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

function startCloudflareTunnel() {
  const token = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim();
  const quick = process.env.ENABLE_CLOUDFLARE_QUICK_TUNNEL === 'true';
  if (!token && !quick) return null;

  const localBin = resolve('.bin/cloudflared');
  const bin = process.env.CLOUDFLARED_BIN || (existsSync(localBin) ? localBin : 'cloudflared');
  const args = token
    ? ['tunnel', '--no-autoupdate', 'run', '--token', token]
    : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`];

  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const logOutput = (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (line.includes('trycloudflare.com') || line.includes('Registered tunnel connection') || line.includes('ERR')) {
        console.log(`[cloudflared] ${line}`);
      }
    }
  };
  child.stdout?.on('data', logOutput);
  child.stderr?.on('data', logOutput);
  child.on('error', (err) => {
    console.warn('[cloudflared] Failed to start:', err.message);
  });
  return child;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
  const tunnel = startCloudflareTunnel();
  if (tunnel) {
    const stopTunnel = () => {
      if (!tunnel.killed) tunnel.kill('SIGTERM');
    };
    process.once('SIGINT', stopTunnel);
    process.once('SIGTERM', stopTunnel);
  }
});
