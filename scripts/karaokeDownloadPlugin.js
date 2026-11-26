import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const maxBytes = 80 * 1024 * 1024;
const format = 'bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]';

export function karaokeDownloadPlugin() {
  let busy = false;
  return {
    name: 'local-karaoke-download',
    configureServer(server) {
      server.middlewares.use('/api/dev/karaoke-video', async (req, res) => {
        const fail = (status, error) => {
          if (res.destroyed || res.headersSent) return;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error }));
        };
        const host = req.headers.host ?? '';
        if (req.method !== 'POST' ||
            !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
            req.headers.origin !== `http://${host}` ||
            !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
          return fail(403, 'Luồng tải thử chỉ chạy trên localhost.');
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
          const url = `https://www.youtube.com/watch?v=${id}`;
          const options = ['--ignore-config', '--no-playlist', '--no-update', '--socket-timeout', '10', '--retries', '1'];
          const execOptions = { signal: controller.signal, timeout: 45000, maxBuffer: 2 * 1024 * 1024 };
          const { stdout } = await run('yt-dlp', [...options, '-J', '--skip-download', url], execOptions);
          const info = JSON.parse(stdout);
          if (info.is_live || ['is_live', 'is_upcoming', 'post_live'].includes(info.live_status)) {
            return fail(422, 'Không hỗ trợ video livestream đang hoặc sắp phát.');
          }
          if (!Number.isFinite(info.duration) || info.duration <= 0 || info.duration > 600) {
            return fail(422, 'Chỉ tải video có thời lượng tối đa 10 phút.');
          }
          folder = await mkdtemp(join(tmpdir(), 'karaoke-video-'));
          const file = join(folder, 'song.mp4');
          await run('yt-dlp', [
            ...options, '--no-progress', '--max-filesize', String(maxBytes),
            '--match-filter', '!is_live & duration <= 600',
            '-f', format, '--merge-output-format', 'mp4', '-o', file, url,
          ], { ...execOptions, timeout: 90000 });
          const { size } = await stat(file);
          if (size <= 0 || size > maxBytes) return fail(422, 'File video vượt giới hạn 80 MiB.');
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': size,
            'Cache-Control': 'no-store',
          });
          await pipeline(createReadStream(file), res, { signal: controller.signal });
        } catch (error) {
          if (!controller.signal.aborted) {
            console.warn('Local karaoke download failed:', error.code, error.message?.split('\n').at(-1));
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
      });
    },
  };
}
