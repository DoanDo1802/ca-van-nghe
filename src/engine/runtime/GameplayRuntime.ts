import * as pc from 'playcanvas';
import { AssetRepository } from '../../storage';
import type {
  AudioSourceComponentData,
  CameraRigComponentData,
  CharacterControllerComponentData,
  EditorEventMap,
  InteractableComponentData,
  ParticleSystemComponentData,
} from '../../types';
import type { EventBus } from '../EventBus';
import { getEntityMeta } from '../serialization/EntityComponentHelper';
import { isAmmoLoaded } from '../serialization/AmmoLoader';
import type { ConsoleBridge } from './ConsoleBridge';

export interface GameplayRuntimeOptions {
  app: pc.Application;
  sceneRoot: pc.Entity;
  canvas: HTMLCanvasElement;
  eventBus: EventBus<EditorEventMap>;
  consoleBridge: ConsoleBridge;
  getEntityById: (id: string) => pc.Entity | null;
  emitCustomEvent: (eventName: string, payload?: unknown) => void;
}

interface CharacterState {
  entity: pc.Entity;
  data: CharacterControllerComponentData;
  yaw: number;
  pitch: number;
  vy: number;
  grounded: boolean;
  isSitting: boolean;
  standReturnPos: pc.Vec3 | null;
  cameraEntity: pc.Entity | null;
}

interface CameraRigState {
  entity: pc.Entity;
  data: CameraRigComponentData;
  yaw: number;
  pitch: number;
  distance: number;
}

interface AudioInstanceState {
  entity: pc.Entity;
  data: AudioSourceComponentData;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  pannerNode: PannerNode | null;
  started: boolean;
}

interface ParticleUnit {
  entity: pc.Entity;
  mat: pc.StandardMaterial;
  vel: pc.Vec3;
  age: number;
  lifetime: number;
}

interface ParticleEmitterState {
  entity: pc.Entity;
  data: ParticleSystemComponentData;
  container: pc.Entity;
  pool: ParticleUnit[];
  spawnAcc: number;
  elapsed: number;
}

export class GameplayRuntime {
  private readonly app: pc.Application;
  private readonly sceneRoot: pc.Entity;
  private readonly canvas: HTMLCanvasElement;
  private readonly eventBus: EventBus<EditorEventMap>;
  private readonly consoleBridge: ConsoleBridge;
  private readonly getEntityById: (id: string) => pc.Entity | null;
  private readonly emitCustomEvent: (eventName: string, payload?: unknown) => void;

  private characters: CharacterState[] = [];
  private cameraRigs: CameraRigState[] = [];
  private audioInstances: AudioInstanceState[] = [];
  private particleEmitters: ParticleEmitterState[] = [];
  private interactables: Array<{ entity: pc.Entity; data: InteractableComponentData }> = [];

  private audioCtx: AudioContext | null = null;
  private audioBuffers = new Map<string, AudioBuffer>();
  private particleMaterials: pc.StandardMaterial[] = [];

  private keys = new Set<string>();
  private joystickX = 0;
  private joystickY = 0;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private activePromptEntityId: string | null = null;
  private paused = false;
  private destroyed = false;

  constructor(options: GameplayRuntimeOptions) {
    this.app = options.app;
    this.sceneRoot = options.sceneRoot;
    this.canvas = options.canvas;
    this.eventBus = options.eventBus;
    this.consoleBridge = options.consoleBridge;
    this.getEntityById = options.getEntityById;
    this.emitCustomEvent = options.emitCustomEvent;
  }

  hasCharacterControllers(): boolean {
    return this.characters.length > 0;
  }

  start(): void {
    this.collectComponents(this.sceneRoot);
    this.attachListeners();
    void this.startAudioSources();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.audioCtx) {
      if (paused && this.audioCtx.state === 'running') {
        void this.audioCtx.suspend();
      } else if (!paused && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
    }
  }

  update(dt: number): void {
    if (this.destroyed || this.paused) return;
    const clampedDt = Math.min(dt, 0.05);
    this.tickCharacters(clampedDt);
    this.tickCameraRigs(clampedDt);
    this.tickInteractables();
    this.tickAudioSpatial();
    this.tickParticles(clampedDt);
  }

  step(dt: number): void {
    if (this.destroyed) return;
    const clampedDt = Math.min(dt, 0.05);
    this.tickCharacters(clampedDt);
    this.tickCameraRigs(clampedDt);
    this.tickInteractables();
    this.tickAudioSpatial();
    this.tickParticles(clampedDt);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detachListeners();

    if (this.activePromptEntityId !== null) {
      this.activePromptEntityId = null;
      this.eventBus.emit('gameplay:prompt-changed', null);
    }

    for (const inst of this.audioInstances) {
      try {
        inst.source?.stop();
      } catch {
        // ignore already stopped
      }
      inst.source?.disconnect();
      inst.gainNode?.disconnect();
      inst.pannerNode?.disconnect();
    }
    this.audioInstances = [];
    this.audioBuffers.clear();

    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    for (const emitter of this.particleEmitters) {
      emitter.container.destroy();
    }
    this.particleEmitters = [];

    for (const mat of this.particleMaterials) {
      mat.destroy();
    }
    this.particleMaterials = [];

    this.characters = [];
    this.cameraRigs = [];
    this.interactables = [];
  }

  private collectComponents(root: pc.Entity): void {
    const stack: pc.Entity[] = [root];
    while (stack.length > 0) {
      const entity = stack.pop()!;
      const meta = getEntityMeta(entity);

      if (meta.characterController?.enabled && entity.enabled) {
        const data = meta.characterController;
        const camEntity = data.cameraEntityId
          ? this.getEntityById(data.cameraEntityId)
          : this.findDefaultGameCamera();
        const euler = entity.getEulerAngles();
        this.characters.push({
          entity,
          data,
          yaw: euler.y,
          pitch: -12,
          vy: 0,
          grounded: true,
          isSitting: false,
          standReturnPos: null,
          cameraEntity: camEntity,
        });
      }

      if (meta.cameraRig?.enabled && entity.enabled && entity.camera) {
        const data = meta.cameraRig;
        const offsetVec = new pc.Vec3(data.offset[0], data.offset[1], data.offset[2]);
        const dist = Math.max(0.5, offsetVec.length());
        const yaw = Math.atan2(-offsetVec.x, -offsetVec.z) * (180 / Math.PI);
        const pitch = Math.asin(Math.max(-1, Math.min(1, offsetVec.y / dist))) * (180 / Math.PI);
        this.cameraRigs.push({
          entity,
          data,
          yaw: Number.isFinite(yaw) ? yaw : 0,
          pitch: Number.isFinite(pitch) ? -pitch : -15,
          distance: dist,
        });
      }

      if (meta.audioSource?.enabled && entity.enabled) {
        this.audioInstances.push({
          entity,
          data: meta.audioSource,
          source: null,
          gainNode: null,
          pannerNode: null,
          started: false,
        });
      }

      if (meta.interactable?.enabled && entity.enabled) {
        this.interactables.push({
          entity,
          data: meta.interactable,
        });
      }

      if (meta.particleSystem?.enabled && entity.enabled) {
        this.createParticleEmitter(entity, meta.particleSystem);
      }

      for (const child of entity.children) {
        if (child instanceof pc.Entity) {
          stack.push(child);
        }
      }
    }
  }

  private findDefaultGameCamera(): pc.Entity | null {
    const stack: pc.Entity[] = [this.sceneRoot];
    while (stack.length > 0) {
      const e = stack.pop()!;
      if (e.camera && e.camera.enabled) return e;
      for (const child of e.children) {
        if (child instanceof pc.Entity) stack.push(child);
      }
    }
    return null;
  }

  private createParticleEmitter(entity: pc.Entity, data: ParticleSystemComponentData): void {
    const container = new pc.Entity(`__particles_${entity.getGuid()}`);
    this.sceneRoot.addChild(container);
    this.particleEmitters.push({
      entity,
      data,
      container,
      pool: [],
      spawnAcc: 0,
      elapsed: 0,
    });
  }

  private async startAudioSources(): Promise<void> {
    if (this.audioInstances.length === 0) return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.audioCtx = new AudioCtx();

    for (const inst of this.audioInstances) {
      if (this.destroyed) return;
      if (!inst.data.playOnAwake || !inst.data.audioAssetId) continue;
      await this.playAudioInstance(inst);
    }
  }

  private async playAudioInstance(inst: AudioInstanceState): Promise<void> {
    if (!this.audioCtx || !inst.data.audioAssetId || this.destroyed) return;
    try {
      let buffer = this.audioBuffers.get(inst.data.audioAssetId);
      if (!buffer) {
        const rawData = await AssetRepository.getAssetBlob(inst.data.audioAssetId);
        if (!rawData || this.destroyed || !this.audioCtx) return;
        buffer = await this.audioCtx.decodeAudioData(rawData.slice(0));
        this.audioBuffers.set(inst.data.audioAssetId, buffer);
      }

      if (this.destroyed || !this.audioCtx) return;

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = inst.data.loop;
      source.playbackRate.value = Math.max(0.1, Math.min(3, inst.data.pitch));

      const gain = this.audioCtx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, inst.data.volume));

      if (inst.data.spatial) {
        const panner = this.audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = Math.max(0.1, inst.data.minDistance);
        panner.maxDistance = Math.max(inst.data.minDistance + 0.5, inst.data.maxDistance);
        const pos = inst.entity.getPosition();
        panner.positionX.value = pos.x;
        panner.positionY.value = pos.y;
        panner.positionZ.value = pos.z;

        source.connect(panner);
        panner.connect(gain);
        gain.connect(this.audioCtx.destination);
        inst.pannerNode = panner;
      } else {
        source.connect(gain);
        gain.connect(this.audioCtx.destination);
      }

      source.start(0);
      inst.source = source;
      inst.gainNode = gain;
      inst.started = true;
    } catch (err) {
      this.consoleBridge.warn(
        `AudioSource "${inst.entity.name}" failed to play:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  private tickAudioSpatial(): void {
    if (!this.audioCtx || this.audioInstances.length === 0) return;

    const cam = this.findDefaultGameCamera();
    if (cam) {
      const pos = cam.getPosition();
      const fwd = cam.forward;
      const up = cam.up;
      const listener = this.audioCtx.listener;
      if (listener.positionX) {
        listener.positionX.value = pos.x;
        listener.positionY.value = pos.y;
        listener.positionZ.value = pos.z;
        listener.forwardX.value = fwd.x;
        listener.forwardY.value = fwd.y;
        listener.forwardZ.value = fwd.z;
        listener.upX.value = up.x;
        listener.upY.value = up.y;
        listener.upZ.value = up.z;
      }
    }

    for (const inst of this.audioInstances) {
      if (inst.pannerNode && inst.entity.enabled) {
        const pos = inst.entity.getPosition();
        inst.pannerNode.positionX.value = pos.x;
        inst.pannerNode.positionY.value = pos.y;
        inst.pannerNode.positionZ.value = pos.z;
      }
    }
  }

  private tickCharacters(dt: number): void {
    if (this.characters.length === 0) return;

    const forwardInput =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) -
      this.joystickY;
    const strafeInput =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) +
      this.joystickX;
    const isRunning = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    for (const char of this.characters) {
      if (!char.entity.enabled) continue;
      if (char.isSitting) {
        this.updateCharacterCamera(char, dt);
        continue;
      }

      const pos = char.entity.getPosition().clone();
      const speed = isRunning ? char.data.runSpeed : char.data.walkSpeed;

      // Movement basis from yaw
      const yawRad = (char.yaw * Math.PI) / 180;
      const fwdX = -Math.sin(yawRad);
      const fwdZ = -Math.cos(yawRad);
      const rightX = Math.cos(yawRad);
      const rightZ = -Math.sin(yawRad);

      let moveX = fwdX * forwardInput + rightX * strafeInput;
      let moveZ = fwdZ * forwardInput + rightZ * strafeInput;
      const len = Math.hypot(moveX, moveZ);
      if (len > 0.001) {
        moveX = (moveX / Math.max(1, len)) * speed * dt;
        moveZ = (moveZ / Math.max(1, len)) * speed * dt;

        // Rotate character toward movement direction in third-person / top-down
        if (char.data.mode !== 'first-person') {
          const targetYaw = Math.atan2(-moveX, -moveZ) * (180 / Math.PI);
          char.entity.setEulerAngles(0, targetYaw, 0);
        } else {
          char.entity.setEulerAngles(0, char.yaw, 0);
        }

        const blocked = this.checkHorizontalCollision(
          pos,
          moveX,
          moveZ,
          char.data.capsuleRadius,
          char.data.stepOffset
        );
        if (!blocked) {
          pos.x += moveX;
          pos.z += moveZ;
        } else {
          // Wall slide
          if (!this.checkHorizontalCollision(pos, moveX, 0, char.data.capsuleRadius, char.data.stepOffset)) {
            pos.x += moveX;
          } else if (!this.checkHorizontalCollision(pos, 0, moveZ, char.data.capsuleRadius, char.data.stepOffset)) {
            pos.z += moveZ;
          }
        }
      } else if (char.data.mode === 'first-person') {
        char.entity.setEulerAngles(0, char.yaw, 0);
      }

      // Vertical physics / ground detection
      char.vy += char.data.gravity * dt;
      pos.y += char.vy * dt;

      const groundY = this.sampleGroundY(pos.x, pos.y + char.data.stepOffset, pos.z);
      if (pos.y <= groundY) {
        pos.y = groundY;
        char.vy = 0;
        char.grounded = true;
      } else {
        char.grounded = false;
      }

      char.entity.setPosition(pos);
      this.updateCharacterCamera(char, dt);
    }
  }

  private checkHorizontalCollision(
    pos: pc.Vec3,
    dx: number,
    dz: number,
    radius: number,
    stepOffset: number
  ): boolean {
    const rbSys = this.app.systems.rigidbody;
    if (!rbSys || !isAmmoLoaded()) return false;

    const dir = new pc.Vec3(dx, 0, dz);
    const dist = dir.length();
    if (dist < 0.0001) return false;
    dir.normalize();

    const origin = new pc.Vec3(pos.x, pos.y + stepOffset + 0.15, pos.z);
    const end = new pc.Vec3(
      origin.x + dir.x * (dist + radius),
      origin.y,
      origin.z + dir.z * (dist + radius)
    );
    const hit = rbSys.raycastFirst(origin, end);
    return Boolean(hit && hit.entity && !getEntityMeta(hit.entity).characterController);
  }

  private sampleGroundY(x: number, fromY: number, z: number): number {
    const rbSys = this.app.systems.rigidbody;
    if (rbSys && isAmmoLoaded()) {
      const start = new pc.Vec3(x, fromY + 0.5, z);
      const end = new pc.Vec3(x, fromY - 25, z);
      const hit = rbSys.raycastFirst(start, end);
      if (hit && hit.entity && !getEntityMeta(hit.entity).characterController) {
        return hit.point.y;
      }
    }
    return 0;
  }

  private updateCharacterCamera(char: CharacterState, _dt: number): void {
    const cam = char.cameraEntity;
    if (!cam) return;
    // If a CameraRig is attached to this camera, let CameraRig handle it
    if (getEntityMeta(cam).cameraRig?.enabled) return;

    const pos = char.entity.getPosition();
    const yawRad = (char.yaw * Math.PI) / 180;
    const pitchRad = (char.pitch * Math.PI) / 180;

    if (char.data.mode === 'first-person') {
      cam.setPosition(pos.x, pos.y + char.data.eyeHeight, pos.z);
      cam.setEulerAngles(char.pitch, char.yaw, 0);
    } else if (char.data.mode === 'top-down') {
      cam.setPosition(pos.x, pos.y + 10, pos.z + 6);
      cam.lookAt(pos.x, pos.y + 1, pos.z);
    } else {
      // Third-person
      const dist = 4.5;
      const cosP = Math.cos(pitchRad);
      const camX = pos.x + Math.sin(yawRad) * cosP * dist;
      const camY = pos.y + 1.5 - Math.sin(pitchRad) * dist;
      const camZ = pos.z + Math.cos(yawRad) * cosP * dist;
      cam.setPosition(camX, Math.max(0.3, camY), camZ);
      cam.lookAt(pos.x, pos.y + 1.25, pos.z);
    }
  }

  private tickCameraRigs(dt: number): void {
    for (const rig of this.cameraRigs) {
      if (!rig.entity.enabled || !rig.data.targetEntityId) continue;
      const target = this.getEntityById(rig.data.targetEntityId);
      if (!target) continue;

      const targetPos = target.getPosition();
      const lookTarget = new pc.Vec3(targetPos.x, targetPos.y + 1.2, targetPos.z);
      let desiredPos: pc.Vec3;

      if (rig.data.mode === 'look-at') {
        rig.entity.lookAt(lookTarget);
        continue;
      } else if (rig.data.mode === 'smooth-follow') {
        desiredPos = new pc.Vec3(
          targetPos.x + rig.data.offset[0],
          targetPos.y + rig.data.offset[1],
          targetPos.z + rig.data.offset[2]
        );
      } else {
        // follow-orbit
        const yawRad = (rig.yaw * Math.PI) / 180;
        const pitchRad = (rig.pitch * Math.PI) / 180;
        const cosP = Math.cos(pitchRad);
        desiredPos = new pc.Vec3(
          lookTarget.x + Math.sin(yawRad) * cosP * rig.distance,
          lookTarget.y - Math.sin(pitchRad) * rig.distance,
          lookTarget.z + Math.cos(yawRad) * cosP * rig.distance
        );
      }

      if (rig.data.collisionAvoidance && this.app.systems.rigidbody && isAmmoLoaded()) {
        const hit = this.app.systems.rigidbody.raycastFirst(lookTarget, desiredPos);
        if (hit && hit.entity !== target && hit.entity !== rig.entity) {
          desiredPos.lerp(lookTarget, hit.point, 0.9);
        }
      }

      const currentPos = rig.entity.getPosition().clone();
      const alpha = rig.data.damping <= 0 ? 1 : 1 - Math.exp(-rig.data.damping * dt);
      currentPos.lerp(currentPos, desiredPos, alpha);
      rig.entity.setPosition(currentPos);
      rig.entity.lookAt(lookTarget);
    }
  }

  private tickInteractables(): void {
    if (this.interactables.length === 0) return;

    const actor = this.characters[0]?.entity ?? this.findDefaultGameCamera();
    if (!actor) return;

    const actorPos = actor.getPosition();
    let nearest: { entity: pc.Entity; data: InteractableComponentData; dist: number } | null = null;

    for (const item of this.interactables) {
      if (!item.entity.enabled) continue;
      const d = actorPos.distance(item.entity.getPosition());
      if (d <= item.data.radius && (!nearest || d < nearest.dist)) {
        nearest = { ...item, dist: d };
      }
    }

    const nextId = nearest ? nearest.entity.getGuid() : null;
    if (nextId !== this.activePromptEntityId) {
      this.activePromptEntityId = nextId;
      if (nearest) {
        this.eventBus.emit('gameplay:prompt-changed', {
          entityId: nearest.entity.getGuid(),
          entityName: nearest.entity.name,
          promptText: nearest.data.promptText,
          keyCode: nearest.data.interactionKey,
        });
      } else {
        this.eventBus.emit('gameplay:prompt-changed', null);
      }
    }
  }

  private triggerNearestInteractable(keyCode: string): void {
    const actor = this.characters[0];
    if (actor?.isSitting && keyCode === 'KeyE') {
      actor.isSitting = false;
      if (actor.standReturnPos) {
        actor.entity.setPosition(actor.standReturnPos);
        actor.standReturnPos = null;
      }
      return;
    }

    if (!this.activePromptEntityId) return;
    const item = this.interactables.find((i) => i.entity.getGuid() === this.activePromptEntityId);
    if (!item || !item.entity.enabled) return;
    if (item.data.interactionKey !== keyCode) return;

    if (item.data.interactType === 'seat' && actor) {
      actor.standReturnPos = actor.entity.getPosition().clone();
      const basePos = item.entity.getPosition();
      actor.entity.setPosition(
        basePos.x + item.data.seatOffset[0],
        basePos.y + item.data.seatOffset[1],
        basePos.z + item.data.seatOffset[2]
      );
      actor.entity.setEulerAngles(0, item.data.seatYaw, 0);
      actor.isSitting = true;
    } else if (item.data.interactType === 'collectible') {
      if (item.data.destroyOnCollect) {
        item.entity.enabled = false;
        this.activePromptEntityId = null;
        this.eventBus.emit('gameplay:prompt-changed', null);
      }
    }

    if (item.data.emitEventName.trim()) {
      this.emitCustomEvent(item.data.emitEventName.trim(), {
        entityId: item.entity.getGuid(),
        entityName: item.entity.name,
      });
    }
  }

  private tickParticles(dt: number): void {
    for (const emitter of this.particleEmitters) {
      if (!emitter.entity.enabled) continue;
      const d = emitter.data;
      emitter.elapsed += dt;

      const shouldEmit = d.playOnAwake && (d.loop || emitter.elapsed < d.lifetime);
      if (shouldEmit && emitter.pool.length < d.maxParticles) {
        emitter.spawnAcc += d.emissionRate * dt;
        while (emitter.spawnAcc >= 1 && emitter.pool.length < d.maxParticles) {
          emitter.spawnAcc -= 1;
          this.spawnParticle(emitter);
        }
      }

      for (let i = emitter.pool.length - 1; i >= 0; i--) {
        const p = emitter.pool[i];
        p.age += dt;
        if (p.age >= p.lifetime) {
          p.entity.destroy();
          emitter.pool.splice(i, 1);
          continue;
        }
        const t = p.age / p.lifetime;
        p.vel.y += d.gravity * dt;
        const pos = p.entity.getPosition();
        p.entity.setPosition(pos.x + p.vel.x * dt, pos.y + p.vel.y * dt, pos.z + p.vel.z * dt);

        const size = d.startSize + (d.endSize - d.startSize) * t;
        p.entity.setLocalScale(size, size, size);

        const r = d.startColor[0] + (d.endColor[0] - d.startColor[0]) * t;
        const g = d.startColor[1] + (d.endColor[1] - d.startColor[1]) * t;
        const b = d.startColor[2] + (d.endColor[2] - d.startColor[2]) * t;
        p.mat.diffuse.set(r, g, b);
        p.mat.emissive.set(r * 0.6, g * 0.6, b * 0.6);
        p.mat.opacity = 1 - t;
        p.mat.update();
      }
    }
  }

  private spawnParticle(emitter: ParticleEmitterState): void {
    const d = emitter.data;
    const origin = emitter.entity.getPosition();
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(d.startColor[0], d.startColor[1], d.startColor[2]);
    mat.emissive = new pc.Color(d.startColor[0] * 0.6, d.startColor[1] * 0.6, d.startColor[2] * 0.6);
    mat.blendType = pc.BLEND_NORMAL;
    mat.opacity = 1;
    mat.update();
    this.particleMaterials.push(mat);

    const pEntity = new pc.Entity('__particle');
    pEntity.addComponent('render', {
      type: 'sphere',
      material: mat,
      castShadows: false,
      receiveShadows: false,
    });
    pEntity.setPosition(origin.x, origin.y, origin.z);
    pEntity.setLocalScale(d.startSize, d.startSize, d.startSize);
    emitter.container.addChild(pEntity);

    const spreadRad = (d.spreadAngle * Math.PI) / 180;
    let vx = 0;
    let vy = d.startSpeed;
    let vz = 0;

    if (d.shape === 'sphere') {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      vx = Math.sin(phi) * Math.cos(theta) * d.startSpeed;
      vy = Math.cos(phi) * d.startSpeed;
      vz = Math.sin(phi) * Math.sin(theta) * d.startSpeed;
    } else if (d.shape === 'box') {
      pEntity.setPosition(
        origin.x + (Math.random() - 0.5) * 0.8,
        origin.y,
        origin.z + (Math.random() - 0.5) * 0.8
      );
      vx = (Math.random() - 0.5) * d.startSpeed * 0.4;
      vz = (Math.random() - 0.5) * d.startSpeed * 0.4;
    } else {
      // cone
      const angle = Math.random() * Math.PI * 2;
      const tilt = Math.random() * spreadRad;
      vx = Math.sin(tilt) * Math.cos(angle) * d.startSpeed;
      vy = Math.cos(tilt) * d.startSpeed;
      vz = Math.sin(tilt) * Math.sin(angle) * d.startSpeed;
    }

    emitter.pool.push({
      entity: pEntity,
      mat,
      vel: new pc.Vec3(vx, vy, vz),
      age: 0,
      lifetime: Math.max(0.1, d.lifetime),
    });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    this.keys.add(e.code);

    if (e.code === 'Space') {
      for (const char of this.characters) {
        if (char.grounded && !char.isSitting && char.entity.enabled) {
          char.vy = char.data.jumpForce;
          char.grounded = false;
        }
      }
    }

    this.triggerNearestInteractable(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0 || e.button === 2) {
      this.isDraggingLook = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDraggingLook) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    for (const char of this.characters) {
      char.yaw -= dx * char.data.mouseSensitivity;
      char.pitch = Math.max(-75, Math.min(75, char.pitch - dy * char.data.mouseSensitivity));
    }

    for (const rig of this.cameraRigs) {
      if (rig.data.mode === 'follow-orbit') {
        rig.yaw -= dx * rig.data.orbitSensitivity;
        rig.pitch = Math.max(
          rig.data.minPitch,
          Math.min(rig.data.maxPitch, rig.pitch - dy * rig.data.orbitSensitivity)
        );
      }
    }
  };

  private onPointerUp = (): void => {
    this.isDraggingLook = false;
  };

  private onWheel = (e: WheelEvent): void => {
    for (const rig of this.cameraRigs) {
      if (rig.data.mode === 'follow-orbit') {
        rig.distance = Math.max(
          rig.data.minDistance,
          Math.min(rig.data.maxDistance, rig.distance + e.deltaY * 0.005)
        );
      }
    }
  };

  private onJoystick = (e: Event): void => {
    const detail = (e as CustomEvent<{ x: number; y: number }>).detail;
    if (detail) {
      this.joystickX = detail.x;
      this.joystickY = detail.y;
    }
  };

  private attachListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('cavannghe:joystick', this.onJoystick);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
  }

  private detachListeners(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('cavannghe:joystick', this.onJoystick);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
