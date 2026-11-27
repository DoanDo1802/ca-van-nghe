import * as pc from 'playcanvas';
import { getAvatarModelPreset, getSavedAvatarModel } from '../../utils/avatarColor';
import { karaokeAudio } from '../../utils/karaokeAudio';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';
import { buildHumanoidRigProfile } from '../animation/HumanoidRigMapper';

const RIGHT_STAGE_SPOT = { x: 15.85, y: 0.36, z: 2.72 };

type RigBoneKind = 'rightarm' | 'rightforearm' | 'righthand' | 'head';

function findRigBone(root: pc.GraphNode | null, kind: RigBoneKind): pc.GraphNode | null {
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

function setQuatFromTo(out: pc.Quat, from: pc.Vec3, to: pc.Vec3, crossBuf: pc.Vec3): pc.Quat {
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
 * Manages the Right Red-Curtain Live Karaoke Stage experience in PlayCanvas:
 * - Detects when the player steps onto the right stage
 * - Smoothly glides the singer to the stage front center facing the audience
 * - Smoothly raises Microphone.glb toward the mouth upon entering karaoke mode (unless overridden by a Hold-R emote)
 * - Drives an audio-reactive singer spotlight
 */
export class KaraokeStageController {
  private readonly sceneRoot: pc.Entity;
  private active = false;
  private isMusicPlaying = false;
  private style: 'chill' | 'dance' = 'chill';
  private smoothedEnergy = 0;
  private phase = 0;
  private armBlend = 0;
  private currentSingerYaw = -90;

  private stageSpot: pc.Entity | null = null;
  private playerEntity: pc.Entity | null = null;
  private rightArmBone: pc.GraphNode | null = null;
  private rightForeArmBone: pc.GraphNode | null = null;
  private rightHandBone: pc.GraphNode | null = null;
  private rightFingerTipBone: pc.GraphNode | null = null;
  private headBone: pc.GraphNode | null = null;
  private micEntity: pc.Entity | null = null;
  private micDestroyResources: (() => void) | null = null;
  private micLoading = false;
  private destroyed = false;

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

  constructor(sceneRoot: pc.Entity) {
    this.sceneRoot = sceneRoot;
  }

  isActive(): boolean {
    return this.active;
  }

  getStyle(): 'chill' | 'dance' {
    return this.style;
  }

  setStyle(style: 'chill' | 'dance'): void {
    this.style = style;
  }

  setPlayerEntity(playerEntity: pc.Entity): void {
    this.playerEntity = playerEntity;
    const preset = getAvatarModelPreset(getSavedAvatarModel());
    const rig = buildHumanoidRigProfile(playerEntity, {
      explicitBoneMap: preset.boneMap,
      normalizeArmsToTPose: false,
    });
    this.rightArmBone = rig.bones.rightUpperArm?.node ?? findRigBone(playerEntity, 'rightarm');
    this.rightForeArmBone =
      rig.bones.rightLowerArm?.node ?? findRigBone(playerEntity, 'rightforearm');
    this.rightHandBone =
      rig.bones.rightMiddle1?.node ??
      findRigBone(playerEntity, 'righthand') ??
      rig.bones.rightHand?.node ??
      null;
    this.rightFingerTipBone =
      rig.bones.rightMiddle3?.node ?? rig.bones.rightMiddle2?.node ?? null;
    this.headBone = rig.bones.head?.node ?? findRigBone(playerEntity, 'head');
  }

  setMusicPlaying(playing: boolean): void {
    this.isMusicPlaying = playing;
  }

  isOnRightStage(x: number, y: number, z: number): boolean {
    return x >= 14.9 && x <= 18.92 && z >= -1.75 && z <= 7.75 && y >= 0.25;
  }

  enter(playerEntity: pc.Entity): { playerYaw: number; camYaw: number; camPitch: number } {
    this.active = true;
    this.isMusicPlaying = false;
    this.phase = 0;
    this.armBlend = 0;
    this.currentSingerYaw = playerEntity.getLocalEulerAngles().y;
    this.setPlayerEntity(playerEntity);

    const playerYaw = -90;
    this.ensureStageSpotlight(true);
    void this.ensureMicLoaded();

    window.dispatchEvent(new CustomEvent('cavannghe:karaoke', { detail: { active: true } }));

    // Default camera behind singer (+X) looking out across the stage toward the audience (-X);
    // user can still freely orbit the camera with mouse/touch drag.
    return { playerYaw, camYaw: 90, camPitch: -10 };
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.isMusicPlaying = false;
    this.smoothedEnergy = 0;
    this.armBlend = 0;
    this.playerEntity = null;
    this.rightArmBone = null;
    this.rightForeArmBone = null;
    this.rightHandBone = null;
    this.rightFingerTipBone = null;
    this.headBone = null;
    if (this.micEntity) {
      this.micEntity.enabled = false;
    }

    this.ensureStageSpotlight(false);
    karaokeAudio.pause();

    window.dispatchEvent(new CustomEvent('cavannghe:karaoke', { detail: { active: false } }));
  }

  update(dt: number): string {
    if (!this.active) {
      this.armBlend = 0;
      return 'Idle_Loop';
    }
    this.phase += dt;

    // Smoothly glide singer into centered stage position & facing (-90 deg -> -X)
    if (this.playerEntity) {
      const moveAlpha = 1 - Math.exp(-9 * dt);
      const pos = this.playerEntity.getLocalPosition();
      const nx = pos.x + (RIGHT_STAGE_SPOT.x - pos.x) * moveAlpha;
      const ny = pos.y + (RIGHT_STAGE_SPOT.y - pos.y) * moveAlpha;
      const nz = pos.z + (RIGHT_STAGE_SPOT.z - pos.z) * moveAlpha;
      this.playerEntity.setLocalPosition(nx, ny, nz);

      const yawDiff = ((-90 - this.currentSingerYaw + 540) % 360) - 180;
      this.currentSingerYaw += yawDiff * moveAlpha;
      this.playerEntity.setLocalEulerAngles(0, this.currentSingerYaw, 0);
    }

    // Smoothly blend arm-raise into mic-holding pose
    this.armBlend = Math.min(1, this.armBlend + (1 - this.armBlend) * (1 - Math.exp(-7 * dt)));

    const { music, mic } = karaokeAudio.getEnergy();
    const targetEnergy = this.isMusicPlaying
      ? Math.max(0.28, Math.min(1, Math.max(music * 0.9, mic * 1.35)))
      : 0;
    this.smoothedEnergy += (targetEnergy - this.smoothedEnergy) * Math.min(1, dt * 12);

    // Pulse stage spotlight with music/vocal energy
    if (this.stageSpot?.light) {
      const pulse = 3.2 + this.smoothedEnergy * 4.5;
      this.stageSpot.light.intensity = pulse;
      const mix = 0.5 + 0.5 * Math.sin(this.phase * 1.4 + mic * 2.0);
      this.stageSpot.light.color = karaokeAudio.isAutoTuneEnabled()
        ? new pc.Color(0.55 + mix * 0.4, 0.2 + (1 - mix) * 0.55, 1.0)
        : new pc.Color(1.0, 0.74 - mix * 0.34, 0.34 + mix * 0.48);
    }

    return 'Idle_Loop';
  }

  /**
   * Smoothly raises Microphone.glb up near the singer's mouth at a natural angle upon entering
   * karaoke mode (no mic is shown during Hold-R emotes).
   */
  applyArmPose(playerEntity?: pc.Entity | null, activeEmoteAnim?: string | null): void {
    if (activeEmoteAnim) {
      this.armBlend = 0;
    }
    const shouldHoldMic = this.active && !activeEmoteAnim;
    if (!shouldHoldMic || !playerEntity) {
      if (this.micEntity && this.micEntity.enabled) {
        this.micEntity.enabled = false;
      }
      return;
    }

    if (this.playerEntity !== playerEntity || !this.rightHandBone) {
      this.setPlayerEntity(playerEntity);
    }
    if (!this.rightHandBone) {
      if (this.micEntity) this.micEntity.enabled = false;
      return;
    }
    if (!this.micEntity) {
      void this.ensureMicLoaded();
    }

    const fwd = playerEntity.forward;
    const right = this.tempRight.copy(playerEntity.right);

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
      const pPos = playerEntity.getPosition();
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

    if (!this.micEntity) return;
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

  destroy(): void {
    this.destroyed = true;
    this.exit();
    if (this.micEntity) {
      this.micEntity.destroy();
      this.micEntity = null;
    }
    if (this.micDestroyResources) {
      this.micDestroyResources();
      this.micDestroyResources = null;
    }
    if (this.stageSpot) {
      this.stageSpot.destroy();
      this.stageSpot = null;
    }
  }

  private async ensureMicLoaded(): Promise<void> {
    if (this.micEntity || this.micLoading || this.destroyed) return;
    const app = pc.Application.getApplication() as pc.Application | undefined;
    if (!app) return;

    this.micLoading = true;
    try {
      const res = await fetch('/models/Microphone.glb');
      if (!res.ok || this.destroyed) return;
      const buf = await res.arrayBuffer();
      if (this.destroyed) return;

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
      console.warn('[KaraokeStageController] Failed to load Microphone.glb:', err);
    } finally {
      this.micLoading = false;
    }
  }

  private ensureStageSpotlight(enabled: boolean): void {
    if (!this.stageSpot && enabled) {
      const spot = new pc.Entity('KaraokeSingerSpotlight');
      spot.addComponent('light', {
        type: 'spot',
        color: new pc.Color(1, 0.72, 0.35),
        intensity: 3.5,
        range: 14,
        innerConeAngle: 22,
        outerConeAngle: 42,
        castShadows: false,
      });
      spot.setLocalPosition(13.6, 4.9, RIGHT_STAGE_SPOT.z);
      spot.lookAt(RIGHT_STAGE_SPOT.x, RIGHT_STAGE_SPOT.y + 1.0, RIGHT_STAGE_SPOT.z);
      this.sceneRoot.addChild(spot);
      this.stageSpot = spot;
    }
    if (this.stageSpot) {
      this.stageSpot.enabled = enabled;
    }
  }
}
