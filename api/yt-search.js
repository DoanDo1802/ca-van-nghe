function parseYouTubeSearch(html) {
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

export default async function handler(req, res) {
  try {
    const q = String(req.query?.q || '').trim();
    if (!q) {
      return res.status(200).json({ items: [] });
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
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ items: [], error: String(err) });
  }
}
