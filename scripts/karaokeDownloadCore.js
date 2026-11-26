import { execFile } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const MAX_BYTES = 80 * 1024 * 1024;
const FORMAT = 'bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]';

function resolveYtdlpBin() {
  if (process.env.YTDLP_BIN) return process.env.YTDLP_BIN;
  const localBin = resolve('.bin/yt-dlp');
  return existsSync(localBin) ? localBin : 'yt-dlp';
}

function resolveFfmpegLocation() {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  try {
    const bin = require('ffmpeg-static');
    return typeof bin === 'string' && bin ? bin : null;
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
    try {
      const ytdlpBin = resolveYtdlpBin();
      const ffmpegLoc = resolveFfmpegLocation();
      const url = `https://www.youtube.com/watch?v=${id}`;
      const options = ['--ignore-config', '--no-playlist', '--no-update', '--socket-timeout', '10', '--retries', '1'];
      if (ffmpegLoc) {
        options.push('--ffmpeg-location', ffmpegLoc);
      }
      if (process.env.YTDLP_COOKIES_FILE) {
        options.push('--cookies', process.env.YTDLP_COOKIES_FILE);
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
        console.warn('Karaoke download failed:', error?.code, error?.message?.split('\n').at(-1));
        fail(502, 'Không tải được video. Kiểm tra yt-dlp, FFmpeg và kết nối mạng.');
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
