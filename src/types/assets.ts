import type { EntityData } from './scene';

export type AssetType = 'glb' | 'gltf' | 'texture' | 'audio' | 'prefab';

export interface AssetManifestEntry {
  id: string;
  name: string;
  type: AssetType;
  folderPath: string; // Virtual folder path, e.g. "/Models"
  mimeType: string;
  sizeBytes: number;
  indexedDbKey: string;
  thumbnailDataUrl?: string;
  createdAt: string;
}

export interface PrefabData {
  id: string;
  name: string;
  root: EntityData;
  createdAt: string;
}
