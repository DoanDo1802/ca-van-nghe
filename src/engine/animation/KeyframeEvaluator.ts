import * as pc from 'playcanvas';
import type {
  AnimatablePropertyPath,
  AnimationClipData,
  ColorRGB,
  InterpolationMode,
  KeyframeData,
  LoopMode,
  PropertyTrackData,
  Vec3,
} from '../../types';

export type EvaluatedValue = number | Vec3 | ColorRGB;

function cloneEvaluatedValue(value: EvaluatedValue): EvaluatedValue {
  return Array.isArray(value) ? ([value[0], value[1], value[2]] as Vec3) : value;
}

/**
 * Maps raw playback time into `[0, duration]` according to `loopMode`.
 */
export function computeEffectiveTime(
  time: number,
  duration: number,
  loopMode: LoopMode | string
): number {
  if (duration <= 0 || !Number.isFinite(duration)) return 0;
  if (!Number.isFinite(time)) return 0;

  const mode = loopMode === 'pingPong' ? 'pingpong' : loopMode;

  switch (mode) {
    case 'once':
      return Math.max(0, Math.min(time, duration));
    case 'loop': {
      const wrapped = ((time % duration) + duration) % duration;
      return wrapped;
    }
    case 'pingpong': {
      const cycle = duration * 2;
      const wrapped = ((time % cycle) + cycle) % cycle;
      return wrapped > duration ? cycle - wrapped : wrapped;
    }
    default:
      return Math.max(0, Math.min(time, duration));
  }
}

export function applyEasing(t: number, mode: InterpolationMode): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (mode) {
    case 'step':
      return 0;
    case 'linear':
      return clamped;
    case 'easeIn':
      return clamped * clamped;
    case 'easeOut':
      return 1 - (1 - clamped) * (1 - clamped);
    case 'easeInOut':
      return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    default:
      return clamped;
  }
}

function interpolateValues(
  a: EvaluatedValue,
  b: EvaluatedValue,
  t: number
): EvaluatedValue {
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }
  return cloneEvaluatedValue(a);
}

/**
 * Evaluates a single `PropertyTrackData` at `effectiveTime` (already mapped into clip duration).
 */
export function evaluateTrack(
  track: PropertyTrackData,
  effectiveTime: number
): EvaluatedValue | null {
  const keyframes = track.keyframes;
  if (!keyframes || keyframes.length === 0) return null;

  const sorted: KeyframeData[] =
    keyframes.length > 1 ? [...keyframes].sort((a, b) => a.time - b.time) : keyframes;

  if (sorted.length === 1 || effectiveTime <= sorted[0].time) {
    return cloneEvaluatedValue(sorted[0].value);
  }

  const last = sorted[sorted.length - 1];
  if (effectiveTime >= last.time) {
    return cloneEvaluatedValue(last.value);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const kfA = sorted[i];
    const kfB = sorted[i + 1];
    if (effectiveTime >= kfA.time && effectiveTime <= kfB.time) {
      if (kfA.interpolation === 'step' || kfB.time <= kfA.time) {
        return cloneEvaluatedValue(kfA.value);
      }
      const rawT = (effectiveTime - kfA.time) / (kfB.time - kfA.time);
      const easedT = applyEasing(rawT, kfA.interpolation);
      return interpolateValues(kfA.value, kfB.value, easedT);
    }
  }

  return cloneEvaluatedValue(last.value);
}

function getStandardMaterials(entity: pc.Entity): pc.StandardMaterial[] {
  const materials: pc.StandardMaterial[] = [];
  const render = entity.render;
  if (!render) return materials;

  if (render.material instanceof pc.StandardMaterial) {
    materials.push(render.material);
  }
  if (render.meshInstances) {
    for (const mi of render.meshInstances) {
      if (mi.material instanceof pc.StandardMaterial && !materials.includes(mi.material)) {
        materials.push(mi.material);
      }
    }
  }
  return materials;
}

/**
 * Applies an evaluated track value to the target `pc.Entity`.
 * Returns true if a transform property (`position`, `rotation`, `scale`) was modified.
 */
export function applyTrackValue(
  entity: pc.Entity,
  property: AnimatablePropertyPath,
  value: EvaluatedValue
): boolean {
  switch (property) {
    case 'position': {
      if (!Array.isArray(value)) return false;
      entity.setLocalPosition(value[0], value[1], value[2]);
      return true;
    }
    case 'rotation': {
      if (!Array.isArray(value)) return false;
      entity.setLocalEulerAngles(value[0], value[1], value[2]);
      return true;
    }
    case 'scale': {
      if (!Array.isArray(value)) return false;
      entity.setLocalScale(value[0], value[1], value[2]);
      return true;
    }
    case 'material.diffuse': {
      if (!Array.isArray(value)) return false;
      const materials = getStandardMaterials(entity);
      for (const mat of materials) {
        mat.diffuse.set(value[0], value[1], value[2]);
        mat.update();
      }
      return false;
    }
    case 'material.opacity': {
      const opacity = typeof value === 'number' ? value : Array.isArray(value) ? value[0] : 1;
      const clamped = Math.max(0, Math.min(1, opacity));
      const materials = getStandardMaterials(entity);
      for (const mat of materials) {
        mat.opacity = clamped;
        if (clamped < 1 && mat.blendType === pc.BLEND_NONE) {
          mat.blendType = pc.BLEND_NORMAL;
        }
        mat.update();
      }
      return false;
    }
    case 'light.intensity': {
      const intensity = typeof value === 'number' ? value : Array.isArray(value) ? value[0] : 1;
      if (entity.light) {
        entity.light.intensity = Math.max(0, intensity);
      }
      return false;
    }
    default:
      return false;
  }
}

/**
 * Evaluates all tracks of an `AnimationClipData` at `time` and applies them
 * to matching `pc.Entity` instances under `SceneRoot`.
 */
export function evaluateClipAtTime(
  clip: AnimationClipData,
  time: number,
  resolveEntity: (entityId: string) => pc.Entity | null,
  onEntityTransformUpdated?: (entity: pc.Entity) => void
): void {
  const effectiveTime = computeEffectiveTime(time, clip.duration, clip.loopMode);
  const transformedEntities = new Set<pc.Entity>();

  for (const track of clip.tracks) {
    const entity = resolveEntity(track.targetEntityId);
    if (!entity) continue;

    const evaluated = evaluateTrack(track, effectiveTime);
    if (evaluated === null) continue;

    const didTransform = applyTrackValue(entity, track.property, evaluated);
    if (didTransform) {
      transformedEntities.add(entity);
    }
  }

  if (onEntityTransformUpdated) {
    for (const entity of transformedEntities) {
      onEntityTransformUpdated(entity);
    }
  }
}
