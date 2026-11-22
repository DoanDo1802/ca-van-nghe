import * as pc from 'playcanvas';
import { AssetRepository } from '../../storage';
import type { EntityData, SceneSchema } from '../../types';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';
import { applyComponentDataToEntity, getEntityMeta } from './EntityComponentHelper';
import {
  applyLoungeMaterialPreset,
  hideGigRoomShell,
  inferLoungeMaterialIdByEntityName,
} from './LoungeSceneBuilder';

export interface ResourceTracker {
  materials: Set<pc.StandardMaterial>;
  textures: Set<pc.Texture>;
  meshes: Set<pc.Mesh>;
  cleanups: Set<() => void>;
}

export function createResourceTracker(): ResourceTracker {
  return {
    materials: new Set<pc.StandardMaterial>(),
    textures: new Set<pc.Texture>(),
    meshes: new Set<pc.Mesh>(),
    cleanups: new Set<() => void>(),
  };
}

export function destroyTrackedResources(tracker: ResourceTracker): void {
  for (const cleanup of tracker.cleanups) {
    cleanup();
  }
  tracker.cleanups.clear();

  for (const mat of tracker.materials) {
    mat.destroy();
  }
  tracker.materials.clear();

  for (const tex of tracker.textures) {
    tex.destroy();
  }
  tracker.textures.clear();

  for (const mesh of tracker.meshes) {
    mesh.destroy();
  }
  tracker.meshes.clear();
}

/**
 * Recursively destroys entities under a root.
 * NOTE: Never destroy `mi.mesh` here — PlayCanvas caches built-in primitive meshes
 * ('box', 'sphere', 'plane', 'cylinder', 'capsule') globally per Application, and GLB
 * meshes are owned by their ContainerResource assets (unloaded via `destroyResources()`).
 * Custom materials are tracked and destroyed via `ResourceTracker` / `trackedMaterials`.
 */
export function destroySubtreeResources(root: pc.Entity, destroyRoot = true): void {
  if (destroyRoot) {
    root.destroy();
  } else {
    const children = [...root.children];
    for (const child of children) {
      if (child instanceof pc.Entity) {
        child.destroy();
      } else {
        root.removeChild(child);
      }
    }
  }
}

export function deserializeEntity(
  data: EntityData,
  tracker: ResourceTracker,
  app?: pc.Application
): pc.Entity {
  const entity = new pc.Entity(data.name);
  entity.setGuid(data.id);
  entity.enabled = data.enabled;

  for (const tag of data.tags) {
    if (tag) {
      entity.tags.add(tag);
    }
  }

  const { position, rotation, scale } = data.transform;
  entity.setLocalPosition(position[0], position[1], position[2]);
  entity.setLocalEulerAngles(rotation[0], rotation[1], rotation[2]);
  entity.setLocalScale(scale[0], scale[1], scale[2]);

  const trackMaterial = (mat: pc.StandardMaterial) => {
    tracker.materials.add(mat);
  };
  const trackTexture = (tex: pc.Texture) => {
    tracker.textures.add(tex);
  };
  const trackCleanup = (fn: () => void) => {
    tracker.cleanups.add(fn);
  };

  for (const comp of data.components) {
    applyComponentDataToEntity(entity, comp, trackMaterial);
    if (app && comp.type === 'render' && !comp.material.diffuseMapAssetId) {
      const presetId =
        comp.material.loungeMaterialId ?? inferLoungeMaterialIdByEntityName(entity.name);
      if (presetId) {
        applyLoungeMaterialPreset(
          app,
          entity,
          presetId,
          trackTexture,
          trackMaterial,
          trackCleanup
        );
      }
    }
  }

  for (const childData of data.children) {
    const child = deserializeEntity(childData, tracker, app);
    entity.addChild(child);
  }

  return entity;
}

export interface DeserializedSceneResult {
  sceneRoot: pc.Entity;
  tracker: ResourceTracker;
  destroy: () => void;
}

export function deserializeScene(
  schema: SceneSchema,
  app: pc.Application,
  targetSceneRoot?: pc.Entity | null
): DeserializedSceneResult {
  const tracker = createResourceTracker();
  const { settings, scene } = schema;

  app.scene.ambientLight = new pc.Color(
    settings.ambientColor[0],
    settings.ambientColor[1],
    settings.ambientColor[2]
  );
  app.scene.exposure =
    typeof settings.exposure === 'number'
      ? settings.exposure
      : schema.metadata?.id?.startsWith('ca-van-nghe-')
        ? 1.1
        : 1.0;

  if (app.systems.rigidbody) {
    app.systems.rigidbody.gravity.set(
      settings.gravity[0],
      settings.gravity[1],
      settings.gravity[2]
    );
  }

  let sceneRoot: pc.Entity;
  if (targetSceneRoot) {
    destroySubtreeResources(targetSceneRoot, false);
    targetSceneRoot.name = scene.name;
    targetSceneRoot.setGuid(scene.id);
    targetSceneRoot.enabled = scene.enabled;
    targetSceneRoot.tags.clear();
    for (const tag of scene.tags) {
      if (tag) targetSceneRoot.tags.add(tag);
    }
    targetSceneRoot.setLocalPosition(
      scene.transform.position[0],
      scene.transform.position[1],
      scene.transform.position[2]
    );
    targetSceneRoot.setLocalEulerAngles(
      scene.transform.rotation[0],
      scene.transform.rotation[1],
      scene.transform.rotation[2]
    );
    targetSceneRoot.setLocalScale(
      scene.transform.scale[0],
      scene.transform.scale[1],
      scene.transform.scale[2]
    );

    const trackMaterial = (mat: pc.StandardMaterial) => {
      tracker.materials.add(mat);
    };
    for (const comp of scene.components) {
      applyComponentDataToEntity(targetSceneRoot, comp, trackMaterial);
    }
    for (const childData of scene.children) {
      targetSceneRoot.addChild(deserializeEntity(childData, tracker, app));
    }
    sceneRoot = targetSceneRoot;
  } else {
    sceneRoot = deserializeEntity(scene, tracker, app);
    app.root.addChild(sceneRoot);
  }

  return {
    sceneRoot,
    tracker,
    destroy: () => {
      destroySubtreeResources(sceneRoot, !targetSceneRoot);
      destroyTrackedResources(tracker);
    },
  };
}

const glbAssetBufferCache = new Map<string, { buffer: ArrayBuffer; name: string }>();

export function clearGlbAssetBufferCache(assetId?: string): void {
  if (assetId) {
    glbAssetBufferCache.delete(assetId);
  } else {
    glbAssetBufferCache.clear();
  }
}

export interface RestoreGlbOptions {
  registerDestroy?: (destroyFn: () => void) => void;
  shouldAbort?: () => boolean;
  onProgress?: (loadedCount: number, totalCount: number, assetName: string) => void;
}

/**
 * Re-loads GLB/GLTF models for any deserialized entities whose `meta.render.meshAssetId`
 * is set, using an in-memory buffer cache so Play/Stop transitions are fast.
 */
export async function restoreGlbEntities(
  sceneRoot: pc.Entity,
  app: pc.Application,
  options?: RestoreGlbOptions
): Promise<boolean> {
  const targets: Array<{ entity: pc.Entity; assetId: string }> = [];
  const collect = (node: pc.GraphNode) => {
    if (node instanceof pc.Entity && node !== sceneRoot) {
      const meta = getEntityMeta(node);
      const meshAssetId = meta.render?.meshAssetId;
      if (meshAssetId) {
        targets.push({ entity: node, assetId: meshAssetId });
        return;
      }
    }
    for (const child of node.children) {
      collect(child);
    }
  };
  collect(sceneRoot);

  if (targets.length === 0) return false;

  let restoredAny = false;
  let completedCount = 0;
  for (const { entity, assetId } of targets) {
    if (options?.shouldAbort?.()) return restoredAny;

    let cached = glbAssetBufferCache.get(assetId);
    if (!cached) {
      const manifest = await AssetRepository.getAssetManifest(assetId);
      if (options?.shouldAbort?.()) return restoredAny;
      if (!manifest || (manifest.type !== 'glb' && manifest.type !== 'gltf')) {
        completedCount++;
        options?.onProgress?.(completedCount, targets.length, manifest?.name ?? 'asset');
        continue;
      }
      const buffer = await AssetRepository.getAssetBlob(manifest.indexedDbKey);
      if (options?.shouldAbort?.()) return restoredAny;
      if (!buffer) {
        completedCount++;
        options?.onProgress?.(completedCount, targets.length, manifest.name);
        continue;
      }
      cached = { buffer, name: manifest.name };
      glbAssetBufferCache.set(assetId, cached);
    }

    const loaded = await loadGlbFromArrayBuffer(app, cached.buffer, cached.name, assetId);
    if (options?.shouldAbort?.()) {
      loaded.destroyResources();
      loaded.entity.destroy();
      return restoredAny;
    }
    options?.registerDestroy?.(loaded.destroyResources);

    if (loaded.entity.render) {
      const prevCast = entity.render?.castShadows ?? true;
      const prevReceive = entity.render?.receiveShadows ?? true;
      const prevEnabled = entity.render?.enabled ?? true;
      const origMaterials = loaded.entity.render.meshInstances.map((mi) => mi.material);
      if (entity.render) {
        entity.removeComponent('render');
      }
      const renderAsset = loaded.entity.render.asset;
      if (renderAsset) {
        entity.addComponent('render', {
          type: 'asset',
          asset: renderAsset,
          castShadows: prevCast,
          receiveShadows: prevReceive,
          enabled: prevEnabled,
        });
      } else {
        entity.addComponent('render', {
          type: loaded.entity.render.type || 'asset',
          meshInstances: loaded.entity.render.meshInstances,
          castShadows: prevCast,
          receiveShadows: prevReceive,
          enabled: prevEnabled,
        });
      }
      if (entity.render && origMaterials.length > 0) {
        entity.render.meshInstances.forEach((mi, idx) => {
          const origMat = origMaterials[idx];
          if (origMat) {
            mi.material = origMat;
          }
        });
      }
    }

    if (loaded.entity.children.length > 0) {
      // Remove deserialized GLB child subtrees (which lacked original GLB materials)
      // while keeping any user-added child entities that have their own meshAssetId.
      const existingChildren = [...entity.children];
      for (const child of existingChildren) {
        if (child instanceof pc.Entity && !getEntityMeta(child).render?.meshAssetId) {
          destroySubtreeResources(child, true);
        }
      }
      const glbChildren = [...loaded.entity.children];
      for (const glbChild of glbChildren) {
        loaded.entity.removeChild(glbChild);
        entity.addChild(glbChild);
      }
    }

    if (loaded.animTracks.length > 0) {
      const rootBone = entity.children[0] instanceof pc.Entity ? entity.children[0] : entity;
      const prevActivate = entity.anim?.activate ?? false;
      const prevSpeed = entity.anim?.speed ?? 1;
      const prevEnabled = entity.anim?.enabled ?? true;
      if (entity.anim) {
        entity.removeComponent('anim');
      }
      entity.addComponent('anim', {
        activate: prevActivate,
        speed: prevSpeed,
        enabled: prevEnabled,
        rootBone,
      });
      if (entity.anim) {
        for (const [trackName, track] of Object.entries(loaded.animTrackMap)) {
          entity.anim.assignAnimation(trackName, track);
        }
      }
    }

    if (
      entity.name === 'Acoustic Live Band Gear' ||
      cached.name.toLowerCase().includes('every_other_gig_ever')
    ) {
      hideGigRoomShell(entity);
    }

    // Prevent premature frustum culling on scaled/skinned/multi-node GLBs (player, band stage, props)
    const disableCull = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity && node.render) {
        for (const mi of node.render.meshInstances) {
          mi.cull = false;
        }
      }
      for (const child of node.children) {
        disableCull(child);
      }
    };
    disableCull(entity);

    loaded.entity.destroy();
    restoredAny = true;
    completedCount++;
    options?.onProgress?.(completedCount, targets.length, cached.name);
  }

  return restoredAny;
}
