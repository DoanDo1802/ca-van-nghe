import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssetManifestEntry, SceneSchema } from '../types';

export const DB_NAME = 'playcanvas-web-editor';
export const DB_VERSION = 1;

export interface StoredProjectRecord {
  id: string;
  name: string;
  updatedAt: string;
  schema: SceneSchema;
}

export interface StoredBlobRecord {
  key: string;
  data: ArrayBuffer;
}

export interface PlayCanvasEditorDB extends DBSchema {
  projects: {
    key: string;
    value: StoredProjectRecord;
  };
  assets: {
    key: string;
    value: AssetManifestEntry;
  };
  blobs: {
    key: string;
    value: StoredBlobRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<PlayCanvasEditorDB>> | null = null;

/**
 * Opens (or returns the cached) IndexedDB database instance for the editor.
 */
export function getDb(): Promise<IDBPDatabase<PlayCanvasEditorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PlayCanvasEditorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'key' });
        }
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/**
 * Closes the cached database connection if open.
 */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

export const IndexedDbClient = {
  DB_NAME,
  DB_VERSION,
  getDb,
  closeDb,
};
