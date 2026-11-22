import type { SceneSchema } from '../types';
import { getDb, type StoredProjectRecord } from './IndexedDbClient';

const AUTO_DRAFT_ID = '__auto_draft__';
const SCENE_DRAFT_PREFIX = '__scene_draft__:';
const LAST_ACTIVE_SCENE_KEY = 'cavannghe:last-active-scene-id';
const LEGACY_MONOLITHIC_SCENE_ID = 'ca-van-nghe-lounge';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

function isLegacyMonolithicSchema(schema: SceneSchema | null | undefined): boolean {
  return Boolean(schema?.metadata?.id === LEGACY_MONOLITHIC_SCENE_ID);
}

/**
 * Persists a SceneSchema project to the `projects` object store.
 */
export async function saveProject(schema: SceneSchema): Promise<void> {
  const db = await getDb();
  const updatedAt = new Date().toISOString();
  const record: StoredProjectRecord = {
    id: schema.metadata.id,
    name: schema.metadata.name,
    updatedAt,
    schema: {
      ...schema,
      metadata: {
        ...schema.metadata,
        updatedAt,
      },
    },
  };
  await db.put('projects', record);
}

/**
 * Loads a SceneSchema project by ID, or returns null if not found.
 */
export async function loadProject(id: string): Promise<SceneSchema | null> {
  const db = await getDb();
  const record = await db.get('projects', id);
  return record ? record.schema : null;
}

/**
 * Lists all saved projects (excluding internal auto-drafts), sorted newest first.
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const records = await db.getAll('projects');
  return records
    .filter(
      (record) => record.id !== AUTO_DRAFT_ID && !record.id.startsWith(SCENE_DRAFT_PREFIX)
    )
    .map((record) => ({
      id: record.id,
      name: record.name,
      updatedAt: record.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Deletes a saved project by ID.
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('projects', id);
}

/**
 * Saves a per-scene draft slot in IndexedDB so multi-scene edits are isolated per scene.
 */
export async function saveSceneDraft(sceneId: string, schema: SceneSchema): Promise<void> {
  const db = await getDb();
  const updatedAt = new Date().toISOString();
  const normalizedSchema: SceneSchema = {
    ...schema,
    metadata: {
      ...schema.metadata,
      id: sceneId,
      updatedAt,
    },
  };
  const record: StoredProjectRecord = {
    id: `${SCENE_DRAFT_PREFIX}${sceneId}`,
    name: normalizedSchema.metadata.name,
    updatedAt,
    schema: normalizedSchema,
  };
  await db.put('projects', record);
  setLastActiveSceneId(sceneId);
}

/**
 * Loads a saved per-scene draft from IndexedDB, or returns null if none exists.
 */
export async function loadSceneDraft(sceneId: string): Promise<SceneSchema | null> {
  const db = await getDb();
  const record = await db.get('projects', `${SCENE_DRAFT_PREFIX}${sceneId}`);
  if (!record || isLegacyMonolithicSchema(record.schema)) {
    return null;
  }
  return record.schema;
}

/**
 * Deletes a saved per-scene draft from IndexedDB.
 */
export async function deleteSceneDraft(sceneId: string): Promise<void> {
  const db = await getDb();
  await db.delete('projects', `${SCENE_DRAFT_PREFIX}${sceneId}`);
}

/**
 * Saves the current scene as an internal auto-draft for crash/reload recovery,
 * and updates its dedicated per-scene draft slot.
 */
export async function saveAutoDraft(schema: SceneSchema): Promise<void> {
  const db = await getDb();
  const updatedAt = new Date().toISOString();
  const record: StoredProjectRecord = {
    id: AUTO_DRAFT_ID,
    name: schema.metadata.name,
    updatedAt,
    schema,
  };
  await db.put('projects', record);
  if (schema.metadata?.id && !isLegacyMonolithicSchema(schema)) {
    await saveSceneDraft(schema.metadata.id, schema);
  }
}

/**
 * Loads the internal auto-draft SceneSchema, or returns null if none exists or legacy.
 */
export async function loadAutoDraft(): Promise<SceneSchema | null> {
  const db = await getDb();
  const record = await db.get('projects', AUTO_DRAFT_ID);
  if (!record || isLegacyMonolithicSchema(record.schema)) {
    return null;
  }
  return record.schema;
}

export function setLastActiveSceneId(sceneId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LAST_ACTIVE_SCENE_KEY, sceneId);
  } catch {
    // ignore
  }
}

export function getLastActiveSceneId(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const id = window.localStorage.getItem(LAST_ACTIVE_SCENE_KEY);
    return id && id !== LEGACY_MONOLITHIC_SCENE_ID ? id : null;
  } catch {
    return null;
  }
}

export const ProjectRepository = {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  saveSceneDraft,
  loadSceneDraft,
  deleteSceneDraft,
  saveAutoDraft,
  loadAutoDraft,
  setLastActiveSceneId,
  getLastActiveSceneId,
};
