import {
  checkSupabaseKaraokeAudio,
  uploadBufferToSupabaseKaraokeAudio,
} from './supabaseKaraokeStorage.js';

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_SEC = 600;

function pickAudioFormat(adaptiveFormats) {
  if (!Array.isArray(adaptiveFormats)) return null;
  const withUrl = adaptiveFormats.filter(
    (f) => f && typeof f.url === 'string' && f.url && typeof f.mimeType === 'string'
  );
  return (
    withUrl.find((f) => Number(f.itag) === 140) ||
    withUrl.find((f) => f.mimeType.startsWith('audio/mp4')) ||
    withUrl.find((f) => f.mimeType.startsWith('audio/')) ||
    null
  );
}

export function createKaraokeAudioHandler({ localhostOnly = false } = {}) {
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

    const controller = new AbortController();
    const abort = () => {
      if (!res.writableFinished) controller.abort();
    };
    res.once('close', abort);

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

      const rapidApiKey = (process.env.RAPIDAPI_KEY || '').trim();
      const rapidApiHost = (process.env.RAPIDAPI_HOST || 'yt-api.p.rapidapi.com').trim();
      const rapidApiGeo = (process.env.RAPIDAPI_GEO || 'SE').trim();
      if (!rapidApiKey) {
        return fail(503, 'Chưa cấu hình RAPIDAPI_KEY trên server.');
      }

      const apiUrl = `https://${rapidApiHost}/dl?id=${encodeURIComponent(id)}&cgeo=${encodeURIComponent(rapidApiGeo)}`;
      const apiRes = await fetch(apiUrl, {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': rapidApiHost,
        },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });

      if (!apiRes.ok) {
        const body = await apiRes.text().catch(() => '');
        console.warn(`Karaoke RapidAPI HTTP ${apiRes.status} for ${id}:`, body.slice(0, 200));
        return fail(502, `Dịch vụ lấy nhạc trả về lỗi (${apiRes.status}).`);
      }

      const data = await apiRes.json();
      if (data?.status !== 'OK') {
        console.warn(`Karaoke RapidAPI status="${data?.status}" for ${id}:`, data?.msg || data?.error || '');
        return fail(422, data?.msg || 'Không lấy được thông tin âm thanh từ YouTube.');
      }

      if (data?.isLiveContent) {
        return fail(422, 'Không hỗ trợ video livestream.');
      }

      const durationSec = Number(data?.lengthSeconds || 0);
      if (Number.isFinite(durationSec) && durationSec > MAX_DURATION_SEC) {
        return fail(422, 'Video dài hơn 10 phút, vượt giới hạn.');
      }

      const chosen = pickAudioFormat(data?.adaptiveFormats);
      if (!chosen) {
        return fail(422, 'Không tìm thấy luồng âm thanh phù hợp cho video này.');
      }

      const mimeType = chosen.mimeType.split(';')[0].trim() || 'audio/mp4';
      const audioRes = await fetch(chosen.url, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
      });
      if (!audioRes.ok) {
        console.warn(`Karaoke audio stream fetch HTTP ${audioRes.status} for ${id}`);
        return fail(502, `Không tải được luồng âm thanh (${audioRes.status}).`);
      }

      const buffer = Buffer.from(await audioRes.arrayBuffer());
      if (buffer.byteLength <= 0 || buffer.byteLength > MAX_BYTES) {
        return fail(422, 'File âm thanh vượt giới hạn 25 MiB.');
      }

      if (mimeType === 'audio/mp4') {
        const publicAudioUrl = await uploadBufferToSupabaseKaraokeAudio(id, buffer, mimeType);
        if (publicAudioUrl) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ url: publicAudioUrl, cached: false }));
          return;
        }
      }

      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': buffer.byteLength,
        'Cache-Control': 'no-store',
      });
      res.end(buffer);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn('Karaoke audio fetch failed:', error?.message || error);
        fail(500, 'Không tải được âm thanh bài hát. Hãy thử bài khác hoặc chọn file MP3.');
      }
    } finally {
      res.off('close', abort);
    }
  };
}
