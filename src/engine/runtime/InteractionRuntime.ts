import * as pc from 'playcanvas';
import { AssetRepository } from '../../storage';
import type {
  ActionConfig,
  InteractionRule,
  InterpolationMode,
  Vec3,
} from '../../types';
import { applyEasing } from '../animation/KeyframeEvaluator';
import { getEntityMeta } from '../serialization/EntityComponentHelper';
import type { ConsoleBridge } from './ConsoleBridge';

export interface InteractionRuntimeOptions {
  app: pc.Application;
  sceneRoot: pc.Entity;
  editorLayer: pc.Layer | null;
  canvas: HTMLCanvasElement | null;
  consoleBridge: ConsoleBridge;
  getEntityById: (id: string) => pc.Entity | null;
  onPlayKeyframeClip?: (clipIdOrName: string) => void;
  onEntityClick?: (entity: pc.Entity) => void;
}

interface RuleBinding {
  entity: pc.Entity;
  rule: InteractionRule;
  inProximity: boolean;
}

interface ActiveTween {
  target: pc.Entity;
  property: 'position' | 'rotation' | 'scale';
  start: Vec3;
  end: Vec3;
  duration: number;
  elapsed: number;
  easing: InterpolationMode;
}

interface ActiveActionChain {
  entity: pc.Entity;
  actions: ActionConfig[];
  index: number;
  waitRemaining: number;
  activeTween: ActiveTween | null;
}

export class InteractionRuntime {
  private readonly app: pc.Application;
  private readonly sceneRoot: pc.Entity;
  private readonly editorLayer: pc.Layer | null;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly consoleBridge: ConsoleBridge;
  private readonly getEntityById: (id: string) => pc.Entity | null;
  private readonly onPlayKeyframeClip?: (clipIdOrName: string) => void;
  private readonly onEntityClick?: (entity: pc.Entity) => void;

  private picker: pc.Picker | null = null;
  private started = false;
  private paused = false;
  private destroyed = false;

  private startRules: RuleBinding[] = [];
  private clickRulesByEntity = new Map<pc.Entity, RuleBinding[]>();
  private hoverEnterRulesByEntity = new Map<pc.Entity, RuleBinding[]>();
  private hoverExitRulesByEntity = new Map<pc.Entity, RuleBinding[]>();
  private keyDownRules: RuleBinding[] = [];
  private proximityRules: RuleBinding[] = [];
  private customEventRules = new Map<string, RuleBinding[]>();

  private activeChains: ActiveActionChain[] = [];
  private collisionCleanups: Array<() => void> = [];
  private pointerDownPos: { x: number; y: number } | null = null;
  private hoveredEntity: pc.Entity | null = null;

  private activeAudios = new Set<HTMLAudioElement>();
  private objectUrls: string[] = [];
  private audioCtx: AudioContext | null = null;

  constructor(options: InteractionRuntimeOptions) {
    this.app = options.app;
    this.sceneRoot = options.sceneRoot;
    this.editorLayer = options.editorLayer;
    this.canvas = options.canvas;
    this.consoleBridge = options.consoleBridge;
    this.getEntityById = options.getEntityById;
    this.onPlayKeyframeClip = options.onPlayKeyframeClip;
    this.onEntityClick = options.onEntityClick;

    if (this.canvas) {
      const width = Math.max(1, Math.floor(this.canvas.clientWidth || this.app.graphicsDevice.width));
      const height = Math.max(1, Math.floor(this.canvas.clientHeight || this.app.graphicsDevice.height));
      this.picker = new pc.Picker(this.app, width, height);
    }
  }

  start(): void {
    if (this.destroyed || this.started) return;
    this.started = true;
    this.paused = false;

    this.collectRules(this.sceneRoot);
    this.attachDomListeners();

    for (const binding of this.startRules) {
      if (binding.entity.enabled) {
        this.enqueueRule(binding);
      }
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  update(dt: number): void {
    if (this.destroyed || !this.started || this.paused) return;
    this.tick(dt);
  }

  step(dt: number): void {
    if (this.destroyed || !this.started) return;
    this.tick(dt);
  }

  emitCustomEvent(eventName: string, _payload?: unknown): void {
    if (this.destroyed || !this.started) return;
    const key = eventName.trim();
    if (!key) return;
    const bindings = this.customEventRules.get(key);
    if (!bindings) return;
    for (const binding of bindings) {
      if (binding.entity.enabled) {
        this.enqueueRule(binding);
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;

    this.detachDomListeners();

    for (const cleanup of this.collisionCleanups) {
      cleanup();
    }
    this.collisionCleanups = [];

    this.startRules = [];
    this.clickRulesByEntity.clear();
    this.hoverEnterRulesByEntity.clear();
    this.hoverExitRulesByEntity.clear();
    this.keyDownRules = [];
    this.proximityRules = [];
    this.customEventRules.clear();
    this.activeChains = [];
    this.hoveredEntity = null;
    this.pointerDownPos = null;
    this.picker = null;

    for (const audio of this.activeAudios) {
      audio.pause();
      audio.src = '';
    }
    this.activeAudios.clear();

    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls = [];

    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }

  private tick(dt: number): void {
    if (dt <= 0) return;
    this.evaluateProximity();
    this.advanceActionChains(dt);
  }

  private collectRules(node: pc.GraphNode): void {
    if (node instanceof pc.Entity && node !== this.sceneRoot) {
      const meta = getEntityMeta(node);
      if (meta.interactive && meta.interactive.enabled) {
        for (const rule of meta.interactive.rules) {
          if (!rule.enabled) continue;
          this.registerRule(node, rule);
        }
      }
    }
    for (const child of node.children) {
      this.collectRules(child);
    }
  }

  private registerRule(entity: pc.Entity, rule: InteractionRule): void {
    const binding: RuleBinding = { entity, rule, inProximity: false };

    switch (rule.trigger.type) {
      case 'OnStart':
        this.startRules.push(binding);
        break;
      case 'OnPointerClick':
        this.pushEntityRule(this.clickRulesByEntity, entity, binding);
        break;
      case 'OnPointerHoverEnter':
        this.pushEntityRule(this.hoverEnterRulesByEntity, entity, binding);
        break;
      case 'OnPointerHoverExit':
        this.pushEntityRule(this.hoverExitRulesByEntity, entity, binding);
        break;
      case 'OnKeyDown':
        this.keyDownRules.push(binding);
        break;
      case 'OnProximityEnter':
        this.proximityRules.push(binding);
        break;
      case 'OnCustomEvent': {
        const eventName = rule.trigger.eventName?.trim();
        if (eventName) {
          const list = this.customEventRules.get(eventName) ?? [];
          list.push(binding);
          this.customEventRules.set(eventName, list);
        }
        break;
      }
      case 'OnCollisionEnter':
        if (entity.collision) {
          const targetId = rule.trigger.targetEntityId;
          const handler = (result: pc.ContactResult) => {
            if (this.destroyed || this.paused || !entity.enabled) return;
            if (targetId && result?.other?.getGuid() !== targetId) return;
            this.enqueueRule(binding);
          };
          entity.collision.on('collisionstart', handler);
          this.collisionCleanups.push(() => entity.collision?.off('collisionstart', handler));
        }
        break;
      case 'OnTriggerEnter':
        if (entity.collision) {
          const targetId = rule.trigger.targetEntityId;
          const handler = (other: pc.Entity) => {
            if (this.destroyed || this.paused || !entity.enabled) return;
            if (targetId && other?.getGuid() !== targetId) return;
            this.enqueueRule(binding);
          };
          entity.collision.on('triggerenter', handler);
          this.collisionCleanups.push(() => entity.collision?.off('triggerenter', handler));
        }
        break;
    }
  }

  private pushEntityRule(
    map: Map<pc.Entity, RuleBinding[]>,
    entity: pc.Entity,
    binding: RuleBinding
  ): void {
    const list = map.get(entity);
    if (list) {
      list.push(binding);
    } else {
      map.set(entity, [binding]);
    }
  }

  private evaluateProximity(): void {
    if (this.proximityRules.length === 0) return;
    const defaultCam = this.findActiveGameCamera()?.entity ?? null;

    for (const binding of this.proximityRules) {
      if (!binding.entity.enabled) continue;
      const target = binding.rule.trigger.targetEntityId
        ? this.getEntityById(binding.rule.trigger.targetEntityId)
        : defaultCam;
      if (!target || !target.enabled) continue;

      const threshold = binding.rule.trigger.distance ?? 2;
      const dist = binding.entity.getPosition().distance(target.getPosition());
      const inside = dist <= threshold;

      if (inside && !binding.inProximity) {
        binding.inProximity = true;
        this.enqueueRule(binding);
      } else if (!inside && binding.inProximity) {
        binding.inProximity = false;
      }
    }
  }

  private enqueueRule(binding: RuleBinding): void {
    if (!binding.rule.actions || binding.rule.actions.length === 0) return;
    const chain: ActiveActionChain = {
      entity: binding.entity,
      actions: binding.rule.actions,
      index: 0,
      waitRemaining: 0,
      activeTween: null,
    };
    this.activeChains.push(chain);
    this.stepChain(chain, 0);
  }

  private advanceActionChains(dt: number): void {
    if (this.activeChains.length === 0) return;

    const remaining: ActiveActionChain[] = [];
    for (const chain of this.activeChains) {
      const done = this.stepChain(chain, dt);
      if (!done) {
        remaining.push(chain);
      }
    }
    this.activeChains = remaining;
  }

  private stepChain(chain: ActiveActionChain, dt: number): boolean {
    let remainingDt = dt;

    while (chain.index < chain.actions.length) {
      if (chain.waitRemaining > 0) {
        if (remainingDt < chain.waitRemaining) {
          chain.waitRemaining -= remainingDt;
          return false;
        }
        remainingDt -= chain.waitRemaining;
        chain.waitRemaining = 0;
      }

      if (chain.activeTween) {
        const tween = chain.activeTween;
        tween.elapsed += remainingDt;
        const progress = tween.duration > 0 ? Math.min(1, tween.elapsed / tween.duration) : 1;
        const eased = applyEasing(progress, tween.easing);
        this.applyTweenValue(tween, eased);

        if (progress < 1) {
          return false;
        }

        remainingDt = Math.max(0, tween.elapsed - tween.duration);
        chain.activeTween = null;
        chain.index++;
        continue;
      }

      const action = chain.actions[chain.index];
      const target = action.targetEntityId
        ? this.getEntityById(action.targetEntityId)
        : chain.entity;

      if (action.type === 'Wait') {
        const duration = Math.max(0, action.duration ?? 1);
        chain.index++;
        if (duration > 0) {
          chain.waitRemaining = duration;
          if (remainingDt === 0) return false;
          continue;
        }
        continue;
      }

      if (action.type === 'TweenTransform') {
        if (!target) {
          chain.index++;
          continue;
        }
        const prop = action.transformProperty ?? 'position';
        const end: Vec3 = action.targetVec3 ? [...action.targetVec3] : [0, 0, 0];
        const duration = Math.max(0, action.duration ?? 0.5);
        const easing = action.easing ?? 'easeInOut';
        const start = this.readTransformVec3(target, prop);

        if (duration <= 0) {
          this.writeTransformVec3(target, prop, end);
          chain.index++;
          continue;
        }

        chain.activeTween = {
          target,
          property: prop,
          start,
          end,
          duration,
          elapsed: 0,
          easing,
        };
        if (remainingDt === 0) return false;
        continue;
      }

      this.executeImmediateAction(action, target);
      chain.index++;
    }

    return true;
  }

  private executeImmediateAction(action: ActionConfig, target: pc.Entity | null): void {
    switch (action.type) {
      case 'SetActive':
        if (target) {
          target.enabled = action.active ?? true;
        }
        break;
      case 'ChangeMaterialColor':
        if (target?.render?.meshInstances) {
          const c = action.color ?? [1, 1, 1];
          for (const mi of target.render.meshInstances) {
            if (mi.material instanceof pc.StandardMaterial) {
              mi.material.diffuse.set(c[0], c[1], c[2]);
              mi.material.update();
            }
          }
        }
        break;
      case 'ApplyForce':
        if (target?.rigidbody) {
          const v = action.targetVec3 ?? [0, 0, 0];
          target.rigidbody.applyImpulse(v[0], v[1], v[2]);
        }
        break;
      case 'PlayAnimation': {
        const name = action.clipOrStateName?.trim();
        if (!name) break;
        if (target?.anim?.baseLayer) {
          try {
            target.anim.baseLayer.transition(name, 0.2);
          } catch {
            try {
              target.anim.baseLayer.play(name);
            } catch {
              // Ignore missing anim state and fall back to keyframe clip
            }
          }
        }
        this.onPlayKeyframeClip?.(name);
        break;
      }
      case 'PlaySound':
        void this.playSound(action.soundAssetId);
        break;
      case 'EmitCustomEvent':
        if (action.eventName) {
          this.emitCustomEvent(action.eventName);
        }
        break;
    }
  }

  private async playSound(soundAssetId?: string): Promise<void> {
    if (this.destroyed) return;

    if (soundAssetId) {
      try {
        const manifest = await AssetRepository.getAssetManifest(soundAssetId);
        if (manifest && !this.destroyed) {
          const url = await AssetRepository.getAssetObjectUrl(
            manifest.indexedDbKey,
            manifest.mimeType
          );
          if (url && !this.destroyed) {
            this.objectUrls.push(url);
            const audio = new Audio(url);
            this.activeAudios.add(audio);
            audio.addEventListener('ended', () => {
              this.activeAudios.delete(audio);
            });
            await audio.play();
            return;
          }
        }
      } catch (err) {
        this.consoleBridge.warnFrom('InteractionRuntime', 'Failed to play audio asset:', err);
      }
    }

    this.playWebAudioFallback();
  }

  private playWebAudioFallback(): void {
    if (this.destroyed || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.18);
    } catch {
      // Ignore WebAudio autoplay restrictions
    }
  }

  private readTransformVec3(
    entity: pc.Entity,
    prop: 'position' | 'rotation' | 'scale'
  ): Vec3 {
    const v =
      prop === 'position'
        ? entity.getLocalPosition()
        : prop === 'rotation'
          ? entity.getLocalEulerAngles()
          : entity.getLocalScale();
    return [v.x, v.y, v.z];
  }

  private writeTransformVec3(
    entity: pc.Entity,
    prop: 'position' | 'rotation' | 'scale',
    val: Vec3
  ): void {
    if (prop === 'position') {
      entity.setLocalPosition(val[0], val[1], val[2]);
    } else if (prop === 'rotation') {
      entity.setLocalEulerAngles(val[0], val[1], val[2]);
    } else {
      entity.setLocalScale(val[0], val[1], val[2]);
    }
  }

  private applyTweenValue(tween: ActiveTween, t: number): void {
    const x = tween.start[0] + (tween.end[0] - tween.start[0]) * t;
    const y = tween.start[1] + (tween.end[1] - tween.start[1]) * t;
    const z = tween.start[2] + (tween.end[2] - tween.start[2]) * t;
    this.writeTransformVec3(tween.target, tween.property, [x, y, z]);
  }

  private attachDomListeners(): void {
    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', this.handlePointerDown);
      this.canvas.addEventListener('pointerup', this.handlePointerUp);
      this.canvas.addEventListener('pointermove', this.handlePointerMove);
    }
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private detachDomListeners(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.canvas.removeEventListener('pointerup', this.handlePointerUp);
      this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    }
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (this.destroyed || this.paused || e.button !== 0) {
      this.pointerDownPos = null;
      return;
    }
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    if (this.destroyed || this.paused || e.button !== 0 || !this.pointerDownPos || !this.canvas) {
      this.pointerDownPos = null;
      return;
    }

    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    this.pointerDownPos = null;

    if (dx * dx + dy * dy > 25) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = this.pickEntity(x, y);
    if (!hit) return;

    const bindings = this.clickRulesByEntity.get(hit);
    if (bindings) {
      for (const binding of bindings) {
        if (binding.entity.enabled) {
          this.enqueueRule(binding);
        }
      }
    }

    this.onEntityClick?.(hit);
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    if (
      this.destroyed ||
      this.paused ||
      !this.canvas ||
      (this.hoverEnterRulesByEntity.size === 0 && this.hoverExitRulesByEntity.size === 0)
    ) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const nextHovered = this.pickEntity(x, y);

    if (nextHovered === this.hoveredEntity) return;

    if (this.hoveredEntity) {
      const exitBindings = this.hoverExitRulesByEntity.get(this.hoveredEntity);
      if (exitBindings) {
        for (const binding of exitBindings) {
          if (binding.entity.enabled) {
            this.enqueueRule(binding);
          }
        }
      }
    }

    this.hoveredEntity = nextHovered;

    if (nextHovered) {
      const enterBindings = this.hoverEnterRulesByEntity.get(nextHovered);
      if (enterBindings) {
        for (const binding of enterBindings) {
          if (binding.entity.enabled) {
            this.enqueueRule(binding);
          }
        }
      }
    }
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (this.destroyed || this.paused || e.repeat) return;
    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
      return;
    }

    const pressedKey = e.key.toLowerCase();
    const pressedCode = e.code.toLowerCase();

    for (const binding of this.keyDownRules) {
      if (!binding.entity.enabled) continue;
      const targetKey = binding.rule.trigger.key?.trim().toLowerCase();
      if (!targetKey) continue;
      if (pressedKey === targetKey || pressedCode === targetKey) {
        this.enqueueRule(binding);
      }
    }
  };

  private findActiveGameCamera(): pc.CameraComponent | null {
    const cameras: pc.CameraComponent[] = [];
    const visit = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity && node !== this.sceneRoot && node.camera) {
        if (node.enabled && node.camera.enabled) {
          cameras.push(node.camera);
        }
      }
      for (const child of node.children) {
        visit(child);
      }
    };
    visit(this.sceneRoot);
    if (cameras.length === 0) return null;
    cameras.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return cameras[0];
  }

  private pickEntity(canvasX: number, canvasY: number): pc.Entity | null {
    const camera = this.findActiveGameCamera();
    if (!camera || !this.picker || !this.canvas) return null;

    const width = Math.max(1, Math.floor(this.canvas.clientWidth || this.app.graphicsDevice.width));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight || this.app.graphicsDevice.height));
    if (this.picker.width !== width || this.picker.height !== height) {
      this.picker.resize(width, height);
    }

    const pickLayers: pc.Layer[] = [];
    for (const layerId of camera.layers) {
      if (this.editorLayer && layerId === this.editorLayer.id) continue;
      const layer = this.app.scene.layers.getLayerById(layerId);
      if (layer) pickLayers.push(layer);
    }

    this.picker.prepare(
      camera,
      this.app.scene,
      pickLayers.length > 0 ? pickLayers : undefined
    );

    const hits = this.picker.getSelection(canvasX, canvasY);
    if (!hits || hits.length === 0) return null;

    for (const hit of hits) {
      const startNode: pc.GraphNode | null =
        'node' in hit ? hit.node : 'entity' in hit ? hit.entity : null;
      const resolved = this.resolveSceneEntity(startNode);
      if (resolved) return resolved;
    }

    return null;
  }

  private resolveSceneEntity(node: pc.GraphNode | null): pc.Entity | null {
    let current: pc.GraphNode | null = node;
    while (current) {
      if (current === this.sceneRoot) return null;
      if (current instanceof pc.Entity && current.parent === this.sceneRoot) {
        return current;
      }
      if (current instanceof pc.Entity && this.isDescendantOfSceneRoot(current)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  private isDescendantOfSceneRoot(entity: pc.Entity): boolean {
    let p: pc.GraphNode | null = entity.parent;
    while (p) {
      if (p === this.sceneRoot) return true;
      p = p.parent;
    }
    return false;
  }
}
