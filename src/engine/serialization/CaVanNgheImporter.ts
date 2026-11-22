import * as pc from 'playcanvas';
import { AssetRepository } from '../../storage';
import { useAssetStore } from '../../store/useAssetStore';
import type { PrefabData, ScriptAttributeValue } from '../../types';
import type { EditorEngine } from '../EditorEngine';
import { clearGlbContainerCache, loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';
import { getEntityMeta } from './EntityComponentHelper';
import { clearGlbAssetBufferCache } from './SceneDeserializer';
import {
  buildAcousticStageOnly,
  buildCinemaEnvironmentShell,
  buildLightingRig,
  buildLobbyEnvironmentShell,
  buildMainStageOnly,
  buildTeaRoomEnvironmentShell,
  createSharedLoungeMaterials,
  type GlbMaterialCache,
} from './LoungeSceneBuilder';
import {
  CINEMA_SCENE_ID,
  getSceneDefinition,
  LOBBY_SCENE_ID,
  TEAROOM_SCENE_ID,
} from './SceneRegistry';

export interface SceneLoadProgressPayload {
  percent: number;
  label: string;
}

export type SceneLoadProgressCallback = (progress: SceneLoadProgressPayload) => void;

function attachObjectVariables(
  entity: pc.Entity,
  scriptName: string,
  attributes: ScriptAttributeValue[]
): void {
  const meta = getEntityMeta(entity);
  const compId = meta.componentIds.script ?? crypto.randomUUID();
  meta.componentIds.script = compId;
  meta.script = {
    id: compId,
    type: 'script',
    enabled: true,
    scriptName,
    code: '',
    attributes,
  };
}

const CA_VAN_NGHE_FOLDER = '/CaVanNghe';
const PREFABS_FOLDER = '/Prefabs';

function extractFilenameFromUrl(url: string): string {
  const cleanUrl = url.split('?')[0].split('#')[0];
  const parts = cleanUrl.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'model.glb';
}

function getPrefabNameForUrl(url: string): string {
  const base = extractFilenameFromUrl(url).replace(/\.(glb|gltf)$/i, '');
  return `PF_${base}`;
}

function tagStagePrefabs(root: pc.GraphNode, prefabNameByAssetId: Map<string, string>): void {
  if (root instanceof pc.Entity) {
    const meshAssetId = getEntityMeta(root).render?.meshAssetId;
    if (meshAssetId) {
      const prefabName = prefabNameByAssetId.get(meshAssetId);
      if (prefabName) {
        const tag = `prefab:${prefabName}`;
        if (!root.tags.has(tag)) {
          root.tags.add(tag);
        }
      }
    }
  }
  for (const child of root.children) {
    tagStagePrefabs(child, prefabNameByAssetId);
  }
}

async function fetchWithProgress(
  url: string,
  onFraction: (fraction: number) => void
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model "${url}": ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (!response.body || contentLength <= 0) {
    const buf = await response.arrayBuffer();
    onFraction(1);
    return buf;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onFraction(Math.min(1, received / contentLength));
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onFraction(1);
  return merged.buffer;
}

async function spawnPlayerAndCamera(options: {
  app: pc.Application;
  engine: EditorEngine;
  sceneRoot: pc.Entity;
  bufferCache: Map<string, ArrayBuffer>;
  assetIdByUrl: Map<string, string>;
  camPos: [number, number, number];
  camLookAt: [number, number, number];
  playerPos: [number, number, number];
  playerRotY: number;
}): Promise<void> {
  const {
    app,
    engine,
    sceneRoot,
    bufferCache,
    assetIdByUrl,
    camPos,
    camLookAt,
    playerPos,
    playerRotY,
  } = options;

  const mainCam = new pc.Entity('Main Camera');
  mainCam.addComponent('camera', {
    fov: 50,
    nearClip: 0.2,
    farClip: 120,
    clearColor: new pc.Color(0.035, 0.039, 0.059, 1),
  });
  if (mainCam.camera) {
    mainCam.camera.enabled = false;
  }
  mainCam.setLocalPosition(camPos[0], camPos[1], camPos[2]);
  mainCam.lookAt(camLookAt[0], camLookAt[1], camLookAt[2]);
  sceneRoot.addChild(mainCam);

  const charUrl = '/models/Character.glb';
  const charBuf = bufferCache.get(charUrl);
  if (charBuf) {
    const charAssetId = assetIdByUrl.get(charUrl);
    const charLoaded = await loadGlbFromArrayBuffer(
      app,
      charBuf,
      'Character.glb',
      charAssetId ?? charUrl
    );
    engine.registerExternalResources(charLoaded.destroyResources);
    const playerEntity = charLoaded.entity;
    playerEntity.name = 'Player';
    playerEntity.setLocalPosition(playerPos[0], playerPos[1], playerPos[2]);
    playerEntity.setLocalEulerAngles(0, playerRotY, 0);
    playerEntity.setLocalScale(0.62, 0.62, 0.62);
    playerEntity.tags.add('player');
    if (charLoaded.animTracks.length > 0) {
      const meta = getEntityMeta(playerEntity);
      meta.anim = {
        defaultState: charLoaded.animTracks.includes('Idle_Loop')
          ? 'Idle_Loop'
          : charLoaded.animTracks[0],
        states: charLoaded.animTracks.map((trackName) => ({
          name: trackName,
          clipAssetId: trackName,
          speed: 1,
          loop: !trackName.startsWith('Jump'),
        })),
        transitions: [],
        keyframeClipIds: [],
      };
    }
    if (charAssetId) {
      getEntityMeta(playerEntity).render = { meshAssetId: charAssetId };
    }
    attachObjectVariables(playerEntity, 'PlayerController', [
      { name: 'walkSpeed', type: 'number', value: 4.5 },
      { name: 'runSpeed', type: 'number', value: 7.5 },
      { name: 'jumpVelocity', type: 'number', value: 6.2 },
      { name: 'gravity', type: 'number', value: -18 },
      { name: 'turnSpeed', type: 'number', value: 12 },
      { name: 'cameraDistance', type: 'number', value: 3.6 },
      { name: 'interactRange', type: 'number', value: 3.2 },
    ]);
    sceneRoot.addChild(playerEntity);
  }
}

/**
 * Imports a single scene by ID, fetching ONLY the .glb assets required by that scene
 * and reporting granular loading progress from 0% to 100%.
 */
export async function importCaVanNgheSceneById(
  engine: EditorEngine,
  sceneId: string = LOBBY_SCENE_ID,
  onProgress?: SceneLoadProgressCallback
): Promise<void> {
  const app = engine.getApp();
  const sceneRoot = engine.getSceneRoot();
  if (!app || !sceneRoot) {
    throw new Error('EditorEngine is not mounted');
  }

  const sceneDef = getSceneDefinition(sceneId);
  const report = (percent: number, label: string) => {
    onProgress?.({ percent, label });
  };

  report(5, `Đang giải phóng tài nguyên scene cũ để vào ${sceneDef.shortName}...`);

  // Release previous scene GPU/GLB caches cleanly before loading new scene assets
  engine.prepareEmptyScene();
  clearGlbContainerCache(app);
  clearGlbAssetBufferCache();

  const uniqueUrls = Array.from(new Set(sceneDef.modelUrls));
  const bufferCache = new Map<string, ArrayBuffer>();
  const fileFractions = new Map<string, number>();

  const updateDownloadProgress = (currentFile: string) => {
    if (uniqueUrls.length === 0) return;
    let sum = 0;
    for (const u of uniqueUrls) {
      sum += fileFractions.get(u) ?? 0;
    }
    const ratio = sum / uniqueUrls.length;
    const pct = 10 + ratio * 55; // 10% -> 65%
    report(pct, `Đang tải tài nguyên: ${currentFile} (${Math.round(pct)}%)`);
  };

  const fetchBuffer = async (url: string): Promise<ArrayBuffer> => {
    const cached = bufferCache.get(url);
    if (cached) return cached;
    const filename = extractFilenameFromUrl(url);
    const buf = await fetchWithProgress(url, (frac) => {
      fileFractions.set(url, frac);
      updateDownloadProgress(filename);
    });
    bufferCache.set(url, buf);
    return buf;
  };

  await Promise.all(uniqueUrls.map((url) => fetchBuffer(url)));

  if (engine.getApp() !== app || engine.getSceneRoot() !== sceneRoot || !app.scene) {
    return;
  }

  report(68, 'Đang đồng bộ kho tài nguyên của phòng...');

  const existingAssets = await AssetRepository.listAssets();
  const existingByName = new Map<string, { id: string; sizeBytes: number }>();
  const existingPrefabs = new Map<string, string>();
  for (const asset of existingAssets) {
    if (asset.folderPath === CA_VAN_NGHE_FOLDER) {
      existingByName.set(asset.name, { id: asset.id, sizeBytes: asset.sizeBytes });
    } else if (asset.type === 'prefab' && asset.folderPath === PREFABS_FOLDER) {
      existingPrefabs.set(asset.name, asset.id);
    }
  }

  const assetIdByUrl = new Map<string, string>();
  for (const url of uniqueUrls) {
    const filename = extractFilenameFromUrl(url);
    const buffer = bufferCache.get(url);
    const existing = existingByName.get(filename);
    if (existing) {
      assetIdByUrl.set(url, existing.id);
      if (buffer && existing.sizeBytes !== buffer.byteLength) {
        await AssetRepository.updateAssetBlob(existing.id, buffer);
        clearGlbAssetBufferCache(existing.id);
      }
      continue;
    }
    if (!buffer) continue;

    const mimeType = filename.toLowerCase().endsWith('.gltf')
      ? 'model/gltf+json'
      : 'model/gltf-binary';
    const file = new File([buffer], filename, { type: mimeType });
    const entry = await AssetRepository.importFile(file, CA_VAN_NGHE_FOLDER);
    assetIdByUrl.set(url, entry.id);
  }

  // Create prefab metadata only for repeated stage models in Cinema_Scene
  const prefabNameByAssetId = new Map<string, string>();
  if (sceneDef.id === CINEMA_SCENE_ID) {
    for (const url of ['/models/pa-speaker.glb', '/models/fresnel-led.glb']) {
      const prefabName = getPrefabNameForUrl(url);
      const assetId = assetIdByUrl.get(url) ?? null;
      if (assetId) {
        prefabNameByAssetId.set(assetId, prefabName);
      }
      if (!existingPrefabs.has(prefabName)) {
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
                meshType: assetId ? 'asset' : 'box',
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
        await AssetRepository.savePrefab(prefabName, prefabData, PREFABS_FOLDER);
      }
    }
  }

  if (engine.getApp() !== app || engine.getSceneRoot() !== sceneRoot || !app.scene) {
    return;
  }

  report(75, `Đang dựng không gian 3D: ${sceneDef.shortName}...`);

  app.scene.ambientLight = new pc.Color(0.045, 0.045, 0.055);
  app.scene.exposure = 0.92;

  const mats = createSharedLoungeMaterials(engine);
  const glbMaterialCache: GlbMaterialCache = new Map();

  if (sceneDef.id === LOBBY_SCENE_ID) {
    sceneRoot.name = 'Lobby_Scene';
    buildLobbyEnvironmentShell(engine, sceneRoot, mats);
    buildLightingRig(sceneRoot, 'lobby');
    await spawnPlayerAndCamera({
      app,
      engine,
      sceneRoot,
      bufferCache,
      assetIdByUrl,
      camPos: [0, 3.0, 8.2],
      camLookAt: [0, 1.8, -8.0],
      playerPos: [0, 0, 6.2],
      playerRotY: 180,
    });
  } else if (sceneDef.id === CINEMA_SCENE_ID) {
    sceneRoot.name = 'Cinema_Scene';
    buildCinemaEnvironmentShell(engine, sceneRoot, mats);
    buildLightingRig(sceneRoot, 'cinema');
    report(82, 'Đang dựng sân khấu Rạp Chiếu Phim (Main_Stage)...');
    await buildMainStageOnly(engine, sceneRoot, mats, fetchBuffer, assetIdByUrl, glbMaterialCache);
    tagStagePrefabs(sceneRoot, prefabNameByAssetId);
    await spawnPlayerAndCamera({
      app,
      engine,
      sceneRoot,
      bufferCache,
      assetIdByUrl,
      camPos: [0, 3.0, 8.5],
      camLookAt: [0, 1.4, -6.0],
      playerPos: [0, 0, 7.0],
      playerRotY: 180,
    });
  } else if (sceneDef.id === TEAROOM_SCENE_ID) {
    sceneRoot.name = 'TeaRoom_Scene';
    buildTeaRoomEnvironmentShell(engine, sceneRoot, mats);
    buildLightingRig(sceneRoot, 'tearoom');
    report(82, 'Đang dựng sân khấu Phòng Trà (Acoustic_Stage)...');
    await buildAcousticStageOnly(engine, sceneRoot, mats, fetchBuffer, assetIdByUrl, glbMaterialCache);
    await spawnPlayerAndCamera({
      app,
      engine,
      sceneRoot,
      bufferCache,
      assetIdByUrl,
      camPos: [-3.2, 2.8, 3.0],
      camLookAt: [16.5, 1.4, 3.0],
      playerPos: [-1.5, 0, 3.0],
      playerRotY: 90,
    });
  }

  report(94, 'Đang hoàn tất khởi tạo nhân vật & vật lý...');
  await useAssetStore.getState().loadAssets();
  engine.notifySceneChanged(sceneDef.id, sceneDef.name);
  report(100, `Đã sẵn sàng vào ${sceneDef.shortName}!`);
}

export async function importCaVanNgheScene(
  engine: EditorEngine,
  sceneId: string = LOBBY_SCENE_ID,
  onProgress?: SceneLoadProgressCallback
): Promise<void> {
  return importCaVanNgheSceneById(engine, sceneId, onProgress);
}
