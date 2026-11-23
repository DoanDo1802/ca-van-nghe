import * as pc from 'playcanvas';

export const DEFAULT_AVATAR_COLOR = '#e8a246';

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
export function applyAvatarColor(entity: pc.Entity | null | undefined, hexColor?: string | null): void {
  if (!entity) return;
  const hex = hexColor && /^#[0-9a-fA-F]{6}$/.test(hexColor.trim()) ? hexColor.trim() : DEFAULT_AVATAR_COLOR;
  const target = new pc.Color().fromString(hex);
  const defaultRef = new pc.Color().fromString(DEFAULT_AVATAR_COLOR);

  // Relative multiplier lets Character.glb keep joint contrast while shifting main body color cleanly
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
    // Detect dark/accent joints vs main body mesh (warm amber diffuse on Character.glb)
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
    mat.update();
  }
}
