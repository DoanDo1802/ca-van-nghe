import type { SceneSchema } from '../types';
import { getDb, type StoredProjectRecord } from './IndexedDbClient';

const AUTO_DRAFT_ID = '__auto_draft__';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
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
 * Lists all saved projects (excluding the internal auto-draft), sorted newest first.
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const records = await db.getAll('projects');
  return records
    .filter((record) => record.id !== AUTO_DRAFT_ID)
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
 * Saves the current scene as an internal auto-draft for crash/reload recovery.
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
}

/**
 * Loads the internal auto-draft SceneSchema, or returns null if none exists.
 */
export async function loadAutoDraft(): Promise<SceneSchema | null> {
  const db = await getDb();
  const record = await db.get('projects', AUTO_DRAFT_ID);
  return record ? record.schema : null;
}

export const ProjectRepository = {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  saveAutoDraft,
  loadAutoDraft,
};
