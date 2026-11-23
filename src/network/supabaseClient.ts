import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null | undefined;

function normalizeSupabaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  return trimmed || null;
}

export function getSupabaseRestConfig(): { url: string; anonKey: string } | null {
  const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseRestConfig());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    cachedClient = null;
    return null;
  }

  cachedClient = createClient(url, key, {
    realtime: {
      params: {
        eventsPerSecond: 30,
      },
    },
  });
  return cachedClient;
}
