import * as pc from 'playcanvas';
import { MultiplayerManager, type RemotePlayerState } from '../../network/MultiplayerManager';
import {
  applyAvatarColor,
  getAvatarModelPreset,
  normalizeAvatarModelId,
  type AvatarModelId,
} from '../../utils/avatarColor';
import { DebugLogger } from '../../utils/debugLogger';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';

export interface NameplateEntry {
  id: string;
  name: string;
  x: number;
  y: number;
  isHost: boolean;
  isAdmin: boolean;
  distance?: number;
  isLocal?: boolean;
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
  avatarColor?: string;
  avatarModel: AvatarModelId;
  lastSeq: number;
  snapshots: SnapshotSample[];
}

const INTERP_BUFFER_MS = 95; // 95ms render delay absorbs network jitter cleanly
const MAX_EXTRAPOLATE_SEC = 0.18;

const _headWorld = new pc.Vec3();
const _headScreen = new pc.Vec3();
const avatarHeadOffsetCache = new WeakMap<pc.Entity, { scaleY: number; offset: number }>();

function getAvatarHeadOffset(entity: pc.Entity): number {
  const currentScaleY = Math.abs(entity.getLocalScale().y) || 1;
  const cached = avatarHeadOffsetCache.get(entity);
  if (cached && Math.abs(cached.scaleY - currentScaleY) < 0.001) {
    return cached.offset;
  }

  const entityPosY = entity.getPosition().y;
  let maxAabbY = -Infinity;
  const renderComps = entity.findComponents('render') as pc.RenderComponent[];
  for (const rc of renderComps) {
    for (const mi of rc.meshInstances) {
      const aabb = mi.aabb;
      if (aabb && Number.isFinite(aabb.center.y) && aabb.halfExtents.y > 0.01) {
        const topY = aabb.center.y + aabb.halfExtents.y;
        if (topY > maxAabbY) {
          maxAabbY = topY;
        }
      }
    }
  }
  const aabbHeight = Number.isFinite(maxAabbY) ? maxAabbY - entityPosY : 0;

  let headBoneHeight = 0;
  const stack: pc.GraphNode[] = [entity];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const name = node.name || '';
    const lower = name.toLowerCase();
    if (!lower.includes('headphone') && !lower.includes('overhead')) {
      if (/(^|[:_.-])(headtop|head_end|head)([:_.-]|\d|$)/i.test(name)) {
        const yDiff = node.getPosition().y - entityPosY;
        const pad = lower.includes('headtop') || lower.includes('end') ? 0.12 : 0.26;
        const candidate = yDiff + pad;
        if (candidate > headBoneHeight) {
          headBoneHeight = candidate;
        }
      }
    }
    for (const child of node.children) {
      stack.push(child);
    }
  }

  if (aabbHeight > 0.25 || headBoneHeight > 0.25) {
    const rawHeight = Math.max(aabbHeight > 0.25 ? aabbHeight + 0.14 : 0, headBoneHeight);
    const offset = pc.math.clamp(rawHeight, 0.75, 4.0);
    avatarHeadOffsetCache.set(entity, { scaleY: currentScaleY, offset });
    return offset;
  }

  return currentScaleY * 1.98;
}

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
  private modelBufferPromises = new Map<string, Promise<ArrayBuffer | null>>();
  private cachedActiveCamera: pc.Entity | null = null;
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
        DebugLogger.log('RemotePlayerPool', `Despawning remote avatar "${avatar.name}" (${id})`);
        avatar.entity.destroy();
        avatar.destroyResources();
        this.avatars.delete(id);
      }
    }

    // 2. Push new snapshots for active remote players
    for (const [id, state] of remotes.entries()) {
      const existing = this.avatars.get(id);
      const nextModel = normalizeAvatarModelId(state.avatarModel);
      if (existing) {
        if (existing.avatarModel !== nextModel && !this.spawningIds.has(id)) {
          existing.entity.destroy();
          existing.destroyResources();
          this.avatars.delete(id);
          this.spawningIds.add(id);
          void this.spawnAvatar(state);
          continue;
        }
        existing.name = state.name;
        if (state.avatarColor && state.avatarColor !== existing.avatarColor) {
          existing.avatarColor = state.avatarColor;
          applyAvatarColor(existing.entity, state.avatarColor, existing.avatarModel);
        }
        if (state.seq !== existing.lastSeq) {
          existing.lastSeq = state.seq;
          const rawVx = state.vx ?? 0;
          const rawVz = state.vz ?? 0;
          const speed = Math.hypot(rawVx, rawVz);
          // Guard against teleport finite-difference spikes exceeding max run speed
          const safeVx = speed <= 9.0 ? rawVx : 0;
          const safeVz = speed <= 9.0 ? rawVz : 0;
          existing.snapshots.push({
            x: state.x,
            y: state.y,
            z: state.z,
            vx: safeVx,
            vz: safeVz,
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
    let sig = '';

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
        const avatarHeadOffset = getAvatarHeadOffset(avatar.entity);
        _headWorld.set(
          avatar.currentPos.x,
          avatar.currentPos.y + avatarHeadOffset,
          avatar.currentPos.z
        );
        cam.camera.worldToScreen(_headWorld, _headScreen);
        if (_headScreen.z > 0.2 && _headScreen.z < 45) {
          const sx = Math.round(_headScreen.x);
          const sy = Math.round(_headScreen.y);
          const isHost = avatar.id === hostId;
          const isAdmin = Boolean(
            status.players.find((p) => p.id === avatar.id)?.isAdmin ||
              remotes.get(avatar.id)?.isAdmin
          );
          nameplates.push({
            id: avatar.id,
            name: avatar.name,
            x: sx,
            y: sy,
            isHost,
            isAdmin,
            distance: _headScreen.z,
          });
          if (sig) sig += '|';
          sig += `${avatar.id}:${sx},${sy},${isHost ? 1 : 0},${isAdmin ? 1 : 0}`;
        }
      }
    }

    // Also project local player head position for overhead chat bubbles
    if (cam?.camera) {
      const localPlayer =
        (this.sceneRoot.findByTag('player')[0] as pc.Entity | undefined) ??
        (this.sceneRoot.findByName('Player') as pc.Entity | null);
      if (localPlayer) {
        const lp = localPlayer.getPosition();
        const localHeadOffset = getAvatarHeadOffset(localPlayer);
        _headWorld.set(lp.x, lp.y + localHeadOffset, lp.z);
        cam.camera.worldToScreen(_headWorld, _headScreen);
        if (_headScreen.z > 0.2 && _headScreen.z < 45) {
          const sx = Math.round(_headScreen.x);
          const sy = Math.round(_headScreen.y);
          const localId = mp.getLocalPlayerId();
          nameplates.push({
            id: localId,
            name: '',
            x: sx,
            y: sy,
            isHost: status.isHost,
            isAdmin: status.localIsAdmin,
            distance: _headScreen.z,
            isLocal: true,
          });
          if (sig) sig += '|';
          sig += `${localId}:${sx},${sy}:local`;
        }
      }
    }

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
    const isStationaryAnim =
      latest.anim === 'Idle_Loop' ||
      latest.anim === 'Idle_Talking_Loop' ||
      latest.anim === 'Singing' ||
      latest.anim === 'Dance_Loop' ||
      latest.anim === 'Samba_Dancing' ||
      latest.anim === 'Slide_Hip_Hop_Dance' ||
      latest.anim === 'Swing_Dancing' ||
      latest.anim === 'Crouch_Idle_Loop';
    if (
      renderTime > latest.recvTime &&
      !latest.isSitting &&
      !isStationaryAnim &&
      (Math.abs(latest.vx) > 0.05 || Math.abs(latest.vz) > 0.05)
    ) {
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

  private async getModelBuffer(url: string): Promise<ArrayBuffer | null> {
    let promise = this.modelBufferPromises.get(url);
    if (!promise) {
      promise = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.modelBufferPromises.set(url, promise);
    }
    return promise;
  }

  private async spawnAvatar(state: RemotePlayerState): Promise<void> {
    try {
      const preset = getAvatarModelPreset(state.avatarModel);
      const buf = await this.getModelBuffer(preset.url);
      if (!buf) {
        DebugLogger.warn('RemotePlayerPool', `Cannot spawn remote player "${state.name}": ${preset.filename} failed to load`);
        return;
      }
      if (this.destroyed) return;

      const loaded = await loadGlbFromArrayBuffer(
        this.app,
        buf,
        preset.filename,
        preset.url
      );
      if (this.destroyed) {
        loaded.entity.destroy();
        loaded.destroyResources();
        return;
      }

      const entity = loaded.entity;
      entity.name = `RemotePlayer_${state.id}`;
      entity.setLocalScale(preset.scale, preset.scale, preset.scale);

      entity.setLocalPosition(state.x, state.y, state.z);
      entity.setLocalEulerAngles(0, state.yaw, 0);
      applyAvatarColor(entity, state.avatarColor, preset.id);

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
        avatarColor: state.avatarColor,
        avatarModel: preset.id,
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
      DebugLogger.log('RemotePlayerPool', `Spawned remote avatar "${state.name}" (${state.id})`);
    } catch (err) {
      DebugLogger.error('RemotePlayerPool', `Failed spawning remote avatar "${state.name}" (${state.id})`, err);
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
        } else if (target === 'Dance_Loop' && layer.states.includes('Samba_Dancing')) {
          target = 'Samba_Dancing';
        } else if (target === 'Singing' && layer.states.includes('Idle_Talking_Loop')) {
          target = 'Idle_Talking_Loop';
        } else if (
          (target === 'Samba_Dancing' || target === 'Slide_Hip_Hop_Dance' || target === 'Swing_Dancing') &&
          layer.states.includes('Dance_Loop')
        ) {
          target = 'Dance_Loop';
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
    const cached = this.cachedActiveCamera;
    if (cached && cached.parent && cached.enabled && cached.camera?.enabled) {
      return cached;
    }
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
    const resolved = walk(this.sceneRoot) ?? fallback;
    this.cachedActiveCamera = resolved;
    return resolved;
  }
}
