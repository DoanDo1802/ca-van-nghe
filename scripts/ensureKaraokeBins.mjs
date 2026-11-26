import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.platform !== 'linux') {
  console.log(`Skipping yt-dlp Linux binary download on ${process.platform}`);
  process.exit(0);
}

const binDir = resolve('.bin');
const target = join(binDir, 'yt-dlp');
if (existsSync(target)) {
  console.log('yt-dlp binary already present at', target);
  process.exit(0);
}

const asset = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;

await mkdir(binDir, { recursive: true });
console.log(`Downloading ${url}...`);
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) {
  throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
}
const buf = Buffer.from(await res.arrayBuffer());
await writeFile(target, buf);
await chmod(target, 0o755);
console.log(`Saved ${target} (${(buf.length / (1024 * 1024)).toFixed(1)} MiB)`);
