import * as pc from 'playcanvas';
import type {
  AnimationClipData,
  AssetManifestEntry,
  CollisionShape,
  ComponentData,
  EntityData,
  InteractionRule,
  LightType,
  ProjectMetadata,
  RenderMeshType,
  RigidBodyType,
  SceneSchema,
  SceneSettings,
} from '../../types';
import {
  createDefaultMaterialData,
  getEntityMeta,
  getOrCreateComponentId,
} from './EntityComponentHelper';

export interface SerializeSceneOptions {
  editorLayerId?: number;
  metadata?: Partial<ProjectMetadata>;
  assets?: AssetManifestEntry[];
  animations?: Record<string, AnimationClipData>;
  activeCameraEntityId?: string | null;
}

const VALID_RENDER_TYPES = new Set<RenderMeshType>([
  'box',
  'sphere',
  'plane',
  'cylinder',
  'capsule',
  'asset',
]);

const VALID_LIGHT_TYPES = new Set<LightType>(['directional', 'point', 'spot']);
const VALID_COLLISION_SHAPES = new Set<CollisionShape>(['box', 'sphere', 'capsule', 'mesh']);
const VALID_BODY_TYPES = new Set<RigidBodyType>(['static', 'dynamic', 'kinematic']);

function isEditorOnlyEntity(entity: pc.Entity, editorLayerId?: number): boolean {
  if (editorLayerId === undefined) return false;
  const renderLayers = entity.render?.layers;
  if (renderLayers && renderLayers.length > 0 && renderLayers.every((id) => id === editorLayerId)) {
    return true;
  }
  const camLayers = entity.camera?.layers;
  if (camLayers && camLayers.length > 0 && camLayers.every((id) => id === editorLayerId)) {
    return true;
  }
  return false;
}

export function serializeEntity(entity: pc.Entity, editorLayerId?: number): EntityData {
  const pos = entity.getLocalPosition();
  const rot = entity.getLocalEulerAngles();
  const scale = entity.getLocalScale();
  const meta = getEntityMeta(entity);

  const components: ComponentData[] = [];

  if (entity.render) {
    const r = entity.render;
    const rawType = r.type as RenderMeshType;
    const meshType: RenderMeshType = VALID_RENDER_TYPES.has(rawType) ? rawType : 'box';
    const mat = r.material instanceof pc.StandardMaterial ? r.material : null;
    const defaultMat = createDefaultMaterialData();

    components.push({
      id: getOrCreateComponentId(entity, 'render'),
      type: 'render',
      enabled: r.enabled,
      meshType,
      meshAssetId: meta.render?.meshAssetId ?? null,
      castShadows: r.castShadows,
      receiveShadows: r.receiveShadows,
      material: {
        diffuseColor: mat ? [mat.diffuse.r, mat.diffuse.g, mat.diffuse.b] : defaultMat.diffuseColor,
        metalness: mat ? mat.metalness : defaultMat.metalness,
        gloss: mat ? mat.gloss : defaultMat.gloss,
        emissiveColor: mat
          ? [mat.emissive.r, mat.emissive.g, mat.emissive.b]
          : defaultMat.emissiveColor,
        emissiveIntensity: mat ? mat.emissiveIntensity : defaultMat.emissiveIntensity,
        opacity: mat ? mat.opacity : defaultMat.opacity,
        diffuseMapAssetId: meta.render?.diffuseMapAssetId ?? null,
        normalMapAssetId: meta.render?.normalMapAssetId ?? null,
        metalnessMapAssetId: meta.render?.metalnessMapAssetId ?? null,
      },
    });
  } else if (meta.render?.meshAssetId) {
    components.push({
      id: getOrCreateComponentId(entity, 'render'),
      type: 'render',
      enabled: true,
      meshType: 'asset',
      meshAssetId: meta.render.meshAssetId,
      castShadows: true,
      receiveShadows: true,
      material: createDefaultMaterialData(),
    });
  }

  if (entity.light) {
    const l = entity.light;
    const rawLight = l.type as LightType;
    components.push({
      id: getOrCreateComponentId(entity, 'light'),
      type: 'light',
      enabled: l.enabled,
      lightType: VALID_LIGHT_TYPES.has(rawLight) ? rawLight : 'point',
      color: [l.color.r, l.color.g, l.color.b],
      intensity: l.intensity,
      range: l.range,
      castShadows: l.castShadows,
      innerConeAngle: l.innerConeAngle,
      outerConeAngle: l.outerConeAngle,
    });
  }

  if (entity.camera) {
    const c = entity.camera;
    components.push({
      id: getOrCreateComponentId(entity, 'camera'),
      type: 'camera',
      enabled: c.enabled,
      fov: c.fov,
      clearColor: [c.clearColor.r, c.clearColor.g, c.clearColor.b, c.clearColor.a],
      nearClip: c.nearClip,
      farClip: c.farClip,
      priority: c.priority,
      projection:
        c.projection === pc.PROJECTION_ORTHOGRAPHIC ? 'orthographic' : 'perspective',
      orthoHeight: c.orthoHeight,
    });
  }

  if (entity.collision) {
    const col = entity.collision;
    const rawShape = col.type as CollisionShape;
    components.push({
      id: getOrCreateComponentId(entity, 'collision'),
      type: 'collision',
      enabled: col.enabled,
      shape: VALID_COLLISION_SHAPES.has(rawShape) ? rawShape : 'box',
      halfExtents: [col.halfExtents.x, col.halfExtents.y, col.halfExtents.z],
      radius: col.radius,
      height: col.height,
      meshAssetId: meta.collision?.meshAssetId ?? null,
      isTrigger: meta.collision?.isTrigger ?? false,
    });
  }

  if (entity.rigidbody) {
    const rb = entity.rigidbody;
    const rawBody = rb.type as RigidBodyType;
    components.push({
      id: getOrCreateComponentId(entity, 'rigidbody'),
      type: 'rigidbody',
      enabled: rb.enabled,
      bodyType: VALID_BODY_TYPES.has(rawBody) ? rawBody : 'dynamic',
      mass: rb.mass,
      friction: rb.friction,
      restitution: rb.restitution,
      linearDamping: rb.linearDamping,
      angularDamping: rb.angularDamping,
      linearFactor: [rb.linearFactor.x, rb.linearFactor.y, rb.linearFactor.z],
      angularFactor: [rb.angularFactor.x, rb.angularFactor.y, rb.angularFactor.z],
    });
  }

  if (entity.anim) {
    const a = entity.anim;
    components.push({
      id: getOrCreateComponentId(entity, 'anim'),
      type: 'anim',
      enabled: a.enabled,
      activate: a.activate,
      speed: a.speed,
      defaultState: meta.anim?.defaultState ?? '',
      states: structuredClone(meta.anim?.states ?? []),
      transitions: structuredClone(meta.anim?.transitions ?? []),
      keyframeClipIds: [...(meta.anim?.keyframeClipIds ?? [])],
    });
  }

  if (meta.interactive) {
    components.push(structuredClone(meta.interactive));
  }

  if (meta.script) {
    components.push(structuredClone(meta.script));
  }

  const hasGlbMeshAsset = Boolean(meta.render?.meshAssetId);
  const children: EntityData[] = [];
  for (const childNode of entity.children) {
    if (!(childNode instanceof pc.Entity)) continue;
    if (isEditorOnlyEntity(childNode, editorLayerId)) continue;
    if (hasGlbMeshAsset && childNode.tags.has('__glb_internal__')) continue;
    children.push(serializeEntity(childNode, editorLayerId));
  }

  return {
    id: entity.getGuid(),
    name: entity.name,
    enabled: entity.enabled,
    tags: entity.tags.list(),
    transform: {
      position: [pos.x, pos.y, pos.z],
      rotation: [rot.x, rot.y, rot.z],
      scale: [scale.x, scale.y, scale.z],
    },
    components,
    children,
  };
}

function collectInteractions(
  entityData: EntityData,
  out: Record<string, InteractionRule[]>
): void {
  for (const comp of entityData.components) {
    if (comp.type === 'interactive' && comp.rules.length > 0) {
      out[entityData.id] = structuredClone(comp.rules);
    }
  }
  for (const child of entityData.children) {
    collectInteractions(child, out);
  }
}

export function serializeScene(
  sceneRoot: pc.Entity,
  app: pc.Application,
  options?: SerializeSceneOptions
): SceneSchema {
  const now = new Date().toISOString();
  const sceneData = serializeEntity(sceneRoot, options?.editorLayerId);

  const ambient = app.scene.ambientLight;
  const gravity = app.systems.rigidbody?.gravity;

  const settings: SceneSettings = {
    ambientColor: [ambient.r, ambient.g, ambient.b],
    skyboxColor: [0.11, 0.12, 0.14, 1],
    gravity: gravity ? [gravity.x, gravity.y, gravity.z] : [0, -9.81, 0],
    activeCameraEntityId: options?.activeCameraEntityId ?? null,
  };

  const interactions: Record<string, InteractionRule[]> = {};
  collectInteractions(sceneData, interactions);

  return {
    version: '1.0.0',
    metadata: {
      id: options?.metadata?.id ?? 'default-scene',
      name: options?.metadata?.name ?? 'Untitled Scene',
      createdAt: options?.metadata?.createdAt ?? now,
      updatedAt: now,
    },
    assets: options?.assets ? structuredClone(options.assets) : [],
    settings,
    scene: sceneData,
    animations: options?.animations ? structuredClone(options.animations) : {},
    interactions,
  };
}
