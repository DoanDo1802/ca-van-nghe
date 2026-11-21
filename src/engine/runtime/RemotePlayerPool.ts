import * as pc from 'playcanvas';
import { MultiplayerManager, type RemotePlayerState } from '../../network/MultiplayerManager';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';

export interface NameplateEntry {
  id: string;
  name: string;
  x: number;
  y: number;
  isHost: boolean;
}

interface SnapshotSample {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  anim: string;
  isSitting: boolean;
  recvTime: number;
}

interface RemoteAvatarInstance {
  id: string;
  name: string;
  entity: pc.Entity;
  destroyResources: () => void;
  currentPos: pc.Vec3;
  desiredPos: pc.Vec3;
  currentYaw: number;
  desiredYaw: number;
  currentAnim: string;
  pendingAnim: string;
  lastSeq: number;
  snapshots: SnapshotSample[];
}

const INTERP_BUFFER_MS = 95; // 95ms render delay absorbs network jitter cleanly
const MAX_EXTRAPOLATE_SEC = 0.18;

const _headWorld = new pc.Vec3();
const _headScreen = new pc.Vec3();

function lerpAngleDeg(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
}

/**
 * Spawns, animates, and smoothly interpolates remote players in PlayCanvas Play Mode
 * using a Snapshot Interpolation Buffer + Velocity Dead-Reckoning.
 */
export class RemotePlayerPool {
  private readonly app: pc.Application;
  private readonly sceneRoot: pc.Entity;

  private avatars = new Map<string, RemoteAvatarInstance>();
  private spawningIds = new Set<string>();
  private charBufferPromise: Promise<ArrayBuffer | null> | null = null;
  private destroyed = false;
  private lastNameplateSig = '';

  constructor(app: pc.Application, sceneRoot: pc.Entity) {
    this.app = app;
    this.sceneRoot = sceneRoot;
  }

  update(dt: number): void {
    if (this.destroyed) return;

    const now = performance.now();
    const renderTime = now - INTERP_BUFFER_MS;
    const mp = MultiplayerManager.getInstance();
    const remotes = mp.getRemotePlayers();
    const status = mp.getRoomStatus();
    const hostId = status.hostId;

    // 1. Despawn players who left
    for (const [id, avatar] of this.avatars.entries()) {
      if (!remotes.has(id)) {
        avatar.entity.destroy();
        avatar.destroyResources();
        this.avatars.delete(id);
      }
    }

    // 2. Push new snapshots for active remote players
    for (const [id, state] of remotes.entries()) {
      const existing = this.avatars.get(id);
      if (existing) {
        existing.name = state.name;
        if (state.seq !== existing.lastSeq) {
          existing.lastSeq = state.seq;
          existing.snapshots.push({
            x: state.x,
            y: state.y,
            z: state.z,
            vx: state.vx ?? 0,
            vz: state.vz ?? 0,
            yaw: state.yaw,
            anim: state.anim || 'Idle_Loop',
            isSitting: state.isSitting,
            recvTime: now,
          });
          if (existing.snapshots.length > 12) {
            existing.snapshots.shift();
          }
        }
      } else if (!this.spawningIds.has(id)) {
        this.spawningIds.add(id);
        void this.spawnAvatar(state);
      }
    }

    // 3. Evaluate Snapshot Interpolation Buffer + smooth micro-damping at 60fps
    const clampedDt = Math.min(dt, 0.05);
    const microAlpha = 1 - Math.exp(-26 * clampedDt);
    const cam = this.findActiveCamera();
    const nameplates: NameplateEntry[] = [];

    for (const avatar of this.avatars.values()) {
      this.sampleSnapshots(avatar, renderTime);

      const jumpDist = avatar.currentPos.distance(avatar.desiredPos);
      if (jumpDist > 3.5) {
        avatar.currentPos.copy(avatar.desiredPos);
        avatar.currentYaw = avatar.desiredYaw;
      } else {
        avatar.currentPos.lerp(avatar.currentPos, avatar.desiredPos, microAlpha);
        avatar.currentYaw = lerpAngleDeg(avatar.currentYaw, avatar.desiredYaw, microAlpha);
      }

      avatar.entity.setLocalPosition(avatar.currentPos);
      avatar.entity.setLocalEulerAngles(0, avatar.currentYaw, 0);

      if (avatar.pendingAnim !== avatar.currentAnim) {
        this.playAnim(avatar, avatar.pendingAnim);
      }

      if (cam?.camera) {
        _headWorld.set(
          avatar.currentPos.x,
          avatar.currentPos.y + 2.05,
          avatar.currentPos.z
        );
        cam.camera.worldToScreen(_headWorld, _headScreen);
        if (_headScreen.z > 0.2 && _headScreen.z < 45) {
          nameplates.push({
            id: avatar.id,
            name: avatar.name,
            x: Math.round(_headScreen.x),
            y: Math.round(_headScreen.y),
            isHost: avatar.id === hostId,
          });
        }
      }
    }

    const sig = nameplates
      .map((n) => `${n.id}:${n.x},${n.y},${n.isHost ? 1 : 0}`)
      .join('|');
    if (sig !== this.lastNameplateSig) {
      this.lastNameplateSig = sig;
      window.dispatchEvent(
        new CustomEvent<NameplateEntry[]>('cavannghe:remote-nameplates', {
          detail: nameplates,
        })
      );
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const avatar of this.avatars.values()) {
      avatar.entity.destroy();
      avatar.destroyResources();
    }
    this.avatars.clear();
    this.spawningIds.clear();
    window.dispatchEvent(
      new CustomEvent<NameplateEntry[]>('cavannghe:remote-nameplates', { detail: [] })
    );
  }

  private sampleSnapshots(avatar: RemoteAvatarInstance, renderTime: number): void {
    const snaps = avatar.snapshots;
    if (snaps.length === 0) return;

    // Trim snapshots older than the one immediately preceding renderTime
    while (snaps.length >= 3 && snaps[1].recvTime <= renderTime) {
      snaps.shift();
    }

    if (snaps.length >= 2 && snaps[0].recvTime <= renderTime && renderTime <= snaps[1].recvTime) {
      const s0 = snaps[0];
      const s1 = snaps[1];
      const span = Math.max(1, s1.recvTime - s0.recvTime);
      const t = (renderTime - s0.recvTime) / span;

      const dist = Math.hypot(s1.x - s0.x, s1.z - s0.z);
      if (s1.isSitting || dist > 3.5) {
        avatar.desiredPos.set(s1.x, s1.y, s1.z);
        avatar.desiredYaw = s1.yaw;
      } else {
        avatar.desiredPos.set(
          s0.x + (s1.x - s0.x) * t,
          s0.y + (s1.y - s0.y) * t,
          s0.z + (s1.z - s0.z) * t
        );
        avatar.desiredYaw = lerpAngleDeg(s0.yaw, s1.yaw, t);
      }
      avatar.pendingAnim = s1.anim;
      return;
    }

    // Either before first snapshot or slightly past latest snapshot -> extrapolate gently
    const latest = snaps[snaps.length - 1];
    if (renderTime > latest.recvTime && !latest.isSitting) {
      const extraSec = Math.min(MAX_EXTRAPOLATE_SEC, (renderTime - latest.recvTime) / 1000);
      avatar.desiredPos.set(
        latest.x + latest.vx * extraSec,
        latest.y,
        latest.z + latest.vz * extraSec
      );
    } else {
      avatar.desiredPos.set(latest.x, latest.y, latest.z);
    }
    avatar.desiredYaw = latest.yaw;
    avatar.pendingAnim = latest.anim;
  }

  private async getCharacterBuffer(): Promise<ArrayBuffer | null> {
    if (!this.charBufferPromise) {
      this.charBufferPromise = fetch('/models/Character.glb')
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
    }
    return this.charBufferPromise;
  }

  private async spawnAvatar(state: RemotePlayerState): Promise<void> {
    try {
      const buf = await this.getCharacterBuffer();
      if (!buf || this.destroyed) return;

      const loaded = await loadGlbFromArrayBuffer(
        this.app,
        buf,
        'Character.glb',
        '/models/Character.glb'
      );
      if (this.destroyed) {
        loaded.entity.destroy();
        loaded.destroyResources();
        return;
      }

      const entity = loaded.entity;
      entity.name = `RemotePlayer_${state.id}`;

      const localPlayer = this.sceneRoot.findByName('Player');
      if (localPlayer) {
        const s = localPlayer.getLocalScale();
        entity.setLocalScale(s.x, s.y, s.z);
      } else {
        entity.setLocalScale(0.62, 0.62, 0.62);
      }

      entity.setLocalPosition(state.x, state.y, state.z);
      entity.setLocalEulerAngles(0, state.yaw, 0);

      entity.findComponents('render').forEach((comp) => {
        const rc = comp as pc.RenderComponent;
        rc.castShadows = false;
        for (const mi of rc.meshInstances) {
          mi.cull = false;
        }
      });

      if (entity.anim) {
        entity.anim.activate = true;
        entity.anim.enabled = true;
        entity.anim.playing = true;
      }

      this.sceneRoot.addChild(entity);

      const avatar: RemoteAvatarInstance = {
        id: state.id,
        name: state.name,
        entity,
        destroyResources: loaded.destroyResources,
        currentPos: new pc.Vec3(state.x, state.y, state.z),
        desiredPos: new pc.Vec3(state.x, state.y, state.z),
        currentYaw: state.yaw,
        desiredYaw: state.yaw,
        currentAnim: '',
        pendingAnim: state.anim || 'Idle_Loop',
        lastSeq: state.seq,
        snapshots: [
          {
            x: state.x,
            y: state.y,
            z: state.z,
            vx: state.vx ?? 0,
            vz: state.vz ?? 0,
            yaw: state.yaw,
            anim: state.anim || 'Idle_Loop',
            isSitting: state.isSitting,
            recvTime: performance.now(),
          },
        ],
      };

      this.playAnim(avatar, avatar.pendingAnim);
      this.avatars.set(state.id, avatar);
    } finally {
      this.spawningIds.delete(state.id);
    }
  }

  private playAnim(avatar: RemoteAvatarInstance, animName: string): void {
    const anim = avatar.entity.anim;
    if (!anim) return;
    try {
      anim.playing = true;
      const layer = anim.baseLayer;
      if (!layer || !layer.states || layer.states.length === 0) return;

      let target = animName;
      let speed = 1;
      if (!layer.states.includes(target)) {
        if (target === 'Running' && layer.states.includes('Walk_Loop')) {
          target = 'Walk_Loop';
          speed = 1.5;
        } else if ((target === 'Jumping' || target === 'JumpWhileRun') && layer.states.includes('Idle_Loop')) {
          target = 'Idle_Loop';
        } else if (layer.states.includes('Idle_Loop')) {
          target = 'Idle_Loop';
        } else {
          target = layer.states[0];
        }
      }

      anim.speed = speed;
      const prev = avatar.currentAnim;
      avatar.currentAnim = animName;
      if (!prev) {
        layer.play(target);
      } else {
        layer.transition(target, 0.15);
      }
    } catch {
      // retry next frame if anim layer not ready yet
    }
  }

  private findActiveCamera(): pc.Entity | null {
    let fallback: pc.Entity | null = null;
    const walk = (node: pc.Entity): pc.Entity | null => {
      if (node.camera && node.enabled) {
        if (node.name === 'Main Camera' || node.name === 'Player Camera') return node;
        if (!fallback) fallback = node;
      }
      for (const child of node.children) {
        if (child instanceof pc.Entity) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(this.sceneRoot) ?? fallback;
  }
}
