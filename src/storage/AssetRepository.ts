import type { AssetManifestEntry, AssetType, PrefabData } from '../types';
import { getDb } from './IndexedDbClient';

const THUMBNAIL_SIZE = 128;

interface ExtensionMeta {
  type: AssetType;
  defaultMimeType: string;
}

const SUPPORTED_EXTENSIONS: Record<string, ExtensionMeta> = {
  glb: { type: 'glb', defaultMimeType: 'model/gltf-binary' },
  gltf: { type: 'gltf', defaultMimeType: 'model/gltf+json' },
  png: { type: 'texture', defaultMimeType: 'image/png' },
  jpg: { type: 'texture', defaultMimeType: 'image/jpeg' },
  jpeg: { type: 'texture', defaultMimeType: 'image/jpeg' },
  webp: { type: 'texture', defaultMimeType: 'image/webp' },
  mp3: { type: 'audio', defaultMimeType: 'audio/mpeg' },
  wav: { type: 'audio', defaultMimeType: 'audio/wav' },
  ogg: { type: 'audio', defaultMimeType: 'audio/ogg' },
};

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFolderPath(folderPath?: string): string {
  if (!folderPath || folderPath.trim() === '' || folderPath.trim() === '/') {
    return '/';
  }
  const trimmed = folderPath.trim().replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx === -1 || idx === filename.length - 1) {
    return '';
  }
  return filename.slice(idx + 1).toLowerCase();
}

function createBadgeThumbnail(label: string, accentHex: string, glyph: 'box' | 'audio' | 'prefab'): string {
  const iconSvg =
    glyph === 'box'
      ? `<path d="M64 26 L94 43 L94 77 L64 94 L34 77 L34 43 Z M64 26 L64 60 M34 43 L64 60 L94 43" fill="none" stroke="${accentHex}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`
      : glyph === 'audio'
        ? `<path d="M52 78 L52 40 L84 32 L84 70" fill="none" stroke="${accentHex}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="44" cy="78" r="8" fill="${accentHex}"/><circle cx="76" cy="70" r="8" fill="${accentHex}"/>`
        : `<rect x="40" y="34" width="48" height="48" rx="8" fill="none" stroke="${accentHex}" stroke-width="3.5"/><path d="M40 58 L88 58 M64 34 L64 82" stroke="${accentHex}" stroke-width="2.5" stroke-opacity="0.7"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="12" fill="url(#bg)"/>
  <rect x="2" y="2" width="124" height="124" rx="10" fill="none" stroke="${accentHex}" stroke-opacity="0.35" stroke-width="2"/>
  ${iconSvg}
  <rect x="28" y="96" width="72" height="20" rx="6" fill="${accentHex}" fill-opacity="0.2" stroke="${accentHex}" stroke-opacity="0.5" stroke-width="1"/>
  <text x="64" y="110" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="700" fill="#f8fafc" letter-spacing="0.06em">${label}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function generateImageThumbnail(file: File): Promise<string | undefined> {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return undefined;
  }

  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      try {
        drawScaledCentered(ctx, bitmap, bitmap.width, bitmap.height);
        return canvas.toDataURL('image/png');
      } finally {
        bitmap.close();
      }
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadHtmlImage(objectUrl);
      drawScaledCentered(ctx, img, img.naturalWidth || img.width, img.naturalHeight || img.height);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return createBadgeThumbnail('TEX', '#10b981', 'prefab');
  }
}

function drawScaledCentered(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
): void {
  if (srcWidth <= 0 || srcHeight <= 0) return;
  const scale = Math.min(THUMBNAIL_SIZE / srcWidth, THUMBNAIL_SIZE / srcHeight);
  const drawW = Math.max(1, Math.round(srcWidth * scale));
  const drawH = Math.max(1, Math.round(srcHeight * scale));
  const offsetX = Math.floor((THUMBNAIL_SIZE - drawW) / 2);
  const offsetY = Math.floor((THUMBNAIL_SIZE - drawH) / 2);
  ctx.clearRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function getThumbnailForAsset(type: AssetType, file?: File): Promise<string | undefined> {
  if (type === 'texture' && file) {
    return generateImageThumbnail(file);
  }
  if (type === 'glb') {
    return Promise.resolve(createBadgeThumbnail('GLB', '#38bdf8', 'box'));
  }
  if (type === 'gltf') {
    return Promise.resolve(createBadgeThumbnail('GLTF', '#0ea5e9', 'box'));
  }
  if (type === 'audio') {
    return Promise.resolve(createBadgeThumbnail('AUDIO', '#f59e0b', 'audio'));
  }
  return Promise.resolve(createBadgeThumbnail('PREFAB', '#6366f1', 'prefab'));
}

/**
 * Imports a browser File (.glb, .gltf, .png, .jpg, .jpeg, .webp, .mp3, .wav, .ogg)
 * into IndexedDB (`blobs` + `assets` stores) with an auto-generated thumbnail.
 */
export async function importFile(file: File, folderPath = '/'): Promise<AssetManifestEntry> {
  const ext = getFileExtension(file.name);
  const meta = SUPPORTED_EXTENSIONS[ext];
  if (!meta) {
    throw new Error(`Unsupported asset file type: ${file.name}`);
  }

  const id = generateId();
  const indexedDbKey = `asset:${id}`;
  const mimeType = file.type || meta.defaultMimeType;
  const buffer = await file.arrayBuffer();
  const thumbnailDataUrl = await getThumbnailForAsset(meta.type, file);

  const entry: AssetManifestEntry = {
    id,
    name: file.name,
    type: meta.type,
    folderPath: normalizeFolderPath(folderPath),
    mimeType,
    sizeBytes: buffer.byteLength,
    indexedDbKey,
    thumbnailDataUrl,
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  const tx = db.transaction(['blobs', 'assets'], 'readwrite');
  await Promise.all([
    tx.objectStore('blobs').put({ key: indexedDbKey, data: buffer }),
    tx.objectStore('assets').put(entry),
    tx.done,
  ]);

  return entry;
}

/**
 * Persists a PrefabData JSON payload into IndexedDB (`blobs` + `assets` stores).
 */
export async function savePrefab(
  name: string,
  prefab: PrefabData,
  folderPath = '/',
): Promise<AssetManifestEntry> {
  const id = prefab.id || generateId();
  const indexedDbKey = `prefab:${id}`;
  const normalizedPrefab: PrefabData = {
    ...prefab,
    id,
    name: name || prefab.name,
    createdAt: prefab.createdAt || new Date().toISOString(),
  };

  const encoded = new TextEncoder().encode(JSON.stringify(normalizedPrefab));
  const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);

  const entry: AssetManifestEntry = {
    id,
    name: normalizedPrefab.name,
    type: 'prefab',
    folderPath: normalizeFolderPath(folderPath),
    mimeType: 'application/json',
    sizeBytes: buffer.byteLength,
    indexedDbKey,
    thumbnailDataUrl: createBadgeThumbnail('PREFAB', '#6366f1', 'prefab'),
    createdAt: normalizedPrefab.createdAt,
  };

  const db = await getDb();
  const tx = db.transaction(['blobs', 'assets'], 'readwrite');
  await Promise.all([
    tx.objectStore('blobs').put({ key: indexedDbKey, data: buffer }),
    tx.objectStore('assets').put(entry),
    tx.done,
  ]);

  return entry;
}

/**
 * Retrieves raw binary data for an asset from the `blobs` store.
 */
export async function getAssetBlob(indexedDbKey: string): Promise<ArrayBuffer | null> {
  const db = await getDb();
  const record = await db.get('blobs', indexedDbKey);
  return record ? record.data : null;
}

/**
 * Retrieves an Object URL (`blob:...`) for an asset. Caller is responsible for calling `URL.revokeObjectURL`.
 */
export async function getAssetObjectUrl(
  indexedDbKey: string,
  mimeType: string,
): Promise<string | null> {
  const buffer = await getAssetBlob(indexedDbKey);
  if (!buffer) return null;
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Decodes a stored prefab JSON blob into PrefabData.
 */
export async function getPrefabData(indexedDbKey: string): Promise<PrefabData | null> {
  const buffer = await getAssetBlob(indexedDbKey);
  if (!buffer) return null;
  const json = new TextDecoder().decode(buffer);
  return JSON.parse(json) as PrefabData;
}

/**
 * Retrieves a single asset manifest entry by ID.
 */
export async function getAssetManifest(id: string): Promise<AssetManifestEntry | null> {
  const db = await getDb();
  const entry = await db.get('assets', id);
  return entry ?? null;
}

/**
 * Lists all asset manifest entries stored in IndexedDB.
 */
export async function listAssets(): Promise<AssetManifestEntry[]> {
  const db = await getDb();
  const entries = await db.getAll('assets');
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Deletes an asset manifest and its corresponding binary blob from IndexedDB.
 */
export async function deleteAsset(id: string): Promise<void> {
  const db = await getDb();
  const entry = await db.get('assets', id);
  const tx = db.transaction(['assets', 'blobs'], 'readwrite');
  const ops: Promise<unknown>[] = [tx.objectStore('assets').delete(id)];
  if (entry?.indexedDbKey) {
    ops.push(tx.objectStore('blobs').delete(entry.indexedDbKey));
  }
  await Promise.all([...ops, tx.done]);
}

/**
 * Updates an existing asset's binary blob and manifest byte size in IndexedDB.
 */
export async function updateAssetBlob(id: string, buffer: ArrayBuffer): Promise<void> {
  const db = await getDb();
  const entry = await db.get('assets', id);
  if (!entry) return;
  const tx = db.transaction(['assets', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('assets').put({ ...entry, sizeBytes: buffer.byteLength }),
    tx.objectStore('blobs').put({ key: entry.indexedDbKey, data: buffer }),
    tx.done,
  ]);
}

export const AssetRepository = {
  importFile,
  savePrefab,
  getAssetBlob,
  getAssetObjectUrl,
  getPrefabData,
  getAssetManifest,
  listAssets,
  deleteAsset,
  updateAssetBlob,
};
