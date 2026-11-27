import { useEffect, useState } from 'react';
import * as pc from 'playcanvas';
import { CharacterRegistry } from '../engine/animation/CharacterRegistry';
import type { CharacterManifestEntry } from '../types/characterStudio';

export const DEFAULT_AVATAR_COLOR = '#e8a246';
export const DEFAULT_AVATAR_MODEL = 'default';

export type AvatarModelId = string;
export type AvatarModelPreset = CharacterManifestEntry;

/** Live fallback export kept for backwards compatibility; use `useCharacterPresets()` in React UI */
export const AVATAR_MODEL_PRESETS: AvatarModelPreset[] = CharacterRegistry.getCharactersSync();

const AVATAR_MODEL_STORAGE_KEY = 'cavannghe:avatar-model';

export function normalizeAvatarModelId(raw?: string | null): AvatarModelId {
  return CharacterRegistry.normalizeCharacterId(raw);
}

export function getSavedAvatarModel(): AvatarModelId {
  try {
    return normalizeAvatarModelId(localStorage.getItem(AVATAR_MODEL_STORAGE_KEY));
  } catch {
    return CharacterRegistry.getDefaultCharacterIdSync();
  }
}

export function saveAvatarModel(modelId: string): AvatarModelId {
  const clean = normalizeAvatarModelId(modelId);
  try {
    localStorage.setItem(AVATAR_MODEL_STORAGE_KEY, clean);
  } catch {
    // ignore storage failures
  }
  return clean;
}

export function getAvatarModelPreset(modelId?: string | null): AvatarModelPreset {
  return CharacterRegistry.getCharacterPresetSync(modelId);
}

/**
 * React hook returning live character presets from `/characters/manifest.json`
 * and re-rendering automatically when edited in Character & Animation Studio.
 */
export function useCharacterPresets(): AvatarModelPreset[] {
  const [presets, setPresets] = useState<AvatarModelPreset[]>(() =>
    CharacterRegistry.getCharactersSync()
  );

  useEffect(() => {
    let mounted = true;
    void CharacterRegistry.ensureLoaded().then((m) => {
      if (mounted) setPresets([...m.characters]);
    });
    const unsub = CharacterRegistry.subscribe((m) => {
      if (mounted) setPresets([...m.characters]);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return presets;
}

export interface AvatarColorPreset {
  id: string;
  label: string;
  hex: string;
}

export const AVATAR_COLOR_PRESETS: AvatarColorPreset[] = [
  { id: 'amber', label: 'Vàng Cam (Mặc định)', hex: '#e8a246' },
  { id: 'crimson', label: 'Đỏ Nhung', hex: '#dc2626' },
  { id: 'rose', label: 'Hồng San Hô', hex: '#f43f5e' },
  { id: 'sky', label: 'Xanh Dương', hex: '#0284c7' },
  { id: 'cyan', label: 'Xanh Ngọc', hex: '#06b6d4' },
  { id: 'emerald', label: 'Xanh Lá', hex: '#10b981' },
  { id: 'violet', label: 'Tím Neon', hex: '#8b5cf6' },
  { id: 'gold', label: 'Vàng Kim', hex: '#eab308' },
  { id: 'pearl', label: 'Trắng Ngọc', hex: '#e5e7eb' },
  { id: 'obsidian', label: 'Đen Than', hex: '#27272a' },
];

const AVATAR_COLOR_STORAGE_KEY = 'cavannghe:avatar-color';

const clonedMaterialCache = new WeakMap<
  pc.Entity,
  { mats: pc.StandardMaterial[]; originals: Map<pc.StandardMaterial, { r: number; g: number; b: number }> }
>();

export function getSavedAvatarColor(): string {
  try {
    const val = localStorage.getItem(AVATAR_COLOR_STORAGE_KEY);
    if (val && /^#[0-9a-fA-F]{6}$/.test(val)) return val;
  } catch {
    // ignore storage failures
  }
  return DEFAULT_AVATAR_COLOR;
}

export function saveAvatarColor(hex: string): string {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex.trim()) ? hex.trim() : DEFAULT_AVATAR_COLOR;
  try {
    localStorage.setItem(AVATAR_COLOR_STORAGE_KEY, clean);
  } catch {
    // ignore storage failures
  }
  return clean;
}

/**
 * Tints an avatar entity's body material safely using per-entity cloned StandardMaterials
 * so multiple players can wear different colors without mutating shared GLB materials.
 */
export function applyAvatarColor(
  entity: pc.Entity | null | undefined,
  hexColor?: string | null,
  modelId?: string | null
): void {
  if (!entity) return;
  const preset = modelId ? getAvatarModelPreset(modelId) : undefined;
  if (preset && !preset.tintable) return;

  const hex =
    hexColor && /^#[0-9a-fA-F]{6}$/.test(hexColor.trim()) ? hexColor.trim() : DEFAULT_AVATAR_COLOR;
  const target = new pc.Color().fromString(hex);
  const defaultRef = new pc.Color().fromString(DEFAULT_AVATAR_COLOR);
  const isOriginalCharacterGlb = !preset || preset.url === '/models/Character.glb';

  const ratioR = target.r / Math.max(0.05, defaultRef.r);
  const ratioG = target.g / Math.max(0.05, defaultRef.g);
  const ratioB = target.b / Math.max(0.05, defaultRef.b);

  let entry = clonedMaterialCache.get(entity);
  if (!entry) {
    const mats: pc.StandardMaterial[] = [];
    const originals = new Map<pc.StandardMaterial, { r: number; g: number; b: number }>();

    entity.findComponents('render').forEach((comp) => {
      const rc = comp as pc.RenderComponent;
      for (const mi of rc.meshInstances) {
        if (mi.material instanceof pc.StandardMaterial) {
          const cloned = mi.material.clone();
          originals.set(cloned, {
            r: cloned.diffuse.r,
            g: cloned.diffuse.g,
            b: cloned.diffuse.b,
          });
          mi.material = cloned;
          mats.push(cloned);
        }
      }
    });

    entry = { mats, originals };
    clonedMaterialCache.set(entity, entry);
  }

  for (const mat of entry.mats) {
    const orig = entry.originals.get(mat);
    if (!orig) continue;
    if (isOriginalCharacterGlb) {
      const isAccentJoint = orig.b > orig.r * 0.9 && orig.r < 0.45;
      if (isAccentJoint) {
        mat.diffuse.set(orig.r, orig.g, orig.b);
      } else {
        mat.diffuse.set(
          Math.min(1, Math.max(0.02, orig.r * ratioR)),
          Math.min(1, Math.max(0.02, orig.g * ratioG)),
          Math.min(1, Math.max(0.02, orig.b * ratioB))
        );
      }
    } else {
      // Generic tint multiplication for custom imported tintable characters
      const lum = Math.max(0.35, 0.299 * orig.r + 0.587 * orig.g + 0.114 * orig.b);
      mat.diffuse.set(
        Math.min(1, lum * target.r),
        Math.min(1, lum * target.g),
        Math.min(1, lum * target.b)
      );
    }
    mat.update();
  }
}
