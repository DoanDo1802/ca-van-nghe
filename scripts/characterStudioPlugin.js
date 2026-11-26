import fs from 'node:fs';
import path from 'node:path';

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MB safety cap for local dev

function sanitizeBaseName(raw, fallback = 'asset') {
  const cleaned = String(raw || fallback)
    .replace(/\.(glb|gltf|fbx|json|png|jpg|jpeg|webp)$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

function readRawBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Payload exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/**
 * Local Dev Server middleware for Character & Animation Studio:
 * Writes standardized .glb models, .glb animation clips, and manifests
 * directly into `public/` so changes appear in `git status`/`git diff`
 * and take effect immediately in the game and production builds.
 */
export function characterStudioPlugin() {
  const attachMiddleware = (server) => {
    server.middlewares.use('/api/dev/studio', async (req, res, next) => {
      try {
        const urlObj = new URL(req.url || '/', 'http://localhost');
        const route = urlObj.pathname;

        if (req.method === 'GET' && route === '/ping') {
          sendJson(res, 200, { ok: true, mode: 'local-studio' });
          return;
        }

        if (req.method === 'POST' && route === '/upload-binary') {
          const kind = urlObj.searchParams.get('kind') === 'animation' ? 'animation' : 'model';
          const rawName = urlObj.searchParams.get('filename') || (kind === 'animation' ? 'anim' : 'character');
          const safeBase = sanitizeBaseName(rawName, kind === 'animation' ? 'anim' : 'character');
          const finalFilename = `${safeBase}.glb`;
          const subDir = kind === 'animation' ? 'animations' : 'models';
          const targetDir = path.resolve(process.cwd(), 'public', subDir);
          fs.mkdirSync(targetDir, { recursive: true });

          const targetPath = path.resolve(targetDir, finalFilename);
          if (!targetPath.startsWith(targetDir)) {
            sendJson(res, 400, { ok: false, error: 'Invalid target filename' });
            return;
          }

          const buf = await readRawBody(req);
          if (!buf || buf.length < 12) {
            sendJson(res, 400, { ok: false, error: 'Empty or invalid GLB binary payload' });
            return;
          }

          // Validate GLB magic header ('glTF' = 0x46546C67)
          const magic = buf.readUInt32LE(0);
          if (magic !== 0x46546c67) {
            sendJson(res, 400, { ok: false, error: 'Uploaded binary is not a valid GLB container' });
            return;
          }

          fs.writeFileSync(targetPath, buf);
          sendJson(res, 200, {
            ok: true,
            filename: finalFilename,
            url: `/${subDir}/${finalFilename}`,
            diskPath: `public/${subDir}/${finalFilename}`,
            sizeBytes: buf.length,
          });
          return;
        }

        if (req.method === 'POST' && route === '/save-characters') {
          const buf = await readRawBody(req, 5 * 1024 * 1024);
          const parsed = JSON.parse(buf.toString('utf8'));
          if (!parsed || !Array.isArray(parsed.characters)) {
            sendJson(res, 400, { ok: false, error: 'Invalid CharacterManifest payload' });
            return;
          }
          const dir = path.resolve(process.cwd(), 'public', 'characters');
          fs.mkdirSync(dir, { recursive: true });
          const filePath = path.join(dir, 'manifest.json');
          fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
          sendJson(res, 200, { ok: true, diskPath: 'public/characters/manifest.json' });
          return;
        }

        if (req.method === 'POST' && route === '/save-animations') {
          const buf = await readRawBody(req, 5 * 1024 * 1024);
          const parsed = JSON.parse(buf.toString('utf8'));
          if (!parsed || !Array.isArray(parsed.clips) || !parsed.slots) {
            sendJson(res, 400, { ok: false, error: 'Invalid AnimationManifest payload' });
            return;
          }
          const dir = path.resolve(process.cwd(), 'public', 'animations');
          fs.mkdirSync(dir, { recursive: true });
          const filePath = path.join(dir, 'manifest.json');
          fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
          sendJson(res, 200, { ok: true, diskPath: 'public/animations/manifest.json' });
          return;
        }

        if (req.method === 'POST' && route === '/delete-asset') {
          const buf = await readRawBody(req, 64 * 1024);
          const { assetUrl } = JSON.parse(buf.toString('utf8') || '{}');
          const cleanUrl = String(assetUrl || '').split('?')[0];
          const protectedFiles = new Set([
            '/models/Character.glb',
            '/models/Tyler.glb',
            '/animations/shared_core_clips.glb',
          ]);
          if (protectedFiles.has(cleanUrl)) {
            sendJson(res, 400, { ok: false, error: 'Protected built-in file cannot be deleted' });
            return;
          }
          if (!cleanUrl.startsWith('/models/') && !cleanUrl.startsWith('/animations/')) {
            sendJson(res, 400, { ok: false, error: 'Only /models/ or /animations/ files can be deleted' });
            return;
          }
          const publicRoot = path.resolve(process.cwd(), 'public');
          const resolved = path.resolve(publicRoot, cleanUrl.slice(1));
          if (!resolved.startsWith(publicRoot) || !resolved.toLowerCase().endsWith('.glb')) {
            sendJson(res, 400, { ok: false, error: 'Invalid asset path' });
            return;
          }
          if (fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
          }
          sendJson(res, 200, { ok: true, deleted: cleanUrl });
          return;
        }

        next();
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  };

  return {
    name: 'character-animation-studio-api',
    configureServer: attachMiddleware,
  };
}
