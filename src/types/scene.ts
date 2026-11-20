import type { AnimationClipData } from './animation';
import type { AssetManifestEntry } from './assets';
import type { ComponentData, ComponentType } from './components';
import type { InteractionRule } from './interaction';

export type Vec3 = [number, number, number];
export type ColorRGB = [number, number, number];
export type ColorRGBA = [number, number, number, number];

export interface TransformData {
  position: Vec3;
  rotation: Vec3; // Euler angles in degrees
  scale: Vec3;
}

export interface PrefabRefData {
  assetId: string;
  overrides?: {
    name?: string;
    transform?: Partial<TransformData>;
  };
}

export interface EntityData {
  id: string;
  name: string;
  enabled: boolean;
  tags: string[];
  transform: TransformData;
  components: ComponentData[];
  children: EntityData[];
  prefabRef?: PrefabRefData;
}

/**
 * Lightweight entity representation for React/Zustand Hierarchy rendering
 * without holding references to PlayCanvas `pc.Entity` instances.
 */
export interface EntitySummary {
  id: string;
  name: string;
  enabled: boolean;
  tags: string[];
  parentId: string | null;
  childIds: string[];
  componentTypes: ComponentType[];
}

export interface SceneSettings {
  ambientColor: ColorRGB;
  exposure?: number;
  skyboxColor: ColorRGBA;
  gravity: Vec3;
  activeCameraEntityId: string | null;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SceneSchema {
  version: string; // e.g. "1.0.0"
  metadata: ProjectMetadata;
  assets: AssetManifestEntry[];
  settings: SceneSettings;
  scene: EntityData; // Always represents SceneRoot
  animations: Record<string, AnimationClipData>;
  interactions: Record<string, InteractionRule[]>; // Keyed by entityId
}
