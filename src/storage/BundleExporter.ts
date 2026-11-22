import type { AssetManifestEntry, EntityData, SceneSchema } from '../types';
import { getAssetBlob, listAssets } from './AssetRepository';
import { getDb } from './IndexedDbClient';
import { saveSceneDraft } from './ProjectRepository';
import {
  getAllSceneDefinitions,
  saveBuildSettingsScenes,
  type BuildSceneEntry,
} from '../engine/serialization/SceneRegistry';

export const BUNDLE_FORMAT = 'playcanvas-web-editor-bundle' as const;
export const MULTI_BUNDLE_FORMAT = 'playcanvas-multi-scene-bundle' as const;
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

export interface MultiSceneStandaloneBundle {
  format: typeof MULTI_BUNDLE_FORMAT;
  bundleVersion: string;
  exportedAt: string;
  startupSceneId: string;
  scenes: SceneSchema[];
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

function isMultiSceneBundle(value: unknown): value is MultiSceneStandaloneBundle {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MultiSceneStandaloneBundle>;
  return (
    candidate.format === MULTI_BUNDLE_FORMAT &&
    Array.isArray(candidate.scenes) &&
    Array.isArray(candidate.embeddedAssets)
  );
}

function isPlainSceneSchema(value: unknown): value is SceneSchema {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SceneSchema>;
  return Boolean(candidate.version && candidate.metadata && candidate.scene);
}

function collectReferencedAssetIdsFromEntity(entity: EntityData, out: Set<string>): void {
  if (entity.prefabRef?.assetId) {
    out.add(entity.prefabRef.assetId);
  }
  for (const comp of entity.components) {
    if (comp.type === 'render') {
      if (comp.meshAssetId) out.add(comp.meshAssetId);
      if (comp.material.diffuseMapAssetId) out.add(comp.material.diffuseMapAssetId);
      if (comp.material.normalMapAssetId) out.add(comp.material.normalMapAssetId);
      if (comp.material.metalnessMapAssetId) out.add(comp.material.metalnessMapAssetId);
    } else if (comp.type === 'collision' && comp.meshAssetId) {
      out.add(comp.meshAssetId);
    } else if (comp.type === 'audioSource' && comp.audioAssetId) {
      out.add(comp.audioAssetId);
    } else if (comp.type === 'script') {
      for (const attr of comp.attributes) {
        if (attr.type === 'asset' && typeof attr.value === 'string' && attr.value) {
          out.add(attr.value);
        }
      }
    }
  }
  for (const child of entity.children) {
    collectReferencedAssetIdsFromEntity(child, out);
  }
}

function collectReferencedAssetIdsFromSchemas(schemas: SceneSchema[]): Set<string> {
  const ids = new Set<string>();
  for (const schema of schemas) {
    for (const asset of schema.assets ?? []) {
      if (asset?.id) ids.add(asset.id);
    }
    collectReferencedAssetIdsFromEntity(schema.scene, ids);
  }
  return ids;
}

/**
 * Exports a single SceneSchema along with its referenced project assets (base64-encoded)
 * as a self-contained JSON Blob.
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
 * Exports ONLY the selected scenes in Build Settings along with ONLY the assets
 * referenced by those selected scenes.
 */
export async function exportMultiSceneBundle(schemas: SceneSchema[]): Promise<Blob> {
  if (schemas.length === 0) {
    throw new Error('Phải chọn ít nhất 1 scene trong Build Settings để export.');
  }

  const referencedIds = collectReferencedAssetIdsFromSchemas(schemas);
  const storedAssets = await listAssets();
  const assetMap = new Map<string, AssetManifestEntry>();

  for (const entry of storedAssets) {
    if (referencedIds.has(entry.id)) {
      assetMap.set(entry.id, entry);
    }
  }
  for (const schema of schemas) {
    for (const entry of schema.assets ?? []) {
      if (referencedIds.has(entry.id)) {
        assetMap.set(entry.id, entry);
      }
    }
  }

  const selectedManifests = Array.from(assetMap.values());
  const embeddedAssets: EmbeddedBundleAsset[] = [];

  for (const manifest of selectedManifests) {
    const buffer = await getAssetBlob(manifest.indexedDbKey);
    if (!buffer) continue;
    embeddedAssets.push({
      manifest,
      base64Data: arrayBufferToBase64(buffer),
    });
  }

  const normalizedScenes = schemas.map((schema) => {
    const sceneRefs = collectReferencedAssetIdsFromSchemas([schema]);
    return {
      ...schema,
      assets: selectedManifests.filter((m) => sceneRefs.has(m.id)),
    };
  });

  const bundle: MultiSceneStandaloneBundle = {
    format: MULTI_BUNDLE_FORMAT,
    bundleVersion: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    startupSceneId: normalizedScenes[0].metadata.id,
    scenes: normalizedScenes,
    embeddedAssets,
  };

  return new Blob([JSON.stringify(bundle)], { type: 'application/json' });
}

async function restoreEmbeddedAssets(embeddedAssets: EmbeddedBundleAsset[]): Promise<void> {
  if (embeddedAssets.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(['assets', 'blobs'], 'readwrite');
  const assetStore = tx.objectStore('assets');
  const blobStore = tx.objectStore('blobs');

  const ops: Promise<unknown>[] = [];
  for (const item of embeddedAssets) {
    const buffer = base64ToArrayBuffer(item.base64Data);
    ops.push(blobStore.put({ key: item.manifest.indexedDbKey, data: buffer }));
    ops.push(assetStore.put(item.manifest));
  }
  await Promise.all([...ops, tx.done]);
}

/**
 * Imports a standalone JSON bundle (single-scene or multi-scene), restores embedded assets
 * and per-scene drafts into IndexedDB, and returns the startup SceneSchema.
 */
export async function importStandaloneBundle(file: File): Promise<SceneSchema> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in bundle file: ${file.name}`);
  }

  if (isMultiSceneBundle(parsed)) {
    await restoreEmbeddedAssets(parsed.embeddedAssets);
    if (parsed.scenes.length === 0) {
      throw new Error(`Multi-scene bundle "${file.name}" has no scenes.`);
    }

    const importedIds = new Set<string>();
    for (const scene of parsed.scenes) {
      if (scene?.metadata?.id) {
        importedIds.add(scene.metadata.id);
        await saveSceneDraft(scene.metadata.id, scene);
      }
    }

    const allDefs = getAllSceneDefinitions();
    const defById = new Map(allDefs.map((d) => [d.id, d]));
    const nextBuildEntries: BuildSceneEntry[] = [];
    for (const scene of parsed.scenes) {
      const id = scene.metadata.id;
      const def = defById.get(id);
      if (def) {
        nextBuildEntries.push({
          sceneId: def.id,
          name: def.name,
          path: def.path,
          enabled: true,
        });
      }
    }
    for (const def of allDefs) {
      if (!importedIds.has(def.id)) {
        nextBuildEntries.push({
          sceneId: def.id,
          name: def.name,
          path: def.path,
          enabled: false,
        });
      }
    }
    saveBuildSettingsScenes(nextBuildEntries);

    return (
      parsed.scenes.find((s) => s.metadata?.id === parsed.startupSceneId) ?? parsed.scenes[0]
    );
  }

  if (isStandaloneBundle(parsed)) {
    await restoreEmbeddedAssets(parsed.embeddedAssets);
    if (parsed.schema?.metadata?.id) {
      await saveSceneDraft(parsed.schema.metadata.id, parsed.schema);
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
  MULTI_BUNDLE_FORMAT,
  BUNDLE_VERSION,
  exportStandaloneBundle,
  exportMultiSceneBundle,
  importStandaloneBundle,
};
