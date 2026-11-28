import * as pc from 'playcanvas';
import {
  ALL_HUMANOID_BONE_KEYS,
  HUMANOID_BONE_KEYS,
  type AnyHumanoidBoneKey,
  type HumanoidBoneKey,
  type HumanoidBoneMap,
  type HumanoidFingerBoneKey,
} from '../../types/characterStudio';

export interface BoneRestTransform {
  node: pc.GraphNode;
  name: string;
  /** Path from anim rootBone down to this node (matches PlayCanvas DefaultAnimBinder) */
  entityPath: string[];
  /** Local rest position on node */
  localPos: pc.Vec3;
  /** Local rest rotation on node */
  localRot: pc.Quat;
  /** Position in character model-space (relative to modelRoot) */
  modelPos: pc.Vec3;
  /** Rotation in character model-space (relative to modelRoot), optionally T-pose normalized */
  modelRot: pc.Quat;
  /** Parent node's raw model-space rotation (unadjusted, so localRot = inv(parentRawModelRot) * rawModelRot) */
  parentModelRot: pc.Quat;
  /** Raw unadjusted model-space rotation of this bone */
  rawModelRot: pc.Quat;
}

export interface HumanoidRigProfile {
  spaceRoot: pc.GraphNode;
  modelRoot: pc.GraphNode;
  animRootBone: pc.GraphNode;
  bones: Partial<Record<AnyHumanoidBoneKey, BoneRestTransform>>;
  boneMap: HumanoidBoneMap;
  /** Rotates this rig's raw bind-pose character space so front faces +Z and left arm is +X */
  facingQuat: pc.Quat;
  invHipsParentModelMat: pc.Mat4;
  hipsHeight: number;
  estimatedHeight: number;
  /** Half-distance between leftUpperArm and rightUpperArm in canonical model space */
  shoulderHalfWidth: number;
  /** Average upperArm + lowerArm length in canonical model space */
  armLength: number;
  /** Dimensionless ratio shoulderHalfWidth / armLength used for two-hand / mouth-reach convergence */
  shoulderToArmRatio: number;
  detectedRigType: 'mixamo' | 'rigify' | 'humanoid' | 'custom';
  mappedCount: number;
  mappedFingerCount: number;
  allNodeNames: string[];
}

interface BoneRule {
  key: HumanoidBoneKey;
  side?: 'left' | 'right';
  patterns: RegExp[];
}

function normalizeBoneToken(rawName: string): {
  clean: string;
  lower: string;
  side: 'left' | 'right' | null;
} {
  let s = rawName.trim();
  // Strip common rig namespace prefixes (including FBXLoader sanitized `mixamorigHips` without colon)
  s = s.replace(/^(mixamorig\d*:?|DEF-|ORG-|MCH-|CC_Base_|J_Bip_[CLR]_|Bip00?1[-_\s]*)/i, '');

  // Strip Sketchfab numeric node suffixes like _01, _024 (keep spine.001 intact)
  if (!/spine\.\d+$/i.test(s)) {
    s = s.replace(/_0*\d+$/, '');
  }

  // Detect explicit side markers for CamelCase (LeftArm, RightUpLeg), suffixes (.L, _R), and J_Bip/CC_Base
  let side: 'left' | 'right' | null = null;
  if (
    /^left(?=[A-Z_.\-\s]|$)/i.test(s) ||
    /(^|[._\-\s:])left([A-Z._\-\s:\d]|$)/i.test(s) ||
    /\.l(\.\d+)?$/i.test(s) ||
    /_l(_\d+)?$/i.test(s) ||
    /^J_Bip_L_/i.test(rawName) ||
    /^CC_Base_L_/i.test(rawName) ||
    /(^|[._\-\s:])l$/i.test(s)
  ) {
    side = 'left';
  } else if (
    /^right(?=[A-Z_.\-\s]|$)/i.test(s) ||
    /(^|[._\-\s:])right([A-Z._\-\s:\d]|$)/i.test(s) ||
    /\.r(\.\d+)?$/i.test(s) ||
    /_r(_\d+)?$/i.test(s) ||
    /^J_Bip_R_/i.test(rawName) ||
    /^CC_Base_R_/i.test(rawName) ||
    /(^|[._\-\s:])r$/i.test(s)
  ) {
    side = 'right';
  }

  // Strip leading Left/Right and trailing .L / .R / _L / _R so canonical patterns match cleanly
  s = s.replace(/^(left|right)[._\-\s]*/i, '');
  s = s.replace(/([._-])[lLrR]$/, '');

  return {
    clean: s,
    lower: s.toLowerCase(),
    side,
  };
}

const BONE_RULES: BoneRule[] = [
  {
    key: 'hips',
    patterns: [/^(hips?|pelvis|hip|cog|root_hips)$/i, /(^|[_.-])(hips|pelvis)([_.-]|$)/i],
  },
  {
    key: 'spine',
    patterns: [/^spine$/i, /^spine\.001$/i, /^spine_?0?1$/i, /^waist$/i, /^abdomen$/i],
  },
  {
    key: 'chest',
    patterns: [/^spine1$/i, /^spine\.002$/i, /^spine_?0?2$/i, /^chest$/i, /^thorax$/i],
  },
  {
    key: 'upperChest',
    patterns: [
      /^spine2$/i,
      /^spine\.003$/i,
      /^spine_?0?3$/i,
      /^upper[_-]?chest$/i,
    ],
  },
  {
    key: 'neck',
    patterns: [/^neck$/i, /^neck[._-]?0?1$/i, /^neck\.001$/i],
  },
  {
    key: 'head',
    patterns: [/^head$/i, /^head[._-]?0?1$/i],
  },
  // Left Arm
  {
    key: 'leftShoulder',
    side: 'left',
    patterns: [/^(left)?[_.-]?shoulder$/i, /^clavicle$/i, /^(left)?[_.-]?collar$/i],
  },
  {
    key: 'leftUpperArm',
    side: 'left',
    patterns: [
      /^(left)?[_.-]?arm$/i,
      /^(left)?[_.-]?upper[_.-]?arm$/i,
      /^upperarm$/i,
    ],
  },
  {
    key: 'leftLowerArm',
    side: 'left',
    patterns: [
      /^(left)?[_.-]?fore[_.-]?arm$/i,
      /^(left)?[_.-]?lower[_.-]?arm$/i,
      /^lowerarm$/i,
    ],
  },
  {
    key: 'leftHand',
    side: 'left',
    patterns: [/^(left)?[_.-]?hand$/i, /^(left)?[_.-]?wrist$/i],
  },
  // Right Arm
  {
    key: 'rightShoulder',
    side: 'right',
    patterns: [/^(right)?[_.-]?shoulder$/i, /^clavicle$/i, /^(right)?[_.-]?collar$/i],
  },
  {
    key: 'rightUpperArm',
    side: 'right',
    patterns: [
      /^(right)?[_.-]?arm$/i,
      /^(right)?[_.-]?upper[_.-]?arm$/i,
      /^upperarm$/i,
    ],
  },
  {
    key: 'rightLowerArm',
    side: 'right',
    patterns: [
      /^(right)?[_.-]?fore[_.-]?arm$/i,
      /^(right)?[_.-]?lower[_.-]?arm$/i,
      /^lowerarm$/i,
    ],
  },
  {
    key: 'rightHand',
    side: 'right',
    patterns: [/^(right)?[_.-]?hand$/i, /^(right)?[_.-]?wrist$/i],
  },
  // Left Leg
  {
    key: 'leftUpperLeg',
    side: 'left',
    patterns: [
      /^(left)?[_.-]?up[_.-]?leg$/i,
      /^(left)?[_.-]?upper[_.-]?leg$/i,
      /^(left)?[_.-]?thigh$/i,
      /^thigh$/i,
    ],
  },
  {
    key: 'leftLowerLeg',
    side: 'left',
    patterns: [
      /^(left)?[_.-]?leg$/i,
      /^(left)?[_.-]?lower[_.-]?leg$/i,
      /^(left)?[_.-]?shin$/i,
      /^(left)?[_.-]?calf$/i,
      /^shin$/i,
      /^calf$/i,
    ],
  },
  {
    key: 'leftFoot',
    side: 'left',
    patterns: [/^(left)?[_.-]?foot$/i, /^(left)?[_.-]?ankle$/i, /^foot$/i],
  },
  {
    key: 'leftToes',
    side: 'left',
    patterns: [
      /^(left)?[_.-]?toe[_.-]?base$/i,
      /^(left)?[_.-]?toes?$/i,
      /^(left)?[_.-]?ball$/i,
      /^toe$/i,
    ],
  },
  // Right Leg
  {
    key: 'rightUpperLeg',
    side: 'right',
    patterns: [
      /^(right)?[_.-]?up[_.-]?leg$/i,
      /^(right)?[_.-]?upper[_.-]?leg$/i,
      /^(right)?[_.-]?thigh$/i,
      /^thigh$/i,
    ],
  },
  {
    key: 'rightLowerLeg',
    side: 'right',
    patterns: [
      /^(right)?[_.-]?leg$/i,
      /^(right)?[_.-]?lower[_.-]?leg$/i,
      /^(right)?[_.-]?shin$/i,
      /^(right)?[_.-]?calf$/i,
      /^shin$/i,
      /^calf$/i,
    ],
  },
  {
    key: 'rightFoot',
    side: 'right',
    patterns: [/^(right)?[_.-]?foot$/i, /^(right)?[_.-]?ankle$/i, /^foot$/i],
  },
  {
    key: 'rightToes',
    side: 'right',
    patterns: [
      /^(right)?[_.-]?toe[_.-]?base$/i,
      /^(right)?[_.-]?toes?$/i,
      /^(right)?[_.-]?ball$/i,
      /^toe$/i,
    ],
  },
];

function extractRotationFromMat4(mat: pc.Mat4, out: pc.Quat): pc.Quat {
  const d = mat.data;
  let sx = Math.hypot(d[0], d[1], d[2]);
  let sy = Math.hypot(d[4], d[5], d[6]);
  let sz = Math.hypot(d[8], d[9], d[10]);
  if (sx < 1e-6) sx = 1;
  if (sy < 1e-6) sy = 1;
  if (sz < 1e-6) sz = 1;

  // Handle reflection if determinant < 0
  const det =
    d[0] * (d[5] * d[10] - d[6] * d[9]) -
    d[4] * (d[1] * d[10] - d[2] * d[9]) +
    d[8] * (d[1] * d[6] - d[2] * d[5]);
  if (det < 0) sx = -sx;

  const normMat = new pc.Mat4();
  const nd = normMat.data;
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

  out.setFromMat4(normMat);
  out.normalize();
  return out;
}

function quatFromUnitVectors(from: pc.Vec3, to: pc.Vec3): pc.Quat {
  const dot = pc.math.clamp(from.dot(to), -1, 1);
  if (dot > 0.99995) {
    return new pc.Quat(0, 0, 0, 1);
  }
  if (dot < -0.99995) {
    const axis = new pc.Vec3(0, 0, 1).cross(from, new pc.Vec3());
    if (axis.lengthSq() < 1e-4) {
      axis.set(1, 0, 0).cross(from, axis);
    }
    axis.normalize();
    return new pc.Quat().setFromAxisAngle(axis, 180);
  }
  const cross = new pc.Vec3().cross(from, to);
  const q = new pc.Quat(cross.x, cross.y, cross.z, 1 + dot);
  q.normalize();
  return q;
}

export function buildEntityPathFromAnimRoot(
  animRootBone: pc.GraphNode,
  targetNode: pc.GraphNode
): string[] {
  const path: string[] = [];
  let cur: pc.GraphNode | null = targetNode;
  while (cur) {
    path.unshift(cur.name);
    if (cur === animRootBone) break;
    cur = cur.parent;
  }
  return path;
}

/**
 * Resolves the PlayCanvas anim `rootBone` node for a character wrapper entity.
 * In `loadGlbFromArrayBuffer`, `entity` wraps `instantiated` as `entity.children[0]`.
 */
export function resolveAnimRootBone(entity: pc.Entity): pc.GraphNode {
  if (entity.anim?.rootBone) {
    return entity.anim.rootBone;
  }
  const firstChild = entity.children[0];
  return firstChild ?? entity;
}

/**
 * Automatically detects the 22 canonical Humanoid bones on any GLB character or animation skeleton,
 * computes model-space rest transforms, and normalizes A-pose vs T-pose arm differences.
 */
export function buildHumanoidRigProfile(
  entityOrRoot: pc.Entity | pc.GraphNode,
  options?: {
    explicitBoneMap?: HumanoidBoneMap;
    armPoseOffsetDeg?: number;
    normalizeArmsToTPose?: boolean;
  }
): HumanoidRigProfile {
  const spaceRoot = entityOrRoot;
  const animRootBone =
    entityOrRoot instanceof pc.Entity ? resolveAnimRootBone(entityOrRoot) : entityOrRoot;
  const modelRoot = animRootBone;

  // Collect deforming skin joints so control/IK helper bones (e.g. Rigify MCH/ORG/IK) are deprioritized
  const skinBoneSet = new Set<pc.GraphNode>();
  if (entityOrRoot instanceof pc.Entity) {
    const renderComps = entityOrRoot.findComponents('render') as pc.RenderComponent[];
    for (const rc of renderComps) {
      for (const mi of rc.meshInstances) {
        const bones = (mi as unknown as { skinInstance?: { bones?: pc.GraphNode[] } }).skinInstance
          ?.bones;
        if (Array.isArray(bones)) {
          for (const b of bones) {
            if (b) skinBoneSet.add(b);
          }
        }
      }
    }
  }

  const allNodes: pc.GraphNode[] = [];
  const nodeByName = new Map<string, pc.GraphNode>();
  const walk = (n: pc.GraphNode) => {
    allNodes.push(n);
    if (n.name && !nodeByName.has(n.name)) {
      nodeByName.set(n.name, n);
    }
    for (const c of n.children) {
      walk(c);
    }
  };
  walk(modelRoot);

  let detectedRigType: HumanoidRigProfile['detectedRigType'] = 'custom';
  for (const n of allNodes) {
    if (/^mixamorig/i.test(n.name)) {
      detectedRigType = 'mixamo';
      break;
    }
    if (/^DEF-/i.test(n.name)) {
      detectedRigType = 'rigify';
      break;
    }
  }

  const resolvedNodes: Partial<Record<AnyHumanoidBoneKey, pc.GraphNode>> = {};
  const usedNodes = new Set<pc.GraphNode>();

  // 1. Apply explicit overrides from manifest / Studio Bone Mapper first
  if (options?.explicitBoneMap) {
    for (const key of HUMANOID_BONE_KEYS) {
      const targetName = options.explicitBoneMap[key];
      if (targetName) {
        const found = nodeByName.get(targetName);
        if (found) {
          resolvedNodes[key] = found;
          usedNodes.add(found);
        }
      }
    }
  }

  // 2. Auto-detect remaining humanoid bones
  for (const rule of BONE_RULES) {
    if (resolvedNodes[rule.key]) continue;

    let bestNode: pc.GraphNode | null = null;
    let bestScore = -Infinity;

    for (const node of allNodes) {
      if (node === modelRoot || usedNodes.has(node) || !node.name) continue;
      const rawLower = node.name.toLowerCase();

      // Skip helper / IK / pole / twist / finger / end-effector nodes
      if (
        /(^|[_.-])(ik|pole|target|ctrl|mch|org|vis|twist|roll|end|headtop|eye|jaw|tongue|tooth|teeth|hair|skirt|cape|cloth|breast)([_.-]|\d|$)/i.test(
          rawLower
        )
      ) {
        continue;
      }
      if (
        rule.key !== 'leftHand' &&
        rule.key !== 'rightHand' &&
        /(thumb|index|middle|ring|pinky|finger)/i.test(rawLower)
      ) {
        continue;
      }
      if (
        (rule.key === 'leftHand' || rule.key === 'rightHand') &&
        /(thumb|index|middle|ring|pinky|finger)/i.test(rawLower)
      ) {
        continue;
      }

      const token = normalizeBoneToken(node.name);
      if (rule.side && token.side !== rule.side) continue;
      if (!rule.side && token.side !== null) continue;

      let patternIdx = -1;
      for (let i = 0; i < rule.patterns.length; i++) {
        if (rule.patterns[i].test(token.clean) || rule.patterns[i].test(token.lower)) {
          patternIdx = i;
          break;
        }
      }
      if (patternIdx < 0) continue;

      let score = 50 - patternIdx * 5;
      if (skinBoneSet.size > 0) {
        score += skinBoneSet.has(node) ? 100 : -40;
      }
      if (/^DEF-/i.test(node.name)) score += 30;
      if (/^mixamorig/i.test(node.name)) score += 25;

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    if (bestNode) {
      resolvedNodes[rule.key] = bestNode;
      usedNodes.add(bestNode);
    }
  }

  if (detectedRigType === 'custom' && Object.keys(resolvedNodes).length >= 12) {
    detectedRigType = 'humanoid';
  }

  // 3. Auto-detect 30 finger bones (Thumb, Index, Middle, Ring, Pinky × 3 phalanges × 2 hands)
  const FINGER_GROUPS: Array<{
    finger: 'Thumb' | 'Index' | 'Middle' | 'Ring' | 'Pinky';
    pattern: RegExp;
  }> = [
    { finger: 'Thumb', pattern: /thumb/i },
    { finger: 'Index', pattern: /index|pointer/i },
    { finger: 'Middle', pattern: /middle/i },
    { finger: 'Ring', pattern: /ring/i },
    { finger: 'Pinky', pattern: /pinky|little/i },
  ];

  const detectHandFingerBones = (handNode: pc.GraphNode | undefined, side: 'left' | 'right') => {
    if (!handNode) return;
    const descendants: Array<{ node: pc.GraphNode; depth: number }> = [];
    const walkHand = (n: pc.GraphNode, depth: number) => {
      for (const c of n.children) {
        descendants.push({ node: c, depth });
        walkHand(c, depth + 1);
      }
    };
    walkHand(handNode, 1);

    for (const { finger, pattern } of FINGER_GROUPS) {
      const bestByDepth = new Map<number, { node: pc.GraphNode; score: number }>();

      for (const { node, depth } of descendants) {
        if (usedNodes.has(node) || !node.name) continue;
        const rawLower = node.name.toLowerCase();
        if (
          /(^|[_.-])(ik|pole|target|ctrl|mch|org|vis|twist|roll|end|tip|palm|metacarpal|carpal)([_.-]|\d|$)/i.test(
            rawLower
          )
        ) {
          continue;
        }
        if (!pattern.test(node.name)) continue;

        let score = 50;
        if (skinBoneSet.size > 0) {
          score += skinBoneSet.has(node) ? 100 : -40;
        }
        if (/^DEF-/i.test(node.name)) score += 30;
        if (/^mixamorig/i.test(node.name)) score += 25;

        const prev = bestByDepth.get(depth);
        if (!prev || score > prev.score) {
          bestByDepth.set(depth, { node, score });
        }
      }

      const sortedPhalanges = Array.from(bestByDepth.entries())
        .sort((a, b) => a[0] - b[0])
        .slice(0, 3);

      for (let i = 0; i < sortedPhalanges.length; i++) {
        const key = `${side}${finger}${i + 1}` as HumanoidFingerBoneKey;
        const chosen = sortedPhalanges[i][1].node;
        resolvedNodes[key] = chosen;
        usedNodes.add(chosen);
      }
    }
  };

  detectHandFingerBones(resolvedNodes.leftHand, 'left');
  detectHandFingerBones(resolvedNodes.rightHand, 'right');

  // Compute character-space transforms relative to `spaceRoot` (outer wrapper entity),
  // preserving internal GLB root rotations/scales (such as Sketchfab -90deg X or 0.01 cm scale)
  // while remaining invariant to the player's world position/yaw/scale in the scene!
  spaceRoot.syncHierarchy();
  const invRootMat = new pc.Mat4().copy(spaceRoot.getWorldTransform()).invert();
  const rawModelMatByNode = new Map<pc.GraphNode, pc.Mat4>();
  const rawModelRotByNode = new Map<pc.GraphNode, pc.Quat>();
  const modelPosByNode = new Map<pc.GraphNode, pc.Vec3>();

  const nodesWithSpaceRoot = spaceRoot === modelRoot ? allNodes : [spaceRoot, ...allNodes];
  for (const node of nodesWithSpaceRoot) {
    const relMat = new pc.Mat4().mul2(invRootMat, node.getWorldTransform());
    rawModelMatByNode.set(node, relMat);
    const rot = extractRotationFromMat4(relMat, new pc.Quat());
    rawModelRotByNode.set(node, rot);
    const pos = new pc.Vec3();
    relMat.getTranslation(pos);
    modelPosByNode.set(node, pos);
  }

  // Determine canonical facing quaternion so left arm is on +X and character front faces +Z.
  // For example, Tyler.glb's bind pose faces -Z (leftArm.x < rightArm.x), so facingQuat = RotY(180deg).
  const leftArmNode = resolvedNodes.leftUpperArm;
  const rightArmNode = resolvedNodes.rightUpperArm;
  let facingYawDeg = 0;
  if (leftArmNode && rightArmNode) {
    const lp = modelPosByNode.get(leftArmNode)!;
    const rp = modelPosByNode.get(rightArmNode)!;
    if (lp.x < rp.x) {
      facingYawDeg = 180;
    }
  }
  const facingQuat = new pc.Quat().setFromEulerAngles(0, facingYawDeg, 0);

  // Build canonical (+Z forward, +X left) model rotations for every node
  const canonModelRotByNode = new Map<pc.GraphNode, pc.Quat>();
  const canonModelPosByNode = new Map<pc.GraphNode, pc.Vec3>();
  for (const node of nodesWithSpaceRoot) {
    const rawRot = rawModelRotByNode.get(node)!;
    const rawPos = modelPosByNode.get(node)!;
    canonModelRotByNode.set(node, new pc.Quat().mul2(facingQuat, rawRot).normalize());
    canonModelPosByNode.set(node, facingQuat.transformVector(rawPos, new pc.Vec3()));
  }

  // Optional automatic A-pose -> canonical T-pose alignment for arms
  // so T-pose animations (Mixamo) and A-pose characters (Rigify/RPM) match cleanly!
  const normalizeArms = options?.normalizeArmsToTPose !== false;
  const extraArmDeg = options?.armPoseOffsetDeg ?? 0;
  const adjustedCanonModelRot = new Map<pc.GraphNode, pc.Quat>();

  const alignLimbChain = (
    upperKey: HumanoidBoneKey,
    lowerKey: HumanoidBoneKey,
    handKey: HumanoidBoneKey,
    targetDirX: number,
    extraDegZ: number
  ) => {
    const upper = resolvedNodes[upperKey];
    const lower = resolvedNodes[lowerKey];
    const hand = resolvedNodes[handKey];
    if (!upper || !lower) return;

    const pUpper = canonModelPosByNode.get(upper)!;
    const pLower = canonModelPosByNode.get(lower)!;
    const curDir = new pc.Vec3().sub2(pLower, pUpper);
    if (curDir.lengthSq() < 1e-6) return;
    curDir.normalize();

    const rad = (extraDegZ * Math.PI) / 180;
    const desiredUpperDir = new pc.Vec3(
      targetDirX * Math.cos(rad),
      Math.sin(rad),
      0
    ).normalize();
    // Canonical palm-down vector perpendicular to desiredUpperDir (equals (0, -1, 0) when extraDegZ = 0)
    const desiredPalmDown = new pc.Vec3(
      targetDirX * Math.sin(rad),
      -Math.cos(rad),
      0
    ).normalize();

    const qUpperDelta = quatFromUnitVectors(curDir, desiredUpperDir);
    const canonUpper = canonModelRotByNode.get(upper)!;
    adjustedCanonModelRot.set(upper, new pc.Quat().mul2(qUpperDelta, canonUpper).normalize());

    const side: 'left' | 'right' = targetDirX > 0 ? 'left' : 'right';
    const index1Node = resolvedNodes[`${side}Index1` as HumanoidFingerBoneKey];
    const middle1Node = resolvedNodes[`${side}Middle1` as HumanoidFingerBoneKey];
    const ring1Node = resolvedNodes[`${side}Ring1` as HumanoidFingerBoneKey];
    const pinky1Node = resolvedNodes[`${side}Pinky1` as HumanoidFingerBoneKey];

    let handAlignDelta = qUpperDelta;
    let qPalmTwist = new pc.Quat(0, 0, 0, 1);

    if (hand) {
      const pHand = canonModelPosByNode.get(hand)!;
      const foreDir = new pc.Vec3().sub2(pHand, pLower);
      let qForeSwing = qUpperDelta;
      if (foreDir.lengthSq() > 1e-6) {
        foreDir.normalize();
        qForeSwing = quatFromUnitVectors(foreDir, desiredUpperDir);
      }

      // Compute hand's own longitudinal axis (wrist -> middle1, or average metacarpal, fallback to foreDir)
      const handDir = new pc.Vec3();
      const pMid1 = middle1Node ? canonModelPosByNode.get(middle1Node) : undefined;
      if (pMid1) {
        handDir.sub2(pMid1, pHand);
      } else {
        let count = 0;
        for (const fn of [index1Node, ring1Node, pinky1Node]) {
          const pf = fn ? canonModelPosByNode.get(fn) : undefined;
          if (pf) {
            handDir.add(new pc.Vec3().sub2(pf, pHand));
            count++;
          }
        }
        if (count === 0) {
          handDir.copy(foreDir);
        }
      }

      let qHandSwing = qForeSwing;
      if (handDir.lengthSq() > 1e-6) {
        handDir.normalize();
        qHandSwing = quatFromUnitVectors(handDir, desiredUpperDir);
      }

      // Normalize axial palm roll (pronation/supination) using metacarpal spread (pinky1 -> index1)
      // In canonical T-pose (+Z forward, +X left, -X right):
      // - Left (+X): handDir ~ (+1,0,0), spread(pinky->index) ~ (0,0,+1) => handDir x spread = (0,-1,0)
      // - Right (-X): handDir ~ (-1,0,0), spread(pinky->index) ~ (0,0,+1) => spread x handDir = (0,-1,0)
      const pIdx1 = index1Node ? canonModelPosByNode.get(index1Node) : undefined;
      const pPnk1 = pinky1Node ? canonModelPosByNode.get(pinky1Node) : undefined;
      if (pIdx1 && pPnk1 && handDir.lengthSq() > 1e-6) {
        const spread = new pc.Vec3().sub2(pIdx1, pPnk1);
        if (spread.lengthSq() > 1e-6) {
          spread.normalize();
          const rawPalmDown =
            targetDirX > 0
              ? new pc.Vec3().cross(handDir, spread)
              : new pc.Vec3().cross(spread, handDir);
          if (rawPalmDown.lengthSq() > 1e-5) {
            rawPalmDown.normalize();
            const swungPalm = qHandSwing.transformVector(rawPalmDown, new pc.Vec3());
            // Project onto plane perpendicular to desiredUpperDir
            const proj = desiredUpperDir.dot(swungPalm);
            swungPalm.sub(new pc.Vec3().copy(desiredUpperDir).mulScalar(proj));
            if (swungPalm.lengthSq() > 1e-5) {
              swungPalm.normalize();
              // Cap automatic roll correction at 110° to guard against inverted finger maps
              if (swungPalm.dot(desiredPalmDown) > -0.35) {
                qPalmTwist = quatFromUnitVectors(swungPalm, desiredPalmDown);
              }
            }
          }
        }
      }

      const halfPalmTwist = new pc.Quat().slerp(new pc.Quat(0, 0, 0, 1), qPalmTwist, 0.5).normalize();
      const qForeDelta = new pc.Quat().mul2(halfPalmTwist, qForeSwing).normalize();
      handAlignDelta = new pc.Quat().mul2(qPalmTwist, qHandSwing).normalize();

      const canonLower = canonModelRotByNode.get(lower)!;
      adjustedCanonModelRot.set(lower, new pc.Quat().mul2(qForeDelta, canonLower).normalize());
      const canonHand = canonModelRotByNode.get(hand);
      if (canonHand) {
        adjustedCanonModelRot.set(hand, new pc.Quat().mul2(handAlignDelta, canonHand).normalize());
      }
    }

    // Align thumb chain toward standard canonical 45° anterior-downward T-pose thumb axis
    // so abducted thumbs (e.g. MainAlpha +48°) and curled thumbs (e.g. core_emotes +21°) match cleanly!
    const rawDesiredThumb = new pc.Vec3(targetDirX * 0.76, -0.44, 0.48).normalize();
    const armTiltQ = quatFromUnitVectors(new pc.Vec3(targetDirX, 0, 0), desiredUpperDir);
    const desiredThumbDir = armTiltQ.transformVector(rawDesiredThumb, new pc.Vec3()).normalize();

    const t1 = resolvedNodes[`${side}Thumb1` as HumanoidFingerBoneKey];
    const t2 = resolvedNodes[`${side}Thumb2` as HumanoidFingerBoneKey];
    const t3 = resolvedNodes[`${side}Thumb3` as HumanoidFingerBoneKey];

    let qThumb1 = handAlignDelta;
    if (t1 && t2) {
      const pt1 = canonModelPosByNode.get(t1);
      const pt2 = canonModelPosByNode.get(t2);
      if (pt1 && pt2) {
        const dt1 = new pc.Vec3().sub2(pt2, pt1);
        if (dt1.lengthSq() > 1e-6) {
          dt1.normalize();
          const swungDt1 = handAlignDelta.transformVector(dt1, new pc.Vec3()).normalize();
          const qFix1 = quatFromUnitVectors(swungDt1, desiredThumbDir);
          qThumb1 = new pc.Quat().mul2(qFix1, handAlignDelta).normalize();
        }
      }
    }
    if (t1 && canonModelRotByNode.get(t1)) {
      adjustedCanonModelRot.set(
        t1,
        new pc.Quat().mul2(qThumb1, canonModelRotByNode.get(t1)!).normalize()
      );
    }

    let qThumb2 = qThumb1;
    let thumbSeg2Len = 0;
    if (t2 && t3) {
      const pt2 = canonModelPosByNode.get(t2);
      const pt3 = canonModelPosByNode.get(t3);
      if (pt2 && pt3) {
        const dt2 = new pc.Vec3().sub2(pt3, pt2);
        thumbSeg2Len = dt2.length();
        if (thumbSeg2Len > 1e-4) {
          dt2.mulScalar(1 / thumbSeg2Len);
          const swungDt2 = handAlignDelta.transformVector(dt2, new pc.Vec3()).normalize();
          const qFix2 = quatFromUnitVectors(swungDt2, desiredThumbDir);
          qThumb2 = new pc.Quat().mul2(qFix2, handAlignDelta).normalize();
        }
      }
    }
    if (t2 && canonModelRotByNode.get(t2)) {
      adjustedCanonModelRot.set(
        t2,
        new pc.Quat().mul2(qThumb2, canonModelRotByNode.get(t2)!).normalize()
      );
    }

    let qThumb3 = qThumb2;
    if (t3) {
      const pt3 = canonModelPosByNode.get(t3);
      if (pt3 && thumbSeg2Len > 1e-4) {
        for (const child of t3.children) {
          const pChild = canonModelPosByNode.get(child);
          if (!pChild) continue;
          const dt3 = new pc.Vec3().sub2(pChild, pt3);
          const seg3Len = dt3.length();
          if (seg3Len > thumbSeg2Len * 0.15 && seg3Len < thumbSeg2Len * 2.5) {
            dt3.mulScalar(1 / seg3Len);
            const swungDt3 = handAlignDelta.transformVector(dt3, new pc.Vec3()).normalize();
            const qFix3 = quatFromUnitVectors(swungDt3, desiredThumbDir);
            qThumb3 = new pc.Quat().mul2(qFix3, handAlignDelta).normalize();
            break;
          }
        }
      }
      if (canonModelRotByNode.get(t3)) {
        adjustedCanonModelRot.set(
          t3,
          new pc.Quat().mul2(qThumb3, canonModelRotByNode.get(t3)!).normalize()
        );
      }
    }

    // Align the 4 fingers along desiredUpperDir (starting from handAlignDelta so palm roll is preserved!)
    // and guard f3 against dummy leaf nodes at origin [0,0,0] (as in Sketchfab core_emotes.glb)!
    for (const finger of ['Index', 'Middle', 'Ring', 'Pinky'] as const) {
      const f1 = resolvedNodes[`${side}${finger}1` as HumanoidFingerBoneKey];
      const f2 = resolvedNodes[`${side}${finger}2` as HumanoidFingerBoneKey];
      const f3 = resolvedNodes[`${side}${finger}3` as HumanoidFingerBoneKey];

      let qDelta1 = handAlignDelta;
      if (f1 && f2) {
        const p1 = canonModelPosByNode.get(f1);
        const p2 = canonModelPosByNode.get(f2);
        if (p1 && p2) {
          const d1 = new pc.Vec3().sub2(p2, p1);
          if (d1.lengthSq() > 1e-6) {
            d1.normalize();
            const swungD1 = handAlignDelta.transformVector(d1, new pc.Vec3()).normalize();
            qDelta1 = new pc.Quat()
              .mul2(quatFromUnitVectors(swungD1, desiredUpperDir), handAlignDelta)
              .normalize();
          }
        }
      }
      if (f1) {
        const canon1 = canonModelRotByNode.get(f1);
        if (canon1) {
          adjustedCanonModelRot.set(f1, new pc.Quat().mul2(qDelta1, canon1).normalize());
        }
      }

      let qDelta2 = qDelta1;
      let seg2Len = 0;
      if (f2 && f3) {
        const p2 = canonModelPosByNode.get(f2);
        const p3 = canonModelPosByNode.get(f3);
        if (p2 && p3) {
          const d2 = new pc.Vec3().sub2(p3, p2);
          seg2Len = d2.length();
          if (seg2Len > 1e-4) {
            d2.mulScalar(1 / seg2Len);
            const swungD2 = handAlignDelta.transformVector(d2, new pc.Vec3()).normalize();
            qDelta2 = new pc.Quat()
              .mul2(quatFromUnitVectors(swungD2, desiredUpperDir), handAlignDelta)
              .normalize();
          }
        }
      }
      if (f2) {
        const canon2 = canonModelRotByNode.get(f2);
        if (canon2) {
          adjustedCanonModelRot.set(f2, new pc.Quat().mul2(qDelta2, canon2).normalize());
        }
      }

      let qDelta3 = qDelta2;
      if (f3) {
        const p3 = canonModelPosByNode.get(f3);
        if (p3 && seg2Len > 1e-4) {
          for (const child of f3.children) {
            const pChild = canonModelPosByNode.get(child);
            if (!pChild) continue;
            const d3 = new pc.Vec3().sub2(pChild, p3);
            const seg3Len = d3.length();
            // Reject broken leaf nodes whose world pos sits at [0,0,0] meters away from the hand!
            if (seg3Len > seg2Len * 0.15 && seg3Len < seg2Len * 2.5) {
              d3.mulScalar(1 / seg3Len);
              const swungD3 = handAlignDelta.transformVector(d3, new pc.Vec3()).normalize();
              qDelta3 = new pc.Quat()
                .mul2(quatFromUnitVectors(swungD3, desiredUpperDir), handAlignDelta)
                .normalize();
              break;
            }
          }
        }
        const canon3 = canonModelRotByNode.get(f3);
        if (canon3) {
          adjustedCanonModelRot.set(f3, new pc.Quat().mul2(qDelta3, canon3).normalize());
        }
      }
    }
  };

  if (normalizeArms) {
    alignLimbChain('leftUpperArm', 'leftLowerArm', 'leftHand', 1, extraArmDeg);
    alignLimbChain('rightUpperArm', 'rightLowerArm', 'rightHand', -1, extraArmDeg);
  }

  const bones: Partial<Record<AnyHumanoidBoneKey, BoneRestTransform>> = {};
  const boneMap: HumanoidBoneMap = {};
  const coreKeySet = new Set<string>(HUMANOID_BONE_KEYS);
  let mappedCoreCount = 0;
  let mappedFingerCount = 0;

  for (const key of ALL_HUMANOID_BONE_KEYS) {
    const node = resolvedNodes[key];
    if (!node) continue;
    if (coreKeySet.has(key)) {
      boneMap[key as HumanoidBoneKey] = node.name;
      mappedCoreCount++;
    } else {
      mappedFingerCount++;
    }
    const parent = node.parent;
    const parentRawRot =
      parent && rawModelRotByNode.get(parent)
        ? rawModelRotByNode.get(parent)!.clone()
        : new pc.Quat(0, 0, 0, 1);
    const rawRot = rawModelRotByNode.get(node)?.clone() ?? new pc.Quat(0, 0, 0, 1);
    const canonRot =
      adjustedCanonModelRot.get(node)?.clone() ??
      canonModelRotByNode.get(node)?.clone() ??
      rawRot.clone();

    bones[key] = {
      node,
      name: node.name,
      entityPath: buildEntityPathFromAnimRoot(animRootBone, node),
      localPos: node.getLocalPosition().clone(),
      localRot: node.getLocalRotation().clone(),
      modelPos: modelPosByNode.get(node)?.clone() ?? new pc.Vec3(),
      modelRot: canonRot,
      parentModelRot: parentRawRot,
      rawModelRot: rawRot,
    };
  }

  const hipsNode = resolvedNodes.hips;
  const invHipsParentModelMat = new pc.Mat4();
  if (hipsNode?.parent && rawModelMatByNode.get(hipsNode.parent)) {
    invHipsParentModelMat.copy(rawModelMatByNode.get(hipsNode.parent)!).invert();
  }

  const hipsY = bones.hips ? Math.abs(bones.hips.modelPos.y) : 0.95;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [n, pos] of modelPosByNode.entries()) {
    if (n === spaceRoot) continue;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
  }
  const skeletonSpan = Number.isFinite(maxY - minY) && maxY > minY ? maxY - minY : 1.6;

  // Measure shoulder half-width and arm length in canonical model space for proportional two-hand / mic convergence
  let shoulderHalfWidth = skeletonSpan * 0.11;
  let armLength = skeletonSpan * 0.33;
  const pLU = resolvedNodes.leftUpperArm ? canonModelPosByNode.get(resolvedNodes.leftUpperArm) : undefined;
  const pRU = resolvedNodes.rightUpperArm ? canonModelPosByNode.get(resolvedNodes.rightUpperArm) : undefined;
  const pLL = resolvedNodes.leftLowerArm ? canonModelPosByNode.get(resolvedNodes.leftLowerArm) : undefined;
  const pRL = resolvedNodes.rightLowerArm ? canonModelPosByNode.get(resolvedNodes.rightLowerArm) : undefined;
  const pLH = resolvedNodes.leftHand ? canonModelPosByNode.get(resolvedNodes.leftHand) : undefined;
  const pRH = resolvedNodes.rightHand ? canonModelPosByNode.get(resolvedNodes.rightHand) : undefined;

  if (pLU && pRU) {
    const sw = pLU.distance(pRU) * 0.5;
    if (sw > 1e-4) shoulderHalfWidth = sw;
  }
  let armSamples = 0;
  let armSum = 0;
  if (pLU && pLL && pLH) {
    const lLen = pLU.distance(pLL) + pLL.distance(pLH);
    if (lLen > 1e-4) {
      armSum += lLen;
      armSamples++;
    }
  }
  if (pRU && pRL && pRH) {
    const rLen = pRU.distance(pRL) + pRL.distance(pRH);
    if (rLen > 1e-4) {
      armSum += rLen;
      armSamples++;
    }
  }
  if (armSamples > 0) {
    armLength = armSum / armSamples;
  }
  const shoulderToArmRatio = pc.math.clamp(
    shoulderHalfWidth / Math.max(1e-4, armLength),
    0.18,
    0.65
  );

  return {
    spaceRoot,
    modelRoot,
    animRootBone,
    bones,
    boneMap,
    facingQuat,
    invHipsParentModelMat,
    hipsHeight: Math.max(0.15, hipsY),
    estimatedHeight: Math.max(0.3, skeletonSpan * 1.08),
    shoulderHalfWidth,
    armLength,
    shoulderToArmRatio,
    detectedRigType,
    mappedCount: mappedCoreCount,
    mappedFingerCount,
    allNodeNames: allNodes.filter((n) => n !== modelRoot && Boolean(n.name)).map((n) => n.name),
  };
}

/**
 * Measures the rendered mesh bounding box of an instantiated character entity (at scale=1)
 * to compute automatic normalized scale (targetHeight ~ 1.72m) and groundOffsetY so feet sit on Y=0.
 */
export function measureCharacterBounds(entity: pc.Entity, targetHeight = 1.72): {
  rawHeight: number;
  recommendedScale: number;
  recommendedGroundOffsetY: number;
} {
  const prevScale = entity.getLocalScale().clone();
  const prevPos = entity.getLocalPosition().clone();
  const prevRot = entity.getLocalEulerAngles().clone();

  entity.setLocalPosition(0, 0, 0);
  entity.setLocalEulerAngles(0, 0, 0);
  entity.setLocalScale(1, 1, 1);
  entity.syncHierarchy();

  let minY = Infinity;
  let maxY = -Infinity;

  const renderComps = entity.findComponents('render') as pc.RenderComponent[];
  for (const rc of renderComps) {
    for (const mi of rc.meshInstances) {
      const aabb = mi.aabb;
      if (aabb && Number.isFinite(aabb.center.y) && aabb.halfExtents.y > 0.001) {
        const lo = aabb.center.y - aabb.halfExtents.y;
        const hi = aabb.center.y + aabb.halfExtents.y;
        if (lo < minY) minY = lo;
        if (hi > maxY) maxY = hi;
      }
    }
  }

  entity.setLocalPosition(prevPos);
  entity.setLocalEulerAngles(prevRot);
  entity.setLocalScale(prevScale);
  entity.syncHierarchy();

  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY - minY < 0.01) {
    return {
      rawHeight: 1.72,
      recommendedScale: 1,
      recommendedGroundOffsetY: 0,
    };
  }

  const rawHeight = maxY - minY;
  const recommendedScale = Number((targetHeight / rawHeight).toFixed(4));
  const recommendedGroundOffsetY = Number((-minY * recommendedScale).toFixed(4));

  return {
    rawHeight,
    recommendedScale: pc.math.clamp(recommendedScale, 0.001, 100),
    recommendedGroundOffsetY:
      Math.abs(recommendedGroundOffsetY) < 0.005 ? 0 : recommendedGroundOffsetY,
  };
}
