import * as pc from 'playcanvas';
import { getSavedAvatarModel } from '../../utils/avatarColor';
import { karaokeAudio } from '../../utils/karaokeAudio';
import { HandheldMicRig } from './HandheldMicPose';

const RIGHT_STAGE_SPOT = { x: 15.85, y: 0.36, z: 2.72 };

/**
 * Manages the Right Red-Curtain Live Karaoke Stage experience in PlayCanvas:
 * - Detects when the player steps onto the right stage
 * - Smoothly glides the singer to the stage front center facing the audience
 * - Smoothly raises Microphone.glb toward the mouth upon entering karaoke mode (unless overridden by a Hold-R emote)
 * - Drives an audio-reactive singer spotlight
 */
export class KaraokeStageController {
  private readonly sceneRoot: pc.Entity;
  private readonly micRig: HandheldMicRig;
  private active = false;
  private isMusicPlaying = false;
  private style: 'chill' | 'dance' = 'chill';
  private smoothedEnergy = 0;
  private phase = 0;
  private currentSingerYaw = -90;

  private stageSpot: pc.Entity | null = null;
  private playerEntity: pc.Entity | null = null;

  constructor(sceneRoot: pc.Entity) {
    this.sceneRoot = sceneRoot;
    this.micRig = new HandheldMicRig(
      (pc.Application.getApplication() as pc.Application | undefined) ?? null,
      sceneRoot
    );
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
    this.micRig.bindCharacter(playerEntity, getSavedAvatarModel());
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
    this.currentSingerYaw = playerEntity.getLocalEulerAngles().y;
    this.setPlayerEntity(playerEntity);
    this.micRig.setBlendImmediate(0, true);

    const playerYaw = -90;
    this.ensureStageSpotlight(true);

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
    this.playerEntity = null;
    this.micRig.setBlendImmediate(0, false);
    this.micRig.bindCharacter(null, getSavedAvatarModel());

    this.ensureStageSpotlight(false);
    karaokeAudio.pause();

    window.dispatchEvent(new CustomEvent('cavannghe:karaoke', { detail: { active: false } }));
  }

  update(dt: number, activeEmoteAnim?: string | null): string {
    if (!this.active) {
      this.micRig.updateBlend(dt, false, true);
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
    const shouldHoldMic = this.active && !activeEmoteAnim;
    this.micRig.updateBlend(dt, shouldHoldMic, Boolean(activeEmoteAnim));

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
      this.micRig.setBlendImmediate(0, false);
    }
    if (this.active && !activeEmoteAnim && playerEntity && (this.playerEntity !== playerEntity || !this.micRig.hasRightHandBone())) {
      this.setPlayerEntity(playerEntity);
    }
    this.micRig.applyPose();
  }

  destroy(): void {
    this.exit();
    this.micRig.destroy();
    if (this.stageSpot) {
      this.stageSpot.destroy();
      this.stageSpot = null;
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
