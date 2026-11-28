import * as pc from 'playcanvas';
import {
  ALL_HUMANOID_BONE_KEYS,
  type AnimEditLayer,
  type AnyHumanoidBoneKey,
  type AnimationClipEntry,
  type CharacterManifestEntry,
  type CoreAnimSlotId,
  type HumanoidBoneKey,
} from '../../types/characterStudio';
import {
  clearAnimEditLayerCache,
  fetchAnimEditLayer,
  sampleBoneDeltaAtTime,
  sampleHipsOffsetAtTime,
} from './AnimEditLayer';
import { AnimationRegistry, CORE_SLOT_STATE_NAMES } from './AnimationRegistry';
import { loadGlbFromArrayBuffer } from './GlbAnimExtractor';
import {
  buildHumanoidRigProfile,
  resolveAnimRootBone,
  type HumanoidRigProfile,
} from './HumanoidRigMapper';

interface CachedAnimContainer {
  entity: pc.Entity;
  rigProfile: HumanoidRigProfile;
  restSnapshot: Map<pc.GraphNode, { pos: pc.Vec3; rot: pc.Quat; scale: pc.Vec3 }>;
  nodeByEntityPathKey: Map<string, pc.GraphNode>;
  nodeByName: Map<string, pc.GraphNode>;
  animTrackMap: Record<string, pc.AnimTrack>;
  animTracks: string[];
  destroyResources: () => void;
}

const sourceContainerCache = new WeakMap<pc.Application, Map<string, Promise<CachedAnimContainer | null>>>();
const retargetedTrackCache = new WeakMap<pc.Application, Map<string, pc.AnimTrack>>();
const arrayBufferFetchCache = new Map<string, Promise<ArrayBuffer | null>>();

function getAppSourceCache(app: pc.Application): Map<string, Promise<CachedAnimContainer | null>> {
  let map = sourceContainerCache.get(app);
  if (!map) {
    map = new Map();
    sourceContainerCache.set(app, map);
  }
  return map;
}

function getAppTrackCache(app: pc.Application): Map<string, pc.AnimTrack> {
  let map = retargetedTrackCache.get(app);
  if (!map) {
    map = new Map();
    retargetedTrackCache.set(app, map);
  }
  return map;
}

export function clearHumanoidRetargetCaches(app?: pc.Application): void {
  arrayBufferFetchCache.clear();
  clearAnimEditLayerCache();
  if (app) {
    sourceContainerCache.get(app)?.clear();
    retargetedTrackCache.get(app)?.clear();
  }
}

async function fetchCachedBuffer(url: string): Promise<ArrayBuffer | null> {
  let pending = arrayBufferFetchCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
    arrayBufferFetchCache.set(url, pending);
  }
  return pending;
}

function extractRotationFromMat4(mat: pc.Mat4, out: pc.Quat): pc.Quat {
  const d = mat.data;
  let sx = Math.hypot(d[0], d[1], d[2]);
  let sy = Math.hypot(d[4], d[5], d[6]);
  let sz = Math.hypot(d[8], d[9], d[10]);
  if (sx < 1e-6) sx = 1;
  if (sy < 1e-6) sy = 1;
  if (sz < 1e-6) sz = 1;
  const det =
    d[0] * (d[5] * d[10] - d[6] * d[9]) -
    d[4] * (d[1] * d[10] - d[2] * d[9]) +
    d[8] * (d[1] * d[6] - d[2] * d[5]);
  if (det < 0) sx = -sx;

  const m = new pc.Mat4();
  const nd = m.data;
  nd[0] = d[0] / sx;
  nd[1] = d[1] / sx;
  nd[2] = d[2] / sx;
  nd[3] = 0;
  nd[4] = d[4] / sy;
  nd[5] = d[5] / sy;
  nd[6] = d[6] / sy;
  nd[7] = 0;
  nd[8] = d[8] / sz;
  nd[9] = d[9] / sz;
  nd[10] = d[10] / sz;
  nd[11] = 0;
  nd[12] = 0;
  nd[13] = 0;
  nd[14] = 0;
  nd[15] = 1;

  out.setFromMat4(m);
  out.normalize();
  return out;
}

function buildAnimContainerFromLoaded(
  loaded: {
    entity: pc.Entity;
    animTracks: string[];
    animTrackMap: Record<string, pc.AnimTrack>;
    destroyResources: () => void;
  },
  options?: {
    sourceBoneMap?: Partial<Record<HumanoidBoneKey, string>>;
    sourceArmPoseOffsetDeg?: number;
  }
): CachedAnimContainer {
  const entity = loaded.entity;
  entity.setLocalPosition(0, 0, 0);
  entity.setLocalEulerAngles(0, 0, 0);
  entity.setLocalScale(1, 1, 1);
  entity.syncHierarchy();

  const animRoot = resolveAnimRootBone(entity);
  const restSnapshot = new Map<pc.GraphNode, { pos: pc.Vec3; rot: pc.Quat; scale: pc.Vec3 }>();
  const nodeByEntityPathKey = new Map<string, pc.GraphNode>();
  const nodeByName = new Map<string, pc.GraphNode>();

  const walk = (n: pc.GraphNode, pathAcc: string[]) => {
    restSnapshot.set(n, {
      pos: n.getLocalPosition().clone(),
      rot: n.getLocalRotation().clone(),
      scale: n.getLocalScale().clone(),
    });
    const nextPath = n === entity ? [] : [...pathAcc, n.name];
    if (nextPath.length > 0) {
      nodeByEntityPathKey.set(nextPath.join('/'), n);
      if (n.name && !nodeByName.has(n.name)) {
        nodeByName.set(n.name, n);
      }
    }
    for (const c of n.children) {
      walk(c, nextPath);
    }
  };
  walk(animRoot === entity ? entity : animRoot, []);

  // If source has an explicit A_TPose track (like Rigify Character.glb), keep bind pose which is already clean
  const rigProfile = buildHumanoidRigProfile(entity, {
    explicitBoneMap: options?.sourceBoneMap,
    armPoseOffsetDeg: options?.sourceArmPoseOffsetDeg ?? 0,
    normalizeArmsToTPose: true,
  });

  return {
    entity,
    rigProfile,
    restSnapshot,
    nodeByEntityPathKey,
    nodeByName,
    animTrackMap: loaded.animTrackMap,
    animTracks: loaded.animTracks,
    destroyResources: loaded.destroyResources,
  };
}

export async function loadAnimSourceContainerFromBuffer(
  app: pc.Application,
  buffer: ArrayBuffer,
  filename: string,
  cacheKey?: string,
  options?: {
    sourceBoneMap?: Partial<Record<HumanoidBoneKey, string>>;
    sourceArmPoseOffsetDeg?: number;
  }
): Promise<CachedAnimContainer> {
  const loaded = await loadGlbFromArrayBuffer(app, buffer, filename, cacheKey);
  return buildAnimContainerFromLoaded(loaded, options);
}

async function getOrLoadSourceContainer(
  app: pc.Application,
  url: string,
  options?: {
    sourceBoneMap?: Partial<Record<HumanoidBoneKey, string>>;
    sourceArmPoseOffsetDeg?: number;
  }
): Promise<CachedAnimContainer | null> {
  const cache = getAppSourceCache(app);
  const key = `${url}|${options?.sourceArmPoseOffsetDeg ?? 0}|${JSON.stringify(options?.sourceBoneMap ?? {})}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const buf = await fetchCachedBuffer(url);
      if (!buf) return null;
      const filename = url.split('/').pop() || 'anim.glb';
      try {
        return await loadAnimSourceContainerFromBuffer(app, buf, filename, `animsrc:${url}`, options);
      } catch {
        return null;
      }
    })();
    cache.set(key, pending);
  }
  return pending;
}

function findKeyframeSpan(times: ArrayLike<number>, t: number): { i0: number; i1: number; alpha: number } {
  const n = times.length;
  if (n === 0) return { i0: 0, i1: 0, alpha: 0 };
  if (n === 1 || t <= times[0]) return { i0: 0, i0_only: true, i1: 0, alpha: 0 } as { i0: number; i1: number; alpha: number };
  if (t >= times[n - 1]) return { i0: n - 1, i1: n - 1, alpha: 0 };

  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = times[lo];
  const t1 = times[hi];
  const dt = t1 - t0;
  const alpha = dt > 1e-6 ? (t - t0) / dt : 0;
  return { i0: lo, i1: hi, alpha };
}

function evalVec3Curve(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  interpolation: number,
  t: number,
  out: pc.Vec3
): pc.Vec3 {
  const { i0, i1, alpha } = findKeyframeSpan(times, t);
  if (interpolation === pc.INTERPOLATION_CUBIC) {
    // glTF CUBICSPLINE layout: [inTangent(3), value(3), outTangent(3)] = 9 floats per keyframe
    const base0 = i0 * 9 + 3;
    if (i0 === i1 || alpha <= 0) {
      return out.set(values[base0], values[base0 + 1], values[base0 + 2]);
    }
    const base1 = i1 * 9 + 3;
    const outTan0 = i0 * 9 + 6;
    const inTan1 = i1 * 9;
    const dt = times[i1] - times[i0];
    const t2 = alpha * alpha;
    const t3 = t2 * alpha;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + alpha;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return out.set(
      h00 * values[base0] + h10 * dt * values[outTan0] + h01 * values[base1] + h11 * dt * values[inTan1],
      h00 * values[base0 + 1] + h10 * dt * values[outTan0 + 1] + h01 * values[base1 + 1] + h11 * dt * values[inTan1 + 1],
      h00 * values[base0 + 2] + h10 * dt * values[outTan0 + 2] + h01 * values[base1 + 2] + h11 * dt * values[inTan1 + 2]
    );
  }

  const b0 = i0 * 3;
  if (i0 === i1 || interpolation === pc.INTERPOLATION_STEP || alpha <= 0) {
    return out.set(values[b0], values[b0 + 1], values[b0 + 2]);
  }
  const b1 = i1 * 3;
  return out.set(
    values[b0] + (values[b1] - values[b0]) * alpha,
    values[b0 + 1] + (values[b1 + 1] - values[b0 + 1]) * alpha,
    values[b0 + 2] + (values[b1 + 2] - values[b0 + 2]) * alpha
  );
}

const _q0 = new pc.Quat();
const _q1 = new pc.Quat();

function evalQuatCurve(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  interpolation: number,
  t: number,
  out: pc.Quat
): pc.Quat {
  const { i0, i1, alpha } = findKeyframeSpan(times, t);
  if (interpolation === pc.INTERPOLATION_CUBIC) {
    // glTF CUBICSPLINE layout: [inTangent(4), value(4), outTangent(4)] = 12 floats per keyframe
    const base0 = i0 * 12 + 4;
    if (i0 === i1 || alpha <= 0) {
      out.set(values[base0], values[base0 + 1], values[base0 + 2], values[base0 + 3]);
      return out.normalize();
    }
    const base1 = i1 * 12 + 4;
    const outTan0 = i0 * 12 + 8;
    const inTan1 = i1 * 12;
    const dt = times[i1] - times[i0];
    const t2 = alpha * alpha;
    const t3 = t2 * alpha;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + alpha;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    out.set(
      h00 * values[base0] + h10 * dt * values[outTan0] + h01 * values[base1] + h11 * dt * values[inTan1],
      h00 * values[base0 + 1] + h10 * dt * values[outTan0 + 1] + h01 * values[base1 + 1] + h11 * dt * values[inTan1 + 1],
      h00 * values[base0 + 2] + h10 * dt * values[outTan0 + 2] + h01 * values[base1 + 2] + h11 * dt * values[inTan1 + 2],
      h00 * values[base0 + 3] + h10 * dt * values[outTan0 + 3] + h01 * values[base1 + 3] + h11 * dt * values[inTan1 + 3]
    );
    return out.normalize();
  }

  const b0 = i0 * 4;
  _q0.set(values[b0], values[b0 + 1], values[b0 + 2], values[b0 + 3]);
  if (i0 === i1 || interpolation === pc.INTERPOLATION_STEP || alpha <= 0) {
    return out.copy(_q0).normalize();
  }
  const b1 = i1 * 4;
  _q1.set(values[b1], values[b1 + 1], values[b1 + 2], values[b1 + 3]);
  out.slerp(_q0, _q1, alpha);
  return out.normalize();
}

export interface RetargetOptions {
  stateName: string;
  inPlace?: boolean;
  strictLockXZ?: boolean;
  trimStart?: number;
  trimEnd?: number;
  yawOffsetDeg?: number;
  hipsYOffset?: number;
  /** Automatically compensates shoulder-width / arm-length differences when hands reach in front of chest/mouth */
  autoArmConvergence?: boolean;
  /** Optional additive keyframe edit layer in canonical humanoid space */
  editLayer?: AnimEditLayer | null;
  sampleFps?: number;
}

/**
 * Retargets a PlayCanvas `AnimTrack` from `sourceContainer` onto `targetRig`
 * with full rest-pose orientation compensation, A-pose <-> T-pose calibration,
 * proportional hip height scaling, and root-motion X/Z drift locking.
 */
export function retargetTrackToHumanoid(
  sourceContainer: CachedAnimContainer,
  sourceTrack: pc.AnimTrack,
  targetRig: HumanoidRigProfile,
  options: RetargetOptions
): pc.AnimTrack {
  const srcRig = sourceContainer.rigProfile;
  const rawDuration = Math.max(0.033, sourceTrack.duration || 1);
  const startSec = pc.math.clamp(options.trimStart ?? 0, 0, Math.max(0, rawDuration - 0.033));
  const endSec = pc.math.clamp(
    options.trimEnd && options.trimEnd > startSec ? options.trimEnd : rawDuration,
    startSec + 0.033,
    rawDuration
  );
  const finalDuration = Math.max(0.033, endSec - startSec);
  const fps = options.sampleFps ?? 30;
  const frameCount = Math.max(2, Math.ceil(finalDuration * fps) + 1);

  const sampleSourceTimes = new Float32Array(frameCount);
  const outputTimes = new Float32Array(frameCount);
  for (let k = 0; k < frameCount; k++) {
    const frac = k / (frameCount - 1);
    outputTimes[k] = frac * finalDuration;
    sampleSourceTimes[k] = startSec + outputTimes[k];
  }

  // Bind sourceTrack curves to sourceContainer nodes
  interface BoundSourceCurve {
    node: pc.GraphNode;
    prop: 'localPosition' | 'localRotation' | 'localScale';
    times: ArrayLike<number>;
    values: ArrayLike<number>;
    interpolation: number;
  }

  const boundCurves: BoundSourceCurve[] = [];
  for (const curve of sourceTrack.curves) {
    const inputData = sourceTrack.inputs[curve.input]?.data;
    const outputData = sourceTrack.outputs[curve.output]?.data;
    if (!inputData || !outputData) continue;

    for (const path of curve.paths) {
      const propName = path.propertyPath?.[0];
      if (
        propName !== 'localPosition' &&
        propName !== 'localRotation' &&
        propName !== 'localScale'
      ) {
        continue;
      }
      const key = (path.entityPath || []).join('/');
      const lastSeg = path.entityPath?.[path.entityPath.length - 1] || '';
      const node =
        sourceContainer.nodeByEntityPathKey.get(key) ??
        sourceContainer.nodeByName.get(lastSeg);
      if (!node) continue;

      boundCurves.push({
        node,
        prop: propName,
        times: inputData,
        values: outputData,
        interpolation: curve.interpolation,
      });
    }
  }

  // Precompute mapped bone pairs & constant ancestor chain compensation on Target
  const mappedNodeToKey = new Map<pc.GraphNode, AnyHumanoidBoneKey>();
  for (const key of ALL_HUMANOID_BONE_KEYS) {
    const tb = targetRig.bones[key];
    const sb = srcRig.bones[key];
    if (tb && sb) {
      mappedNodeToKey.set(tb.node, key);
    }
  }

  interface RetargetBoneJob {
    key: AnyHumanoidBoneKey;
    srcNode: pc.GraphNode;
    tgtEntityPath: string[];
    /** W_{S,TPose}^{-1} * W_{T,TPose} */
    qOffset: pc.Quat;
    nearestMappedAncestorKey: AnyHumanoidBoneKey | null;
    /** C_{a -> p} = W_{T,a,raw,0}^{-1} * W_{T,p,raw,0} for unmapped intermediate parent nodes */
    parentChainOffset: pc.Quat;
    outQuats: Float32Array;
  }

  const jobs: RetargetBoneJob[] = [];

  for (const key of ALL_HUMANOID_BONE_KEYS) {
    const sb = srcRig.bones[key];
    const tb = targetRig.bones[key];
    if (!sb || !tb) continue;

    const invSrcModelRot = sb.modelRot.clone().invert();
    const qOffset = new pc.Quat().mul2(invSrcModelRot, tb.modelRot).normalize();

    // Find nearest mapped ancestor in Target hierarchy
    let ancNode: pc.GraphNode | null = tb.node.parent;
    let nearestKey: AnyHumanoidBoneKey | null = null;
    while (ancNode && ancNode !== targetRig.spaceRoot) {
      const kFound = mappedNodeToKey.get(ancNode);
      if (kFound) {
        nearestKey = kFound;
        break;
      }
      ancNode = ancNode.parent;
    }

    const ancRawRot = nearestKey
      ? targetRig.bones[nearestKey]!.rawModelRot.clone()
      : new pc.Quat(0, 0, 0, 1);
    const parentChainOffset = new pc.Quat()
      .mul2(ancRawRot.invert(), tb.parentModelRot)
      .normalize();

    jobs.push({
      key,
      srcNode: sb.node,
      tgtEntityPath: tb.entityPath,
      qOffset,
      nearestMappedAncestorKey: nearestKey,
      parentChainOffset,
      outQuats: new Float32Array(frameCount * 4),
    });
  }

  const srcHips = srcRig.bones.hips;
  const tgtHips = targetRig.bones.hips;
  // Allow full unit-scale range (e.g. Mixamo FBX in cm ~100 vs glTF in m ~1 -> ratio ~0.01)
  const hipsScale =
    srcHips && tgtHips
      ? pc.math.clamp(targetRig.hipsHeight / Math.max(0.01, srcRig.hipsHeight), 0.001, 100.0)
      : 1.0;
  const rawHipsDeltaX = new Float32Array(frameCount);
  const rawHipsDeltaY = new Float32Array(frameCount);
  const rawHipsDeltaZ = new Float32Array(frameCount);

  // Reset source skeleton to rest pose before sampling
  for (const [node, snap] of sourceContainer.restSnapshot.entries()) {
    node.setLocalPosition(snap.pos);
    node.setLocalRotation(snap.rot);
    node.setLocalScale(snap.scale);
  }

  const tempV = new pc.Vec3();
  const tempQ = new pc.Quat();
  const tempSrcWorldQ = new pc.Quat();
  const tempAlignedSrcQ = new pc.Quat();
  const tempTgtWorldQ = new pc.Quat();
  const tempParentWorldQ = new pc.Quat();
  const tempLocalQ = new pc.Quat();
  const tempHipsDelta = new pc.Vec3();

  // Check if source animation frame 0 itself flips Hips/Chest ~180° from its bind pose (as in core_emotes.glb,
  // where bind pose faces -Z so srcRig.facingQuat = RotY(180°), while Singing starts turned ~49° from +Z!).
  const srcEffectiveFacingQuat = srcRig.facingQuat.clone();
  const bindHad180Flip = Math.abs(srcRig.facingQuat.y) > 0.7;
  if (srcHips && bindHad180Flip) {
    const refChest = srcRig.bones.upperChest ?? srcRig.bones.chest ?? srcHips;
    let dotSum = 0;
    let dotCount = 0;
    const probeIndices = [
      0,
      Math.min(frameCount - 1, Math.floor(frameCount * 0.25)),
      Math.min(frameCount - 1, Math.floor(frameCount * 0.5)),
    ];
    for (const pIdx of probeIndices) {
      const tp = sampleSourceTimes[pIdx];
      for (const bc of boundCurves) {
        if (bc.prop === 'localPosition') {
          evalVec3Curve(bc.times, bc.values, bc.interpolation, tp, tempV);
          bc.node.setLocalPosition(tempV);
        } else if (bc.prop === 'localRotation') {
          evalQuatCurve(bc.times, bc.values, bc.interpolation, tp, tempQ);
          bc.node.setLocalRotation(tempQ);
        } else {
          evalVec3Curve(bc.times, bc.values, bc.interpolation, tp, tempV);
          bc.node.setLocalScale(tempV);
        }
      }
      sourceContainer.entity.syncHierarchy();
      for (const probeBone of [srcHips, refChest]) {
        extractRotationFromMat4(probeBone.node.getWorldTransform(), tempSrcWorldQ);
        const bindFwd = probeBone.rawModelRot.transformVector(new pc.Vec3(0, 0, 1), new pc.Vec3());
        const animFwd = tempSrcWorldQ.transformVector(new pc.Vec3(0, 0, 1), new pc.Vec3());
        bindFwd.y = 0;
        animFwd.y = 0;
        if (bindFwd.lengthSq() > 1e-4 && animFwd.lengthSq() > 1e-4) {
          bindFwd.normalize();
          animFwd.normalize();
          dotSum += bindFwd.dot(animFwd);
          dotCount++;
        }
      }
    }
    if (dotCount > 0 && dotSum / dotCount < -0.25) {
      const flip180 = new pc.Quat().setFromEulerAngles(0, 180, 0);
      srcEffectiveFacingQuat.mul2(flip180, srcEffectiveFacingQuat).normalize();
    }
    for (const [node, snap] of sourceContainer.restSnapshot.entries()) {
      node.setLocalPosition(snap.pos);
      node.setLocalRotation(snap.rot);
      node.setLocalScale(snap.scale);
    }
  }

  // Facing alignment quaternion: F_T^{-1} * F_{S,effective} maps source animated space -> target character space
  const invTargetFacingQuat = targetRig.facingQuat.clone().invert();
  const facingDelta = new pc.Quat()
    .mul2(invTargetFacingQuat, srcEffectiveFacingQuat)
    .normalize();

  if (options.yawOffsetDeg && Math.abs(options.yawOffsetDeg) > 0.01) {
    const manualYawQ = new pc.Quat().setFromEulerAngles(0, options.yawOffsetDeg, 0);
    facingDelta.mul2(manualYawQ, facingDelta).normalize();
  }

  const computedTargetWorldRot = new Map<AnyHumanoidBoneKey, pc.Quat>();
  const baseTargetWorldRot = new Map<AnyHumanoidBoneKey, pc.Quat>();
  for (const job of jobs) {
    computedTargetWorldRot.set(job.key, new pc.Quat());
    baseTargetWorldRot.set(job.key, new pc.Quat());
  }

  const autoConverge = options.autoArmConvergence !== false;
  const editLayer = options.editLayer ?? null;
  const overrideBoneSet = new Set<AnyHumanoidBoneKey>(editLayer?.overrideBones ?? []);
  const hasEditTracks = Boolean(
    editLayer && (Object.keys(editLayer.tracks).length > 0 || overrideBoneSet.size > 0)
  );
  const hasHipsEditKeys = Boolean(editLayer?.hipsOffsetKeys && editLayer.hipsOffsetKeys.length > 0);

  const chestKey: HumanoidBoneKey | null =
    targetRig.bones.upperChest && srcRig.bones.upperChest
      ? 'upperChest'
      : targetRig.bones.chest && srcRig.bones.chest
        ? 'chest'
        : targetRig.bones.spine && srcRig.bones.spine
          ? 'spine'
          : targetRig.bones.hips && srcRig.bones.hips
            ? 'hips'
            : null;
  const srcChestBone = chestKey ? srcRig.bones[chestKey] : undefined;
  const tgtChestBone = chestKey ? targetRig.bones[chestKey] : undefined;
  const invSrcChestModelRot = srcChestBone ? srcChestBone.modelRot.clone().invert() : null;
  const invTgtChestModelRot = tgtChestBone ? tgtChestBone.modelRot.clone().invert() : null;

  const classifyLimbSide = (
    k: AnyHumanoidBoneKey
  ): {
    side: 'left' | 'right';
    sign: number;
    part: 'upper' | 'lower' | 'hand' | 'thumb' | 'f1' | 'f2' | 'f3';
  } | null => {
    const isLeft = k.startsWith('left');
    const isRight = k.startsWith('right');
    if (!isLeft && !isRight) return null;
    const side: 'left' | 'right' = isLeft ? 'left' : 'right';
    const sign = isLeft ? 1 : -1;
    const rest = isLeft ? k.slice(4) : k.slice(5);
    if (rest === 'UpperArm') return { side, sign, part: 'upper' };
    if (rest === 'LowerArm') return { side, sign, part: 'lower' };
    if (rest === 'Hand') return { side, sign, part: 'hand' };
    if (rest.startsWith('Thumb')) return { side, sign, part: 'thumb' };
    if (rest.endsWith('1')) return { side, sign, part: 'f1' };
    if (rest.endsWith('2')) return { side, sign, part: 'f2' };
    if (rest.endsWith('3')) return { side, sign, part: 'f3' };
    return null;
  };

  const jobSideMeta = new Map<
    AnyHumanoidBoneKey,
    ReturnType<typeof classifyLimbSide>
  >();
  const accumEditCanonDelta = new Map<AnyHumanoidBoneKey, pc.Quat>();
  for (const job of jobs) {
    jobSideMeta.set(job.key, classifyLimbSide(job.key));
    accumEditCanonDelta.set(job.key, new pc.Quat(0, 0, 0, 1));
  }

  const tempChestSrcWQ = new pc.Quat();
  const tempChestCanonQ = new pc.Quat();
  const tempInvChestCanonQ = new pc.Quat();
  const tempRelHand = new pc.Vec3();
  const tempChestUpAxis = new pc.Vec3(0, 1, 0);
  const tempChestRightAxis = new pc.Vec3(1, 0, 0);
  const tempAdductQ = new pc.Quat();
  const tempLocalDeltaQ = new pc.Quat();
  const tempTargetEditQ = new pc.Quat();
  const tempEditHipsOff = new pc.Vec3();

  // Sample FK across all frames
  for (let k = 0; k < frameCount; k++) {
    const t = sampleSourceTimes[k];
    const clipLocalT = outputTimes[k];

    for (const bc of boundCurves) {
      if (bc.prop === 'localPosition') {
        evalVec3Curve(bc.times, bc.values, bc.interpolation, t, tempV);
        bc.node.setLocalPosition(tempV);
      } else if (bc.prop === 'localRotation') {
        evalQuatCurve(bc.times, bc.values, bc.interpolation, t, tempQ);
        bc.node.setLocalRotation(tempQ);
      } else {
        evalVec3Curve(bc.times, bc.values, bc.interpolation, t, tempV);
        bc.node.setLocalScale(tempV);
      }
    }

    sourceContainer.entity.syncHierarchy();

    // Compute per-arm automatic chest-space inward convergence for two-hand (Clapping) & mouth-reach (Singing) poses
    let leftAutoAdductDeg = 0;
    let rightAutoAdductDeg = 0;
    let leftUpLiftDeg = 0;
    let rightUpLiftDeg = 0;

    if (autoConverge && srcChestBone && invSrcChestModelRot) {
      extractRotationFromMat4(srcChestBone.node.getWorldTransform(), tempChestSrcWQ);
      tempChestCanonQ.mul2(srcEffectiveFacingQuat, tempChestSrcWQ);
      tempChestCanonQ.mul2(tempChestCanonQ, invSrcChestModelRot).normalize();
      tempInvChestCanonQ.copy(tempChestCanonQ).invert();

      const pChest = srcChestBone.node.getPosition();
      const ratioDiff = targetRig.shoulderToArmRatio - srcRig.shoulderToArmRatio;

      if (Math.abs(ratioDiff) > 0.015) {
        for (const side of ['left', 'right'] as const) {
          const srcHand = srcRig.bones[`${side}Hand` as HumanoidBoneKey];
          if (!srcHand) continue;
          const pHand = srcHand.node.getPosition();
          tempRelHand.sub2(pHand, pChest);
          srcEffectiveFacingQuat.transformVector(tempRelHand, tempRelHand);
          tempInvChestCanonQ.transformVector(tempRelHand, tempRelHand);

          const fwdFrac = tempRelHand.z / Math.max(1e-4, srcRig.armLength);
          const midFrac =
            1 - pc.math.clamp(Math.abs(tempRelHand.x) / Math.max(1e-4, srcRig.shoulderHalfWidth * 1.28), 0, 1);
          const reachWeight = pc.math.clamp((fwdFrac - 0.1) / 0.3, 0, 1) * midFrac;
          if (reachWeight > 0.01) {
            const deg = pc.math.clamp(ratioDiff * 56 * reachWeight, -18, 18);
            const highWeight = pc.math.clamp((tempRelHand.y / Math.max(1e-4, srcRig.armLength) + 0.02) / 0.25, 0, 1);
            const liftDeg = pc.math.clamp(ratioDiff * 28 * reachWeight * highWeight, -10, 10);
            if (side === 'left') {
              leftAutoAdductDeg = deg;
              leftUpLiftDeg = liftDeg;
            } else {
              rightAutoAdductDeg = deg;
              rightUpLiftDeg = liftDeg;
            }
          }
        }
      }
    }

    let chestUpReady = false;
    tempChestUpAxis.set(0, 1, 0);
    tempChestRightAxis.set(1, 0, 0);

    for (const job of jobs) {
      if (overrideBoneSet.has(job.key)) {
        if (job.nearestMappedAncestorKey) {
          const ancBase = baseTargetWorldRot.get(job.nearestMappedAncestorKey)!;
          tempParentWorldQ.mul2(ancBase, job.parentChainOffset);
        } else {
          tempParentWorldQ.copy(job.parentChainOffset);
        }
        const restLocal = targetRig.bones[job.key]?.localRot;
        if (restLocal) {
          tempTgtWorldQ.mul2(tempParentWorldQ, restLocal).normalize();
        } else {
          tempTgtWorldQ.copy(tempParentWorldQ).normalize();
        }
      } else {
        extractRotationFromMat4(job.srcNode.getWorldTransform(), tempSrcWorldQ);
        tempAlignedSrcQ.mul2(facingDelta, tempSrcWorldQ);
        tempTgtWorldQ.mul2(tempAlignedSrcQ, job.qOffset).normalize();

        if (job.key === chestKey && invTgtChestModelRot) {
          tempChestCanonQ.mul2(targetRig.facingQuat, tempTgtWorldQ);
          tempChestCanonQ.mul2(tempChestCanonQ, invTgtChestModelRot).normalize();
          tempChestCanonQ.transformVector(new pc.Vec3(0, 1, 0), tempChestUpAxis);
          invTargetFacingQuat.transformVector(tempChestUpAxis, tempChestUpAxis);
          tempChestUpAxis.normalize();

          tempChestCanonQ.transformVector(new pc.Vec3(1, 0, 0), tempChestRightAxis);
          invTargetFacingQuat.transformVector(tempChestRightAxis, tempChestRightAxis);
          tempChestRightAxis.normalize();
          chestUpReady = true;
        }

        const meta = jobSideMeta.get(job.key);
        if (meta) {
          const autoDeg = meta.side === 'left' ? leftAutoAdductDeg : rightAutoAdductDeg;
          const liftDeg = meta.side === 'left' ? leftUpLiftDeg : rightUpLiftDeg;

          if (Math.abs(autoDeg) > 0.01) {
            const upAxis = chestUpReady ? tempChestUpAxis : new pc.Vec3(0, 1, 0);
            tempAdductQ.setFromAxisAngle(upAxis, -meta.sign * autoDeg);
            tempTgtWorldQ.mul2(tempAdductQ, tempTgtWorldQ).normalize();
          }

          if (
            Math.abs(liftDeg) > 0.01 &&
            (meta.part === 'lower' || meta.part === 'hand' || meta.part === 'thumb' || meta.part === 'f1' || meta.part === 'f2' || meta.part === 'f3')
          ) {
            tempAdductQ.setFromAxisAngle(tempChestRightAxis, -liftDeg);
            tempTgtWorldQ.mul2(tempAdductQ, tempTgtWorldQ).normalize();
          }
        }
      }

      baseTargetWorldRot.get(job.key)!.copy(tempTgtWorldQ);

      // Apply additive canonical edit layer (propagating parent bone edits down the FK chain!)
      if (hasEditTracks && editLayer) {
        const accumQ = accumEditCanonDelta.get(job.key)!;
        if (job.nearestMappedAncestorKey) {
          accumQ.copy(accumEditCanonDelta.get(job.nearestMappedAncestorKey)!);
        } else {
          accumQ.set(0, 0, 0, 1);
        }
        if (sampleBoneDeltaAtTime(editLayer.tracks[job.key], clipLocalT, tempLocalDeltaQ)) {
          accumQ.mul2(accumQ, tempLocalDeltaQ).normalize();
        }
        if (
          Math.abs(accumQ.x) > 1e-5 ||
          Math.abs(accumQ.y) > 1e-5 ||
          Math.abs(accumQ.z) > 1e-5
        ) {
          tempTargetEditQ.mul2(invTargetFacingQuat, accumQ);
          tempTargetEditQ.mul2(tempTargetEditQ, targetRig.facingQuat).normalize();
          tempTgtWorldQ.mul2(tempTargetEditQ, tempTgtWorldQ).normalize();
        }
      }

      computedTargetWorldRot.get(job.key)!.copy(tempTgtWorldQ);

      if (job.nearestMappedAncestorKey) {
        const ancWorld = computedTargetWorldRot.get(job.nearestMappedAncestorKey)!;
        tempParentWorldQ.mul2(ancWorld, job.parentChainOffset);
      } else {
        tempParentWorldQ.copy(job.parentChainOffset);
      }

      tempParentWorldQ.invert();
      tempLocalQ.mul2(tempParentWorldQ, tempTgtWorldQ).normalize();

      const outIdx = k * 4;
      // Enforce quaternion hemisphere continuity with previous frame so SLERP never spins 360deg
      if (k > 0) {
        const prevIdx = (k - 1) * 4;
        const dp =
          job.outQuats[prevIdx] * tempLocalQ.x +
          job.outQuats[prevIdx + 1] * tempLocalQ.y +
          job.outQuats[prevIdx + 2] * tempLocalQ.z +
          job.outQuats[prevIdx + 3] * tempLocalQ.w;
        if (dp < 0) {
          tempLocalQ.x = -tempLocalQ.x;
          tempLocalQ.y = -tempLocalQ.y;
          tempLocalQ.z = -tempLocalQ.z;
          tempLocalQ.w = -tempLocalQ.w;
        }
      }

      job.outQuats[outIdx] = tempLocalQ.x;
      job.outQuats[outIdx + 1] = tempLocalQ.y;
      job.outQuats[outIdx + 2] = tempLocalQ.z;
      job.outQuats[outIdx + 3] = tempLocalQ.w;
    }

    if (srcHips && tgtHips) {
      const pSrc = srcHips.node.getPosition();
      tempHipsDelta.set(
        (pSrc.x - srcHips.modelPos.x) * hipsScale,
        (pSrc.y - srcHips.modelPos.y) * hipsScale,
        (pSrc.z - srcHips.modelPos.z) * hipsScale
      );
      facingDelta.transformVector(tempHipsDelta, tempHipsDelta);
      rawHipsDeltaX[k] = tempHipsDelta.x;
      rawHipsDeltaY[k] = tempHipsDelta.y;
      rawHipsDeltaZ[k] = tempHipsDelta.z;
    }
  }

  // Restore source skeleton rest pose cleanly
  for (const [node, snap] of sourceContainer.restSnapshot.entries()) {
    node.setLocalPosition(snap.pos);
    node.setLocalRotation(snap.rot);
    node.setLocalScale(snap.scale);
  }
  sourceContainer.entity.syncHierarchy();

  // Build PlayCanvas AnimTrack
  const inputs: pc.AnimData[] = [new pc.AnimData(1, outputTimes)];
  const outputs: pc.AnimData[] = [];
  const curves: pc.AnimCurve[] = [];

  for (const job of jobs) {
    const outIdx = outputs.length;
    outputs.push(new pc.AnimData(4, job.outQuats));
    curves.push(
      new pc.AnimCurve(
        [
          {
            entityPath: job.tgtEntityPath,
            component: 'graph',
            propertyPath: ['localRotation'],
          },
        ],
        0,
        outIdx,
        pc.INTERPOLATION_LINEAR
      )
    );
  }

  if (srcHips && tgtHips) {
    const hipsPosOut = new Float32Array(frameCount * 3);
    const dx0 = rawHipsDeltaX[0];
    const dz0 = rawHipsDeltaZ[0];
    const netDrift = Math.hypot(
      rawHipsDeltaX[frameCount - 1] - dx0,
      rawHipsDeltaZ[frameCount - 1] - dz0
    );
    let maxHorizRadius = 0;
    for (let k = 0; k < frameCount; k++) {
      const r = Math.hypot(rawHipsDeltaX[k] - dx0, rawHipsDeltaZ[k] - dz0);
      if (r > maxHorizRadius) maxHorizRadius = r;
    }

    const shouldZeroXZ =
      Boolean(options.strictLockXZ) ||
      (options.inPlace !== false && (netDrift > 0.25 || maxHorizRadius > 1.25));

    const worldHipsTarget = new pc.Vec3();
    const localHipsTarget = new pc.Vec3();
    const hipsYOffset = options.hipsYOffset ?? 0;

    for (let k = 0; k < frameCount; k++) {
      let dx = shouldZeroXZ ? 0 : rawHipsDeltaX[k] - dx0;
      let dy = rawHipsDeltaY[k];
      let dz = shouldZeroXZ ? 0 : rawHipsDeltaZ[k] - dz0;

      if (hasHipsEditKeys && editLayer) {
        if (sampleHipsOffsetAtTime(editLayer.hipsOffsetKeys, outputTimes[k], tempEditHipsOff)) {
          invTargetFacingQuat.transformVector(tempEditHipsOff, tempEditHipsOff);
          dx += tempEditHipsOff.x;
          dy += tempEditHipsOff.y;
          dz += tempEditHipsOff.z;
        }
      }

      worldHipsTarget.set(
        tgtHips.modelPos.x + dx,
        Math.max(0.02, tgtHips.modelPos.y + dy + hipsYOffset),
        tgtHips.modelPos.z + dz
      );
      targetRig.invHipsParentModelMat.transformPoint(worldHipsTarget, localHipsTarget);

      const idx = k * 3;
      hipsPosOut[idx] = localHipsTarget.x;
      hipsPosOut[idx + 1] = localHipsTarget.y;
      hipsPosOut[idx + 2] = localHipsTarget.z;
    }

    const outIdx = outputs.length;
    outputs.push(new pc.AnimData(3, hipsPosOut));
    curves.push(
      new pc.AnimCurve(
        [
          {
            entityPath: tgtHips.entityPath,
            component: 'graph',
            propertyPath: ['localPosition'],
          },
        ],
        0,
        outIdx,
        pc.INTERPOLATION_LINEAR
      )
    );
  }

  return new pc.AnimTrack(options.stateName, finalDuration, inputs, outputs, curves);
}

/**
 * Equips a character `pc.Entity` (whether built-in or newly downloaded with 0 embedded animations)
 * with ALL animations registered in `AnimationRegistry` (locomotion slots + emotes + library clips),
 * retargeting each clip onto the character's skeleton and caching `pc.AnimTrack`s per character!
 */
export async function applyCharacterAnimations(
  app: pc.Application,
  characterEntity: pc.Entity,
  preset: CharacterManifestEntry
): Promise<string[]> {
  await AnimationRegistry.ensureLoaded();
  const manifest = AnimationRegistry.getManifestSync();
  const animRoot = resolveAnimRootBone(characterEntity);

  // Apply facingYawOffset & groundOffsetY onto the inner GLB model node so outer playerEntity
  // position/yaw stays 100% controlled by gameplay / multiplayer!
  if (animRoot && animRoot !== characterEntity) {
    const yawOffset = preset.facingYawOffset ?? 0;
    const groundY = preset.groundOffsetY ?? 0;
    const curEuler = animRoot.getLocalEulerAngles();
    const baseRotKey = '__baseLocalRotQuat__';
    const basePosKey = '__baseLocalPosVec__';
    const anyRoot = animRoot as unknown as Record<string, unknown>;
    if (!anyRoot[baseRotKey]) {
      anyRoot[baseRotKey] = animRoot.getLocalRotation().clone();
    }
    if (!anyRoot[basePosKey]) {
      anyRoot[basePosKey] = animRoot.getLocalPosition().clone();
    }
    const baseRot = (anyRoot[baseRotKey] as pc.Quat).clone();
    const basePos = (anyRoot[basePosKey] as pc.Vec3).clone();
    if (Math.abs(yawOffset) > 0.01) {
      const yawQ = new pc.Quat().setFromEulerAngles(0, yawOffset, 0);
      animRoot.setLocalRotation(new pc.Quat().mul2(yawQ, baseRot));
    } else {
      animRoot.setLocalRotation(baseRot);
    }
    // groundOffsetY is specified in character world meters; divide by preset.scale for local offset on child
    const safeScale = Math.max(0.001, preset.scale || 1);
    animRoot.setLocalPosition(basePos.x, basePos.y + groundY / safeScale, basePos.z);
    void curEuler;
  }

  const targetRig = buildHumanoidRigProfile(characterEntity, {
    explicitBoneMap: preset.boneMap,
    armPoseOffsetDeg: preset.armPoseOffsetDeg ?? 0,
    normalizeArmsToTPose: true,
  });

  if (!characterEntity.anim) {
    characterEntity.addComponent('anim', {
      activate: true,
      speed: 1,
      rootBone: animRoot as pc.Entity,
    });
  } else {
    characterEntity.anim.rootBone = animRoot as pc.Entity;
  }

  const trackCache = getAppTrackCache(app);
  const charAutoConv = preset.autoArmConvergence !== false ? 1 : 0;
  const charSig = `${preset.id}|${preset.url}|${preset.armPoseOffsetDeg ?? 0}|${preset.facingYawOffset ?? 0}|${charAutoConv}|${JSON.stringify(preset.boneMap ?? {})}`;

  // Build desired state -> clip mapping:
  // 1. Core gameplay slots ('Idle_Loop', 'Walk_Loop', 'Running', 'Jumping', 'JumpWhileRun', 'Crouch_Idle_Loop', 'Idle_Talking_Loop')
  // 2. All clips in manifest.clips (by clip.name and clip.id) so Emotes & Editor states all work!
  const desiredAssignments: Array<{
    stateName: string;
    clip: AnimationClipEntry;
    strictLockXZ: boolean;
  }> = [];
  const seenStates = new Set<string>();

  for (const [slotKey, stateName] of Object.entries(CORE_SLOT_STATE_NAMES) as Array<
    [CoreAnimSlotId, string]
  >) {
    const clipId = manifest.slots[slotKey];
    const clip = AnimationRegistry.getClipByIdSync(clipId);
    if (clip) {
      desiredAssignments.push({
        stateName,
        clip,
        strictLockXZ: true,
      });
      seenStates.add(stateName);
    }
  }

  for (const clip of manifest.clips) {
    if (!seenStates.has(clip.name)) {
      desiredAssignments.push({
        stateName: clip.name,
        clip,
        strictLockXZ: false,
      });
      seenStates.add(clip.name);
    }
  }

  // Preload unique animation source GLBs in parallel
  const uniqueUrls = Array.from(new Set(desiredAssignments.map((a) => a.clip.url)));
  await Promise.all(uniqueUrls.map((u) => getOrLoadSourceContainer(app, u)));

  const assignedStates: string[] = [];

  for (const item of desiredAssignments) {
    const { stateName, clip, strictLockXZ } = item;
    const cacheKey = `${charSig}::${stateName}::${clip.id}|${clip.url}|${clip.trackName ?? ''}|${clip.inPlace ? 1 : 0}|${strictLockXZ ? 1 : 0}|${clip.trimStart ?? 0}|${clip.trimEnd ?? 0}|${clip.yawOffsetDeg ?? 0}|${clip.hipsYOffset ?? 0}|${clip.editLayerUrl ?? ''}|${clip.editLayerUpdatedAt ?? ''}|${clip.updatedAt ?? ''}`;

    let retargeted = trackCache.get(cacheKey);
    if (!retargeted && targetRig.mappedCount >= 6) {
      const [srcContainer, editLayer] = await Promise.all([
        getOrLoadSourceContainer(app, clip.url, {
          sourceBoneMap: clip.sourceBoneMap,
          sourceArmPoseOffsetDeg: clip.sourceArmPoseOffsetDeg,
        }),
        clip.editLayerUrl
          ? fetchAnimEditLayer(clip.editLayerUrl, clip.editLayerUpdatedAt ?? clip.updatedAt)
          : Promise.resolve(null),
      ]);
      if (srcContainer) {
        const srcTrack =
          (clip.trackName ? srcContainer.animTrackMap[clip.trackName] : undefined) ??
          srcContainer.animTrackMap[clip.name] ??
          (srcContainer.animTracks[0]
            ? srcContainer.animTrackMap[srcContainer.animTracks[0]]
            : undefined);

        if (srcTrack) {
          retargeted = retargetTrackToHumanoid(srcContainer, srcTrack, targetRig, {
            stateName,
            inPlace: clip.inPlace,
            strictLockXZ,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
            yawOffsetDeg: clip.yawOffsetDeg,
            hipsYOffset: (clip.hipsYOffset ?? 0) / Math.max(0.001, preset.scale || 1),
            autoArmConvergence: preset.autoArmConvergence !== false,
            editLayer,
          });
          trackCache.set(cacheKey, retargeted);
        }
      }
    }

    if (retargeted && characterEntity.anim) {
      characterEntity.anim.assignAnimation(
        stateName,
        retargeted,
        undefined,
        clip.speed ?? 1,
        clip.loop !== false
      );
      assignedStates.push(stateName);
    }
  }

  return assignedStates;
}
