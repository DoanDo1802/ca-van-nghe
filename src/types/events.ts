import type { AnimatablePropertyPath } from './animation';
import type { AssetManifestEntry } from './assets';
import type { TransformData } from './scene';

export type PlayModeState = 'edit' | 'playing' | 'paused';
export type TransformTool = 'select' | 'move' | 'rotate' | 'scale';
export type CoordinateSpace = 'local' | 'world';
export type ConsoleLogLevel = 'log' | 'warn' | 'error';

export interface ConsoleLogPayload {
  id: string;
  level: ConsoleLogLevel;
  message: string;
  source?: string;
  timestamp: number;
}

export interface EditorEventMap {
  'engine:ready': { version: string };
  'scene:loaded': { sceneId: string };
  'hierarchy:changed': { rootId: string };
  'selection:changed': { entityIds: string[] };
  'entity:transform-updated': { entityId: string; transform: TransformData; fromGizmo: boolean };
  'entity:property-changed': { entityId: string; componentId?: string; property: string };
  'gizmo:drag-start': { entityIds: string[] };
  'gizmo:drag-end': { entityIds: string[] };
  'tool:changed': { tool: TransformTool; space: CoordinateSpace };
  'playmode:changed': { state: PlayModeState };
  'command:executed': { label: string; canUndo: boolean; canRedo: boolean };
  'timeline:scrub': { clipId: string; time: number };
  'timeline:keyframe-recorded': {
    clipId: string;
    entityId: string;
    property: AnimatablePropertyPath;
    time: number;
  };
  'asset:imported': { asset: AssetManifestEntry };
  'console:message': ConsoleLogPayload;
  'gameplay:prompt-changed': {
    entityId: string;
    entityName: string;
    promptText: string;
    keyCode: string;
  } | null;
}

export type EventHandler<T> = (payload: T) => void;

export interface TypedEventBus<TMap extends object = EditorEventMap> {
  on<K extends keyof TMap>(event: K, handler: EventHandler<TMap[K]>): () => void;
  once<K extends keyof TMap>(event: K, handler: EventHandler<TMap[K]>): () => void;
  off<K extends keyof TMap>(event: K, handler: EventHandler<TMap[K]>): void;
  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void;
  clear(): void;
}
