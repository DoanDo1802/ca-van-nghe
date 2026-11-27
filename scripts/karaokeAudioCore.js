import { execFile } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  checkSupabaseKaraokeAudio,
  uploadFileToSupabaseKaraokeAudio,
} from './supabaseKaraokeStorage.js';

const run = promisify(execFile);
const MAX_BYTES = 25 * 1024 * 1024;
const AUDIO_FORMAT = 'ba[ext=m4a][abr<=128]/ba[ext=m4a]/ba[acodec^=mp4a]';
const WORK_TMP_ROOT = resolve(process.env.KARAOKE_TMP_DIR || '.tmp-karaoke');
const XDG_CONFIG_HOME = resolve('.bin/xdg-config');

try {
  rmSync(WORK_TMP_ROOT, { recursive: true, force: true });
  mkdirSync(WORK_TMP_ROOT, { recursive: true });
} catch {
  // ignore startup cleanup errors
}

let cachedDbCookies = { value: '', fetchedAt: 0 };

function normalizeToNetscapeCookies(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lines = trimmed.split(/\r?\n/);
  if (
    trimmed.startsWith('# Netscape HTTP Cookie File') ||
    lines.some((l) => !l.trim().startsWith('#') && l.split('\t').length >= 7)
  ) {
    return trimmed;
  }

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
      mkdirSync(WORK_TMP_ROOT, { recursive: true });
      const out = join(WORK_TMP_ROOT, 'ytdlp-cookies.txt');
      writeFileSync(out, normalized, 'utf8');
      return out;
    }
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
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
          signal: AbortSignal.timeout(5000),
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
  mkdirSync(WORK_TMP_ROOT, { recursive: true });
  const out = join(WORK_TMP_ROOT, 'ytdlp-cookies-db.txt');
  writeFileSync(out, normalized, 'utf8');
  return out;
}

function resolveYtdlpBin() {
  if (process.env.YTDLP_BIN) return process.env.YTDLP_BIN;
  const localBin = resolve('.bin/yt-dlp');
  return existsSync(localBin) ? localBin : 'yt-dlp';
}

export function createKaraokeAudioHandler({ localhostOnly = false } = {}) {
  let busy = false;

  return async function handleKaraokeAudio(req, res) {
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
    try {
      const cachedUrl = await checkSupabaseKaraokeAudio(id);
      if (cachedUrl) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ url: cachedUrl, cached: true }));
        return;
      }

      const url = `https://www.youtube.com/watch?v=${id}`;
      const baseArgs = [
        '--ignore-config',
        '--no-playlist',
        '--no-update',
        '--socket-timeout',
        '10',
        '--retries',
        '1',
        '--no-progress',
        '--max-filesize',
        String(MAX_BYTES),
        '--match-filter',
        '!is_live & duration <= 600',
        '--js-runtimes',
        `node:${process.execPath}`,
        '-f',
        AUDIO_FORMAT,
      ];
      const execOptions = {
        signal: controller.signal,
        timeout: 65000,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...process.env,
          TMPDIR: WORK_TMP_ROOT,
          XDG_CONFIG_HOME,
        },
      };

      mkdirSync(WORK_TMP_ROOT, { recursive: true });
      folder = await mkdtemp(join(WORK_TMP_ROOT, 'audio-'));
      const file = join(folder, 'song.m4a');

      try {
        await run(ytdlpBin, [...baseArgs, '-o', file, url], execOptions);
      } catch (firstErr) {
        const firstStderr = String(firstErr?.stderr || firstErr?.message || '');
        if (/sign in to confirm/i.test(firstStderr) && !controller.signal.aborted) {
          cachedDbCookies.fetchedAt = 0;
          const cookiesFile = await resolveCookiesFile();
          if (cookiesFile) {
            await run(
              ytdlpBin,
              [...baseArgs, '--cookies', cookiesFile, '-o', file, url],
              execOptions
            );
          } else {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }

      if (!existsSync(file)) {
        return fail(422, 'Video không hợp lệ (livestream hoặc dài hơn 10 phút).');
      }
      const { size } = await stat(file);
      if (size <= 0 || size > MAX_BYTES) {
        return fail(422, 'File âm thanh vượt giới hạn 25 MiB.');
      }

      const publicAudioUrl = await uploadFileToSupabaseKaraokeAudio(id, file);
      if (publicAudioUrl) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ url: publicAudioUrl, cached: false }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'audio/mp4',
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
        console.warn('Karaoke audio download failed:', error?.code, stderrLine);
        const isAuthBlock = /sign in to confirm/i.test(stderrLine);
        fail(
          500,
          isAuthBlock
            ? 'YouTube chặn xác thực bot trên server khi tải âm thanh.'
            : 'Không tải được âm thanh bài hát. Hãy thử bài khác hoặc chọn file MP3.'
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
