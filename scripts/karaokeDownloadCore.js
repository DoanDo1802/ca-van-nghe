import { execFile } from 'node:child_process';
import { chmodSync, createReadStream, existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const MAX_BYTES = 80 * 1024 * 1024;
const FORMAT = 'b[height<=480][ext=mp4]/b[ext=mp4]/bv*[height<=480][ext=mp4]+ba[ext=m4a]';

let cachedDbCookies = { value: '', fetchedAt: 0 };

function normalizeToNetscapeCookies(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lines = trimmed.split(/\r?\n/);
  // Already Netscape cookies.txt format (7 tab-separated columns)
  if (
    trimmed.startsWith('# Netscape HTTP Cookie File') ||
    lines.some((l) => !l.trim().startsWith('#') && l.split('\t').length >= 7)
  ) {
    return trimmed;
  }

  // Convert DevTools "NAME: VALUE" lines or "name=value; ..." header to Netscape format
  const out = ['# Netscape HTTP Cookie File'];
  const exp = '2147483647';
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const colonIdx = clean.indexOf(':');
    if (colonIdx > 0 && !clean.slice(0, colonIdx).includes('=')) {
      const name = clean.slice(0, colonIdx).trim();
      const val = clean.slice(colonIdx + 1).trim();
      if (name && val) {
        out.push(`.youtube.com\tTRUE\t/\tTRUE\t${exp}\t${name}\t${val}`);
      }
      continue;
    }
    for (const part of clean.split(';')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx <= 0) continue;
      const name = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      if (name && val) {
        out.push(`.youtube.com\tTRUE\t/\tTRUE\t${exp}\t${name}\t${val}`);
      }
    }
  }
  return out.length > 1 ? `${out.join('\n')}\n` : '';
}

async function resolveCookiesFile() {
  if (process.env.YTDLP_COOKIES_FILE && existsSync(process.env.YTDLP_COOKIES_FILE)) {
    return process.env.YTDLP_COOKIES_FILE;
  }
  const b64 = process.env.YTDLP_COOKIES_B64?.trim();
  if (b64) {
    const normalized = normalizeToNetscapeCookies(Buffer.from(b64, 'base64').toString('utf8'));
    if (normalized) {
      const out = join(tmpdir(), 'ytdlp-cookies.txt');
      writeFileSync(out, normalized, 'utf8');
      return out;
    }
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) return null;

  if (Date.now() - cachedDbCookies.fetchedAt > 60_000) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/karaoke_server_secrets?id=eq.1&select=ytdlp_cookies`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        }
      );
      if (res.ok) {
        const rows = await res.json();
        cachedDbCookies = {
          value: typeof rows?.[0]?.ytdlp_cookies === 'string' ? rows[0].ytdlp_cookies.trim() : '',
          fetchedAt: Date.now(),
        };
      }
    } catch {
      // keep previous cache on transient network error
    }
  }

  const normalized = normalizeToNetscapeCookies(cachedDbCookies.value);
  if (!normalized) return null;
  const out = join(tmpdir(), 'ytdlp-cookies-db.txt');
  writeFileSync(out, normalized, 'utf8');
  return out;
}

function resolveYtdlpBin() {
  if (process.env.YTDLP_BIN) return process.env.YTDLP_BIN;
  const localBin = resolve('.bin/yt-dlp');
  return existsSync(localBin) ? localBin : 'yt-dlp';
}

function resolveFfmpegLocation() {
  if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) return process.env.FFMPEG_BIN;
  try {
    const bin = require('ffmpeg-static');
    if (typeof bin === 'string' && bin && existsSync(bin)) {
      try {
        chmodSync(bin, 0o755);
      } catch {
        // ignore
      }
      return bin;
    }
    return null;
  } catch {
    return null;
  }
}

export function createKaraokeDownloadHandler({ localhostOnly = true } = {}) {
  let busy = false;

  return async function handleKaraokeDownload(req, res) {
    const fail = (status, error) => {
      if (res.destroyed || res.headersSent) return;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
    };

    if (req.method !== 'POST') {
      return fail(405, 'Method not allowed.');
    }

    if (localhostOnly) {
      const host = req.headers.host ?? '';
      if (
        !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
        req.headers.origin !== `http://${host}` ||
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
      ) {
        return fail(403, 'Luồng tải thử chỉ chạy trên localhost.');
      }
    }

    const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? '';
    if (!/^[\w-]{11}$/.test(id)) return fail(400, 'ID video không hợp lệ.');
    if (busy) return fail(429, 'Đang tải một bài khác. Hãy thử lại sau.');

    busy = true;
    const controller = new AbortController();
    const abort = () => {
      if (!res.writableFinished) controller.abort();
    };
    res.once('close', abort);

    let folder;
    const ytdlpBin = resolveYtdlpBin();
    const ffmpegLoc = resolveFfmpegLocation();
    try {
      const url = `https://www.youtube.com/watch?v=${id}`;
      const options = [
        '--ignore-config',
        '--no-playlist',
        '--no-update',
        '--socket-timeout',
        '10',
        '--retries',
        '1',
        '--js-runtimes',
        `node:${process.execPath}`,
      ];
      if (ffmpegLoc) {
        options.push('--ffmpeg-location', ffmpegLoc);
      }
      const cookiesFile = await resolveCookiesFile();
      if (cookiesFile) {
        options.push('--cookies', cookiesFile);
      }
      const execOptions = { signal: controller.signal, timeout: 45000, maxBuffer: 2 * 1024 * 1024 };
      const { stdout } = await run(ytdlpBin, [...options, '-J', '--skip-download', url], execOptions);
      const info = JSON.parse(stdout);
      if (info.is_live || ['is_live', 'is_upcoming', 'post_live'].includes(info.live_status)) {
        return fail(422, 'Không hỗ trợ video livestream đang hoặc sắp phát.');
      }
      if (!Number.isFinite(info.duration) || info.duration <= 0 || info.duration > 600) {
        return fail(422, 'Chỉ tải video có thời lượng tối đa 10 phút.');
      }
      folder = await mkdtemp(join(tmpdir(), 'karaoke-video-'));
      const file = join(folder, 'song.mp4');
      await run(
        ytdlpBin,
        [
          ...options,
          '--no-progress',
          '--max-filesize',
          String(MAX_BYTES),
          '--match-filter',
          '!is_live & duration <= 600',
          '-f',
          FORMAT,
          '--merge-output-format',
          'mp4',
          '-o',
          file,
          url,
        ],
        { ...execOptions, timeout: 90000 }
      );
      const { size } = await stat(file);
      if (size <= 0 || size > MAX_BYTES) return fail(422, 'File video vượt giới hạn 80 MiB.');
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': size,
        'Cache-Control': 'no-store',
      });
      await pipeline(createReadStream(file), res, { signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted) {
        const stderrLine = String(error?.stderr || error?.message || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(-3)
          .join(' | ');
        console.warn('Karaoke download failed:', error?.code, `ffmpeg=${ffmpegLoc}`, stderrLine);
        const isAuthBlock = /sign in to confirm/i.test(stderrLine);
        if (isAuthBlock) {
          cachedDbCookies.fetchedAt = 0;
        }
        fail(
          500,
          isAuthBlock
            ? 'YouTube yêu cầu xác thực trên server (Admin cần cập nhật cookies.txt).'
            : 'Không tải được video. Kiểm tra yt-dlp, FFmpeg và kết nối mạng.'
        );
      }
    } finally {
      res.off('close', abort);
      try {
        if (folder) await rm(folder, { recursive: true, force: true });
      } finally {
        busy = false;
      }
    }
  };
}
