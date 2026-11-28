import * as pc from 'playcanvas';
import {
  sampleBoneDeltaAtTime,
  sampleHipsOffsetAtTime,
  upsertBoneEditKey,
} from '../../engine/animation/AnimEditLayer';
import type { HumanoidRigProfile } from '../../engine/animation/HumanoidRigMapper';
import {
  ALL_HUMANOID_BONE_KEYS,
  type AnimEditLayer,
  type AnyHumanoidBoneKey,
  type HumanoidBoneKey,
} from '../../types/characterStudio';
import type { BaseClipPoseCache, IKLimbId } from './AnimEditorTypes';
import { solveTwoBoneIK } from './TwoBoneIK';

/**
 * Extracts topological bone order and per-frame base local rotations from a freshly retargeted
 * `pc.AnimTrack` (which has NO editLayer applied) so scrubbing & gizmo dragging run at 60fps.
 */
export function buildBaseClipPoseCache(
  baseTrack: pc.AnimTrack,
  targetRig: HumanoidRigProfile,
  fps = 30
): BaseClipPoseCache {
  const duration = Math.max(0.05, baseTrack.duration || 1);
  const frameCount = Math.max(2, Math.ceil(duration * fps) + 1);

  const orderedBones: AnyHumanoidBoneKey[] = [];
  const mappedNodeSet = new Set<pc.GraphNode>();
  const nodeToKey = new Map<pc.GraphNode, AnyHumanoidBoneKey>();

  for (const key of ALL_HUMANOID_BONE_KEYS) {
    const b = targetRig.bones[key];
    if (b) {
      orderedBones.push(key);
      mappedNodeSet.add(b.node);
      nodeToKey.set(b.node, key);
    }
  }

  // Sort topologically by hierarchy depth so parents always precede children
  const depthOf = (n: pc.GraphNode): number => {
    let d = 0;
    let cur: pc.GraphNode | null = n.parent;
    while (cur && cur !== targetRig.spaceRoot) {
      d++;
      cur = cur.parent;
    }
    return d;
  };
  orderedBones.sort((a, b) => depthOf(targetRig.bones[a]!.node) - depthOf(targetRig.bones[b]!.node));

  const nearestAncestor: Partial<Record<AnyHumanoidBoneKey, AnyHumanoidBoneKey | null>> = {};
  for (const key of orderedBones) {
    let cur: pc.GraphNode | null = targetRig.bones[key]!.node.parent;
    let found: AnyHumanoidBoneKey | null = null;
    while (cur && cur !== targetRig.spaceRoot) {
      const k = nodeToKey.get(cur);
      if (k) {
        found = k;
        break;
      }
      cur = cur.parent;
    }
    nearestAncestor[key] = found;
  }

  // Build quick lookup from entityPath string -> curve data
  const rotCurveByPath = new Map<string, { times: Float32Array | number[]; vals: Float32Array | number[] }>();
  let hipsPosCurve: { times: Float32Array | number[]; vals: Float32Array | number[] } | null = null;
  const hipsPathStr = targetRig.bones.hips?.entityPath.join('/') ?? '';

  for (const curve of baseTrack.curves) {
    const inData = baseTrack.inputs[curve.input]?.data;
    const outData = baseTrack.outputs[curve.output]?.data;
    if (!inData || !outData) continue;
    for (const p of curve.paths) {
      const prop = p.propertyPath?.[0];
      const pathStr = (p.entityPath || []).join('/');
      if (prop === 'localRotation') {
        rotCurveByPath.set(pathStr, { times: inData, vals: outData });
      } else if (prop === 'localPosition' && pathStr === hipsPathStr) {
        hipsPosCurve = { times: inData, vals: outData };
      }
    }
  }

  const evalQuatAt = (
    c: { times: Float32Array | number[]; vals: Float32Array | number[] },
    t: number
  ): pc.Quat => {
    const n = c.times.length;
    if (n === 0) return new pc.Quat();
    if (n === 1 || t <= c.times[0]) {
      return new pc.Quat(c.vals[0], c.vals[1], c.vals[2], c.vals[3]).normalize();
    }
    if (t >= c.times[n - 1]) {
      const i = (n - 1) * 4;
      return new pc.Quat(c.vals[i], c.vals[i + 1], c.vals[i + 2], c.vals[i + 3]).normalize();
    }
    let lo = 0;
    let hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (c.times[mid] <= t) lo = mid;
      else hi = mid;
    }
    const dt = c.times[hi] - c.times[lo];
    const alpha = dt > 1e-6 ? (t - c.times[lo]) / dt : 0;
    const i0 = lo * 4;
    const i1 = hi * 4;
    const q0 = new pc.Quat(c.vals[i0], c.vals[i0 + 1], c.vals[i0 + 2], c.vals[i0 + 3]);
    const q1 = new pc.Quat(c.vals[i1], c.vals[i1 + 1], c.vals[i1 + 2], c.vals[i1 + 3]);
    return new pc.Quat().slerp(q0, q1, alpha).normalize();
  };

  const evalVec3At = (
    c: { times: Float32Array | number[]; vals: Float32Array | number[] },
    t: number
  ): pc.Vec3 => {
    const n = c.times.length;
    if (n === 0) return new pc.Vec3();
    if (n === 1 || t <= c.times[0]) {
      return new pc.Vec3(c.vals[0], c.vals[1], c.vals[2]);
    }
    if (t >= c.times[n - 1]) {
      const i = (n - 1) * 3;
      return new pc.Vec3(c.vals[i], c.vals[i + 1], c.vals[i + 2]);
    }
    let lo = 0;
    let hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (c.times[mid] <= t) lo = mid;
      else hi = mid;
    }
    const dt = c.times[hi] - c.times[lo];
    const alpha = dt > 1e-6 ? (t - c.times[lo]) / dt : 0;
    const i0 = lo * 3;
    const i1 = hi * 3;
    return new pc.Vec3(
      c.vals[i0] + (c.vals[i1] - c.vals[i0]) * alpha,
      c.vals[i0 + 1] + (c.vals[i1 + 1] - c.vals[i0 + 1]) * alpha,
      c.vals[i0 + 2] + (c.vals[i1 + 2] - c.vals[i0 + 2]) * alpha
    );
  };

  const baseLocalRots = new Map<AnyHumanoidBoneKey, pc.Quat[]>();
  for (const key of orderedBones) {
    const bone = targetRig.bones[key]!;
    const curve = rotCurveByPath.get(bone.entityPath.join('/'));
    const frames: pc.Quat[] = [];
    for (let k = 0; k < frameCount; k++) {
      const t = (k / (frameCount - 1)) * duration;
      frames.push(curve ? evalQuatAt(curve, t) : bone.localRot.clone());
    }
    baseLocalRots.set(key, frames);
  }

  const baseHipsLocalPos: pc.Vec3[] = [];
  const defaultHipsPos = targetRig.bones.hips?.localPos.clone() ?? new pc.Vec3();
  for (let k = 0; k < frameCount; k++) {
    const t = (k / (frameCount - 1)) * duration;
    baseHipsLocalPos.push(hipsPosCurve ? evalVec3At(hipsPosCurve, t) : defaultHipsPos.clone());
  }

  return {
    duration,
    frameCount,
    fps,
    orderedBones,
    nearestAncestor,
    baseLocalRots,
    baseHipsLocalPos,
  };
}

const _qSlerp = new pc.Quat();
const _vLerp = new pc.Vec3();
const _deltaLocal = new pc.Quat();
const _targetEdit = new pc.Quat();
const _newWorldQ = new pc.Quat();
const _parentWorldQ = new pc.Quat();
const _localQ = new pc.Quat();
const _hipsOff = new pc.Vec3();
const _hipsWorldOff = new pc.Vec3();

/**
 * Applies `basePose + layer` at time `t` onto `entity` and returns the accumulated canonical
 * delta per bone (used by FK Gizmo and IK solver to isolate a bone's own delta from its parent).
 */
export function applyEditorPoseAtTime(
  entity: pc.Entity,
  targetRig: HumanoidRigProfile,
  cache: BaseClipPoseCache,
  layer: AnimEditLayer,
  t: number,
  options?: { footLock?: boolean; lockedLeftFootPos?: pc.Vec3 | null; lockedRightFootPos?: pc.Vec3 | null }
): Map<AnyHumanoidBoneKey, pc.Quat> {
  const safeT = pc.math.clamp(t, 0, cache.duration);
  const fFloat = (safeT / cache.duration) * (cache.frameCount - 1);
  const f0 = Math.min(cache.frameCount - 1, Math.floor(fFloat));
  const f1 = Math.min(cache.frameCount - 1, f0 + 1);
  const alpha = fFloat - f0;

  // 1. Apply Base Retargeted Pose first (or rest localRot for overridden bones)
  const overrideSet = new Set<AnyHumanoidBoneKey>(layer.overrideBones ?? []);
  for (const key of cache.orderedBones) {
    const bone = targetRig.bones[key];
    const frames = cache.baseLocalRots.get(key);
    if (!bone || !frames) continue;
    if (overrideSet.has(key)) {
      bone.node.setLocalRotation(bone.localRot);
    } else {
      _qSlerp.slerp(frames[f0], frames[f1], alpha).normalize();
      bone.node.setLocalRotation(_qSlerp);
    }
  }

  const hipsBone = targetRig.bones.hips;
  if (hipsBone && cache.baseHipsLocalPos.length > 0) {
    const p0 = cache.baseHipsLocalPos[f0];
    const p1 = cache.baseHipsLocalPos[f1];
    _vLerp.lerp(p0, p1, alpha);

    if (sampleHipsOffsetAtTime(layer.hipsOffsetKeys, safeT, _hipsOff)) {
      const invFacing = targetRig.facingQuat.clone().invert();
      invFacing.transformVector(_hipsOff, _hipsWorldOff);
      // Hips local space may be scaled by character scale; convert world meter offset to hips parent local space
      const hipsParent = hipsBone.node.parent;
      if (hipsParent) {
        const ps = hipsParent.getWorldTransform().getScale();
        const sx = Math.max(1e-4, Math.abs(ps.x));
        const sy = Math.max(1e-4, Math.abs(ps.y));
        const sz = Math.max(1e-4, Math.abs(ps.z));
        _vLerp.x += _hipsWorldOff.x / sx;
        _vLerp.y += _hipsWorldOff.y / sy;
        _vLerp.z += _hipsWorldOff.z / sz;
      }
    }
    hipsBone.node.setLocalPosition(_vLerp);
  }

  entity.syncHierarchy();

  // Capture base world rotations BEFORE applying additive edit layer so parent rotations
  // propagated via syncHierarchy() are not multiplied onto child bones multiple times.
  const baseWorldRotByBone = new Map<AnyHumanoidBoneKey, pc.Quat>();
  for (const key of cache.orderedBones) {
    const bone = targetRig.bones[key];
    if (bone) {
      baseWorldRotByBone.set(key, bone.node.getRotation().clone());
    }
  }

  // 2. Apply Additive Canonical Edit Layer in parent-before-child order
  const accumCanonByBone = new Map<AnyHumanoidBoneKey, pc.Quat>();
  const invFacing = targetRig.facingQuat.clone().invert();

  for (const key of cache.orderedBones) {
    const bone = targetRig.bones[key];
    if (!bone) continue;
    const ancKey = cache.nearestAncestor[key] ?? null;
    const accum = ancKey && accumCanonByBone.has(ancKey)
      ? accumCanonByBone.get(ancKey)!.clone()
      : new pc.Quat(0, 0, 0, 1);

    if (sampleBoneDeltaAtTime(layer.tracks[key], safeT, _deltaLocal)) {
      accum.mul2(accum, _deltaLocal).normalize();
    }
    accumCanonByBone.set(key, accum);

    if (
      Math.abs(accum.x) > 1e-5 ||
      Math.abs(accum.y) > 1e-5 ||
      Math.abs(accum.z) > 1e-5
    ) {
      const baseWorldQ = baseWorldRotByBone.get(key)!;
      _targetEdit.mul2(invFacing, accum);
      _targetEdit.mul2(_targetEdit, targetRig.facingQuat).normalize();
      _newWorldQ.mul2(_targetEdit, baseWorldQ).normalize();

      if (bone.node.parent) {
        _parentWorldQ.copy(bone.node.parent.getRotation()).invert();
        _localQ.mul2(_parentWorldQ, _newWorldQ).normalize();
        bone.node.setLocalRotation(_localQ);
      } else {
        bone.node.setRotation(_newWorldQ);
      }
      entity.syncHierarchy();
    }
  }

  // 3. Optional Foot Lock (IK pin feet to floor when Hips moves)
  if (options?.footLock) {
    const solvePin = (
      uKey: HumanoidBoneKey,
      lKey: HumanoidBoneKey,
      eKey: HumanoidBoneKey,
      pinPos: pc.Vec3 | null | undefined
    ) => {
      if (!pinPos) return;
      const u = targetRig.bones[uKey]?.node;
      const l = targetRig.bones[lKey]?.node;
      const e = targetRig.bones[eKey]?.node;
      if (!u || !l || !e) return;
      const res = solveTwoBoneIK({
        upperPos: u.getPosition().clone(),
        lowerPos: l.getPosition().clone(),
        endPos: e.getPosition().clone(),
        upperWorldRot: u.getRotation().clone(),
        lowerWorldRot: l.getRotation().clone(),
        targetPos: pinPos,
        poleDirHint: entity.forward.clone().mulScalar(-1), // knees bend forward (+Z in local Studio)
      });
      if (u.parent) {
        u.setLocalRotation(u.parent.getRotation().clone().invert().mul(res.upperWorldRot).normalize());
        entity.syncHierarchy();
      }
      if (l.parent) {
        l.setLocalRotation(l.parent.getRotation().clone().invert().mul(res.lowerWorldRot).normalize());
        entity.syncHierarchy();
      }
    };
    solvePin('leftUpperLeg', 'leftLowerLeg', 'leftFoot', options.lockedLeftFootPos);
    solvePin('rightUpperLeg', 'rightLowerLeg', 'rightFoot', options.lockedRightFootPos);
  }

  return accumCanonByBone;
}

/**
 * Given a bone's desired new world rotation `desiredWorldRot` and its base world rotation
 * (without this bone's own local delta, i.e., with only parent accum applied),
 * computes the canonical local delta `[x, y, z, w]` to store in `AnimEditLayer`.
 */
export function computeCanonicalLocalDelta(
  desiredWorldRot: pc.Quat,
  baseWorldRotWithParentOnly: pc.Quat,
  facingQuat: pc.Quat,
  parentAccumCanonDelta: pc.Quat
): [number, number, number, number] {
  const deltaWorld = new pc.Quat()
    .mul2(desiredWorldRot, baseWorldRotWithParentOnly.clone().invert())
    .normalize();
  const invFacing = facingQuat.clone().invert();
  const deltaCanon = new pc.Quat()
    .mul2(facingQuat, deltaWorld)
    .mul(invFacing)
    .normalize();
  // Since accum = parentAccum * localDelta, we conjugate by parentAccum to isolate localDelta:
  // wait: accum_new = deltaCanon * parentAccum => localDelta = inv(parentAccum) * deltaCanon * parentAccum!
  const invParent = parentAccumCanonDelta.clone().invert();
  const localDelta = new pc.Quat()
    .mul2(invParent, deltaCanon)
    .mul(parentAccumCanonDelta)
    .normalize();
  return [localDelta.x, localDelta.y, localDelta.z, localDelta.w];
}

export function getLimbBoneKeys(limb: IKLimbId): {
  upper: HumanoidBoneKey;
  lower: HumanoidBoneKey;
  end: HumanoidBoneKey;
} {
  switch (limb) {
    case 'leftArm':
      return { upper: 'leftUpperArm', lower: 'leftLowerArm', end: 'leftHand' };
    case 'rightArm':
      return { upper: 'rightUpperArm', lower: 'rightLowerArm', end: 'rightHand' };
    case 'leftLeg':
      return { upper: 'leftUpperLeg', lower: 'leftLowerLeg', end: 'leftFoot' };
    case 'rightLeg':
      return { upper: 'rightUpperLeg', lower: 'rightLowerLeg', end: 'rightFoot' };
  }
}

/**
 * Solves Two-Bone IK for `limb` toward `targetWorldPos` and writes both upper & lower
 * keyframe deltas into `layer` at `timeSec`.
 */
export function applyTwoBoneIKToLayer(params: {
  entity: pc.Entity;
  targetRig: HumanoidRigProfile;
  cache: BaseClipPoseCache;
  layer: AnimEditLayer;
  limb: IKLimbId;
  timeSec: number;
  targetWorldPos: pc.Vec3;
}): AnimEditLayer {
  const { entity, targetRig, cache, layer, limb, timeSec, targetWorldPos } = params;
  const { upper, lower, end } = getLimbBoneKeys(limb);
  const uNode = targetRig.bones[upper]?.node;
  const lNode = targetRig.bones[lower]?.node;
  const eNode = targetRig.bones[end]?.node;
  if (!uNode || !lNode || !eNode) return layer;

  // Evaluate pose with current layer first so we get parent accum & base positions
  const accumMap = applyEditorPoseAtTime(entity, targetRig, cache, layer, timeSec);
  const uPos = uNode.getPosition().clone();
  const lPos = lNode.getPosition().clone();
  const ePos = eNode.getPosition().clone();
  const curUWorld = uNode.getRotation().clone();
  const curLWorld = lNode.getRotation().clone();

  const isLeg = limb === 'leftLeg' || limb === 'rightLeg';
  // Elbows naturally point backward (-Z), knees naturally point forward (+Z)
  const poleHint = isLeg ? new pc.Vec3(0, 0.2, 1) : new pc.Vec3(0, -0.1, -1);

  const ik = solveTwoBoneIK({
    upperPos: uPos,
    lowerPos: lPos,
    endPos: ePos,
    upperWorldRot: curUWorld,
    lowerWorldRot: curLWorld,
    targetPos: targetWorldPos,
    poleDirHint: poleHint,
  });

  // Compute incremental canonical delta from current pose -> IK pose, then compose with existing local delta!
  const invFacing = targetRig.facingQuat.clone().invert();
  const composeDelta = (boneKey: AnyHumanoidBoneKey, oldW: pc.Quat, newW: pc.Quat, parentAccum: pc.Quat) => {
    const stepWorld = new pc.Quat().mul2(newW, oldW.clone().invert()).normalize();
    const stepCanon = new pc.Quat().mul2(targetRig.facingQuat, stepWorld).mul(invFacing).normalize();
    const curLocal = new pc.Quat(0, 0, 0, 1);
    sampleBoneDeltaAtTime(layer.tracks[boneKey], timeSec, curLocal);
    const invP = parentAccum.clone().invert();
    const localStep = new pc.Quat().mul2(invP, stepCanon).mul(parentAccum).normalize();
    const finalLocal = new pc.Quat().mul2(localStep, curLocal).normalize();
    return [finalLocal.x, finalLocal.y, finalLocal.z, finalLocal.w] as [number, number, number, number];
  };

  const upperAncKey = cache.nearestAncestor[upper] ?? null;
  const upperParentAccum =
    upperAncKey && accumMap.has(upperAncKey) ? accumMap.get(upperAncKey)! : new pc.Quat(0, 0, 0, 1);
  const newUpperDelta = composeDelta(upper, curUWorld, ik.upperWorldRot, upperParentAccum);

  let nextLayer = upsertBoneEditKey(layer, upper, timeSec, newUpperDelta, 'linear');

  // Recompute upper accum for lower bone
  const uDeltaQ = new pc.Quat(...newUpperDelta);
  const newUpperAccum = new pc.Quat().mul2(upperParentAccum, uDeltaQ).normalize();
  // Note: rotating upper by stepUpper also rotated lower by stepUpper!
  const stepUpperWorld = new pc.Quat().mul2(ik.upperWorldRot, curUWorld.clone().invert()).normalize();
  const lowerAfterUpperWorld = new pc.Quat().mul2(stepUpperWorld, curLWorld).normalize();
  const newLowerDelta = composeDelta(lower, lowerAfterUpperWorld, ik.lowerWorldRot, newUpperAccum);

  nextLayer = upsertBoneEditKey(nextLayer, lower, timeSec, newLowerDelta, 'linear');
  return nextLayer;
}
