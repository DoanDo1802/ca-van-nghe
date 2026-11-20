import * as pc from 'playcanvas';

export interface LoadedGlbResult {
  entity: pc.Entity;
  animTracks: string[];
  animTrackMap: Record<string, pc.AnimTrack>;
  destroyResources: () => void;
}

/**
 * Per-Application cache of loaded GLB/GLTF Container assets so duplicated
 * objects / Prefabs share GPU meshes, materials, and textures instead of
 * re-parsing and re-uploading the same GLB multiple times.
 */
const containerAssetCache = new WeakMap<pc.Application, Map<string, pc.Asset>>();
const pendingLoads = new WeakMap<pc.Application, Map<string, Promise<pc.Asset>>>();

function getAppCache(app: pc.Application): Map<string, pc.Asset> {
  let map = containerAssetCache.get(app);
  if (!map) {
    map = new Map();
    containerAssetCache.set(app, map);
  }
  return map;
}

function getAppPending(app: pc.Application): Map<string, Promise<pc.Asset>> {
  let map = pendingLoads.get(app);
  if (!map) {
    map = new Map();
    pendingLoads.set(app, map);
  }
  return map;
}

/**
 * Unloads all cached GLB container assets for an Application (called on unmount).
 */
export function clearGlbContainerCache(app: pc.Application): void {
  const map = containerAssetCache.get(app);
  if (!map) return;
  for (const asset of map.values()) {
    const resource = asset.resource as pc.ContainerResource | undefined;
    if (resource) {
      const subAssets = [
        ...(resource.renders ?? []),
        ...(resource.materials ?? []),
        ...(resource.textures ?? []),
        ...(resource.animations ?? []),
      ];
      for (const sub of subAssets) {
        sub.unload();
        app.assets.remove(sub);
      }
    }
    asset.unload();
    app.assets.remove(asset);
  }
  map.clear();
  pendingLoads.get(app)?.clear();
}

function loadContainerAsset(
  app: pc.Application,
  buffer: ArrayBuffer,
  filename: string,
  cacheKey?: string
): Promise<{ asset: pc.Asset; cached: boolean }> {
  if (cacheKey) {
    const existing = getAppCache(app).get(cacheKey);
    if (existing && existing.resource) {
      return Promise.resolve({ asset: existing, cached: true });
    }
    const pending = getAppPending(app).get(cacheKey);
    if (pending) {
      return pending.then((asset) => ({ asset, cached: true }));
    }
  }

  const promise = new Promise<pc.Asset>((resolve, reject) => {
    const isGltf = filename.toLowerCase().endsWith('.gltf');
    const mimeType = isGltf ? 'model/gltf+json' : 'model/gltf-binary';
    const blob = new Blob([buffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);

    app.assets.loadFromUrlAndFilename(objectUrl, filename, 'container', (err, asset) => {
      URL.revokeObjectURL(objectUrl);

      if (err || !asset || !asset.resource) {
        if (asset) {
          asset.unload();
          app.assets.remove(asset);
        }
        reject(new Error(err ?? `Failed to load GLB container: ${filename}`));
        return;
      }

      if (cacheKey) {
        getAppCache(app).set(cacheKey, asset);
      }
      resolve(asset);
    });
  });

  if (cacheKey) {
    getAppPending(app).set(cacheKey, promise);
    promise.finally(() => {
      getAppPending(app).delete(cacheKey);
    });
  }

  return promise.then((asset) => ({ asset, cached: Boolean(cacheKey) }));
}

function instantiateFromAsset(
  app: pc.Application,
  asset: pc.Asset,
  filename: string,
  isCached: boolean
): LoadedGlbResult {
  const resource = asset.resource as pc.ContainerResource;
  const entity = resource.instantiateRenderEntity({
    castShadows: true,
    receiveShadows: true,
  });

  const baseName = filename.replace(/\.(glb|gltf)$/i, '').trim();
  if (!entity.name || entity.name === 'Untitled' || entity.name === 'RootNode') {
    entity.name = baseName || 'GLB Model';
  }

  const animTracks: string[] = [];
  const animTrackMap: Record<string, pc.AnimTrack> = {};
  if (resource.animations && resource.animations.length > 0) {
    if (!entity.anim) {
      entity.addComponent('anim', {
        activate: false,
        speed: 1,
      });
    }

    for (let i = 0; i < resource.animations.length; i++) {
      const animAsset = resource.animations[i];
      const track = animAsset.resource as pc.AnimTrack | undefined;
      const trackName = track?.name || animAsset.name || `Track_${i}`;
      animTracks.push(trackName);
      if (track) {
        animTrackMap[trackName] = track;
        if (entity.anim) {
          entity.anim.assignAnimation(trackName, track);
        }
      }
    }
  }

  // Cached containers stay alive in `containerAssetCache` until `clearGlbContainerCache(app)`.
  const destroyResources = isCached
    ? () => {
        /* shared GPU resources managed by containerAssetCache */
      }
    : () => {
        const subAssets = [
          ...(resource.renders ?? []),
          ...(resource.materials ?? []),
          ...(resource.textures ?? []),
          ...(resource.animations ?? []),
        ];
        for (const sub of subAssets) {
          sub.unload();
          app.assets.remove(sub);
        }
        asset.unload();
        app.assets.remove(asset);
      };

  return {
    entity,
    animTracks,
    animTrackMap,
    destroyResources,
  };
}

/**
 * Loads a GLB/GLTF binary buffer into PlayCanvas v2 via `loadFromUrlAndFilename`,
 * instantiates a `render`-component entity hierarchy (never `model`),
 * and extracts any `AnimTrack` names into an `anim` component.
 * Pass `cacheKey` (e.g. assetId or URL) to share GPU meshes/materials across instances.
 */
export async function loadGlbFromArrayBuffer(
  app: pc.Application,
  buffer: ArrayBuffer,
  filename: string,
  cacheKey?: string
): Promise<LoadedGlbResult> {
  const { asset, cached } = await loadContainerAsset(app, buffer, filename, cacheKey);
  return instantiateFromAsset(app, asset, filename, cached);
}
