import * as pc from 'playcanvas';
import { karaokeAudio } from '../../utils/karaokeAudio';

const RIGHT_STAGE_SPOT = { x: 15.65, y: 0.36, z: 3.0 };

/**
 * Manages the Right Red-Curtain Live Karaoke Stage experience in PlayCanvas:
 * - Detects when the player steps onto the right stage
 * - Positions the singer at the stage center facing the lounge
 * - Drives an audio-reactive singer spotlight
 */
export class KaraokeStageController {
  private readonly sceneRoot: pc.Entity;
  private active = false;
  private style: 'chill' | 'dance' = 'chill';
  private smoothedEnergy = 0;
  private phase = 0;

  private stageSpot: pc.Entity | null = null;

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

  isOnRightStage(x: number, y: number, z: number): boolean {
    return x >= 14.9 && x <= 18.92 && z >= -1.75 && z <= 7.75 && y >= 0.25;
  }

  enter(playerEntity: pc.Entity): { playerYaw: number; camYaw: number; camPitch: number } {
    this.active = true;
    this.phase = 0;

    // Move player to front-center of right stage facing the lounge (-X)
    playerEntity.setLocalPosition(RIGHT_STAGE_SPOT.x, RIGHT_STAGE_SPOT.y, RIGHT_STAGE_SPOT.z);
    const playerYaw = -90;
    playerEntity.setLocalEulerAngles(0, playerYaw, 0);

    this.ensureStageSpotlight(true);

    window.dispatchEvent(new CustomEvent('cavannghe:karaoke', { detail: { active: true } }));

    // 3/4 stage camera view showing the singer, red curtain, and band behind
    return { playerYaw, camYaw: -128, camPitch: -10 };
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.smoothedEnergy = 0;

    this.ensureStageSpotlight(false);
    karaokeAudio.pause();

    window.dispatchEvent(new CustomEvent('cavannghe:karaoke', { detail: { active: false } }));
  }

  update(dt: number): string {
    if (!this.active) return 'Idle_Loop';
    this.phase += dt;

    const { music, mic } = karaokeAudio.getEnergy();
    const targetEnergy = Math.min(1, Math.max(music * 0.9, mic * 1.35));
    this.smoothedEnergy += (targetEnergy - this.smoothedEnergy) * Math.min(1, dt * 12);

    // Pulse stage spotlight with music/vocal energy
    if (this.stageSpot?.light) {
      const pulse = 3.2 + this.smoothedEnergy * 4.5;
      this.stageSpot.light.intensity = pulse;
      const mix = 0.5 + 0.5 * Math.sin(this.phase * 1.4 + mic * 2.0);
      this.stageSpot.light.color = new pc.Color(
        1.0,
        0.74 - mix * 0.34,
        0.34 + mix * 0.48
      );
    }

    if (this.style === 'dance' || this.smoothedEnergy > 0.62) {
      return 'Dance_Loop';
    }
    return 'Idle_Talking_Loop';
  }

  /**
   * Reserved for future custom mic-holding arm animation.
   */
  applyArmPose(): void {}

  destroy(): void {
    this.exit();
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
      spot.setLocalPosition(13.6, 4.9, 3.0);
      spot.lookAt(RIGHT_STAGE_SPOT.x, RIGHT_STAGE_SPOT.y + 1.0, RIGHT_STAGE_SPOT.z);
      this.sceneRoot.addChild(spot);
      this.stageSpot = spot;
    }
    if (this.stageSpot) {
      this.stageSpot.enabled = enabled;
    }
  }
}
