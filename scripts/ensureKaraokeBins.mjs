import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.platform !== 'linux') {
  console.log(`Skipping Linux binary downloads on ${process.platform}`);
  process.exit(0);
}

const binDir = resolve('.bin');
await mkdir(binDir, { recursive: true });

// Keep this entry point for the existing Altare install command.
const target = join(binDir, 'cloudflared');
if (existsSync(target)) {
  console.log('cloudflared already present at', target);
  process.exit(0);
}

const cloudflaredAsset = process.arch === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';
const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${cloudflaredAsset}`;
console.log(`Downloading ${url}...`);
const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
}
const buffer = Buffer.from(await res.arrayBuffer());
await writeFile(target, buffer);
await chmod(target, 0o755);
console.log(`Saved ${target} (${(buffer.length / (1024 * 1024)).toFixed(1)} MiB)`);
