import * as pc from 'playcanvas';
import { DEFAULT_LOUNGE_DECO_ITEMS } from '../../data/defaultLoungeLayout';
import { AssetRepository } from '../../storage';
import { useAssetStore } from '../../store/useAssetStore';
import type { PrefabData } from '../../types';
import type { EditorEngine } from '../EditorEngine';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';
import { getEntityMeta } from './EntityComponentHelper';
import {
  buildEnvironmentShell,
  buildLightingRig,
  buildMainAndAcousticStages,
  createSharedLoungeMaterials,
} from './LoungeSceneBuilder';

interface LoungeDecoItem {
  id: string;
  name: string;
  category: string;
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  interactiveId?: string;
}

const CA_VAN_NGHE_FOLDER = '/CaVanNghe';
const PREFABS_FOLDER = '/Prefabs';
const RAD_TO_DEG = 180 / Math.PI;

const EXTRA_STAGE_MODELS = [
  '/models/pa-speaker.glb',
  '/models/fresnel-led.glb',
  '/models/every_other_gig_ever.glb',
  '/models/Character.glb',
];

function extractFilenameFromUrl(url: string): string {
  const cleanUrl = url.split('?')[0].split('#')[0];
  const parts = cleanUrl.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'model.glb';
}

function getPrefabNameForUrl(url: string): string {
  const base = extractFilenameFromUrl(url).replace(/\.(glb|gltf)$/i, '');
  return `PF_${base}`;
}

/**
 * Imports the complete "Ca Van Nghe" web game as 1 optimized Unity-style Scene:
 * - Shared GLB Container Cache (each .glb parsed & uploaded to GPU once)
 * - Shared Materials across walls/floor/ceiling/stages
 * - Prefabs created in `/Prefabs` for duplicated objects (`prefabRef` metadata)
 * - Full `Environment_Shell`, `Lighting_Rig`, `Main_Stage`, `Acoustic_Stage`, `Lounge_Furniture`
 */
export async function importCaVanNgheScene(engine: EditorEngine): Promise<void> {
  const app = engine.getApp();
  const sceneRoot = engine.getSceneRoot();
  if (!app || !sceneRoot) {
    throw new Error('EditorEngine is not mounted');
  }

  const items = DEFAULT_LOUNGE_DECO_ITEMS as LoungeDecoItem[];
  const uniqueUrls = Array.from(
    new Set([...items.map((item) => item.url), ...EXTRA_STAGE_MODELS])
  );

  // Fetch all unique GLB files once and cache ArrayBuffers in memory
  const bufferCache = new Map<string, ArrayBuffer>();
  const fetchBuffer = async (url: string): Promise<ArrayBuffer> => {
    const cached = bufferCache.get(url);
    if (cached) return cached;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch model "${url}": ${response.status} ${response.statusText}`);
    }
    const buf = await response.arrayBuffer();
    bufferCache.set(url, buf);
    return buf;
  };
  await Promise.all(uniqueUrls.map((url) => fetchBuffer(url)));

  // Abort cleanly if React StrictMode unmounted/remounted while fetching
  if (engine.getApp() !== app || engine.getSceneRoot() !== sceneRoot || !app.scene) {
    return;
  }

  // Persist unique models into AssetRepository under "/CaVanNghe"
  const existingAssets = await AssetRepository.listAssets();
  const existingByName = new Map<string, string>();
  const existingPrefabs = new Map<string, string>();
  for (const asset of existingAssets) {
    if (asset.folderPath === CA_VAN_NGHE_FOLDER) {
      existingByName.set(asset.name, asset.id);
    } else if (asset.type === 'prefab' && asset.folderPath === PREFABS_FOLDER) {
      existingPrefabs.set(asset.name, asset.id);
    }
  }

  const assetIdByUrl = new Map<string, string>();
  for (const url of uniqueUrls) {
    const filename = extractFilenameFromUrl(url);
    const existingId = existingByName.get(filename);
    if (existingId) {
      assetIdByUrl.set(url, existingId);
      continue;
    }

    const buffer = bufferCache.get(url);
    if (!buffer) continue;

    const mimeType = filename.toLowerCase().endsWith('.gltf')
      ? 'model/gltf+json'
      : 'model/gltf-binary';
    const file = new File([buffer], filename, { type: mimeType });
    const entry = await AssetRepository.importFile(file, CA_VAN_NGHE_FOLDER);
    assetIdByUrl.set(url, entry.id);
  }

  // Create Prefab entries for any URL that appears more than once in the lounge/stages
  const urlCounts = new Map<string, number>();
  for (const item of items) {
    urlCounts.set(item.url, (urlCounts.get(item.url) ?? 0) + 1);
  }
  urlCounts.set('/models/pa-speaker.glb', 4);
  urlCounts.set('/models/fresnel-led.glb', 5);

  const prefabIdByUrl = new Map<string, string>();
  for (const [url, count] of urlCounts.entries()) {
    if (count < 2) continue;
    const prefabName = getPrefabNameForUrl(url);
    const existingPrefabId = existingPrefabs.get(prefabName);
    if (existingPrefabId) {
      prefabIdByUrl.set(url, existingPrefabId);
      continue;
    }

    const assetId = assetIdByUrl.get(url) ?? null;
    const prefabData: PrefabData = {
      id: crypto.randomUUID(),
      name: prefabName,
      createdAt: new Date().toISOString(),
      root: {
        id: crypto.randomUUID(),
        name: prefabName,
        enabled: true,
        tags: ['prefab'],
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        components: [
          {
            id: crypto.randomUUID(),
            type: 'render',
            enabled: true,
            meshType: 'box',
            meshAssetId: assetId,
            castShadows: true,
            receiveShadows: true,
            material: {
              diffuseColor: [0.8, 0.8, 0.8],
              metalness: 0.1,
              gloss: 0.5,
              emissiveColor: [0, 0, 0],
              emissiveIntensity: 1,
              opacity: 1,
              diffuseMapAssetId: null,
              normalMapAssetId: null,
              metalnessMapAssetId: null,
            },
          },
        ],
        children: [],
      },
    };
    const savedPrefab = await AssetRepository.savePrefab(prefabName, prefabData, PREFABS_FOLDER);
    prefabIdByUrl.set(url, savedPrefab.id);
  }

  // Abort cleanly if React StrictMode unmounted/remounted while writing IndexedDB
  if (engine.getApp() !== app || engine.getSceneRoot() !== sceneRoot || !app.scene) {
    return;
  }

  // Reset the scene cleanly before building the lounge
  engine.prepareEmptyScene();
  sceneRoot.name = 'CaVanNghe_Main';

  // Ambient & Sky settings matching Day Mode lounge
  app.scene.ambientLight = new pc.Color(0.65, 0.6, 0.55);

  const mats = createSharedLoungeMaterials(engine);

  // 1. Environment Shell (Floor, Carpets, Walls, Ceiling, Beams, Downlights)
  buildEnvironmentShell(sceneRoot, mats);

  // 2. Lighting Rig (Directional, Bar/Reception Spotlights, Lamp PointLights)
  buildLightingRig(sceneRoot);

  // 3. Main Stage & Acoustic Stage (Stages, Steps, LED Strips, PA Speakers, Fresnels, Gig, Video LEDs)
  await buildMainAndAcousticStages(engine, sceneRoot, mats, fetchBuffer, assetIdByUrl);

  // 4. Main Camera inside the lounge (in front of reception desk, clear view of bar + stages)
  const mainCam = new pc.Entity('Main Camera');
  mainCam.addComponent('camera', {
    fov: 50,
    nearClip: 0.2,
    farClip: 120,
    clearColor: new pc.Color(0.08, 0.07, 0.06, 1),
  });
  if (mainCam.camera) {
    mainCam.camera.enabled = false;
  }
  mainCam.setLocalPosition(0, 3.0, 8.5);
  mainCam.lookAt(0, 1.4, -6);
  sceneRoot.addChild(mainCam);

  // 5. Player Character (`Character.glb`) for Play Mode walking/sitting
  const charUrl = '/models/Character.glb';
  const charBuf = bufferCache.get(charUrl);
  if (charBuf) {
    const charAssetId = assetIdByUrl.get(charUrl);
    const charLoaded = await loadGlbFromArrayBuffer(app, charBuf, 'Character.glb', charAssetId ?? charUrl);
    engine.registerExternalResources(charLoaded.destroyResources);
    const playerEntity = charLoaded.entity;
    playerEntity.name = 'Player';
    playerEntity.setLocalPosition(0, 0, 7.0);
    playerEntity.setLocalEulerAngles(0, 180, 0);
    playerEntity.setLocalScale(0.62, 0.62, 0.62);
    playerEntity.tags.add('player');
    if (charAssetId) {
      getEntityMeta(playerEntity).render = { meshAssetId: charAssetId };
    }
    sceneRoot.addChild(playerEntity);
  }

  // 5. Lounge Furniture (with Shared GLB Container Cache + Prefab tagging)
  const furnitureGroup = new pc.Entity('Lounge_Furniture');
  sceneRoot.addChild(furnitureGroup);

  for (const item of items) {
    const buffer = bufferCache.get(item.url);
    if (!buffer) continue;

    try {
      const filename = extractFilenameFromUrl(item.url);
      const assetId = assetIdByUrl.get(item.url);
      const loaded = await loadGlbFromArrayBuffer(app, buffer, filename, assetId ?? item.url);
      engine.registerExternalResources(loaded.destroyResources);

      const entity = loaded.entity;
      entity.name = item.name;
      entity.setLocalPosition(item.position[0], item.position[1], item.position[2]);
      entity.setLocalEulerAngles(
        item.rotation[0] * RAD_TO_DEG,
        item.rotation[1] * RAD_TO_DEG,
        item.rotation[2] * RAD_TO_DEG
      );
      entity.setLocalScale(item.scale[0], item.scale[1], item.scale[2]);

      const tags = [item.category, item.interactiveId].filter((t): t is string => Boolean(t));
      if (prefabIdByUrl.has(item.url)) {
        tags.push(`prefab:${getPrefabNameForUrl(item.url)}`);
      }
      if (tags.length > 0) {
        entity.tags.add(...tags);
      }

      if (loaded.animTracks.length > 0) {
        const meta = getEntityMeta(entity);
        meta.anim = {
          defaultState: loaded.animTracks[0],
          states: loaded.animTracks.map((trackName) => ({
            name: trackName,
            clipAssetId: trackName,
            speed: 1,
            loop: true,
          })),
          transitions: [],
          keyframeClipIds: [],
        };
      }

      if (assetId) {
        const meta = getEntityMeta(entity);
        meta.render = { ...(meta.render ?? {}), meshAssetId: assetId };
      }

      furnitureGroup.addChild(entity);
    } catch (itemErr) {
      engine.consoleBridge.warn(
        `Skipped lounge item "${item.name}" (${item.url}): ${
          itemErr instanceof Error ? itemErr.message : String(itemErr)
        }`
      );
    }
  }

  await useAssetStore.getState().loadAssets();
  engine.notifySceneChanged('ca-van-nghe-lounge');
}
