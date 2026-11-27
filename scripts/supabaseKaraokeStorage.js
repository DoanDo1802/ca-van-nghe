import { readFile } from 'node:fs/promises';

const DEFAULT_BUCKET = 'karaoke-videos';

export function getSupabaseStorageConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = (process.env.KARAOKE_SUPABASE_BUCKET || DEFAULT_BUCKET).trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, bucket };
}

function getPublicAudioObjectUrl(config, id) {
  return `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/audio-${encodeURIComponent(id)}.m4a`;
}

export async function checkSupabaseKaraokeAudio(id) {
  const config = getSupabaseStorageConfig();
  if (!config) return null;
  const publicUrl = getPublicAudioObjectUrl(config, id);
  try {
    const res = await fetch(publicUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? publicUrl : null;
  } catch {
    return null;
  }
}

export async function uploadFileToSupabaseKaraokeAudio(id, filePath) {
  const config = getSupabaseStorageConfig();
  if (!config) return null;
  const objectUrl = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/audio-${encodeURIComponent(id)}.m4a`;
  try {
    const body = await readFile(filePath);
    const res = await fetch(objectUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        'Content-Type': 'audio/mp4',
        'x-upsert': 'true',
        'cache-control': '31536000',
      },
      body,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('Supabase Storage audio upload failed:', res.status, errText.slice(0, 200));
      return null;
    }
    return getPublicAudioObjectUrl(config, id);
  } catch (err) {
    console.warn('Supabase Storage audio upload error:', err?.message || err);
    return null;
  }
}
