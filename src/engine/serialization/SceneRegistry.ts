export const LOBBY_SCENE_ID = 'ca-van-nghe-lobby';
export const CINEMA_SCENE_ID = 'ca-van-nghe-cinema';
export const TEAROOM_SCENE_ID = 'ca-van-nghe-tearoom';

export const BUILD_SETTINGS_STORAGE_KEY = 'cavannghe:unity-build-settings:v1';

export interface SceneDefinition {
  id: string;
  name: string;
  shortName: string;
  path: string;
  description: string;
  modelUrls: string[];
}

export interface BuildSceneEntry {
  sceneId: string;
  name: string;
  path: string;
  enabled: boolean;
}

export interface SceneLoadingProgress {
  loading: boolean;
  sceneId: string;
  sceneName: string;
  percent: number;
  label: string;
}

export const SCENE_DEFINITIONS: SceneDefinition[] = [
  {
    id: LOBBY_SCENE_ID,
    name: 'Sảnh Chờ (Lobby)',
    shortName: 'Sảnh Chờ',
    path: 'Scenes/Lobby_Scene.unity',
    description: 'Sảnh chờ trung tâm của phòng Lobby với 2 khu vực hoạt động: Rạp Chiếu Phim & Phòng Trà.',
    modelUrls: ['/models/Character.glb'],
  },
  {
    id: CINEMA_SCENE_ID,
    name: 'Rạp Chiếu Phim (Cinema)',
    shortName: 'Rạp Chiếu Phim',
    path: 'Scenes/Cinema_Scene.unity',
    description: 'Không gian Rạp Chiếu Phim với Main_Stage (Màn hình LED lớn, loa PA, đèn Fresnel).',
    modelUrls: ['/models/pa-speaker.glb', '/models/fresnel-led.glb', '/models/Character.glb'],
  },
  {
    id: TEAROOM_SCENE_ID,
    name: 'Phòng Trà (Acoustic)',
    shortName: 'Phòng Trà',
    path: 'Scenes/TeaRoom_Scene.unity',
    description: 'Không gian Phòng Trà tách riêng với Acoustic_Stage (Ban nhạc Live, LED Board, Karaoke).',
    modelUrls: [
      '/models/every_other_gig_ever.glb',
      '/models/MicStand.glb',
      '/models/Microphone.glb',
      '/models/fresnel-led.glb',
      '/models/Character.glb',
    ],
  },
];

const SCENE_DEF_BY_ID = new Map<string, SceneDefinition>(
  SCENE_DEFINITIONS.map((def) => [def.id, def])
);

export function getAllSceneDefinitions(): SceneDefinition[] {
  return [...SCENE_DEFINITIONS];
}

export function getSceneDefinition(sceneId: string): SceneDefinition {
  return SCENE_DEF_BY_ID.get(sceneId) ?? SCENE_DEFINITIONS[0];
}

export function isKnownSceneId(sceneId: string): boolean {
  return SCENE_DEF_BY_ID.has(sceneId);
}

export function getDefaultBuildSettings(): BuildSceneEntry[] {
  return SCENE_DEFINITIONS.map((def) => ({
    sceneId: def.id,
    name: def.name,
    path: def.path,
    enabled: true,
  }));
}

export function getBuildSettingsScenes(): BuildSceneEntry[] {
  const defaults = getDefaultBuildSettings();
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(BUILD_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;

    const validIds = new Set(SCENE_DEFINITIONS.map((d) => d.id));
    const seen = new Set<string>();
    const result: BuildSceneEntry[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as Partial<BuildSceneEntry>;
      if (!candidate.sceneId || !validIds.has(candidate.sceneId) || seen.has(candidate.sceneId)) {
        continue;
      }
      seen.add(candidate.sceneId);
      const def = getSceneDefinition(candidate.sceneId);
      result.push({
        sceneId: def.id,
        name: def.name,
        path: def.path,
        enabled: candidate.enabled !== false,
      });
    }

    for (const def of SCENE_DEFINITIONS) {
      if (!seen.has(def.id)) {
        result.push({
          sceneId: def.id,
          name: def.name,
          path: def.path,
          enabled: true,
        });
      }
    }

    return result;
  } catch {
    return defaults;
  }
}

export function saveBuildSettingsScenes(entries: BuildSceneEntry[]): BuildSceneEntry[] {
  const validIds = new Set(SCENE_DEFINITIONS.map((d) => d.id));
  const seen = new Set<string>();
  const normalized: BuildSceneEntry[] = [];

  for (const item of entries) {
    if (!validIds.has(item.sceneId) || seen.has(item.sceneId)) continue;
    seen.add(item.sceneId);
    const def = getSceneDefinition(item.sceneId);
    normalized.push({
      sceneId: def.id,
      name: def.name,
      path: def.path,
      enabled: Boolean(item.enabled),
    });
  }

  for (const def of SCENE_DEFINITIONS) {
    if (!seen.has(def.id)) {
      normalized.push({
        sceneId: def.id,
        name: def.name,
        path: def.path,
        enabled: true,
      });
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(BUILD_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(
        new CustomEvent<BuildSceneEntry[]>('cavannghe:build-settings-changed', {
          detail: normalized,
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }

  return normalized;
}

export function getEnabledBuildScenes(): BuildSceneEntry[] {
  return getBuildSettingsScenes().filter((entry) => entry.enabled);
}

export function isSceneEnabledInBuild(sceneId: string): boolean {
  const enabled = getEnabledBuildScenes();
  if (enabled.length === 0) return sceneId === LOBBY_SCENE_ID;
  return enabled.some((entry) => entry.sceneId === sceneId);
}

export function getStartupSceneId(): string {
  const enabled = getEnabledBuildScenes();
  return enabled[0]?.sceneId ?? LOBBY_SCENE_ID;
}

export function emitSceneLoadingProgress(progress: SceneLoadingProgress): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SceneLoadingProgress>('cavannghe:scene-loading', {
      detail: {
        ...progress,
        percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      },
    })
  );
}
