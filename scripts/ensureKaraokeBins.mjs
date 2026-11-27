import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

if (process.platform !== 'linux') {
  console.log(`Skipping Linux binary downloads on ${process.platform}`);
  process.exit(0);
}

const binDir = resolve('.bin');
await mkdir(binDir, { recursive: true });

async function downloadFile(url, dest, mode) {
  console.log(`Downloading ${url}...`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ca-van-nghe-setup/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buffer);
  if (mode) await chmod(dest, mode);
  console.log(`Saved ${dest} (${(buffer.length / (1024 * 1024)).toFixed(1)} MiB)`);
}

// 1. cloudflared
const cloudflaredTarget = join(binDir, 'cloudflared');
if (existsSync(cloudflaredTarget)) {
  console.log('cloudflared already present at', cloudflaredTarget);
} else {
  const cloudflaredAsset = process.arch === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';
  await downloadFile(
    `https://github.com/cloudflare/cloudflared/releases/latest/download/${cloudflaredAsset}`,
    cloudflaredTarget,
    0o755
  );
}

// 2. yt-dlp standalone Linux binary (does not require system python3)
const ytdlpTarget = join(binDir, 'yt-dlp');
if (existsSync(ytdlpTarget)) {
  console.log('yt-dlp already present at', ytdlpTarget);
} else {
  const ytdlpAsset = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  await downloadFile(
    `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpAsset}`,
    ytdlpTarget,
    0o755
  );
}

// 3. bgutil-ytdlp-pot-provider plugin + Node HTTP PO Token Server (non-fatal)
const POT_VERSION = '2.0.2';
try {
  const pluginDir = join(binDir, 'xdg-config', 'yt-dlp', 'plugins');
  await mkdir(pluginDir, { recursive: true });
  const pluginZip = join(pluginDir, 'bgutil-ytdlp-pot-provider.zip');
  if (!existsSync(pluginZip)) {
    await downloadFile(
      `https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${POT_VERSION}/bgutil-ytdlp-pot-provider.zip`,
      pluginZip
    );
  } else {
    console.log('bgutil-ytdlp-pot-provider.zip already present at', pluginZip);
  }

  const potRoot = join(binDir, 'bgutil-pot');
  const potEntry = join(potRoot, 'server', 'build', 'main.js');
  if (!existsSync(potEntry)) {
    const tarballPath = join(binDir, 'bgutil-pot.tar.gz');
    await downloadFile(
      `https://api.github.com/repos/Brainicism/bgutil-ytdlp-pot-provider/tarball/${POT_VERSION}`,
      tarballPath
    );
    await rm(potRoot, { recursive: true, force: true });
    await mkdir(potRoot, { recursive: true });
    execFileSync('tar', ['-xzf', tarballPath, '--strip-components=1', '-C', potRoot], {
      stdio: 'inherit',
    });
    await rm(tarballPath, { force: true });

    const serverDir = join(potRoot, 'server');
    console.log(`Installing & building bgutil-pot server in ${serverDir}...`);
    execFileSync('npm', ['ci'], { cwd: serverDir, stdio: 'inherit' });
    execFileSync('npx', ['tsc'], { cwd: serverDir, stdio: 'inherit' });
    console.log('bgutil-pot server built successfully at', potEntry);
  } else {
    console.log('bgutil-pot server already present at', potEntry);
  }
} catch (err) {
  console.warn('[ensureKaraokeBins] Warning: PO Token provider setup failed (non-fatal):', err?.message || err);
}
