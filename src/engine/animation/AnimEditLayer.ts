import * as pc from 'playcanvas';
import type {
  AnimEditInterp,
  AnimEditKey,
  AnimEditLayer,
  AnimHipsOffsetKey,
  AnyHumanoidBoneKey,
} from '../../types/characterStudio';

const editLayerCache = new Map<string, Promise<AnimEditLayer | null>>();

export function clearAnimEditLayerCache(): void {
  editLayerCache.clear();
}

export async function fetchAnimEditLayer(
  url?: string | null,
  cacheBust?: string
): Promise<AnimEditLayer | null> {
  if (!url) return null;
  const fullUrl = cacheBust ? `${url}?v=${encodeURIComponent(cacheBust)}` : url;
  let pending = editLayerCache.get(fullUrl);
  if (!pending) {
    pending = fetch(fullUrl, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as Partial<AnimEditLayer>;
        if (!data || typeof data !== 'object' || !data.tracks) return null;
        return {
          version: 1,
          clipId: data.clipId || '',
          updatedAt: data.updatedAt || '',
          tracks: data.tracks,
          overrideBones: Array.isArray(data.overrideBones) ? data.overrideBones : undefined,
          hipsOffsetKeys: Array.isArray(data.hipsOffsetKeys) ? data.hipsOffsetKeys : undefined,
          ikTargets: Array.isArray(data.ikTargets) ? data.ikTargets : undefined,
        } satisfies AnimEditLayer;
      })
      .catch(() => null);
    editLayerCache.set(fullUrl, pending);
  }
  return pending;
}

export function createEmptyAnimEditLayer(clipId: string): AnimEditLayer {
  return {
    version: 1,
    clipId,
    updatedAt: new Date().toISOString(),
    tracks: {},
    hipsOffsetKeys: [],
    ikTargets: [],
  };
}

export function cloneAnimEditLayer(layer: AnimEditLayer): AnimEditLayer {
  return structuredClone(layer);
}

const IDENTITY_ROT: [number, number, number, number] = [0, 0, 0, 1];

function smoothstep01(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

const _qA = new pc.Quat();
const _qB = new pc.Quat();

export function sampleBoneDeltaAtTime(
  keys: AnimEditKey[] | undefined,
  t: number,
  out: pc.Quat
): boolean {
  if (!keys || keys.length === 0) {
    out.set(0, 0, 0, 1);
    return false;
  }
  if (keys.length === 1 || t <= keys[0].t) {
    const r = keys[0].rot;
    out.set(r[0], r[1], r[2], r[3]).normalize();
    return true;
  }
  const last = keys[keys.length - 1];
  if (t >= last.t) {
    const r = last.rot;
    out.set(r[0], r[1], r[2], r[3]).normalize();
    return true;
  }

  let lo = 0;
  let hi = keys.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid;
  }

  const k0 = keys[lo];
  const k1 = keys[hi];
  if (k0.interp === 'step' || k1.t - k0.t < 1e-6) {
    out.set(k0.rot[0], k0.rot[1], k0.rot[2], k0.rot[3]).normalize();
    return true;
  }

  let alpha = (t - k0.t) / (k1.t - k0.t);
  if (k0.interp === 'ease') {
    alpha = smoothstep01(alpha);
  }
  _qA.set(k0.rot[0], k0.rot[1], k0.rot[2], k0.rot[3]);
  _qB.set(k1.rot[0], k1.rot[1], k1.rot[2], k1.rot[3]);
  // Shortest-arc slerp
  if (_qA.x * _qB.x + _qA.y * _qB.y + _qA.z * _qB.z + _qA.w * _qB.w < 0) {
    _qB.set(-_qB.x, -_qB.y, -_qB.z, -_qB.w);
  }
  out.slerp(_qA, _qB, alpha).normalize();
  return true;
}

export function sampleHipsOffsetAtTime(
  keys: AnimHipsOffsetKey[] | undefined,
  t: number,
  out: pc.Vec3
): boolean {
  if (!keys || keys.length === 0) {
    out.set(0, 0, 0);
    return false;
  }
  if (keys.length === 1 || t <= keys[0].t) {
    out.set(keys[0].pos[0], keys[0].pos[1], keys[0].pos[2]);
    return true;
  }
  const last = keys[keys.length - 1];
  if (t >= last.t) {
    out.set(last.pos[0], last.pos[1], last.pos[2]);
    return true;
  }

  let lo = 0;
  let hi = keys.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const k0 = keys[lo];
  const k1 = keys[hi];
  if (k0.interp === 'step' || k1.t - k0.t < 1e-6) {
    out.set(k0.pos[0], k0.pos[1], k0.pos[2]);
    return true;
  }
  let alpha = (t - k0.t) / (k1.t - k0.t);
  if (k0.interp === 'ease') {
    alpha = smoothstep01(alpha);
  }
  out.set(
    k0.pos[0] + (k1.pos[0] - k0.pos[0]) * alpha,
    k0.pos[1] + (k1.pos[1] - k0.pos[1]) * alpha,
    k0.pos[2] + (k1.pos[2] - k0.pos[2]) * alpha
  );
  return true;
}

export function roundTime3(t: number): number {
  return Math.round(t * 1000) / 1000;
}

export function upsertBoneEditKey(
  layer: AnimEditLayer,
  bone: AnyHumanoidBoneKey,
  t: number,
  rot: [number, number, number, number],
  interp: AnimEditInterp = 'linear',
  snapThresholdSec = 0.012
): AnimEditLayer {
  const next = cloneAnimEditLayer(layer);
  next.updatedAt = new Date().toISOString();
  const list = [...(next.tracks[bone] ?? [])];
  const cleanT = roundTime3(Math.max(0, t));
  const idx = list.findIndex((k) => Math.abs(k.t - cleanT) <= snapThresholdSec);
  const entry: AnimEditKey = {
    t: idx >= 0 ? list[idx].t : cleanT,
    rot: [...rot] as [number, number, number, number],
    interp: idx >= 0 ? list[idx].interp : interp,
  };
  if (idx >= 0) {
    list[idx] = entry;
  } else {
    list.push(entry);
    list.sort((a, b) => a.t - b.t);
  }
  next.tracks[bone] = list;
  return next;
}

export function removeBoneEditKey(
  layer: AnimEditLayer,
  bone: AnyHumanoidBoneKey,
  t: number,
  toleranceSec = 0.012
): AnimEditLayer {
  const next = cloneAnimEditLayer(layer);
  next.updatedAt = new Date().toISOString();
  const list = (next.tracks[bone] ?? []).filter((k) => Math.abs(k.t - t) > toleranceSec);
  if (list.length === 0) {
    delete next.tracks[bone];
  } else {
    next.tracks[bone] = list;
  }
  return next;
}

export function moveBoneEditKey(
  layer: AnimEditLayer,
  bone: AnyHumanoidBoneKey,
  oldT: number,
  newT: number,
  toleranceSec = 0.012
): AnimEditLayer {
  const next = cloneAnimEditLayer(layer);
  next.updatedAt = new Date().toISOString();
  const list = [...(next.tracks[bone] ?? [])];
  const idx = list.findIndex((k) => Math.abs(k.t - oldT) <= toleranceSec);
  if (idx < 0) return next;
  const moved = { ...list[idx], t: roundTime3(Math.max(0, newT)) };
  const filtered = list.filter((_, i) => i !== idx && Math.abs(list[i].t - moved.t) > 0.008);
  filtered.push(moved);
  filtered.sort((a, b) => a.t - b.t);
  next.tracks[bone] = filtered;
  return next;
}

export function setBoneEditKeyInterp(
  layer: AnimEditLayer,
  bone: AnyHumanoidBoneKey,
  t: number,
  interp: AnimEditInterp,
  toleranceSec = 0.012
): AnimEditLayer {
  const next = cloneAnimEditLayer(layer);
  next.updatedAt = new Date().toISOString();
  const list = [...(next.tracks[bone] ?? [])];
  const idx = list.findIndex((k) => Math.abs(k.t - t) <= toleranceSec);
  if (idx >= 0) {
    list[idx] = { ...list[idx], interp };
    next.tracks[bone] = list;
  }
  return next;
}

export function upsertHipsOffsetKey(
  layer: AnimEditLayer,
  t: number,
  pos: [number, number, number],
  interp: AnimEditInterp = 'linear',
  snapThresholdSec = 0.012
): AnimEditLayer {
  const next = cloneAnimEditLayer(layer);
  next.updatedAt = new Date().toISOString();
  const list = [...(next.hipsOffsetKeys ?? [])];
  const cleanT = roundTime3(Math.max(0, t));
  const idx = list.findIndex((k) => Math.abs(k.t - cleanT) <= snapThresholdSec);
  const entry: AnimHipsOffsetKey = {
    t: idx >= 0 ? list[idx].t : cleanT,
    pos: [...pos] as [number, number, number],
    interp: idx >= 0 ? list[idx].interp : interp,
  };
  if (idx >= 0) list[idx] = entry;
  else {
    list.push(entry);
    list.sort((a, b) => a.t - b.t);
  }
  next.hipsOffsetKeys = list;
  return next;
}

export function hasAnyEditKeys(layer: AnimEditLayer | null | undefined): boolean {
  if (!layer) return false;
  if (layer.hipsOffsetKeys && layer.hipsOffsetKeys.length > 0) return true;
  if (layer.overrideBones && layer.overrideBones.length > 0) return true;
  return Object.values(layer.tracks).some((arr) => Array.isArray(arr) && arr.length > 0);
}

export function getIdentityDelta(): [number, number, number, number] {
  return [...IDENTITY_ROT] as [number, number, number, number];
}
