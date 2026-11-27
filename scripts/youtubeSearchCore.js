export function parseYouTubeSearch(html) {
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
  if (!match) return [];
  const data = JSON.parse(match[1]);
  const items = [];
  const seen = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object' || items.length >= 20) return;
    const v = node.videoRenderer;
    if (v && v.videoId && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      const title = v.title?.runs?.map((r) => r.text).join('') || '';
      const channel = v.ownerText?.runs?.[0]?.text || 'YouTube';
      const durationLabel = v.lengthText?.simpleText || 'LIVE';
      const views = v.shortViewCountText?.simpleText || '';
      if (title) {
        items.push({
          id: v.videoId,
          youtubeId: v.videoId,
          title,
          artist: channel,
          channel,
          views: views ? `${views} lượt xem` : 'YouTube Karaoke',
          durationLabel,
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          category: 'YouTube',
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
    } else {
      for (const val of Object.values(node)) walk(val);
    }
  }

  walk(data);
  return items;
}

export async function handleYouTubeSearch(req, res) {
  try {
    const url = new URL(req.url || '', 'http://localhost');
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: [] }));
      return;
    }
    const ytRes = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        },
      }
    );
    const html = await ytRes.text();
    const items = parseYouTubeSearch(html);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items: [], error: String(err) }));
  }
}
