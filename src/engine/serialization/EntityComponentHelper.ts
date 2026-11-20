import * as pc from 'playcanvas';
import type {
  AnimComponentData,
  CameraComponentData,
  CollisionComponentData,
  ComponentData,
  ComponentType,
  InteractiveComponentData,
  LightComponentData,
  MaterialOverrideData,
  RenderComponentData,
  RigidBodyComponentData,
  ScriptComponentData,
} from '../../types';

export interface EntityEditorMeta {
  componentIds: Partial<Record<ComponentType, string>>;
  render?: {
    meshAssetId?: string | null;
    diffuseMapAssetId?: string | null;
    normalMapAssetId?: string | null;
    metalnessMapAssetId?: string | null;
  };
  collision?: {
    meshAssetId?: string | null;
    isTrigger?: boolean;
  };
  anim?: {
    defaultState: string;
    states: AnimComponentData['states'];
    transitions: AnimComponentData['transitions'];
    keyframeClipIds: string[];
  };
  interactive?: InteractiveComponentData;
  script?: ScriptComponentData;
}

const ENTITY_META_KEY = '__editorMeta';

type EntityWithMeta = pc.Entity & { [ENTITY_META_KEY]?: EntityEditorMeta };

export function getEntityMeta(entity: pc.Entity): EntityEditorMeta {
  const host = entity as EntityWithMeta;
  if (!host[ENTITY_META_KEY]) {
    host[ENTITY_META_KEY] = { componentIds: {} };
  }
  return host[ENTITY_META_KEY];
}

export function getOrCreateComponentId(entity: pc.Entity, type: ComponentType): string {
  const meta = getEntityMeta(entity);
  if (!meta.componentIds[type]) {
    meta.componentIds[type] = crypto.randomUUID();
  }
  return meta.componentIds[type];
}

export function createDefaultMaterialData(): MaterialOverrideData {
  return {
    diffuseColor: [0.75, 0.78, 0.84],
    metalness: 0.1,
    gloss: 0.6,
    emissiveColor: [0, 0, 0],
    emissiveIntensity: 1,
    opacity: 1,
    diffuseMapAssetId: null,
    normalMapAssetId: null,
    metalnessMapAssetId: null,
  };
}

export function createDefaultComponentData(
  type: ComponentType,
  id: string = crypto.randomUUID()
): ComponentData {
  switch (type) {
    case 'render':
      return {
        id,
        type: 'render',
        enabled: true,
        meshType: 'box',
        meshAssetId: null,
        castShadows: true,
        receiveShadows: true,
        material: createDefaultMaterialData(),
      };
    case 'light':
      return {
        id,
        type: 'light',
        enabled: true,
        lightType: 'point',
        color: [1, 1, 1],
        intensity: 1,
        range: 10,
        castShadows: false,
        innerConeAngle: 30,
        outerConeAngle: 45,
      };
    case 'camera':
      return {
        id,
        type: 'camera',
        enabled: false,
        fov: 45,
        clearColor: [0.15, 0.16, 0.19, 1],
        nearClip: 0.1,
        farClip: 1000,
        priority: 0,
        projection: 'perspective',
        orthoHeight: 5,
      };
    case 'collision':
      return {
        id,
        type: 'collision',
        enabled: true,
        shape: 'box',
        halfExtents: [0.5, 0.5, 0.5],
        radius: 0.5,
        height: 2,
        meshAssetId: null,
        isTrigger: false,
      };
    case 'rigidbody':
      return {
        id,
        type: 'rigidbody',
        enabled: true,
        bodyType: 'dynamic',
        mass: 1,
        friction: 0.5,
        restitution: 0.2,
        linearDamping: 0,
        angularDamping: 0.05,
        linearFactor: [1, 1, 1],
        angularFactor: [1, 1, 1],
      };
    case 'anim':
      return {
        id,
        type: 'anim',
        enabled: true,
        activate: true,
        speed: 1,
        defaultState: '',
        states: [],
        transitions: [],
        keyframeClipIds: [],
      };
    case 'interactive':
      return {
        id,
        type: 'interactive',
        enabled: true,
        rules: [],
      };
    case 'script':
      return {
        id,
        type: 'script',
        enabled: true,
        scriptName: 'NewScript',
        code: 'export function onStart(entity) {\n  // Called when Play Mode starts\n}\n\nexport function onUpdate(entity, dt) {\n  // Called every frame\n}\n',
        attributes: [],
      };
  }
}

export function buildStandardMaterial(
  matData: MaterialOverrideData,
  trackMaterial?: (mat: pc.StandardMaterial) => void
): pc.StandardMaterial {
  const mat = new pc.StandardMaterial();
  applyMaterialData(mat, matData);
  trackMaterial?.(mat);
  return mat;
}

export function applyMaterialData(
  mat: pc.StandardMaterial,
  matData: MaterialOverrideData
): void {
  mat.diffuse = new pc.Color(
    matData.diffuseColor[0],
    matData.diffuseColor[1],
    matData.diffuseColor[2]
  );
  mat.metalness = matData.metalness;
  mat.gloss = matData.gloss;
  mat.useMetalness = true;
  mat.emissive = new pc.Color(
    matData.emissiveColor[0],
    matData.emissiveColor[1],
    matData.emissiveColor[2]
  );
  mat.emissiveIntensity = matData.emissiveIntensity;
  mat.opacity = matData.opacity;
  mat.blendType = matData.opacity < 1 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
  mat.update();
}

export function applyComponentDataToEntity(
  entity: pc.Entity,
  data: ComponentData,
  trackMaterial?: (mat: pc.StandardMaterial) => void
): void {
  const meta = getEntityMeta(entity);
  meta.componentIds[data.type] = data.id;

  switch (data.type) {
    case 'render': {
      applyRenderComponent(entity, data, meta, trackMaterial);
      break;
    }
    case 'light': {
      applyLightComponent(entity, data);
      break;
    }
    case 'camera': {
      applyCameraComponent(entity, data);
      break;
    }
    case 'collision': {
      applyCollisionComponent(entity, data, meta);
      break;
    }
    case 'rigidbody': {
      applyRigidBodyComponent(entity, data);
      break;
    }
    case 'anim': {
      applyAnimComponent(entity, data, meta);
      break;
    }
    case 'interactive': {
      meta.interactive = structuredClone(data);
      break;
    }
    case 'script': {
      meta.script = structuredClone(data);
      break;
    }
  }
}

function applyRenderComponent(
  entity: pc.Entity,
  data: RenderComponentData,
  meta: EntityEditorMeta,
  trackMaterial?: (mat: pc.StandardMaterial) => void
): void {
  meta.render = {
    meshAssetId: data.meshAssetId ?? null,
    diffuseMapAssetId: data.material.diffuseMapAssetId ?? null,
    normalMapAssetId: data.material.normalMapAssetId ?? null,
    metalnessMapAssetId: data.material.metalnessMapAssetId ?? null,
  };

  if (entity.render) {
    const existingMat = entity.render.material;
    let mat: pc.StandardMaterial;
    if (existingMat instanceof pc.StandardMaterial) {
      applyMaterialData(existingMat, data.material);
      mat = existingMat;
    } else {
      mat = buildStandardMaterial(data.material, trackMaterial);
    }

    if (entity.render.type !== data.meshType) {
      entity.render.type = data.meshType;
    }
    entity.render.material = mat;
    entity.render.castShadows = data.castShadows;
    entity.render.receiveShadows = data.receiveShadows;
    entity.render.enabled = data.enabled;
  } else if (data.meshType !== 'asset') {
    const mat = buildStandardMaterial(data.material, trackMaterial);
    entity.addComponent('render', {
      type: data.meshType,
      material: mat,
      castShadows: data.castShadows,
      receiveShadows: data.receiveShadows,
      enabled: data.enabled,
    });
  }
}

function applyLightComponent(entity: pc.Entity, data: LightComponentData): void {
  const color = new pc.Color(data.color[0], data.color[1], data.color[2]);
  if (entity.light) {
    entity.light.type = data.lightType;
    entity.light.color = color;
    entity.light.intensity = data.intensity;
    entity.light.range = data.range;
    entity.light.castShadows = data.castShadows;
    entity.light.innerConeAngle = data.innerConeAngle;
    entity.light.outerConeAngle = data.outerConeAngle;
    entity.light.enabled = data.enabled;
  } else {
    entity.addComponent('light', {
      type: data.lightType,
      color,
      intensity: data.intensity,
      range: data.range,
      castShadows: data.castShadows,
      innerConeAngle: data.innerConeAngle,
      outerConeAngle: data.outerConeAngle,
      enabled: data.enabled,
    });
  }
}

function applyCameraComponent(entity: pc.Entity, data: CameraComponentData): void {
  const clearColor = new pc.Color(
    data.clearColor[0],
    data.clearColor[1],
    data.clearColor[2],
    data.clearColor[3]
  );
  const projection =
    data.projection === 'orthographic' ? pc.PROJECTION_ORTHOGRAPHIC : pc.PROJECTION_PERSPECTIVE;

  if (entity.camera) {
    entity.camera.fov = data.fov;
    entity.camera.clearColor = clearColor;
    entity.camera.nearClip = data.nearClip;
    entity.camera.farClip = data.farClip;
    entity.camera.priority = data.priority;
    entity.camera.projection = projection;
    if (data.orthoHeight !== undefined) {
      entity.camera.orthoHeight = data.orthoHeight;
    }
    entity.camera.enabled = data.enabled;
  } else {
    entity.addComponent('camera', {
      fov: data.fov,
      clearColor,
      nearClip: data.nearClip,
      farClip: data.farClip,
      priority: data.priority,
      projection,
      orthoHeight: data.orthoHeight ?? 5,
      enabled: data.enabled,
    });
  }
}

function applyCollisionComponent(
  entity: pc.Entity,
  data: CollisionComponentData,
  meta: EntityEditorMeta
): void {
  meta.collision = {
    meshAssetId: data.meshAssetId ?? null,
    isTrigger: data.isTrigger,
  };
  const halfExtents = new pc.Vec3(data.halfExtents[0], data.halfExtents[1], data.halfExtents[2]);

  if (entity.collision) {
    entity.collision.type = data.shape;
    entity.collision.halfExtents = halfExtents;
    entity.collision.radius = data.radius;
    entity.collision.height = data.height;
    entity.collision.enabled = data.enabled;
  } else {
    entity.addComponent('collision', {
      type: data.shape,
      halfExtents,
      radius: data.radius,
      height: data.height,
      enabled: data.enabled,
    });
  }
}

function applyRigidBodyComponent(entity: pc.Entity, data: RigidBodyComponentData): void {
  const linearFactor = new pc.Vec3(
    data.linearFactor[0],
    data.linearFactor[1],
    data.linearFactor[2]
  );
  const angularFactor = new pc.Vec3(
    data.angularFactor[0],
    data.angularFactor[1],
    data.angularFactor[2]
  );

  if (entity.rigidbody) {
    entity.rigidbody.type = data.bodyType;
    entity.rigidbody.mass = data.mass;
    entity.rigidbody.friction = data.friction;
    entity.rigidbody.restitution = data.restitution;
    entity.rigidbody.linearDamping = data.linearDamping;
    entity.rigidbody.angularDamping = data.angularDamping;
    entity.rigidbody.linearFactor = linearFactor;
    entity.rigidbody.angularFactor = angularFactor;
    entity.rigidbody.enabled = data.enabled;
  } else {
    entity.addComponent('rigidbody', {
      type: data.bodyType,
      mass: data.mass,
      friction: data.friction,
      restitution: data.restitution,
      linearDamping: data.linearDamping,
      angularDamping: data.angularDamping,
      linearFactor,
      angularFactor,
      enabled: data.enabled,
    });
  }
}

function applyAnimComponent(
  entity: pc.Entity,
  data: AnimComponentData,
  meta: EntityEditorMeta
): void {
  meta.anim = {
    defaultState: data.defaultState,
    states: structuredClone(data.states),
    transitions: structuredClone(data.transitions),
    keyframeClipIds: [...data.keyframeClipIds],
  };

  if (entity.anim) {
    entity.anim.activate = data.activate;
    entity.anim.speed = data.speed;
    entity.anim.enabled = data.enabled;
  } else {
    entity.addComponent('anim', {
      activate: data.activate,
      speed: data.speed,
      enabled: data.enabled,
    });
  }
}

export function removeComponentByType(entity: pc.Entity, type: ComponentType): void {
  const meta = getEntityMeta(entity);
  delete meta.componentIds[type];

  switch (type) {
    case 'render':
      delete meta.render;
      if (entity.render) entity.removeComponent('render');
      break;
    case 'light':
      if (entity.light) entity.removeComponent('light');
      break;
    case 'camera':
      if (entity.camera) entity.removeComponent('camera');
      break;
    case 'collision':
      delete meta.collision;
      if (entity.collision) entity.removeComponent('collision');
      break;
    case 'rigidbody':
      if (entity.rigidbody) entity.removeComponent('rigidbody');
      break;
    case 'anim':
      delete meta.anim;
      if (entity.anim) entity.removeComponent('anim');
      break;
    case 'interactive':
      delete meta.interactive;
      break;
    case 'script':
      delete meta.script;
      break;
  }
}
