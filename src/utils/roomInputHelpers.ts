let cachedSupportsWebkitTextSecurity: boolean | null = null;

/**
 * Checks whether the current browser supports `-webkit-text-security: disc`.
 * Using a masked text input avoids triggering browser Password Manager autofill
 * on room search bars and room creation fields.
 */
export function supportsWebkitTextSecurity(): boolean {
  if (cachedSupportsWebkitTextSecurity !== null) {
    return cachedSupportsWebkitTextSecurity;
  }
  try {
    cachedSupportsWebkitTextSecurity =
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('-webkit-text-security', 'disc');
  } catch {
    cachedSupportsWebkitTextSecurity = false;
  }
  return cachedSupportsWebkitTextSecurity;
}

/**
 * Normalizes text for case- and Vietnamese diacritic-insensitive search matching.
 */
export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/**
 * Matches a room against a search query across room_id, room_name, and host_name
 * (both exact lowercase and diacritic-normalized).
 */
export function matchesRoomSearch(
  room: { room_id: string; room_name?: string; host_name?: string },
  query: string
): boolean {
  const rawQuery = query.trim().toLowerCase();
  if (!rawQuery) return true;
  const normQuery = normalizeSearchText(query);
  const candidates = [room.room_id, room.room_name || '', room.host_name || ''];
  return candidates.some((field) => {
    const rawField = field.toLowerCase();
    if (rawField.includes(rawQuery)) return true;
    return Boolean(normQuery) && normalizeSearchText(field).includes(normQuery);
  });
}
