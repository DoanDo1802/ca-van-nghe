import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.platform !== 'linux') {
  console.log(`Skipping Linux binary downloads on ${process.platform}`);
  process.exit(0);
}

const binDir = resolve('.bin');
await mkdir(binDir, { recursive: true });

async function ensureBinary(filename, url) {
  const target = join(binDir, filename);
  if (existsSync(target)) {
    console.log(`${filename} already present at`, target);
    return;
  }
  console.log(`Downloading ${url}...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buf);
  await chmod(target, 0o755);
  console.log(`Saved ${target} (${(buf.length / (1024 * 1024)).toFixed(1)} MiB)`);
}

const ytdlpAsset = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
const cloudflaredAsset = process.arch === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';

await ensureBinary('yt-dlp', `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpAsset}`);
await ensureBinary(
  'cloudflared',
  `https://github.com/cloudflare/cloudflared/releases/latest/download/${cloudflaredAsset}`
);
