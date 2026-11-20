import * as pc from 'playcanvas';
import { CHAIRS_LIST, INTERACTABLES_LIST } from '../../data/sceneData';

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

const STAGE_SURFACES: StageSurface[] = [
  { minX: -7.32, maxX: 7.32, minZ: -8.06, maxZ: -7.56, y: 0.12 },
  { minX: -7.42, maxX: 7.42, minZ: -8.51, maxZ: -8.0, y: 0.24 },
  { minX: -7.5, maxX: 7.5, minZ: -16.9, maxZ: -8.45, y: 0.36 },
  { minX: 14.38, maxX: 14.98, minZ: -1.45, maxZ: 7.45, y: 0.18 },
  { minX: 14.92, maxX: 18.92, minZ: -1.75, maxZ: 7.75, y: 0.36 },
];

const STAGE_SOLIDS: SolidBox[] = [
  { minX: 16.35, maxX: 18.3, minZ: -0.72, maxZ: 1.12 },
  { minX: 16.4, maxX: 18.28, minZ: 3.68, maxZ: 6.05 },
  { minX: 18.02, maxX: 18.55, minZ: 1.55, maxZ: 3.82 },
  { minX: -7.5, maxX: -5.38, minZ: -16.58, maxZ: -14.7 },
  { minX: 5.38, maxX: 7.5, minZ: -16.58, maxZ: -14.7 },
  { minX: -7.5, maxX: -5.38, minZ: -10.85, maxZ: -8.95 },
  { minX: 5.38, maxX: 7.5, minZ: -10.85, maxZ: -8.95 },
];

const STAGE_RADIUS = 0.25;
const WALK_SPEED = 4.5;
const RUN_SPEED = 7.5;
const JUMP_VELOCITY = 6.2;
const GRAVITY = -18.0;

function groundAt(x: number, z: number): number {
  let y = 0;
  for (const s of STAGE_SURFACES) {
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ && s.y > y) {
      y = s.y;
    }
  }
  return y;
}

export interface NearbyPromptData {
  type: 'chair' | 'object';
  id: string;
  title: string;
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
  private pitch = -12;
  private cameraMode: 'third' | 'first' = 'third';
  private velocityY = 0;
  private grounded = true;
  private isSitting = false;
  private currentSeatId: string | null = null;
  private currentAnimState = '';

  private readonly keys = new Set<string>();
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private mobileMove: { x: number; y: number } | null = null;
  private lastPromptKey = '';
  private destroyed = false;

  private readonly tempPos = new pc.Vec3();

  constructor(sceneRoot: pc.Entity, canvas: HTMLCanvasElement) {
    this.sceneRoot = sceneRoot;
    this.canvas = canvas;
  }

  start(): boolean {
    this.playerEntity = this.findByTagOrName(this.sceneRoot, 'player', 'Player');
    this.cameraEntity = this.findMainCamera(this.sceneRoot);
    if (!this.playerEntity || !this.cameraEntity) {
      return false;
    }

    const rot = this.playerEntity.getLocalEulerAngles();
    this.yaw = rot.y || 180;

    if (this.playerEntity.anim) {
      this.playerEntity.anim.activate = true;
      this.playerEntity.anim.enabled = true;
      this.playAnim('Idle_Loop');
    }

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('cavannghe:mobile-move', this.onMobileMove as EventListener);
    window.addEventListener('cavannghe:toggle-camera', this.onToggleCamera);
    window.addEventListener('cavannghe:stand-up', this.onStandUp);
    window.addEventListener('cavannghe:emote', this.onEmote as EventListener);

    this.updateCameraTransform(1);
    return true;
  }

  update(dt: number): void {
    if (this.destroyed || !this.playerEntity || !this.cameraEntity) return;
    const clampedDt = Math.min(dt, 0.05);

    if (!this.isSitting) {
      this.updateMovement(clampedDt);
    }

    this.updateCameraTransform(1 - Math.exp(-12 * clampedDt));
    this.updateProximity();
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('cavannghe:mobile-move', this.onMobileMove as EventListener);
    window.removeEventListener('cavannghe:toggle-camera', this.onToggleCamera);
    window.removeEventListener('cavannghe:stand-up', this.onStandUp);
    window.removeEventListener('cavannghe:emote', this.onEmote as EventListener);
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

    const len = Math.hypot(forwardInput, rightInput);
    const isMoving = len > 0.05;
    if (isMoving) {
      const nf = forwardInput / Math.max(1, len);
      const nr = rightInput / Math.max(1, len);
      const isRunning = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = isRunning ? RUN_SPEED : WALK_SPEED;

      const yawRad = (this.yaw * Math.PI) / 180;
      const fwdX = -Math.sin(yawRad);
      const fwdZ = -Math.cos(yawRad);
      const rgtX = Math.cos(yawRad);
      const rgtZ = -Math.sin(yawRad);

      const moveX = (fwdX * nf + rgtX * nr) * speed * dt;
      const moveZ = (fwdZ * nf + rgtZ * nr) * speed * dt;

      x = pc.math.clamp(x + moveX, -18.2, 18.2);
      z = pc.math.clamp(z + moveZ, -16.2, 16.2);

      // Resolve solid boxes on stage
      for (const box of STAGE_SOLIDS) {
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
      this.playerEntity.setLocalEulerAngles(0, targetYaw, 0);

      this.playAnim(isRunning ? 'Walk_Formal_Loop' : 'Walk_Loop');
    } else if (this.grounded) {
      this.playAnim('Idle_Loop');
    }

    // Gravity & step-up
    const floorY = groundAt(x, z);
    if (this.grounded && this.keys.has('Space')) {
      this.velocityY = JUMP_VELOCITY;
      this.grounded = false;
    }

    if (!this.grounded) {
      this.velocityY += GRAVITY * dt;
      y += this.velocityY * dt;
      if (y <= floorY) {
        y = floorY;
        this.velocityY = 0;
        this.grounded = true;
      }
    } else {
      y += (floorY - y) * Math.min(1, dt * 15);
    }

    this.playerEntity.setLocalPosition(x, y, z);
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

    const dist = 3.6;
    const horiz = dist * Math.cos(pitchRad);
    const camX = p.x + Math.sin(yawRad) * horiz;
    const camY = Math.max(0.4, p.y + 1.5 - Math.sin(pitchRad) * dist);
    const camZ = p.z + Math.cos(yawRad) * horiz;

    const cur = this.cameraEntity.getLocalPosition();
    this.tempPos.set(
      pc.math.lerp(cur.x, camX, alpha),
      pc.math.lerp(cur.y, camY, alpha),
      pc.math.lerp(cur.z, camZ, alpha)
    );
    this.cameraEntity.setLocalPosition(this.tempPos);
    this.cameraEntity.lookAt(p.x, p.y + 1.15, p.z);
  }

  private updateProximity(): void {
    if (!this.playerEntity) return;
    const p = this.playerEntity.getLocalPosition();

    // 1. Check nearby interactables
    let bestPrompt: NearbyPromptData | null = null;
    let bestDist = 3.2;

    for (const obj of INTERACTABLES_LIST) {
      const dx = p.x - obj.position[0];
      const dz = p.z - obj.position[2];
      const d = Math.hypot(dx, dz);
      if (d < bestDist) {
        bestDist = d;
        bestPrompt = { type: 'object', id: obj.id, title: obj.title };
      }
    }

    // 2. Check nearby chairs (CHAIRS_LIST + entities tagged 'chair' / 'Bar_Chair')
    if (!bestPrompt) {
      let bestChairDist = 2.0;
      for (const ch of CHAIRS_LIST) {
        const d = Math.hypot(p.x - ch.position[0], p.z - ch.position[2]);
        if (d < bestChairDist) {
          bestChairDist = d;
          bestPrompt = {
            type: 'chair',
            id: ch.id,
            title: ch.title,
            chair: {
              id: ch.id,
              title: ch.title,
              position: ch.position as [number, number, number],
              seatPosition: ch.seatPosition as [number, number, number],
              seatRotation: ch.seatRotation,
            },
          };
        }
      }
    }

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
    this.currentAnimState = name;
    try {
      const baseLayer = anim.baseLayer;
      if (baseLayer && baseLayer.states?.includes(name)) {
        baseLayer.transition(name, 0.18);
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
      if (this.isSitting) {
        this.onStandUp();
        return;
      }
      if (this.lastPromptKey.startsWith('chair:')) {
        const chairId = this.lastPromptKey.slice(6);
        const ch = CHAIRS_LIST.find((c) => c.id === chairId);
        if (ch && this.playerEntity) {
          this.isSitting = true;
          this.currentSeatId = ch.id;
          this.playerEntity.setLocalPosition(
            ch.seatPosition[0],
            ch.seatPosition[1] - 0.35,
            ch.seatPosition[2]
          );
          this.playerEntity.setLocalEulerAngles(0, (ch.seatRotation * 180) / Math.PI, 0);
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
    if (e.button === 0 || e.button === 2) {
      this.isDraggingLook = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDraggingLook) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.yaw -= dx * 0.28;
    this.pitch = pc.math.clamp(this.pitch - dy * 0.22, -60, 45);
  };

  private onMouseUp = (): void => {
    this.isDraggingLook = false;
  };

  private onMobileMove = (e: CustomEvent<{ x: number; y: number } | null>): void => {
    this.mobileMove = e.detail;
  };

  private onToggleCamera = (): void => {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
  };

  private onStandUp = (): void => {
    if (!this.isSitting || !this.playerEntity) return;
    const ch = CHAIRS_LIST.find((c) => c.id === this.currentSeatId);
    if (ch) {
      this.playerEntity.setLocalPosition(ch.position[0] + 0.6, 0, ch.position[2]);
    }
    this.isSitting = false;
    this.currentSeatId = null;
    this.playAnim('Idle_Loop');
    window.dispatchEvent(new CustomEvent('cavannghe:sit', { detail: { sitting: false, chair: null } }));
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
