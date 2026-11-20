import type { AssetManifestEntry, SceneSchema } from '../types';
import { getAssetBlob, listAssets } from './AssetRepository';
import { getDb } from './IndexedDbClient';

export const BUNDLE_FORMAT = 'playcanvas-web-editor-bundle' as const;
export const BUNDLE_VERSION = '1.0.0';

export interface EmbeddedBundleAsset {
  manifest: AssetManifestEntry;
  base64Data: string;
}

export interface StandaloneBundle {
  format: typeof BUNDLE_FORMAT;
  bundleVersion: string;
  exportedAt: string;
  schema: SceneSchema;
  embeddedAssets: EmbeddedBundleAsset[];
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...slice));
  }
  return btoa(chunks.join(''));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function isStandaloneBundle(value: unknown): value is StandaloneBundle {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StandaloneBundle>;
  return (
    candidate.format === BUNDLE_FORMAT &&
    Boolean(candidate.schema) &&
    Array.isArray(candidate.embeddedAssets)
  );
}

function isPlainSceneSchema(value: unknown): value is SceneSchema {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SceneSchema>;
  return Boolean(candidate.version && candidate.metadata && candidate.scene);
}

/**
 * Exports a SceneSchema along with all project assets (base64-encoded)
 * as a self-contained JSON Blob for standalone Web Game distribution.
 */
export async function exportStandaloneBundle(schema: SceneSchema): Promise<Blob> {
  const storedAssets = await listAssets();
  const assetMap = new Map<string, AssetManifestEntry>();

  for (const entry of storedAssets) {
    assetMap.set(entry.id, entry);
  }
  for (const entry of schema.assets) {
    assetMap.set(entry.id, entry);
  }

  const allManifests = Array.from(assetMap.values());
  const embeddedAssets: EmbeddedBundleAsset[] = [];

  for (const manifest of allManifests) {
    const buffer = await getAssetBlob(manifest.indexedDbKey);
    if (!buffer) continue;
    embeddedAssets.push({
      manifest,
      base64Data: arrayBufferToBase64(buffer),
    });
  }

  const bundle: StandaloneBundle = {
    format: BUNDLE_FORMAT,
    bundleVersion: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    schema: {
      ...schema,
      assets: allManifests,
    },
    embeddedAssets,
  };

  return new Blob([JSON.stringify(bundle)], { type: 'application/json' });
}

/**
 * Imports a standalone JSON bundle file, restores all embedded assets into IndexedDB,
 * and returns the contained SceneSchema.
 */
export async function importStandaloneBundle(file: File): Promise<SceneSchema> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in bundle file: ${file.name}`);
  }

  if (isStandaloneBundle(parsed)) {
    if (parsed.embeddedAssets.length > 0) {
      const db = await getDb();
      const tx = db.transaction(['assets', 'blobs'], 'readwrite');
      const assetStore = tx.objectStore('assets');
      const blobStore = tx.objectStore('blobs');

      const ops: Promise<unknown>[] = [];
      for (const item of parsed.embeddedAssets) {
        const buffer = base64ToArrayBuffer(item.base64Data);
        ops.push(blobStore.put({ key: item.manifest.indexedDbKey, data: buffer }));
        ops.push(assetStore.put(item.manifest));
      }
      await Promise.all([...ops, tx.done]);
    }
    return parsed.schema;
  }

  if (isPlainSceneSchema(parsed)) {
    return parsed;
  }

  throw new Error(`Unrecognized standalone bundle format in file: ${file.name}`);
}

export const BundleExporter = {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  exportStandaloneBundle,
  importStandaloneBundle,
};
