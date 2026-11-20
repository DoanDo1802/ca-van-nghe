import { create } from 'zustand';
import { EditorEngine } from '../engine/EditorEngine';
import { AssetRepository } from '../storage';
import type { AssetManifestEntry } from '../types';
import { useConsoleStore } from './useConsoleStore';

export interface AssetStoreState {
  assets: AssetManifestEntry[];
  folders: string[];
  currentFolder: string;
  selectedAssetId: string | null;
  isLoading: boolean;

  setCurrentFolder: (folder: string) => void;
  setSelectedAssetId: (id: string | null) => void;
  loadAssets: () => Promise<void>;
  importFiles: (files: FileList | File[]) => Promise<AssetManifestEntry[]>;
  createFolder: (name: string) => void;
  createPrefabFromEntity: (entityId: string) => Promise<AssetManifestEntry | null>;
  deleteAsset: (id: string) => Promise<void>;
}

const DEFAULT_FOLDERS = ['/', '/Models', '/Textures', '/Audio', '/Prefabs'];

function normalizeFolderPath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed === '/') return '/';
  const collapsed = trimmed.replace(/\/+/g, '/').replace(/\/$/, '');
  return collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
}

function mergeFolders(existing: string[], assets: AssetManifestEntry[]): string[] {
  const set = new Set<string>(DEFAULT_FOLDERS);
  for (const folder of existing) {
    set.add(normalizeFolderPath(folder));
  }
  for (const asset of assets) {
    if (asset.folderPath) {
      const normalized = normalizeFolderPath(asset.folderPath);
      set.add(normalized);
      // Ensure parent folders exist too
      const parts = normalized.split('/').filter(Boolean);
      let acc = '';
      for (const part of parts) {
        acc += `/${part}`;
        set.add(acc);
      }
    }
  }
  return Array.from(set).sort((a, b) => {
    if (a === '/') return -1;
    if (b === '/') return 1;
    return a.localeCompare(b);
  });
}

export const useAssetStore = create<AssetStoreState>()((set, get) => ({
  assets: [],
  folders: DEFAULT_FOLDERS,
  currentFolder: '/',
  selectedAssetId: null,
  isLoading: false,

  setCurrentFolder: (folder) =>
    set({ currentFolder: normalizeFolderPath(folder), selectedAssetId: null }),

  setSelectedAssetId: (id) => set({ selectedAssetId: id }),

  loadAssets: async () => {
    set({ isLoading: true });
    try {
      const list = await AssetRepository.listAssets();
      set((state) => ({
        assets: list,
        folders: mergeFolders(state.folders, list),
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'AssetStore',
        message: `Failed to load assets: ${message}`,
      });
      set({ isLoading: false });
    }
  },

  importFiles: async (files) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return [];

    const folderPath = get().currentFolder;
    const imported: AssetManifestEntry[] = [];
    set({ isLoading: true });

    try {
      for (const file of fileArray) {
        try {
          const entry = await AssetRepository.importFile(file, folderPath);
          imported.push(entry);
          useConsoleStore.getState().addLog({
            level: 'log',
            source: 'AssetStore',
            message: `Imported asset "${entry.name}" (${entry.type}) into ${entry.folderPath}`,
          });
        } catch (fileErr) {
          const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
          useConsoleStore.getState().addLog({
            level: 'error',
            source: 'AssetStore',
            message: `Failed to import "${file.name}": ${msg}`,
          });
        }
      }

      if (imported.length > 0) {
        const latestList = await AssetRepository.listAssets();
        set((state) => ({
          assets: latestList,
          folders: mergeFolders(state.folders, latestList),
          selectedAssetId: imported[imported.length - 1].id,
        }));
      }
    } finally {
      set({ isLoading: false });
    }

    return imported;
  },

  createFolder: (name) => {
    const cleanName = name.trim().replace(/[\\/]+/g, '');
    if (!cleanName) return;
    const parent = get().currentFolder;
    const newPath = normalizeFolderPath(parent === '/' ? `/${cleanName}` : `${parent}/${cleanName}`);
    set((state) => ({
      folders: mergeFolders([...state.folders, newPath], state.assets),
      currentFolder: newPath,
      selectedAssetId: null,
    }));
  },

  createPrefabFromEntity: async (entityId) => {
    const engine = EditorEngine.getInstance();
    const prefab = engine.serializeEntityToPrefab(entityId);
    if (!prefab) {
      useConsoleStore.getState().addLog({
        level: 'warn',
        source: 'AssetStore',
        message: `Cannot create prefab: entity "${entityId}" not found or cannot be serialized.`,
      });
      return null;
    }

    const folderPath = get().currentFolder;
    set({ isLoading: true });
    try {
      const entry = await AssetRepository.savePrefab(prefab.name, prefab, folderPath);
      const latestList = await AssetRepository.listAssets();
      set((state) => ({
        assets: latestList,
        folders: mergeFolders(state.folders, latestList),
        selectedAssetId: entry.id,
        isLoading: false,
      }));
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'AssetStore',
        message: `Created prefab "${entry.name}" in ${entry.folderPath}`,
      });
      return entry;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'AssetStore',
        message: `Failed to save prefab: ${msg}`,
      });
      set({ isLoading: false });
      return null;
    }
  },

  deleteAsset: async (id) => {
    try {
      await AssetRepository.deleteAsset(id);
      set((state) => ({
        assets: state.assets.filter((a) => a.id !== id),
        selectedAssetId: state.selectedAssetId === id ? null : state.selectedAssetId,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'AssetStore',
        message: `Failed to delete asset: ${msg}`,
      });
    }
  },
}));
