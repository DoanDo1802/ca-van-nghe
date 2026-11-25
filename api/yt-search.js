export default async function handler(req, res) {
  try {
    const q = String(req.query?.q || '').trim();
    if (!q) {
      return res.status(200).json({ items: [] });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        items: [],
        error: 'Chưa cấu hình YOUTUBE_API_KEY trên server.',
      });
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('maxResults', '15');
    url.searchParams.set('q', q);
    url.searchParams.set('key', apiKey);

    const ytRes = await fetch(url.toString());
    if (!ytRes.ok) {
      const errText = await ytRes.text().catch(() => '');
      return res.status(ytRes.status).json({
        items: [],
        error: `YouTube Data API v3 error (${ytRes.status}): ${errText.slice(0, 200)}`,
      });
    }

    const data = await ytRes.json();
    const items = (Array.isArray(data.items) ? data.items : [])
      .filter((item) => Boolean(item?.id?.videoId))
      .map((item) => {
        const videoId = item.id.videoId;
        const snippet = item.snippet || {};
        return {
          id: videoId,
          youtubeId: videoId,
          title: snippet.title || 'YouTube Karaoke',
          artist: snippet.channelTitle || 'YouTube',
          channel: snippet.channelTitle || 'YouTube',
          views: 'YouTube',
          durationLabel: 'HD',
          thumbnail:
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.medium?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          category: 'YouTube',
        };
      });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ items: [], error: String(err) });
  }
}
