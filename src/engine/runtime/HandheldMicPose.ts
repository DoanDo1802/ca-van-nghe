import * as pc from 'playcanvas';
import { getAvatarModelPreset } from '../../utils/avatarColor';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';
import { buildHumanoidRigProfile } from '../animation/HumanoidRigMapper';

export type RigBoneKind = 'rightarm' | 'rightforearm' | 'righthand' | 'head';

let micBufferPromise: Promise<ArrayBuffer | null> | null = null;

/**
 * Fetches and caches `/models/Microphone.glb` once so local and remote avatars
 * share the same ArrayBuffer without duplicate network requests.
 */
export function getMicrophoneModelBuffer(): Promise<ArrayBuffer | null> {
  if (!micBufferPromise) {
    micBufferPromise = fetch('/models/Microphone.glb')
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
  }
  return micBufferPromise;
}

export function findRigBone(root: pc.GraphNode | null, kind: RigBoneKind): pc.GraphNode | null {
  if (!root) return null;
  const stack: pc.GraphNode[] = [root];
  let fallbackHand: pc.GraphNode | null = null;
  while (stack.length > 0) {
    const node = stack.pop()!;
    const name = node.name || '';
    const lower = name.toLowerCase();

    if (kind === 'rightarm') {
      if (/(^|[:_.-])(rightarm|upper_arm[._-]?r)([:_.-]|\d|$)/i.test(name)) {
        return node;
      }
    } else if (kind === 'rightforearm') {
      if (/(^|[:_.-])(rightforearm|forearm[._-]?r)([:_.-]|\d|$)/i.test(name)) {
        return node;
      }
    } else if (kind === 'righthand') {
      if (/(^|[:_.-])(righthandmiddle1|f_middle[._-]?0?1[._-]?r)([:_.-]|\d|$)/i.test(name)) {
        return node;
      }
      if (
        !fallbackHand &&
        !lower.includes('thumb') &&
        !lower.includes('index') &&
        !lower.includes('middle') &&
        !lower.includes('ring') &&
        !lower.includes('pinky') &&
        /(^|[:_.-])(righthand|hand[._-]?r)([:_.-]|\d|$)/i.test(name)
      ) {
        fallbackHand = node;
      }
    } else {
      if (
        !lower.includes('headtop') &&
        !lower.includes('headphone') &&
        !lower.includes('overhead') &&
        /(^|[:_.-])head([:_.-]|\d|$)/i.test(name)
      ) {
        return node;
      }
    }

    for (const child of node.children) {
      stack.push(child);
    }
  }
  return kind === 'righthand' ? fallbackHand : null;
}

export function setQuatFromTo(
  out: pc.Quat,
  from: pc.Vec3,
  to: pc.Vec3,
  crossBuf: pc.Vec3
): pc.Quat {
  const dot = pc.math.clamp(from.dot(to), -1, 1);
  if (dot > 0.9999) {
    return out.set(0, 0, 0, 1);
  }
  if (dot < -0.9999) {
    crossBuf.set(1, 0, 0).cross(from, crossBuf);
    if (crossBuf.lengthSq() < 1e-4) {
      crossBuf.set(0, 1, 0).cross(from, crossBuf);
    }
    crossBuf.normalize();
    return out.setFromAxisAngle(crossBuf, 180);
  }
  crossBuf.cross(from, to);
  out.set(crossBuf.x, crossBuf.y, crossBuf.z, 1 + dot);
  return out.normalize();
}

/**
 * Shared procedural right-arm mic-holding rig + `Microphone.glb` attachment
 * used identically for both the local singer and remote players in `postUpdate`.
 */
export class HandheldMicRig {
  private readonly app: pc.Application | null;
  private readonly sceneRoot: pc.Entity;

  private entity: pc.Entity | null = null;
  private rightArmBone: pc.GraphNode | null = null;
  private rightForeArmBone: pc.GraphNode | null = null;
  private rightHandBone: pc.GraphNode | null = null;
  private rightFingerTipBone: pc.GraphNode | null = null;
  private headBone: pc.GraphNode | null = null;

  private micEntity: pc.Entity | null = null;
  private micDestroyResources: (() => void) | null = null;
  private micLoading = false;
  private destroyed = false;

  private holding = false;
  private armBlend = 0;

  private readonly tempMouth = new pc.Vec3();
  private readonly tempHandMouth = new pc.Vec3();
  private readonly tempAimTarget = new pc.Vec3();
  private readonly tempElbowTarget = new pc.Vec3();
  private readonly tempDir = new pc.Vec3();
  private readonly tempCurVec = new pc.Vec3();
  private readonly tempTgtVec = new pc.Vec3();
  private readonly tempRight = new pc.Vec3();
  private readonly tempGripPos = new pc.Vec3();
  private readonly tempMicPos = new pc.Vec3();
  private readonly tempCross = new pc.Vec3();
  private readonly tempDeltaQ = new pc.Quat();
  private readonly tempOrigQ = new pc.Quat();
  private readonly tempWorldQ = new pc.Quat();
  private readonly tempSlerpQ = new pc.Quat();

  constructor(app: pc.Application | null, sceneRoot: pc.Entity) {
    this.app = app;
    this.sceneRoot = sceneRoot;
  }

  getBoundEntity(): pc.Entity | null {
    return this.entity;
  }

  hasRightHandBone(): boolean {
    return this.rightHandBone !== null;
  }

  bindCharacter(entity: pc.Entity | null, avatarModelId: string): void {
    this.entity = entity;
    if (!entity) {
      this.rightArmBone = null;
      this.rightForeArmBone = null;
      this.rightHandBone = null;
      this.rightFingerTipBone = null;
      this.headBone = null;
      return;
    }

    const preset = getAvatarModelPreset(avatarModelId);
    const rig = buildHumanoidRigProfile(entity, {
      explicitBoneMap: preset.boneMap,
      normalizeArmsToTPose: false,
    });
    this.rightArmBone = rig.bones.rightUpperArm?.node ?? findRigBone(entity, 'rightarm');
    this.rightForeArmBone =
      rig.bones.rightLowerArm?.node ?? findRigBone(entity, 'rightforearm');
    this.rightHandBone =
      rig.bones.rightMiddle1?.node ??
      findRigBone(entity, 'righthand') ??
      rig.bones.rightHand?.node ??
      null;
    this.rightFingerTipBone =
      rig.bones.rightMiddle3?.node ?? rig.bones.rightMiddle2?.node ?? null;
    this.headBone = rig.bones.head?.node ?? findRigBone(entity, 'head');
  }

  setBlendImmediate(blend: number, holding: boolean): void {
    this.armBlend = pc.math.clamp(blend, 0, 1);
    this.holding = holding;
    if (holding) {
      void this.ensureMicLoaded();
    }
  }

  updateBlend(dt: number, holding: boolean, snapDown = false): void {
    this.holding = holding;
    if (holding) {
      this.armBlend = Math.min(1, this.armBlend + (1 - this.armBlend) * (1 - Math.exp(-7 * dt)));
      void this.ensureMicLoaded();
    } else if (snapDown) {
      this.armBlend = 0;
    } else {
      this.armBlend *= Math.exp(-10 * dt);
      if (this.armBlend < 0.005) {
        this.armBlend = 0;
      }
    }
  }

  /**
   * Applies procedural shoulder/forearm rotation toward the mouth and positions
   * `Microphone.glb` in the right hand. Must be called in PlayCanvas `postUpdate`.
   */
  applyPose(): void {
    if (this.destroyed || !this.entity) {
      if (this.micEntity && this.micEntity.enabled) {
        this.micEntity.enabled = false;
      }
      return;
    }

    if (!this.holding && this.armBlend <= 0.001) {
      if (this.micEntity && this.micEntity.enabled) {
        this.micEntity.enabled = false;
      }
      return;
    }

    if (!this.rightHandBone) {
      if (this.micEntity) {
        this.micEntity.enabled = false;
      }
      return;
    }

    const fwd = this.entity.forward;
    const right = this.tempRight.copy(this.entity.right);

    if (this.headBone) {
      const hp = this.headBone.getPosition();
      this.tempMouth.set(hp.x - fwd.x * 0.11, hp.y + 0.08, hp.z - fwd.z * 0.11);
      // Character mesh faces local +Z (-fwd), so character's right side is -right.
      this.tempHandMouth.set(
        hp.x - fwd.x * 0.19 - right.x * 0.03,
        hp.y - 0.07,
        hp.z - fwd.z * 0.19 - right.z * 0.03
      );
    } else {
      const pPos = this.entity.getPosition();
      this.tempMouth.set(pPos.x - fwd.x * 0.12, pPos.y + 1.15, pPos.z - fwd.z * 0.12);
      this.tempHandMouth.set(
        pPos.x - fwd.x * 0.22 - right.x * 0.04,
        pPos.y + 1.01,
        pPos.z - fwd.z * 0.22 - right.z * 0.04
      );
    }

    const blend = pc.math.clamp(this.armBlend, 0, 1);

    if (this.rightArmBone && this.rightForeArmBone && blend > 0.001) {
      const armPos = this.rightArmBone.getPosition();
      const forePos = this.rightForeArmBone.getPosition();
      this.tempCurVec.sub2(forePos, armPos);
      if (this.tempCurVec.lengthSq() > 1e-6) {
        this.tempCurVec.normalize();
        this.tempElbowTarget.set(
          armPos.x - fwd.x * 0.14 - right.x * 0.08,
          armPos.y - 0.18,
          armPos.z - fwd.z * 0.14 - right.z * 0.08
        );
        this.tempTgtVec.sub2(this.tempElbowTarget, armPos).normalize();
        setQuatFromTo(this.tempDeltaQ, this.tempCurVec, this.tempTgtVec, this.tempCross);
        this.tempOrigQ.copy(this.rightArmBone.getRotation());
        this.tempWorldQ.mul2(this.tempDeltaQ, this.tempOrigQ);
        this.tempSlerpQ.slerp(this.tempOrigQ, this.tempWorldQ, blend);
        this.rightArmBone.setRotation(this.tempSlerpQ);
      }

      const newElbowPos = this.rightForeArmBone.getPosition();
      const curHandPos = this.rightHandBone.getPosition();
      this.tempCurVec.sub2(curHandPos, newElbowPos);
      if (this.tempCurVec.lengthSq() > 1e-6) {
        this.tempCurVec.normalize();
        this.tempTgtVec.sub2(this.tempHandMouth, newElbowPos).normalize();
        setQuatFromTo(this.tempDeltaQ, this.tempCurVec, this.tempTgtVec, this.tempCross);
        this.tempOrigQ.copy(this.rightForeArmBone.getRotation());
        this.tempWorldQ.mul2(this.tempDeltaQ, this.tempOrigQ);
        this.tempSlerpQ.slerp(this.tempOrigQ, this.tempWorldQ, blend);
        this.rightForeArmBone.setRotation(this.tempSlerpQ);
      }
    }

    if (!this.holding) {
      if (this.micEntity && this.micEntity.enabled) {
        this.micEntity.enabled = false;
      }
      return;
    }

    if (!this.micEntity) {
      void this.ensureMicLoaded();
      return;
    }
    this.micEntity.enabled = true;

    const handPos = this.rightHandBone.getPosition();
    if (this.rightFingerTipBone) {
      const tipPos = this.rightFingerTipBone.getPosition();
      this.tempGripPos.set(
        handPos.x * 0.55 + tipPos.x * 0.45,
        handPos.y * 0.55 + tipPos.y * 0.45,
        handPos.z * 0.55 + tipPos.z * 0.45
      );
    } else {
      this.tempGripPos.set(
        handPos.x + fwd.x * 0.016,
        handPos.y,
        handPos.z + fwd.z * 0.016
      );
    }

    // Tilt the grill cleanly toward the singer's lips instead of pointing straight up
    this.tempAimTarget.set(
      this.tempGripPos.x + (this.tempMouth.x - this.tempGripPos.x) * 0.85,
      this.tempGripPos.y + 0.11,
      this.tempGripPos.z + (this.tempMouth.z - this.tempGripPos.z) * 0.85
    );

    this.tempDir.sub2(this.tempAimTarget, this.tempGripPos);
    const len = this.tempDir.length();
    if (len > 0.001) {
      this.tempDir.mulScalar(1 / len);
    } else {
      this.tempDir.set(0, 1, 0);
    }

    // Position the handle at the fist grip center, nudged slightly along aim direction so the grill clears the hand
    this.tempMicPos.set(
      this.tempGripPos.x + this.tempDir.x * 0.012,
      this.tempGripPos.y + this.tempDir.y * 0.012,
      this.tempGripPos.z + this.tempDir.z * 0.012
    );
    this.micEntity.setPosition(this.tempMicPos);
    this.micEntity.lookAt(this.tempAimTarget);
  }

  private async ensureMicLoaded(): Promise<void> {
    if (this.micEntity || this.micLoading || this.destroyed) return;
    const app = this.app ?? (pc.Application.getApplication() as pc.Application | undefined);
    if (!app) return;

    this.micLoading = true;
    try {
      const buf = await getMicrophoneModelBuffer();
      if (!buf || this.destroyed) return;

      const loaded = await loadGlbFromArrayBuffer(app, buf, 'Microphone.glb', '/models/Microphone.glb');
      if (this.destroyed) {
        loaded.entity.destroy();
        loaded.destroyResources();
        return;
      }

      const entity = loaded.entity;
      entity.name = 'KaraokeHandheldMic';
      entity.setLocalScale(0.72, 0.72, 0.72);
      const clonedMats = new Map<pc.Material, pc.StandardMaterial>();
      entity.findComponents('render').forEach((comp) => {
        const rc = comp as pc.RenderComponent;
        rc.castShadows = false;
        for (const mi of rc.meshInstances) {
          mi.cull = false;
          if (mi.material instanceof pc.StandardMaterial) {
            let cloned = clonedMats.get(mi.material);
            if (!cloned) {
              cloned = mi.material.clone() as pc.StandardMaterial;
              cloned.metalness = Math.min(cloned.metalness ?? 0.3, 0.35);
              cloned.gloss = Math.max(cloned.gloss ?? 0.65, 0.65);
              cloned.diffuse = new pc.Color(0.85, 0.85, 0.88);
              cloned.emissive = new pc.Color(0.12, 0.12, 0.13);
              cloned.update();
              clonedMats.set(mi.material, cloned);
            }
            mi.material = cloned;
          }
        }
      });
      entity.enabled = false;
      this.sceneRoot.addChild(entity);
      this.micEntity = entity;
      this.micDestroyResources = () => {
        for (const m of clonedMats.values()) {
          m.destroy();
        }
        loaded.destroyResources();
      };
    } catch (err) {
      console.warn('[HandheldMicRig] Failed to load Microphone.glb:', err);
    } finally {
      this.micLoading = false;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.holding = false;
    this.armBlend = 0;
    this.bindCharacter(null, '');
    if (this.micEntity) {
      this.micEntity.destroy();
      this.micEntity = null;
    }
    if (this.micDestroyResources) {
      this.micDestroyResources();
      this.micDestroyResources = null;
    }
  }
}
