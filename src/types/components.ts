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
  | 'script'
  | 'characterController'
  | 'cameraRig'
  | 'audioSource'
  | 'interactable'
  | 'particleSystem';

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
  useLighting?: boolean;
  loungeMaterialId?: string;
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
  shadowBias?: number;
  normalOffsetBias?: number;
  shadowDistance?: number;
  shadowResolution?: number;
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

export type CharacterControllerMode = 'third-person' | 'first-person' | 'top-down';

export interface CharacterControllerComponentData extends BaseComponentData {
  type: 'characterController';
  mode: CharacterControllerMode;
  walkSpeed: number;
  runSpeed: number;
  jumpForce: number;
  gravity: number;
  capsuleRadius: number;
  capsuleHeight: number;
  stepOffset: number;
  eyeHeight: number;
  mouseSensitivity: number;
  cameraEntityId: string | null;
}

export type CameraRigMode = 'follow-orbit' | 'smooth-follow' | 'look-at';

export interface CameraRigComponentData extends BaseComponentData {
  type: 'cameraRig';
  targetEntityId: string | null;
  mode: CameraRigMode;
  offset: Vec3;
  damping: number;
  orbitSensitivity: number;
  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;
  collisionAvoidance: boolean;
}

export interface AudioSourceComponentData extends BaseComponentData {
  type: 'audioSource';
  audioAssetId: string | null;
  playOnAwake: boolean;
  loop: boolean;
  volume: number;
  pitch: number;
  spatial: boolean;
  minDistance: number;
  maxDistance: number;
}

export type InteractableType = 'event' | 'seat' | 'collectible';

export interface InteractableComponentData extends BaseComponentData {
  type: 'interactable';
  promptText: string;
  interactionKey: string;
  radius: number;
  interactType: InteractableType;
  seatOffset: Vec3;
  seatYaw: number;
  destroyOnCollect: boolean;
  emitEventName: string;
}

export type ParticleEmissionShape = 'cone' | 'sphere' | 'box';

export interface ParticleSystemComponentData extends BaseComponentData {
  type: 'particleSystem';
  playOnAwake: boolean;
  loop: boolean;
  emissionRate: number;
  maxParticles: number;
  lifetime: number;
  startSpeed: number;
  gravity: number;
  startSize: number;
  endSize: number;
  startColor: ColorRGB;
  endColor: ColorRGB;
  spreadAngle: number;
  shape: ParticleEmissionShape;
}

export type ComponentData =
  | RenderComponentData
  | LightComponentData
  | CameraComponentData
  | CollisionComponentData
  | RigidBodyComponentData
  | AnimComponentData
  | InteractiveComponentData
  | ScriptComponentData
  | CharacterControllerComponentData
  | CameraRigComponentData
  | AudioSourceComponentData
  | InteractableComponentData
  | ParticleSystemComponentData;
