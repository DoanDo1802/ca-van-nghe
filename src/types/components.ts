import type { InteractionRule } from './interaction';
import type { ColorRGB, ColorRGBA, Vec3 } from './scene';

export type ComponentType =
  | 'render'
  | 'light'
  | 'camera'
  | 'collision'
  | 'rigidbody'
  | 'anim'
  | 'interactive'
  | 'script';

export interface BaseComponentData {
  id: string;
  type: ComponentType;
  enabled: boolean;
}

export interface MaterialOverrideData {
  diffuseColor: ColorRGB;
  metalness: number; // 0..1
  gloss: number; // 0..1
  emissiveColor: ColorRGB;
  emissiveIntensity: number;
  opacity: number; // 0..1
  diffuseMapAssetId?: string | null;
  normalMapAssetId?: string | null;
  metalnessMapAssetId?: string | null;
}

export type RenderMeshType = 'box' | 'sphere' | 'plane' | 'cylinder' | 'capsule' | 'asset';

export interface RenderComponentData extends BaseComponentData {
  type: 'render';
  meshType: RenderMeshType;
  meshAssetId?: string | null;
  castShadows: boolean;
  receiveShadows: boolean;
  material: MaterialOverrideData;
}

export type LightType = 'directional' | 'point' | 'spot';

export interface LightComponentData extends BaseComponentData {
  type: 'light';
  lightType: LightType;
  color: ColorRGB;
  intensity: number;
  range: number;
  castShadows: boolean;
  innerConeAngle: number;
  outerConeAngle: number;
}

export type CameraProjection = 'perspective' | 'orthographic';

export interface CameraComponentData extends BaseComponentData {
  type: 'camera';
  fov: number;
  clearColor: ColorRGBA;
  nearClip: number;
  farClip: number;
  priority: number;
  projection: CameraProjection;
  orthoHeight?: number;
}

export type CollisionShape = 'box' | 'sphere' | 'capsule' | 'mesh';

export interface CollisionComponentData extends BaseComponentData {
  type: 'collision';
  shape: CollisionShape;
  halfExtents: Vec3;
  radius: number;
  height: number;
  meshAssetId?: string | null;
  isTrigger: boolean;
}

export type RigidBodyType = 'static' | 'dynamic' | 'kinematic';

export interface RigidBodyComponentData extends BaseComponentData {
  type: 'rigidbody';
  bodyType: RigidBodyType;
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  linearFactor: Vec3;
  angularFactor: Vec3;
}

export interface AnimStateConfig {
  name: string;
  clipAssetId: string; // GLB AnimTrack or AnimationClipData ID
  speed: number;
  loop: boolean;
}

export interface AnimTransitionConfig {
  from: string;
  to: string;
  blendTime: number;
  trigger?: string;
}

export interface AnimComponentData extends BaseComponentData {
  type: 'anim';
  activate: boolean;
  speed: number;
  defaultState: string;
  states: AnimStateConfig[];
  transitions: AnimTransitionConfig[];
  keyframeClipIds: string[];
}

export interface InteractiveComponentData extends BaseComponentData {
  type: 'interactive';
  rules: InteractionRule[];
}

export type ScriptAttributeType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'vec3'
  | 'color'
  | 'entity'
  | 'asset';

export interface ScriptAttributeDef {
  name: string;
  type: ScriptAttributeType;
  defaultValue?: unknown;
  description?: string;
}

export interface ScriptAttributeValue {
  name: string;
  type: ScriptAttributeType;
  value: unknown;
}

export interface ScriptComponentData extends BaseComponentData {
  type: 'script';
  scriptName: string;
  code: string;
  attributes: ScriptAttributeValue[];
}

export type ComponentData =
  | RenderComponentData
  | LightComponentData
  | CameraComponentData
  | CollisionComponentData
  | RigidBodyComponentData
  | AnimComponentData
  | InteractiveComponentData
  | ScriptComponentData;
