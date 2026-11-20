import { create } from 'zustand';
import type {
  CoordinateSpace,
  EntitySummary,
  PlayModeState,
  TransformTool,
} from '../types';

export interface SnapSettings {
  enabled: boolean;
  translateStep: number;
  rotateStep: number;
  scaleStep: number;
}

export interface EditorStoreState {
  engineReady: boolean;
  sceneId: string | null;
  sceneName: string;
  isDirty: boolean;
  rootEntityId: string | null;
  selectedEntityIds: string[];
  activeTool: TransformTool;
  coordSpace: CoordinateSpace;
  snapSettings: SnapSettings;
  playState: PlayModeState;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  hierarchyTreeVersion: number;
  inspectorVersion: number;
  entitySummaries: Record<string, EntitySummary>;

  setEngineReady: (ready: boolean) => void;
  setSceneMeta: (sceneId: string, sceneName: string, rootEntityId: string) => void;
  setDirty: (dirty: boolean) => void;
  setSelectedEntityIds: (ids: string[]) => void;
  toggleEntitySelection: (id: string) => void;
  clearSelection: () => void;
  setActiveTool: (tool: TransformTool) => void;
  setCoordSpace: (space: CoordinateSpace) => void;
  setSnapSettings: (patch: Partial<SnapSettings>) => void;
  toggleSnap: () => void;
  setPlayState: (state: PlayModeState) => void;
  setCommandHistoryState: (canUndo: boolean, canRedo: boolean, label?: string | null) => void;
  bumpHierarchyVersion: () => void;
  bumpInspectorVersion: () => void;
  setEntitySummaries: (
    summaries: Record<string, EntitySummary>,
    rootEntityId?: string | null
  ) => void;
  upsertEntitySummary: (summary: EntitySummary) => void;
  removeEntitySummary: (entityId: string) => void;
}

const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: false,
  translateStep: 0.5,
  rotateStep: 15,
  scaleStep: 0.1,
};

export const useEditorStore = create<EditorStoreState>()((set) => ({
  engineReady: false,
  sceneId: null,
  sceneName: 'Untitled Scene',
  isDirty: false,
  rootEntityId: null,
  selectedEntityIds: [],
  activeTool: 'move',
  coordSpace: 'world',
  snapSettings: DEFAULT_SNAP_SETTINGS,
  playState: 'edit',
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  hierarchyTreeVersion: 0,
  inspectorVersion: 0,
  entitySummaries: {},

  setEngineReady: (ready) => set({ engineReady: ready }),

  setSceneMeta: (sceneId, sceneName, rootEntityId) =>
    set({ sceneId, sceneName, rootEntityId }),

  setDirty: (isDirty) => set({ isDirty }),

  setSelectedEntityIds: (ids) => set({ selectedEntityIds: ids }),

  toggleEntitySelection: (id) =>
    set((state) => {
      const exists = state.selectedEntityIds.includes(id);
      return {
        selectedEntityIds: exists
          ? state.selectedEntityIds.filter((item) => item !== id)
          : [...state.selectedEntityIds, id],
      };
    }),

  clearSelection: () => set({ selectedEntityIds: [] }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setCoordSpace: (space) => set({ coordSpace: space }),

  setSnapSettings: (patch) =>
    set((state) => ({
      snapSettings: { ...state.snapSettings, ...patch },
    })),

  toggleSnap: () =>
    set((state) => ({
      snapSettings: {
        ...state.snapSettings,
        enabled: !state.snapSettings.enabled,
      },
    })),

  setPlayState: (playState) => set({ playState }),

  setCommandHistoryState: (canUndo, canRedo, label = null) =>
    set({ canUndo, canRedo, undoLabel: label }),

  bumpHierarchyVersion: () =>
    set((state) => ({ hierarchyTreeVersion: state.hierarchyTreeVersion + 1 })),

  bumpInspectorVersion: () =>
    set((state) => ({ inspectorVersion: state.inspectorVersion + 1 })),

  setEntitySummaries: (summaries, rootEntityId) =>
    set((state) => ({
      entitySummaries: summaries,
      rootEntityId: rootEntityId !== undefined ? rootEntityId : state.rootEntityId,
      hierarchyTreeVersion: state.hierarchyTreeVersion + 1,
    })),

  upsertEntitySummary: (summary) =>
    set((state) => ({
      entitySummaries: {
        ...state.entitySummaries,
        [summary.id]: summary,
      },
      hierarchyTreeVersion: state.hierarchyTreeVersion + 1,
    })),

  removeEntitySummary: (entityId) =>
    set((state) => {
      if (!(entityId in state.entitySummaries)) return state;
      const next = { ...state.entitySummaries };
      delete next[entityId];
      return {
        entitySummaries: next,
        selectedEntityIds: state.selectedEntityIds.filter((id) => id !== entityId),
        hierarchyTreeVersion: state.hierarchyTreeVersion + 1,
      };
    }),
}));
