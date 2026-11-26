import { AnimationRegistry } from '../../engine/animation/AnimationRegistry';
import { CharacterRegistry } from '../../engine/animation/CharacterRegistry';
import { clearHumanoidRetargetCaches } from '../../engine/animation/HumanoidRetargeter';
import type { AnimationManifest, CharacterManifest } from '../../types/characterStudio';
import type * as pc from 'playcanvas';

export interface UploadedPublicAsset {
  ok: boolean;
  filename: string;
  url: string;
  diskPath: string;
  sizeBytes: number;
}

export async function checkStudioServerAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/dev/studio/ping', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export async function uploadStudioGlbToPublic(
  kind: 'model' | 'animation',
  filename: string,
  glbBuffer: ArrayBuffer
): Promise<UploadedPublicAsset> {
  const params = new URLSearchParams({ kind, filename });
  const res = await fetch(`/api/dev/studio/upload-binary?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: glbBuffer,
  });
  const data = (await res.json()) as UploadedPublicAsset & { error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Không thể ghi file GLB vào public/${kind === 'animation' ? 'animations' : 'models'}`);
  }
  return data;
}

export async function persistCharacterManifest(
  manifest: CharacterManifest,
  app?: pc.Application
): Promise<string> {
  const res = await fetch('/api/dev/studio/save-characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  const data = (await res.json()) as { ok?: boolean; diskPath?: string; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Không thể lưu public/characters/manifest.json');
  }
  clearHumanoidRetargetCaches(app);
  CharacterRegistry.setManifestInMemory(manifest);
  return data.diskPath || 'public/characters/manifest.json';
}

export async function persistAnimationManifest(
  manifest: AnimationManifest,
  app?: pc.Application
): Promise<string> {
  const res = await fetch('/api/dev/studio/save-animations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  const data = (await res.json()) as { ok?: boolean; diskPath?: string; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Không thể lưu public/animations/manifest.json');
  }
  clearHumanoidRetargetCaches(app);
  AnimationRegistry.setManifestInMemory(manifest);
  return data.diskPath || 'public/animations/manifest.json';
}

export async function deletePublicStudioAsset(assetUrl: string): Promise<void> {
  const res = await fetch('/api/dev/studio/delete-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetUrl }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Không thể xóa file ${assetUrl}`);
  }
}

export function slugifyStudioId(raw: string, fallback = 'custom'): string {
  const s = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return s || fallback;
}
