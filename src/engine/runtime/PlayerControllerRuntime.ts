import * as pc from 'playcanvas';
import { MultiplayerManager } from '../../network/MultiplayerManager';
import { applyAvatarColor } from '../../utils/avatarColor';
import { DebugLogger } from '../../utils/debugLogger';
import { getEntityMeta } from '../serialization/EntityComponentHelper';
import { KaraokeStageController } from './KaraokeStageController';

interface StageSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

interface SolidBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface CameraOccluderBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const MAIN_STAGE_SURFACES: StageSurface[] = [
  { minX: -7.32, maxX: 7.32, minZ: -8.06, maxZ: -7.56, y: 0.12 },
  { minX: -7.42, maxX: 7.42, minZ: -8.51, maxZ: -8.0, y: 0.24 },
  { minX: -7.5, maxX: 7.5, minZ: -16.9, maxZ: -8.45, y: 0.36 },
];

const ACOUSTIC_STAGE_SURFACES: StageSurface[] = [
  { minX: 14.38, maxX: 14.98, minZ: -1.45, maxZ: 7.45, y: 0.18 },
  { minX: 14.92, maxX: 18.92, minZ: -1.75, maxZ: 7.75, y: 0.36 },
];

const MAIN_STAGE_SOLIDS: SolidBox[] = [
  { minX: -7.5, maxX: -5.38, minZ: -16.58, maxZ: -14.7 },
  { minX: 5.38, maxX: 7.5, minZ: -16.58, maxZ: -14.7 },
  { minX: -7.5, maxX: -5.38, minZ: -10.85, maxZ: -8.95 },
  { minX: 5.38, maxX: 7.5, minZ: -10.85, maxZ: -8.95 },
];

const ACOUSTIC_STAGE_SOLIDS: SolidBox[] = [
  { minX: 16.35, maxX: 18.3, minZ: -0.72, maxZ: 1.12 },
  { minX: 16.4, maxX: 18.28, minZ: 3.68, maxZ: 6.05 },
  { minX: 18.02, maxX: 18.55, minZ: 1.55, maxZ: 3.82 },
];

const LOBBY_KIOSK_SOLIDS: SolidBox[] = [
  { minX: -1.18, maxX: 1.18, minZ: -6.8, maxZ: -5.6 },
];

const STAGE_RADIUS = 0.25;
const WALK_SPEED = 4.5;
const RUN_SPEED = 7.5;
const JUMP_VELOCITY = 6.2;
const GRAVITY = -18.0;

export interface NearbyPromptData {
  type: 'chair' | 'object' | 'door';
  id: string;
  title: string;
  targetSceneId?: string;
  chair?: {
    id: string;
    title: string;
    position: [number, number, number];
    seatPosition: [number, number, number];
    seatRotation: number;
  };
}

/**
 * Play Mode Player Controller for the Ca Van Nghe Lounge.
 * Activates automatically when a `player`-tagged entity + `Main Camera` exist in SceneRoot.
 */
export class PlayerControllerRuntime {
  private readonly sceneRoot: pc.Entity;
  private readonly canvas: HTMLCanvasElement;
  private playerEntity: pc.Entity | null = null;
  private cameraEntity: pc.Entity | null = null;

  private yaw = 180; // facing -Z toward Main Stage
  private playerYaw = 180;
  private pitch = -12;
  private cameraMode: 'third' | 'first' = 'third';
  private velocityY = 0;
  private grounded = true;
  private isSitting = false;
  private currentSeatId: string | null = null;
  private activeSeatChair: NearbyPromptData['chair'] | null = null;
  private lastPromptChair: NearbyPromptData['chair'] | null = null;
  private currentAnimState = '';

  private dynamicChairs: pc.Entity[] = [];
  private lastNetPos = new pc.Vec3(0, 0, 7);
  private hasLastNetPos = false;
  private dynamicInteractables: pc.Entity[] = [];
  private lastPromptDoorSceneId: string | null = null;
  private hasMainStage = false;
  private hasAcousticStage = false;
  private hasLobbyKiosk = false;
  private roomBounds = { minX: -18.2, maxX: 18.2, minZ: -16.2, maxZ: 16.2 };
  private cameraOccluders: CameraOccluderBox[] = [];

  private readonly keys = new Set<string>();
  private hasLastPointer = false;
  private isKaraokeDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lookTouchId: number | null = null;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private cameraSensitivity = (() => {
    const saved = Number(localStorage.getItem('cavannghe:cam-sensitivity'));
    return Number.isFinite(saved) && saved >= 0.2 && saved <= 3 ? saved : 1.0;
  })();
  private mobileMove: { x: number; y: number } | null = null;
  private lastPromptKey = '';
  private destroyed = false;

  private readonly tempPos = new pc.Vec3();
  private readonly tempSeatOffset = new pc.Vec3();
  private readonly karaoke: KaraokeStageController;

  constructor(sceneRoot: pc.Entity, canvas: HTMLCanvasElement) {
    this.sceneRoot = sceneRoot;
    this.canvas = canvas;
    this.karaoke = new KaraokeStageController(sceneRoot);
  }

  start(): boolean {
    this.playerEntity = this.findByTagOrName(this.sceneRoot, 'player', 'Player');
    this.cameraEntity = this.findMainCamera(this.sceneRoot);
    if (!this.playerEntity || !this.cameraEntity) {
      DebugLogger.warn(
        'PlayerController',
        `PlayerControllerRuntime failed to start (player=${Boolean(this.playerEntity)}, camera=${Boolean(this.cameraEntity)})`
      );
      return false;
    }

    const rot = this.playerEntity.getLocalEulerAngles();
    this.playerYaw = rot.y;
    // Player faces -Z (rot.y = 180°). Camera orbits behind player (+Z) when yaw = 0°.
    this.yaw = ((rot.y - 180) % 360 + 360) % 360;

    this.collectDynamicTargets();
    this.detectRoomEnvironment();
    this.disablePlayerFrustumCulling(this.playerEntity);

    if (this.playerEntity.anim) {
      this.playerEntity.anim.activate = true;
      this.playerEntity.anim.enabled = true;
      this.playerEntity.anim.playing = true;
      this.playAnim('Idle_Loop');
    }

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd);
    this.canvas.addEventListener('touchcancel', this.onTouchEnd);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('cavannghe:mobile-move', this.onMobileMove as EventListener);
    window.addEventListener('cavannghe:toggle-camera', this.onToggleCamera);
    window.addEventListener('cavannghe:camera-sensitivity', this.onCameraSensitivity as EventListener);
    window.addEventListener('cavannghe:stand-up', this.onStandUp);
    window.addEventListener('cavannghe:emote', this.onEmote as EventListener);
    window.addEventListener('cavannghe:karaoke-exit', this.onKaraokeExit);
    window.addEventListener('cavannghe:karaoke-style', this.onKaraokeStyle as EventListener);
    window.addEventListener('cavannghe:avatar-color', this.onAvatarColor as EventListener);
    pc.Application.getApplication()?.on('postUpdate', this.onPostUpdate);

    this.updateCameraTransform(1);
    return true;
  }

  update(dt: number): void {
    if (this.destroyed || !this.playerEntity || !this.cameraEntity) return;
    const clampedDt = Math.min(dt, 0.05);

    if (this.karaoke.isActive()) {
      const animName = this.karaoke.update(clampedDt);
      this.playAnim(animName);
    } else if (!this.isSitting) {
      this.updateMovement(clampedDt);
    }

    this.updateCameraTransform(1 - Math.exp(-12 * clampedDt));
    this.updateProximity();

    const pos = this.playerEntity.getLocalPosition();
    let vx = 0;
    let vz = 0;
    if (this.hasLastNetPos && clampedDt > 0.001) {
      vx = (pos.x - this.lastNetPos.x) / clampedDt;
      vz = (pos.z - this.lastNetPos.z) / clampedDt;
    }
    this.lastNetPos.copy(pos);
    this.hasLastNetPos = true;

    MultiplayerManager.getInstance().sendLocalPlayerState({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      vx,
      vz,
      yaw: this.playerYaw,
      anim: this.currentAnimState || 'Idle_Loop',
      emote: null,
      isSitting: this.isSitting,
      chairId: this.isSitting ? this.currentSeatId : null,
    });
  }

  destroy(): void {
    this.destroyed = true;
    pc.Application.getApplication()?.off('postUpdate', this.onPostUpdate);
    this.karaoke.destroy();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.onTouchEnd);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    window.removeEventListener('cavannghe:mobile-move', this.onMobileMove as EventListener);
    window.removeEventListener('cavannghe:toggle-camera', this.onToggleCamera);
    window.removeEventListener('cavannghe:camera-sensitivity', this.onCameraSensitivity as EventListener);
    window.removeEventListener('cavannghe:stand-up', this.onStandUp);
    window.removeEventListener('cavannghe:emote', this.onEmote as EventListener);
    window.removeEventListener('cavannghe:karaoke-exit', this.onKaraokeExit);
    window.removeEventListener('cavannghe:karaoke-style', this.onKaraokeStyle as EventListener);
    window.removeEventListener('cavannghe:avatar-color', this.onAvatarColor as EventListener);
    this.keys.clear();
    this.emitProximity(null);
  }

  private updateMovement(dt: number): void {
    if (!this.playerEntity) return;

    let forwardInput = 0;
    let rightInput = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forwardInput += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forwardInput -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) rightInput += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) rightInput -= 1;

    if (this.mobileMove) {
      rightInput += this.mobileMove.x;
      forwardInput += this.mobileMove.y;
    }

    const pos = this.playerEntity.getLocalPosition();
    let x = pos.x;
    let y = pos.y;
    let z = pos.z;

    const walkSpeed = this.getNumberAttr(this.playerEntity, 'walkSpeed', WALK_SPEED);
    const runSpeed = this.getNumberAttr(this.playerEntity, 'runSpeed', RUN_SPEED);
    const jumpVelocity = this.getNumberAttr(this.playerEntity, 'jumpVelocity', JUMP_VELOCITY);
    const gravity = this.getNumberAttr(this.playerEntity, 'gravity', GRAVITY);
    const turnSpeed = Math.max(0.1, this.getNumberAttr(this.playerEntity, 'turnSpeed', 12));

    const len = Math.hypot(forwardInput, rightInput);
    const isMoving = len > 0.05;
    if (isMoving) {
      const nf = forwardInput / Math.max(1, len);
      const nr = rightInput / Math.max(1, len);
      const isRunning = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = isRunning ? runSpeed : walkSpeed;

      const yawRad = (this.yaw * Math.PI) / 180;
      const fwdX = -Math.sin(yawRad);
      const fwdZ = -Math.cos(yawRad);
      const rgtX = Math.cos(yawRad);
      const rgtZ = -Math.sin(yawRad);

      const moveX = (fwdX * nf + rgtX * nr) * speed * dt;
      const moveZ = (fwdZ * nf + rgtZ * nr) * speed * dt;

      x = pc.math.clamp(x + moveX, this.roomBounds.minX, this.roomBounds.maxX);
      z = pc.math.clamp(z + moveZ, this.roomBounds.minZ, this.roomBounds.maxZ);

      const stageSolids = [
        ...(this.hasMainStage ? MAIN_STAGE_SOLIDS : []),
        ...(this.hasAcousticStage ? ACOUSTIC_STAGE_SOLIDS : []),
        ...(this.hasLobbyKiosk ? LOBBY_KIOSK_SOLIDS : []),
      ];

      // Resolve solid boxes on stage
      for (const box of stageSolids) {
        if (
          x > box.minX - STAGE_RADIUS &&
          x < box.maxX + STAGE_RADIUS &&
          z > box.minZ - STAGE_RADIUS &&
          z < box.maxZ + STAGE_RADIUS
        ) {
          const dLeft = Math.abs(x - (box.minX - STAGE_RADIUS));
          const dRight = Math.abs(box.maxX + STAGE_RADIUS - x);
          const dBack = Math.abs(z - (box.minZ - STAGE_RADIUS));
          const dFront = Math.abs(box.maxZ + STAGE_RADIUS - z);
          const minD = Math.min(dLeft, dRight, dBack, dFront);
          if (minD === dLeft) x = box.minX - STAGE_RADIUS;
          else if (minD === dRight) x = box.maxX + STAGE_RADIUS;
          else if (minD === dBack) z = box.minZ - STAGE_RADIUS;
          else z = box.maxZ + STAGE_RADIUS;
        }
      }

      const targetYaw = (Math.atan2(fwdX * nf + rgtX * nr, fwdZ * nf + rgtZ * nr) * 180) / Math.PI;
      let diff = targetYaw - this.playerYaw;
      while (diff < -180) diff += 360;
      while (diff > 180) diff -= 360;
      this.playerYaw += diff * (1 - Math.exp(-turnSpeed * dt));
      this.playerEntity.setLocalEulerAngles(0, this.playerYaw, 0);

      if (this.grounded) {
        this.playAnim(isRunning ? 'Running' : 'Walk_Loop');
      }
    } else if (this.grounded) {
      this.playAnim('Idle_Loop');
    }

    // Gravity & step-up
    const floorY = this.groundAt(x, z);
    if (this.grounded && this.keys.has('Space')) {
      this.velocityY = jumpVelocity;
      this.grounded = false;
      const isRunning = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      this.playAnim(isRunning && isMoving ? 'JumpWhileRun' : 'Jumping');
    }

    if (!this.grounded) {
      this.velocityY += gravity * dt;
      y += this.velocityY * dt;
      if (y <= floorY) {
        y = floorY;
        this.velocityY = 0;
        this.grounded = true;
      }
    } else {
      y += (floorY - y) * Math.min(1, dt * 15);
    }

    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      this.playerEntity.setLocalPosition(x, y, z);
    }
  }

  private updateCameraTransform(alpha: number): void {
    if (!this.playerEntity || !this.cameraEntity) return;
    const p = this.playerEntity.getLocalPosition();
    const yawRad = (this.yaw * Math.PI) / 180;
    const pitchRad = (this.pitch * Math.PI) / 180;

    if (this.cameraMode === 'first') {
      this.tempPos.set(p.x, p.y + 1.45, p.z);
      this.cameraEntity.setLocalPosition(this.tempPos);
      this.cameraEntity.setLocalEulerAngles(this.pitch, this.yaw, 0);
      return;
    }

    const dist = this.getNumberAttr(this.playerEntity, 'cameraDistance', 3.6);
    const horiz = dist * Math.cos(pitchRad);
    const targetX = p.x;
    const targetY = p.y + 1.15;
    const targetZ = p.z;

    let camX = targetX + Math.sin(yawRad) * horiz;
    let camY = Math.max(0.4, Math.min(6.4, p.y + 1.5 - Math.sin(pitchRad) * dist));
    let camZ = targetZ + Math.cos(yawRad) * horiz;

    // Pull camera inward if ray from target to desired camera hits a wall or stage curtain
    const hitT = this.raycastCameraOccluders(targetX, targetY, targetZ, camX, camY, camZ);
    if (hitT < 1) {
      const safeT = Math.max(0.18, hitT * 0.88);
      camX = targetX + (camX - targetX) * safeT;
      camY = Math.max(0.4, targetY + (camY - targetY) * safeT);
      camZ = targetZ + (camZ - targetZ) * safeT;
    }

    // Clamp inside room walls so camera never clips outside the room
    const wallMargin = 0.25;
    camX = pc.math.clamp(camX, this.roomBounds.minX + wallMargin, this.roomBounds.maxX - wallMargin);
    camZ = pc.math.clamp(camZ, this.roomBounds.minZ + wallMargin, this.roomBounds.maxZ - wallMargin);

    const cur = this.cameraEntity.getLocalPosition();
    this.tempPos.set(
      pc.math.lerp(cur.x, camX, alpha),
      pc.math.lerp(cur.y, camY, alpha),
      pc.math.lerp(cur.z, camZ, alpha)
    );
    this.cameraEntity.setLocalPosition(this.tempPos);
    this.cameraEntity.lookAt(targetX, targetY, targetZ);
  }

  private raycastCameraOccluders(
    ox: number,
    oy: number,
    oz: number,
    ex: number,
    ey: number,
    ez: number
  ): number {
    const dx = ex - ox;
    const dy = ey - oy;
    const dz = ez - oz;
    let closest = 1;

    for (const box of this.cameraOccluders) {
      let tmin = 0;
      let tmax = closest;

      const checkAxis = (o: number, d: number, minB: number, maxB: number): boolean => {
        if (Math.abs(d) < 1e-6) {
          return o >= minB && o <= maxB;
        }
        let t1 = (minB - o) / d;
        let t2 = (maxB - o) / d;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        return tmin <= tmax;
      };

      if (
        checkAxis(ox, dx, box.minX, box.maxX) &&
        checkAxis(oy, dy, box.minY, box.maxY) &&
        checkAxis(oz, dz, box.minZ, box.maxZ) &&
        tmin > 0.02 &&
        tmin < closest
      ) {
        closest = tmin;
      }
    }

    return closest;
  }

  private updateProximity(): void {
    if (!this.playerEntity) return;
    if (this.karaoke.isActive()) {
      if (this.lastPromptKey !== '') {
        this.lastPromptKey = '';
        this.emitProximity(null);
      }
      return;
    }
    const p = this.playerEntity.getLocalPosition();
    const interactRange = this.getNumberAttr(this.playerEntity, 'interactRange', 3.2);

    // 1. Check nearby dynamic interactables (Portal Doors, Stage Screen, custom Editor interactables)
    let bestPrompt: NearbyPromptData | null = null;
    let bestDist = interactRange;

    for (const objEntity of this.dynamicInteractables) {
      if (!objEntity.enabled) continue;
      const interactId = this.getStringAttr(objEntity, 'interactId', '');
      if (!interactId) continue;
      const maxDist = this.getNumberAttr(objEntity, 'interactDistance', interactRange);
      const pos = objEntity.getPosition();
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d <= maxDist && d < bestDist) {
        bestDist = d;
        if (interactId.startsWith('load_scene:')) {
          const targetSceneId =
            this.getStringAttr(objEntity, 'targetSceneId', '') ||
            interactId.slice('load_scene:'.length);
          bestPrompt = {
            type: 'door',
            id: interactId,
            title: this.getStringAttr(objEntity, 'interactTitle', objEntity.name),
            targetSceneId,
          };
        } else {
          bestPrompt = {
            type: 'object',
            id: interactId,
            title: this.getStringAttr(objEntity, 'interactTitle', objEntity.name),
          };
        }
      }
    }

    // 2. Check nearby dynamic chairs placed in Editor
    for (const chairEntity of this.dynamicChairs) {
      if (!chairEntity.enabled || !this.getBoolAttr(chairEntity, 'isChair', true)) continue;
      const maxDist = this.getNumberAttr(chairEntity, 'interactDistance', 2.0);
      const cPos = chairEntity.getPosition();
      const d = Math.hypot(p.x - cPos.x, p.z - cPos.z);
      if (d <= maxDist && d - 0.25 < bestDist) {
        bestDist = d - 0.25;
        const seatOffset = this.getVec3Attr(chairEntity, 'seatOffset', [0, 0.83, 0]);
        this.tempSeatOffset.set(seatOffset[0], seatOffset[1], seatOffset[2]);
        chairEntity.getRotation().transformVector(this.tempSeatOffset, this.tempSeatOffset);
        const seatYawOffset = this.getNumberAttr(chairEntity, 'seatYawOffset', 0);
        const seatRotation = ((chairEntity.getEulerAngles().y + seatYawOffset) * Math.PI) / 180;
        const title = this.getStringAttr(chairEntity, 'sitTitle', chairEntity.name);
        const id = chairEntity.getGuid();
        bestPrompt = {
          type: 'chair',
          id,
          title,
          chair: {
            id,
            title,
            position: [cPos.x, cPos.y, cPos.z],
            seatPosition: [
              cPos.x + this.tempSeatOffset.x,
              cPos.y + this.tempSeatOffset.y,
              cPos.z + this.tempSeatOffset.z,
            ],
            seatRotation,
          },
        };
      }
    }

    // 3. Acoustic Stage Karaoke Zone (only when Acoustic_Stage exists in current scene)
    if (!bestPrompt && this.hasAcousticStage && this.karaoke.isOnRightStage(p.x, p.y, p.z)) {
      bestPrompt = {
        type: 'object',
        id: 'karaoke_stage',
        title: 'Sân Khấu Acoustic — Cầm Mic Hát Karaoke',
      };
    }

    this.lastPromptChair = bestPrompt?.type === 'chair' ? (bestPrompt.chair ?? null) : null;
    this.lastPromptDoorSceneId =
      bestPrompt?.type === 'door' ? (bestPrompt.targetSceneId ?? null) : null;

    const key = bestPrompt ? `${bestPrompt.type}:${bestPrompt.id}` : '';
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      this.emitProximity(bestPrompt);
    }
  }

  private emitProximity(prompt: NearbyPromptData | null): void {
    window.dispatchEvent(new CustomEvent('cavannghe:proximity', { detail: prompt }));
  }

  private playAnim(name: string): void {
    const anim = this.playerEntity?.anim;
    if (!anim || this.currentAnimState === name) return;
    const prev = this.currentAnimState;
    this.currentAnimState = name;
    try {
      anim.playing = true;
      const baseLayer = anim.baseLayer;
      if (baseLayer && baseLayer.states?.includes(name)) {
        if (!prev) {
          baseLayer.play(name);
        } else {
          baseLayer.transition(name, 0.18);
        }
      }
    } catch {
      /* Track name may differ in GLB; ignore cleanly */
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    this.keys.add(e.code);

    if (e.code === 'KeyV') {
      this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
      window.dispatchEvent(
        new CustomEvent('cavannghe:camera-mode', { detail: this.cameraMode })
      );
    }

    if (e.code === 'KeyE') {
      if (this.karaoke.isActive()) {
        this.exitKaraoke();
        return;
      }
      if (this.isSitting) {
        this.onStandUp();
        return;
      }
      if (this.lastPromptKey.startsWith('door:') && this.lastPromptDoorSceneId) {
        const targetSceneId = this.lastPromptDoorSceneId;
        window.dispatchEvent(
          new CustomEvent('cavannghe:load-scene', { detail: { sceneId: targetSceneId } })
        );
        return;
      }
      if (this.lastPromptKey === 'object:karaoke_stage' && this.playerEntity) {
        this.enterKaraoke();
        return;
      }
      if (this.lastPromptKey.startsWith('chair:')) {
        const ch = this.lastPromptChair;
        if (ch && this.playerEntity) {
          if (MultiplayerManager.getInstance().isChairOccupiedByOther(ch.id)) {
            return;
          }
          this.isSitting = true;
          this.currentSeatId = ch.id;
          this.activeSeatChair = ch;
          this.playerEntity.setLocalPosition(
            ch.seatPosition[0],
            ch.seatPosition[1] - 0.35,
            ch.seatPosition[2]
          );
          this.playerYaw = (ch.seatRotation * 180) / Math.PI;
          this.playerEntity.setLocalEulerAngles(0, this.playerYaw, 0);
          this.playAnim('Crouch_Idle_Loop');
          window.dispatchEvent(
            new CustomEvent('cavannghe:sit', { detail: { sitting: true, chair: ch } })
          );
        }
      } else if (this.lastPromptKey.startsWith('object:')) {
        const objId = this.lastPromptKey.slice(7);
        window.dispatchEvent(new CustomEvent('cavannghe:interact', { detail: objId }));
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.target !== this.canvas) return;
    if (this.karaoke.isActive()) {
      this.isKaraokeDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      return;
    }
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock?.();
    }
  };

  private onMouseUp = (): void => {
    this.isKaraokeDragging = false;
  };

  private onMouseLeave = (): void => {
    this.hasLastPointer = false;
  };

  private onPointerLockChange = (): void => {
    this.hasLastPointer = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.karaoke.isActive()) {
      if (!this.isKaraokeDragging) {
        this.hasLastPointer = false;
        return;
      }
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.yaw -= dx * 0.25 * this.cameraSensitivity;
      this.pitch = pc.math.clamp(this.pitch - dy * 0.2 * this.cameraSensitivity, -60, 45);
      return;
    }

    const isPointerLocked = document.pointerLockElement === this.canvas;
    if (!isPointerLocked && e.target !== this.canvas) {
      this.hasLastPointer = false;
      return;
    }

    let dx = 0;
    let dy = 0;
    if (isPointerLocked) {
      dx = e.movementX || 0;
      dy = e.movementY || 0;
    } else {
      if (!this.hasLastPointer) {
        this.hasLastPointer = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        return;
      }
      dx = e.clientX - this.lastPointerX;
      dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }

    this.yaw -= dx * 0.22 * this.cameraSensitivity;
    this.pitch = pc.math.clamp(this.pitch - dy * 0.18 * this.cameraSensitivity, -60, 45);
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (e.target !== this.canvas || this.lookTouchId !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    this.lookTouchId = touch.identifier;
    this.lastTouchX = touch.clientX;
    this.lastTouchY = touch.clientY;
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (this.lookTouchId === null) return;
    let activeTouch: Touch | null = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === this.lookTouchId) {
        activeTouch = e.touches[i];
        break;
      }
    }
    if (!activeTouch) return;
    e.preventDefault();
    const dx = activeTouch.clientX - this.lastTouchX;
    const dy = activeTouch.clientY - this.lastTouchY;
    this.lastTouchX = activeTouch.clientX;
    this.lastTouchY = activeTouch.clientY;
    this.yaw -= dx * 0.28 * this.cameraSensitivity;
    this.pitch = pc.math.clamp(this.pitch - dy * 0.22 * this.cameraSensitivity, -60, 45);
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (this.lookTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.lookTouchId) {
        this.lookTouchId = null;
        break;
      }
    }
  };

  private onCameraSensitivity = (e: CustomEvent<number>): void => {
    if (typeof e.detail === 'number' && Number.isFinite(e.detail)) {
      this.cameraSensitivity = Math.max(0.2, Math.min(3.0, e.detail));
    }
  };

  private onAvatarColor = (e: CustomEvent<string>): void => {
    if (typeof e.detail === 'string' && this.playerEntity) {
      applyAvatarColor(this.playerEntity, e.detail);
    }
  };

  private onMobileMove = (e: CustomEvent<{ x: number; y: number } | null>): void => {
    this.mobileMove = e.detail;
  };

  private onToggleCamera = (): void => {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
  };

  private onStandUp = (): void => {
    if (!this.isSitting || !this.playerEntity) return;
    const ch = this.activeSeatChair;
    if (ch) {
      this.playerEntity.setLocalPosition(ch.position[0] + 0.6, ch.position[1], ch.position[2]);
    }
    this.isSitting = false;
    this.currentSeatId = null;
    this.activeSeatChair = null;
    this.playAnim('Idle_Loop');
    window.dispatchEvent(new CustomEvent('cavannghe:sit', { detail: { sitting: false, chair: null } }));
  };

  private groundAt(x: number, z: number): number {
    let y = 0;
    const surfaces = [
      ...(this.hasMainStage ? MAIN_STAGE_SURFACES : []),
      ...(this.hasAcousticStage ? ACOUSTIC_STAGE_SURFACES : []),
    ];
    for (const s of surfaces) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ && s.y > y) {
        y = s.y;
      }
    }
    return y;
  }

  private detectRoomEnvironment(): void {
    this.hasMainStage = Boolean(this.sceneRoot.findByName('Main_Stage'));
    this.hasAcousticStage = Boolean(this.sceneRoot.findByName('Acoustic_Stage'));
    this.hasLobbyKiosk = Boolean(this.sceneRoot.findByName('Lobby_Hub_Kiosk'));
    this.collectCameraOccluders();

    const floorNames = ['Lobby Floor', 'Lounge Floor', 'TeaRoom Floor'];
    for (const name of floorNames) {
      const floor = this.sceneRoot.findByName(name);
      if (floor instanceof pc.Entity) {
        const pos = floor.getLocalPosition();
        const scale = floor.getLocalScale();
        const halfX = Math.max(2, scale.x * 0.5 - 0.6);
        const halfZ = Math.max(2, scale.z * 0.5 - 0.6);
        this.roomBounds = {
          minX: pos.x - halfX,
          maxX: pos.x + halfX,
          minZ: pos.z - halfZ,
          maxZ: pos.z + halfZ,
        };
        return;
      }
    }
  }

  private collectCameraOccluders(): void {
    const boxes: CameraOccluderBox[] = [];
    const pad = 0.22;

    const visit = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity && node !== this.sceneRoot) {
        const lower = node.name.toLowerCase();
        const isFloor = lower.includes('floor') || lower.includes('ceiling');
        const isBlockingName =
          lower.includes('wall') ||
          lower.includes('curtain') ||
          lower.includes('backdrop') ||
          lower.includes('drape') ||
          lower.includes('rem');
        const hasBoxCollider = node.collision?.type === 'box';

        if (!isFloor && (isBlockingName || hasBoxCollider)) {
          if (node.render && node.render.meshInstances.length > 0) {
            for (const mi of node.render.meshInstances) {
              const aabb = mi.aabb;
              const min = aabb.getMin();
              const max = aabb.getMax();
              if (max.y - min.y >= 1.2) {
                boxes.push({
                  minX: min.x - pad,
                  maxX: max.x + pad,
                  minY: min.y - pad,
                  maxY: max.y + pad,
                  minZ: min.z - pad,
                  maxZ: max.z + pad,
                });
              }
            }
          } else if (hasBoxCollider && node.collision) {
            const pos = node.getPosition();
            const he = node.collision.halfExtents;
            if (he && he.y * 2 >= 1.2) {
              boxes.push({
                minX: pos.x - he.x - pad,
                maxX: pos.x + he.x + pad,
                minY: pos.y - he.y - pad,
                maxY: pos.y + he.y + pad,
                minZ: pos.z - he.z - pad,
                maxZ: pos.z + he.z + pad,
              });
            }
          }
        }
      }
      for (const child of node.children) {
        visit(child);
      }
    };

    visit(this.sceneRoot);
    this.cameraOccluders = boxes;
  }

  private onPostUpdate = (): void => {
    this.karaoke.applyArmPose();
  };

  private enterKaraoke(): void {
    if (!this.playerEntity) return;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    DebugLogger.log('KaraokeStage', 'Local player entered Acoustic Karaoke Stage');
    const view = this.karaoke.enter(this.playerEntity);
    this.playerYaw = view.playerYaw;
    this.yaw = view.camYaw;
    this.pitch = view.camPitch;
    this.playAnim('Idle_Talking_Loop');
  }

  private exitKaraoke(): void {
    DebugLogger.log('KaraokeStage', 'Local player exited Acoustic Karaoke Stage');
    this.karaoke.exit();
    this.playAnim('Idle_Loop');
  }

  private onKaraokeExit = (): void => {
    this.exitKaraoke();
  };

  private onKaraokeStyle = (e: CustomEvent<'chill' | 'dance'>): void => {
    if (e.detail === 'chill' || e.detail === 'dance') {
      this.karaoke.setStyle(e.detail);
    }
  };

  private onEmote = (e: CustomEvent<string | null>): void => {
    const emote = e.detail;
    if (!emote) {
      this.playAnim('Idle_Loop');
      return;
    }
    const map: Record<string, string> = {
      dance: 'Dance_Loop',
      talk: 'Idle_Talking_Loop',
      interact: 'Interact',
      crouch: 'Crouch_Idle_Loop',
    };
    this.playAnim(map[emote] ?? 'Dance_Loop');
  };

  private collectDynamicTargets(): void {
    this.dynamicChairs = [];
    this.dynamicInteractables = [];
    const visit = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity) {
        const script = getEntityMeta(node).script;
        if (script?.enabled) {
          const hasChair = script.attributes.some(
            (a) => (a.name === 'isChair' && Boolean(a.value)) || a.name === 'seatOffset'
          );
          if (hasChair || node.tags.has('chair')) {
            this.dynamicChairs.push(node);
          }
          const hasInteractId = script.attributes.some(
            (a) => a.name === 'interactId' && typeof a.value === 'string' && a.value.trim().length > 0
          );
          if (hasInteractId) {
            this.dynamicInteractables.push(node);
          }
        }
      }
      for (const child of node.children) {
        visit(child);
      }
    };
    visit(this.sceneRoot);
  }

  private getAttrValue(entity: pc.Entity | null, name: string): unknown {
    if (!entity) return undefined;
    const script = getEntityMeta(entity).script;
    if (!script || !script.enabled) return undefined;
    return script.attributes.find((a) => a.name === name)?.value;
  }

  private getNumberAttr(entity: pc.Entity | null, name: string, fallback: number): number {
    const val = this.getAttrValue(entity, name);
    return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  }

  private getStringAttr(entity: pc.Entity | null, name: string, fallback: string): string {
    const val = this.getAttrValue(entity, name);
    return typeof val === 'string' && val.trim().length > 0 ? val : fallback;
  }

  private getBoolAttr(entity: pc.Entity | null, name: string, fallback: boolean): boolean {
    const val = this.getAttrValue(entity, name);
    return typeof val === 'boolean' ? val : fallback;
  }

  private getVec3Attr(
    entity: pc.Entity | null,
    name: string,
    fallback: [number, number, number]
  ): [number, number, number] {
    const val = this.getAttrValue(entity, name);
    if (
      Array.isArray(val) &&
      val.length >= 3 &&
      typeof val[0] === 'number' &&
      typeof val[1] === 'number' &&
      typeof val[2] === 'number'
    ) {
      return [val[0], val[1], val[2]];
    }
    return fallback;
  }

  private disablePlayerFrustumCulling(node: pc.GraphNode): void {
    if (node instanceof pc.Entity && node.render) {
      for (const mi of node.render.meshInstances) {
        mi.cull = false;
      }
    }
    for (const child of node.children) {
      this.disablePlayerFrustumCulling(child);
    }
  }

  private findByTagOrName(root: pc.Entity, tag: string, name: string): pc.Entity | null {
    if (root.tags.has(tag) || root.name === name) return root;
    for (const child of root.children) {
      if (child instanceof pc.Entity) {
        const found = this.findByTagOrName(child, tag, name);
        if (found) return found;
      }
    }
    return null;
  }

  private findMainCamera(root: pc.Entity): pc.Entity | null {
    if (root.camera) return root;
    for (const child of root.children) {
      if (child instanceof pc.Entity) {
        const found = this.findMainCamera(child);
        if (found) return found;
      }
    }
    return null;
  }
}
