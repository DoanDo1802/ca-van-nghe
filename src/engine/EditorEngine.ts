import * as pc from 'playcanvas';
import type {
  AnimatablePropertyPath,
  AnimationClipData,
  ComponentType,
  CoordinateSpace,
  EditorEventMap,
  EntityData,
  EntitySummary,
  InterpolationMode,
  KeyframeData,
  LoopMode,
  PlayModeState,
  PrefabData,
  SceneSchema,
  TransformData,
  TransformTool,
  Vec3,
} from '../types';
import { AssetRepository, ProjectRepository } from '../storage';
import { useAssetStore } from '../store/useAssetStore';
import { clearGlbContainerCache, loadGlbFromArrayBuffer } from './animation/GlbAnimExtractor';
import { evaluateClipAtTime } from './animation/KeyframeEvaluator';
import { CommandManager } from './CommandManager';
import {
  AddComponentCommand,
  RemoveComponentCommand,
  ReparentEntityCommand,
  UpdateComponentPropertyCommand,
  UpdateTransformCommand,
  type ComponentCommandContext,
} from './commands/ComponentCommands';
import {
  CreateEntityCommand,
  DeleteEntityCommand,
  DuplicateEntityCommand,
  RenameEntityCommand,
  ToggleEntityEnabledCommand,
  type EntityCommandContext,
} from './commands/EntityCommands';
import {
  AddKeyframeCommand,
  DeleteKeyframeCommand,
  MoveKeyframeCommand,
  UpdateKeyframeInterpolationCommand,
  type KeyframeCommandContext,
} from './commands/KeyframeCommands';
import {
  EditorCameraController,
  GizmoController,
  InfiniteGrid,
  SelectionPicker,
} from './editor-world';
import { EventBus } from './EventBus';
import { useEditorStore } from '../store/useEditorStore';
import {
  ConsoleBridge,
  GameplayRuntime,
  InteractionRuntime,
  RemotePlayerPool,
  ScriptSandbox,
  StageAudioManager,
  type StageMediaState,
} from './runtime';
import { PlayerControllerRuntime } from './runtime/PlayerControllerRuntime';
import { configureAmmo, initAmmo, isAmmoLoaded } from './serialization/AmmoLoader';
import {
  importCaVanNgheSceneById,
  type SceneLoadProgressCallback,
} from './serialization/CaVanNgheImporter';
import { getEntityMeta } from './serialization/EntityComponentHelper';
import {
  clearGlbAssetBufferCache,
  createResourceTracker,
  deserializeEntity,
  deserializeScene,
  destroySubtreeResources,
  restoreGlbEntities,
} from './serialization/SceneDeserializer';
import {
  emitSceneLoadingProgress,
  getSceneDefinition,
  getStartupSceneId,
} from './serialization/SceneRegistry';
import { serializeEntity, serializeScene } from './serialization/SceneSerializer';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../network/KaraokeVoiceManager';

export type PrimitiveType = 'box' | 'sphere' | 'plane' | 'cylinder' | 'capsule';
export type SnapView = 'top' | 'front' | 'right' | 'iso';

export interface SnapConfig {
  enabled: boolean;
  move: number;
  rotate: number;
  scale: number;
}

function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (Boolean(window.matchMedia?.('(pointer: coarse)').matches) &&
      Math.min(window.innerWidth, window.innerHeight) <= 900)
  );
}

const KNOWN_COMPONENT_TYPES = new Set<ComponentType>([
  'render',
  'light',
  'camera',
  'collision',
  'rigidbody',
  'anim',
  'interactive',
  'script',
]);

export class EditorEngine {
  private static instance: EditorEngine | null = null;

  static getInstance(): EditorEngine {
    if (!EditorEngine.instance) {
      EditorEngine.instance = new EditorEngine();
    }
    return EditorEngine.instance;
  }

  readonly eventBus = new EventBus<EditorEventMap>();
  readonly commandManager = new CommandManager(this.eventBus);
  readonly consoleBridge = new ConsoleBridge(this.eventBus);

  private app: pc.Application | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private sceneRoot: pc.Entity | null = null;
  private editorLayer: pc.Layer | null = null;

  private cameraController: EditorCameraController | null = null;
  private gizmoController: GizmoController | null = null;
  private infiniteGrid: InfiniteGrid | null = null;
  private selectionPicker: SelectionPicker | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private viewportResizeCleanup: (() => void) | null = null;
  private trackedMaterials = new Set<pc.StandardMaterial>();
  private glbDestroyCallbacks: Array<() => void> = [];
  private entityGuidCache = new Map<string, pc.Entity>();
  private readonly playModeClipSpeeds = new Map<string, number>();
  private readonly playModeDisabledClips = new Set<string>();
  private selectedEntityIds: string[] = [];
  private activeTool: TransformTool = 'move';
  private coordSpace: CoordinateSpace = 'world';
  private pointerDownPos: { x: number; y: number } | null = null;
  private playState: PlayModeState = 'edit';
  private playSnapshot: SceneSchema | null = null;
  private sceneGeneration = 0;
  private currentSceneId = getStartupSceneId();
  private currentSceneName = getSceneDefinition(getStartupSceneId()).name;
  private sceneTransitionLock = false;
  private autoDraftReady = false;
  private allowAutoDraftSave = true;
  private autoDraftTimer: number | null = null;
  private hasPendingAutoDraft = false;
  private autoDraftUnsubs: Array<() => void> = [];
  private autoDraftFlushCleanup: (() => void) | null = null;
  private pendingScrubOldTransform = new Map<string, TransformData>();

  private animationClips: Record<string, AnimationClipData> = {};
  private isRecording = false;
  private activeRecordingClipId: string | null = null;
  private currentPlayheadTime = 0;
  private playModeClipTimes = new Map<string, number>();
  private unsubGizmoDragEnd: (() => void) | null = null;
  private appUpdateHandler: ((dt: number) => void) | null = null;
  private interactionRuntime: InteractionRuntime | null = null;
  private scriptSandbox: ScriptSandbox | null = null;
  private playerController: PlayerControllerRuntime | null = null;
  private gameplayRuntime: GameplayRuntime | null = null;
  private stageAudioManager: StageAudioManager | null = null;
  private remotePlayerPool: RemotePlayerPool | null = null;
  private stageSweepGeneration = -1;
  private stageMovingHeads: Array<{
    node: pc.Entity;
    baseQuat: pc.Quat;
    glowMat: pc.StandardMaterial | null;
    spotEntity: pc.Entity | null;
    phase: number;
    speed: number;
    baseZ: number;
    front: boolean;
    canRotate: boolean;
    anchorPos: pc.Vec3;
  }> = [];
  private stageFresnelModels: Array<{ node: pc.Entity; phase: number; baseX: number }> = [];
  private stageSweepSpots: pc.Entity[] = [];

  private readonly commandContext: EntityCommandContext = {
    getSceneRoot: () => {
      if (!this.sceneRoot) throw new Error('EditorEngine is not mounted');
      return this.sceneRoot;
    },
    getEntityById: (id: string) => this.getEntityById(id),
    getSelectedEntityIds: () => this.selectedEntityIds,
    selectEntities: (ids: string[]) => this.selectEntities(ids),
    notifyHierarchyChanged: () => this.emitHierarchyChanged(),
    notifyPropertyChanged: (entityId: string, property: string, componentId?: string) => {
      this.eventBus.emit('entity:property-changed', { entityId, componentId, property });
    },
  };

  private readonly componentCommandContext: ComponentCommandContext = {
    getSceneRoot: () => {
      if (!this.sceneRoot) throw new Error('EditorEngine is not mounted');
      return this.sceneRoot;
    },
    getEntityById: (id: string) => this.getEntityById(id),
    trackMaterial: (mat: pc.StandardMaterial) => {
      this.trackedMaterials.add(mat);
    },
    notifyHierarchyChanged: () => this.emitHierarchyChanged(),
    notifyPropertyChanged: (entityId: string, property: string, componentId?: string) => {
      this.eventBus.emit('entity:property-changed', { entityId, componentId, property });
    },
    notifyTransformUpdated: (entityId: string, transform: TransformData, fromGizmo = false) => {
      this.eventBus.emit('entity:transform-updated', { entityId, transform, fromGizmo });
    },
  };

  private readonly keyframeCommandContext: KeyframeCommandContext = {
    getClip: (clipId: string) => this.animationClips[clipId] ?? null,
    notifyTimelineChanged: (
      clipId: string,
      entityId: string,
      property: AnimatablePropertyPath,
      time: number
    ) => {
      this.eventBus.emit('timeline:keyframe-recorded', { clipId, entityId, property, time });
    },
    evaluateClipAtCurrentTime: (clipId: string) => {
      const clip = this.animationClips[clipId];
      if (clip && this.playState === 'edit') {
        this.evaluateClipInEditor(clip, this.currentPlayheadTime);
      }
    },
  };

  private constructor() {}

  mount(
    canvas: HTMLCanvasElement,
    options?: { restoreAutoDraft?: boolean; autoLoadScene?: boolean }
  ): void {
    if (this.app) {
      if (this.canvas === canvas) return;
      this.unmount();
    }

    this.canvas = canvas;
    this.autoDraftReady = false;
    this.allowAutoDraftSave = options?.restoreAutoDraft !== false;

    configureAmmo();
    void initAmmo();

    const app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      keyboard: new pc.Keyboard(window),
      graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      },
    });
    this.app = app;
    if (app.systems.rigidbody) {
      app.systems.rigidbody.timeScale = 0;
    }

    app.graphicsDevice.maxPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      isMobileBrowser() ? 1.25 : 1.5
    );
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    const resizeTarget = canvas.parentElement ?? canvas;
    const syncSize = () => {
      const rect = resizeTarget.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0 && this.app) {
        this.app.resizeCanvas(w, h);
      }
    };
    syncSize();
    this.resizeObserver = new ResizeObserver(syncSize);
    this.resizeObserver.observe(resizeTarget);

    const onOrientationChange = () => {
      syncSize();
      window.setTimeout(syncSize, 120);
      window.setTimeout(syncSize, 320);
    };
    window.addEventListener('resize', syncSize);
    window.addEventListener('orientationchange', onOrientationChange);
    window.visualViewport?.addEventListener('resize', syncSize);
    this.viewportResizeCleanup = () => {
      window.removeEventListener('resize', syncSize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.visualViewport?.removeEventListener('resize', syncSize);
    };

    const editorLayer = new pc.Layer({ name: 'EditorLayer' });
    app.scene.layers.push(editorLayer);
    this.editorLayer = editorLayer;

    app.scene.ambientLight = new pc.Color(0.28, 0.25, 0.22);
    app.scene.exposure = 1.1;

    const sceneRoot = new pc.Entity('SceneRoot');
    app.root.addChild(sceneRoot);
    this.sceneRoot = sceneRoot;

    this.cameraController = new EditorCameraController(app, canvas, editorLayer);
    const editorCamera = this.cameraController.cameraEntity.camera!;

    this.gizmoController = new GizmoController(
      app,
      editorCamera,
      editorLayer,
      this.eventBus,
      this.commandManager
    );
    this.gizmoController.setTool(this.activeTool);
    this.gizmoController.setCoordSpace(this.coordSpace);

    this.infiniteGrid = new InfiniteGrid(app, editorLayer);
    this.selectionPicker = new SelectionPicker(app, editorCamera, sceneRoot, editorLayer);

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('dblclick', this.handleDoubleClick);

    this.unsubGizmoDragEnd = this.eventBus.on('gizmo:drag-end', ({ entityIds }) => {
      if (!this.isRecording || !this.activeRecordingClipId || this.playState !== 'edit') {
        return;
      }
      for (const entityId of entityIds) {
        this.recordTransformKeyframes(entityId);
      }
    });

    this.appUpdateHandler = (dt: number) => {
      if (this.playState === 'playing') {
        this.tickPlayModeAnimations(dt);
        this.tickStageSweepLights();
        this.interactionRuntime?.update(dt);
        this.scriptSandbox?.update(dt);
        this.gameplayRuntime?.update(dt);
        this.playerController?.update(dt);
        this.remotePlayerPool?.update(dt);
        this.stageAudioManager?.update();
        if (this.sceneRoot) {
          KaraokeVoiceManager.getInstance().updateSpatialAudio(
            this.findGameCamera(this.sceneRoot),
            MultiplayerManager.getInstance().getRemotePlayers()
          );
        }
      }
    };
    app.on('update', this.appUpdateHandler);

    app.start();

    this.autoDraftUnsubs = [
      this.eventBus.on('command:executed', () => this.scheduleAutoDraft()),
      this.eventBus.on('entity:property-changed', () => this.scheduleAutoDraft()),
      this.eventBus.on('hierarchy:changed', () => this.scheduleAutoDraft()),
      this.eventBus.on('timeline:keyframe-recorded', () => this.scheduleAutoDraft()),
    ];

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.flushPendingAutoDraft();
      }
    };
    const onPageHide = () => {
      this.flushPendingAutoDraft();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    this.autoDraftFlushCleanup = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };

    this.eventBus.emit('engine:ready', { version: pc.version });
    this.eventBus.emit('scene:loaded', { sceneId: this.currentSceneId });
    this.emitHierarchyChanged();

    const gen = this.sceneGeneration;
    if (options?.autoLoadScene === false) {
      return;
    }
    if (options?.restoreAutoDraft !== false) {
      void this.restoreStartupScene(gen, app, sceneRoot);
    } else {
      void this.loadSceneById(getStartupSceneId()).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.consoleBridge.error(`Failed to auto-load startup scene: ${msg}`);
      });
    }
  }

  private async restoreStartupScene(
    gen: number,
    app: pc.Application,
    sceneRoot: pc.Entity
  ): Promise<void> {
    try {
      const lastSceneId = ProjectRepository.getLastActiveSceneId();
      const draft = lastSceneId
        ? await ProjectRepository.loadSceneDraft(lastSceneId)
        : await ProjectRepository.loadAutoDraft();
      if (
        this.sceneGeneration !== gen ||
        this.app !== app ||
        this.sceneRoot !== sceneRoot ||
        !app.scene
      ) {
        return;
      }
      if (draft) {
        await this.syncUpdatedCharacterAsset(draft.metadata?.id);
        if (
          this.sceneGeneration !== gen ||
          this.app !== app ||
          this.sceneRoot !== sceneRoot ||
          !app.scene
        ) {
          return;
        }
        this.loadSceneSchema(draft);
        await useAssetStore.getState().loadAssets();
        this.consoleBridge.log(`Restored saved scene "${draft.metadata?.name || 'Untitled Scene'}".`);
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.consoleBridge.warn(`Failed to restore auto-draft scene: ${msg}`);
    }

    if (
      this.sceneGeneration !== gen ||
      this.app !== app ||
      this.sceneRoot !== sceneRoot ||
      !app.scene
    ) {
      return;
    }

    try {
      await importCaVanNgheSceneById(this, getStartupSceneId());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.consoleBridge.error(`Failed to auto-load startup scene: ${msg}`);
    }
  }

  private async syncUpdatedCharacterAsset(sceneId?: string): Promise<void> {
    const def = getSceneDefinition(sceneId ?? getStartupSceneId());
    const syncNames = def.modelUrls.map((u) => u.split('/').pop() || '').filter(Boolean);
    try {
      const assets = await AssetRepository.listAssets();
      for (const name of syncNames) {
        const url = `/models/${name}`;
        const existing = assets.find(
          (a) => a.name === name && a.folderPath === '/CaVanNghe'
        );

        const head = await fetch(url, { method: 'HEAD' });
        const contentLen = Number(head.headers.get('content-length') || 0);
        if (existing && contentLen > 0 && contentLen === existing.sizeBytes) continue;

        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        if (existing) {
          if (buf.byteLength !== existing.sizeBytes) {
            await AssetRepository.updateAssetBlob(existing.id, buf);
            clearGlbAssetBufferCache(existing.id);
          }
        } else {
          const file = new File([buf], name, { type: 'model/gltf-binary' });
          await AssetRepository.importFile(file, '/CaVanNghe');
        }
      }
    } catch {
      /* Ignore offline/network errors during startup asset sync */
    }
  }

  private scheduleAutoDraft(): void {
    if (!this.autoDraftReady || this.playState !== 'edit') return;
    useEditorStore.getState().setDirty(true);
    this.hasPendingAutoDraft = true;
    if (this.autoDraftTimer !== null) {
      window.clearTimeout(this.autoDraftTimer);
    }
    this.autoDraftTimer = window.setTimeout(() => {
      this.autoDraftTimer = null;
      void this.saveAutoDraftNow();
    }, 1000);
  }

  private flushPendingAutoDraft(): void {
    if (!this.hasPendingAutoDraft || this.playState !== 'edit' || !this.autoDraftReady) {
      return;
    }
    if (this.autoDraftTimer !== null) {
      window.clearTimeout(this.autoDraftTimer);
      this.autoDraftTimer = null;
    }
    void this.saveAutoDraftNow();
  }

  async saveAutoDraftNow(): Promise<void> {
    if (
      !this.app ||
      !this.sceneRoot ||
      this.playState !== 'edit' ||
      !this.autoDraftReady ||
      !this.allowAutoDraftSave
    ) {
      return;
    }
    if (this.autoDraftTimer !== null) {
      window.clearTimeout(this.autoDraftTimer);
      this.autoDraftTimer = null;
    }
    this.hasPendingAutoDraft = false;
    try {
      const schema = this.exportSceneSchema();
      await ProjectRepository.saveAutoDraft(schema);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.consoleBridge.warn(`Auto-draft save failed: ${msg}`);
    }
  }

  getSceneId(): string {
    return this.currentSceneId;
  }

  getSceneName(): string {
    return this.currentSceneName;
  }

  unmount(): void {
    if (!this.app) return;
    this.flushPendingAutoDraft();
    this.autoDraftFlushCleanup?.();
    this.autoDraftFlushCleanup = null;
    if (this.autoDraftTimer !== null) {
      window.clearTimeout(this.autoDraftTimer);
      this.autoDraftTimer = null;
    }
    this.hasPendingAutoDraft = false;
    for (const unsub of this.autoDraftUnsubs) {
      unsub();
    }
    this.autoDraftUnsubs = [];
    this.autoDraftReady = false;
    this.sceneTransitionLock = false;
    this.sceneGeneration++;

    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.canvas.removeEventListener('pointerup', this.handlePointerUp);
      this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
    }

    this.unsubGizmoDragEnd?.();
    this.unsubGizmoDragEnd = null;

    if (this.appUpdateHandler) {
      this.app.off('update', this.appUpdateHandler);
      this.appUpdateHandler = null;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.viewportResizeCleanup?.();
    this.viewportResizeCleanup = null;

    this.interactionRuntime?.destroy();
    this.interactionRuntime = null;
    this.scriptSandbox?.destroy();
    this.scriptSandbox = null;
    this.gameplayRuntime?.destroy();
    this.gameplayRuntime = null;
    this.playerController?.destroy();
    this.playerController = null;
    this.remotePlayerPool?.destroy();
    this.remotePlayerPool = null;
    this.stageAudioManager?.destroy();
    this.stageAudioManager = null;

    this.gizmoController?.destroy();
    this.gizmoController = null;

    this.selectionPicker?.destroy();
    this.selectionPicker = null;

    this.infiniteGrid?.destroy();
    this.infiniteGrid = null;

    this.cameraController?.destroy();
    this.cameraController = null;

    for (const mat of this.trackedMaterials) {
      mat.destroy();
    }
    this.trackedMaterials.clear();

    for (const destroyGlb of this.glbDestroyCallbacks) {
      destroyGlb();
    }
    this.glbDestroyCallbacks = [];

    if (this.sceneRoot) {
      destroySubtreeResources(this.sceneRoot, true);
      this.sceneRoot = null;
    }
    this.editorLayer = null;
    this.playSnapshot = null;
    this.playState = 'edit';
    this.pendingScrubOldTransform.clear();
    this.animationClips = {};
    this.isRecording = false;
    this.activeRecordingClipId = null;
    this.currentPlayheadTime = 0;
    this.playModeClipTimes.clear();

    this.commandManager.clear();
    this.selectedEntityIds = [];

    clearGlbContainerCache(this.app);
    this.app.destroy();
    this.app = null;
    this.canvas = null;
  }

  getApp(): pc.Application | null {
    return this.app;
  }

  getSceneRoot(): pc.Entity | null {
    return this.sceneRoot;
  }

  isEditorAutoDraftEnabled(): boolean {
    return this.allowAutoDraftSave;
  }

  getEditorLayer(): pc.Layer | null {
    return this.editorLayer;
  }

  getEntityById(id: string): pc.Entity | null {
    if (!this.sceneRoot) return null;
    if (this.sceneRoot.getGuid() === id) return this.sceneRoot;
    const cached = this.entityGuidCache.get(id);
    if (cached && cached.parent) {
      return cached;
    }
    const found = (this.sceneRoot.findByGuid(id) as pc.Entity | null) ?? null;
    if (found) {
      this.entityGuidCache.set(id, found);
    } else if (cached) {
      this.entityGuidCache.delete(id);
    }
    return found;
  }

  createPrimitive(type: PrimitiveType, parentId?: string): string {
    const labelName = type.charAt(0).toUpperCase() + type.slice(1);
    const cmd = new CreateEntityCommand(
      this.commandContext,
      () => {
        const entity = new pc.Entity(labelName);
        const mat = this.createStandardMaterial(new pc.Color(0.75, 0.78, 0.84));
        entity.addComponent('render', {
          type,
          material: mat,
          castShadows: true,
          receiveShadows: true,
        });
        entity.setLocalPosition(0, type === 'plane' ? 0 : 0.5, 0);
        return entity;
      },
      parentId ?? null,
      `Create ${labelName}`
    );
    this.commandManager.execute(cmd);
    return cmd.getCreatedEntityId() ?? '';
  }

  createEmpty(name = 'Empty', parentId?: string): string {
    const cmd = new CreateEntityCommand(
      this.commandContext,
      () => new pc.Entity(name),
      parentId ?? null,
      `Create ${name}`
    );
    this.commandManager.execute(cmd);
    return cmd.getCreatedEntityId() ?? '';
  }

  createLight(lightType: 'directional' | 'point' | 'spot' = 'point', parentId?: string): string {
    const labelName = `${lightType.charAt(0).toUpperCase() + lightType.slice(1)} Light`;
    const cmd = new CreateEntityCommand(
      this.commandContext,
      () => {
        const entity = new pc.Entity(labelName);
        entity.addComponent('light', {
          type: lightType,
          color: new pc.Color(1, 1, 1),
          intensity: 1,
          range: 10,
          castShadows: lightType === 'directional',
        });
        if (lightType === 'directional') {
          entity.setLocalEulerAngles(45, 30, 0);
        } else {
          entity.setLocalPosition(0, 2, 0);
        }
        return entity;
      },
      parentId ?? null,
      `Create ${labelName}`
    );
    this.commandManager.execute(cmd);
    return cmd.getCreatedEntityId() ?? '';
  }

  createCamera(parentId?: string): string {
    const cmd = new CreateEntityCommand(
      this.commandContext,
      () => {
        const entity = new pc.Entity('Camera');
        entity.addComponent('camera', {
          fov: 45,
          nearClip: 0.1,
          farClip: 1000,
          clearColor: new pc.Color(0.15, 0.16, 0.19, 1),
        });
        // Keep game camera disabled in Edit Mode so EditorCamera renders cleanly
        if (entity.camera) {
          entity.camera.enabled = false;
        }
        entity.setLocalPosition(0, 2, 6);
        return entity;
      },
      parentId ?? null,
      'Create Camera'
    );
    this.commandManager.execute(cmd);
    return cmd.getCreatedEntityId() ?? '';
  }

  deleteEntities(entityIds: string[]): void {
    if (entityIds.length === 0) return;
    const cmd = new DeleteEntityCommand(this.commandContext, entityIds);
    this.commandManager.execute(cmd);
  }

  duplicateEntities(entityIds: string[]): string[] {
    if (entityIds.length === 0) return [];
    const cmd = new DuplicateEntityCommand(this.commandContext, entityIds);
    this.commandManager.execute(cmd);
    return cmd.getDuplicatedIds();
  }

  renameEntity(entityId: string, name: string): void {
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot || !name.trim() || entity.name === name) return;
    const cmd = new RenameEntityCommand(this.commandContext, entityId, entity.name, name.trim());
    this.commandManager.execute(cmd);
  }

  setEntityEnabled(entityId: string, enabled: boolean): void {
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot || entity.enabled === enabled) return;
    const cmd = new ToggleEntityEnabledCommand(
      this.commandContext,
      entityId,
      entity.enabled,
      enabled
    );
    this.commandManager.execute(cmd);
  }

  selectEntities(entityIds: string[]): void {
    const validEntities: pc.Entity[] = [];
    const validIds: string[] = [];

    for (const id of entityIds) {
      const entity = this.getEntityById(id);
      if (entity && entity !== this.sceneRoot) {
        validEntities.push(entity);
        validIds.push(entity.getGuid());
      }
    }

    this.selectedEntityIds = validIds;
    this.gizmoController?.attach(validEntities);
    this.selectionPicker?.updateSelectionHighlight(validEntities);
    this.eventBus.emit('selection:changed', { entityIds: [...validIds] });
  }

  setTool(tool: TransformTool): void {
    this.activeTool = tool;
    this.gizmoController?.setTool(tool);
    this.eventBus.emit('tool:changed', { tool: this.activeTool, space: this.coordSpace });
  }

  setCoordSpace(space: CoordinateSpace): void {
    this.coordSpace = space;
    this.gizmoController?.setCoordSpace(space);
    this.eventBus.emit('tool:changed', { tool: this.activeTool, space: this.coordSpace });
  }

  setSnapSettings(snap: SnapConfig): void {
    this.gizmoController?.setSnap(snap);
  }

  setGridVisible(visible: boolean): void {
    this.infiniteGrid?.setVisible(visible);
  }

  focusSelected(): void {
    if (!this.cameraController) return;
    if (this.selectedEntityIds.length === 0) {
      this.cameraController.focusOn(pc.Vec3.ZERO.clone(), 4);
      return;
    }

    const combinedBox = new pc.BoundingBox();
    let hasBounds = false;

    const collectBounds = (node: pc.GraphNode) => {
      if (!(node instanceof pc.Entity) || !node.enabled) return;
      if (node.render && node.render.enabled) {
        for (const mi of node.render.meshInstances) {
          if (!mi.aabb || !mi.visible) continue;
          if (!hasBounds) {
            combinedBox.copy(mi.aabb);
            hasBounds = true;
          } else {
            combinedBox.add(mi.aabb);
          }
        }
      }
      for (const child of node.children) {
        collectBounds(child);
      }
    };

    const fallbackCenter = new pc.Vec3();
    let entityCount = 0;
    for (const id of this.selectedEntityIds) {
      const entity = this.getEntityById(id);
      if (entity) {
        collectBounds(entity);
        fallbackCenter.add(entity.getPosition());
        entityCount++;
      }
    }

    if (hasBounds) {
      const center = combinedBox.center.clone();
      const radius = combinedBox.halfExtents.length();
      this.cameraController.focusOn(center, Math.max(radius, 1.2));
    } else if (entityCount > 0) {
      fallbackCenter.mulScalar(1 / entityCount);
      this.cameraController.focusOn(fallbackCenter, 1.2);
    }
  }

  snapCameraView(view: SnapView): void {
    this.cameraController?.snapView(view);
  }

  undo(): boolean {
    return this.commandManager.undo();
  }

  redo(): boolean {
    return this.commandManager.redo();
  }

  getEntitySummaries(): EntitySummary[] {
    if (!this.sceneRoot) return [];
    const summaries: EntitySummary[] = [];

    const visit = (entity: pc.Entity, parentId: string | null) => {
      if (entity !== this.sceneRoot && entity.tags.has('__glb_internal__')) {
        return;
      }

      const childIds = entity.children
        .filter((c): c is pc.Entity => c instanceof pc.Entity && !c.tags.has('__glb_internal__'))
        .map((c) => c.getGuid());
      const componentTypes = Object.keys(entity.c ?? {}).filter((t): t is ComponentType =>
        KNOWN_COMPONENT_TYPES.has(t as ComponentType)
      );

      summaries.push({
        id: entity.getGuid(),
        name: entity.name,
        enabled: entity.enabled,
        tags: entity.tags.list(),
        parentId,
        childIds,
        componentTypes,
      });

      for (const child of entity.children) {
        if (child instanceof pc.Entity && !child.tags.has('__glb_internal__')) {
          visit(child, entity.getGuid());
        }
      }
    };

    visit(this.sceneRoot, null);
    return summaries;
  }

  getRootEntityIds(): string[] {
    if (!this.sceneRoot) return [];
    return this.sceneRoot.children.map((c) => (c as pc.Entity).getGuid());
  }

  getCameraBasisMatrix(): number[] {
    const camEntity = this.cameraController?.cameraEntity;
    if (!camEntity) {
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    }
    return Array.from(camEntity.getWorldTransform().data);
  }

  getEntityData(entityId: string): EntityData | null {
    const entity = this.getEntityById(entityId);
    if (!entity) return null;
    return serializeEntity(entity, this.editorLayer?.id);
  }

  setEntityTransform(entityId: string, transform: TransformData, commitCommand = true): void {
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot) return;

    const readCurrentTransform = (): TransformData => {
      const pos = entity.getLocalPosition();
      const rot = entity.getLocalEulerAngles();
      const scale = entity.getLocalScale();
      return {
        position: [pos.x, pos.y, pos.z],
        rotation: [rot.x, rot.y, rot.z],
        scale: [scale.x, scale.y, scale.z],
      };
    };

    if (commitCommand) {
      const oldTransform = this.pendingScrubOldTransform.get(entityId) ?? readCurrentTransform();
      this.pendingScrubOldTransform.delete(entityId);
      const cmd = new UpdateTransformCommand(
        this.componentCommandContext,
        entityId,
        oldTransform,
        transform
      );
      this.commandManager.execute(cmd);
      if (this.isRecording && this.activeRecordingClipId && this.playState === 'edit') {
        this.recordTransformKeyframes(entityId);
      }
    } else {
      if (!this.pendingScrubOldTransform.has(entityId)) {
        this.pendingScrubOldTransform.set(entityId, readCurrentTransform());
      }
      entity.setLocalPosition(transform.position[0], transform.position[1], transform.position[2]);
      entity.setLocalEulerAngles(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
      entity.setLocalScale(transform.scale[0], transform.scale[1], transform.scale[2]);
      this.eventBus.emit('entity:transform-updated', {
        entityId,
        transform: {
          position: [...transform.position],
          rotation: [...transform.rotation],
          scale: [...transform.scale],
        },
        fromGizmo: false,
      });
    }
  }

  setEntityTags(entityId: string, tags: string[]): void {
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot) return;
    entity.tags.clear();
    for (const tag of tags) {
      const trimmed = tag.trim();
      if (trimmed) {
        entity.tags.add(trimmed);
      }
    }
    this.eventBus.emit('entity:property-changed', { entityId, property: 'tags' });
  }

  addComponent(entityId: string, type: ComponentType): void {
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot) return;
    const cmd = new AddComponentCommand(this.componentCommandContext, entityId, type);
    this.commandManager.execute(cmd);
  }

  removeComponent(entityId: string, componentId: string): void {
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot) return;
    const cmd = new RemoveComponentCommand(this.componentCommandContext, entityId, componentId);
    this.commandManager.execute(cmd);
  }

  updateComponentProperty(
    entityId: string,
    componentId: string,
    patch: Record<string, unknown>
  ): void {
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot) return;
    const cmd = new UpdateComponentPropertyCommand(
      this.componentCommandContext,
      entityId,
      componentId,
      patch
    );
    this.commandManager.execute(cmd);
  }

  reparentEntity(entityId: string, newParentId: string, insertIndex?: number): void {
    const entity = this.getEntityById(entityId);
    const newParent = this.getEntityById(newParentId);
    if (!entity || !newParent || entity === this.sceneRoot) return;
    const cmd = new ReparentEntityCommand(
      this.componentCommandContext,
      entityId,
      newParentId,
      insertIndex
    );
    this.commandManager.execute(cmd);
  }

  async play(): Promise<void> {
    if (!this.app || !this.sceneRoot) return;
    if (this.playState === 'playing') return;

    this.flushPendingAutoDraft();

    try {
      if (this.playState === 'paused') {
        this.app.timeScale = 1;
        if (this.app.systems.rigidbody && isAmmoLoaded()) {
          this.app.systems.rigidbody.timeScale = 1;
        }
        this.interactionRuntime?.setPaused(false);
        this.gameplayRuntime?.setPaused(false);
        this.playState = 'playing';
        this.eventBus.emit('playmode:changed', { state: 'playing' });
        return;
      }

      await initAmmo();
      if (!this.app || !this.sceneRoot) return;

      this.playSnapshot = serializeScene(this.sceneRoot, this.app, {
        editorLayerId: this.editorLayer?.id,
        animations: this.animationClips,
      });
      this.playModeClipTimes.clear();

      // Hide EditorLayer overlays, gizmos, and EditorCamera
      this.gizmoController?.attach([]);
      this.selectionPicker?.updateSelectionHighlight([]);
      this.infiniteGrid?.setVisible(false);
      if (this.cameraController) {
        this.cameraController.cameraEntity.enabled = false;
      }

      // Switch to Game Camera in SceneRoot (or create a fallback camera)
      const gameCamera = this.findGameCamera(this.sceneRoot);
      if (gameCamera?.camera) {
        gameCamera.enabled = true;
        gameCamera.camera.enabled = true;
      } else {
        const fallbackCam = new pc.Entity('Fallback Camera');
        fallbackCam.addComponent('camera', {
          fov: 45,
          nearClip: 0.1,
          farClip: 1000,
          clearColor: new pc.Color(0.08, 0.09, 0.12, 1),
          enabled: true,
        });
        fallbackCam.setLocalPosition(0, 4, 15);
        fallbackCam.lookAt(0, 1.5, 0);
        this.sceneRoot.addChild(fallbackCam);
      }

      this.app.timeScale = 1;
      if (this.app.systems.rigidbody && isAmmoLoaded()) {
        this.app.systems.rigidbody.timeScale = 1;
      }

      this.interactionRuntime?.destroy();
      this.scriptSandbox?.destroy();
      this.gameplayRuntime?.destroy();
      this.playerController?.destroy();

      this.interactionRuntime = new InteractionRuntime({
        app: this.app,
        sceneRoot: this.sceneRoot,
        editorLayer: this.editorLayer,
        canvas: this.canvas,
        consoleBridge: this.consoleBridge,
        getEntityById: (id) => this.getEntityById(id),
        onPlayKeyframeClip: (clipIdOrName) => this.playKeyframeClipFromRuntime(clipIdOrName),
        onEntityClick: (entity) => {
          this.scriptSandbox?.handleEntityClick(entity);
          let cur: pc.GraphNode | null = entity;
          while (cur && cur !== this.sceneRoot) {
            if (cur instanceof pc.Entity) {
              const portalTag = cur.tags.list().find((t) => t.startsWith('load_scene:'));
              if (portalTag) {
                const targetSceneId = portalTag.slice('load_scene:'.length);
                window.dispatchEvent(
                  new CustomEvent('cavannghe:load-scene', { detail: { sceneId: targetSceneId } })
                );
                break;
              }
            }
            cur = cur.parent;
          }
        },
      });

      this.scriptSandbox = new ScriptSandbox({
        app: this.app,
        sceneRoot: this.sceneRoot,
        consoleBridge: this.consoleBridge,
        getEntityById: (id) => this.getEntityById(id),
        getAssetById: (id) => useAssetStore.getState().assets.find((a) => a.id === id) ?? null,
        emitEvent: (eventName, payload) => this.interactionRuntime?.emitCustomEvent(eventName, payload),
      });

      this.playState = 'playing';
      this.interactionRuntime.start();
      this.scriptSandbox.start();

      if (this.canvas) {
        this.gameplayRuntime = new GameplayRuntime({
          app: this.app,
          sceneRoot: this.sceneRoot,
          canvas: this.canvas,
          eventBus: this.eventBus,
          consoleBridge: this.consoleBridge,
          getEntityById: (id) => this.getEntityById(id),
          emitCustomEvent: (eventName, payload) =>
            this.interactionRuntime?.emitCustomEvent(eventName, payload),
        });
        this.gameplayRuntime.start();

        // Only activate legacy Ca Van Nghe controller when no generic CharacterController component is present
        if (!this.gameplayRuntime.hasCharacterControllers()) {
          this.playerController = new PlayerControllerRuntime(this.sceneRoot, this.canvas);
          if (!this.playerController.start()) {
            this.playerController = null;
          }
        }
      }

      this.stageAudioManager?.destroy();
      this.stageAudioManager = new StageAudioManager(this.app, this.sceneRoot);
      this.stageAudioManager.start();

      this.remotePlayerPool?.destroy();
      this.remotePlayerPool = new RemotePlayerPool(this.app, this.sceneRoot);

      void MultiplayerManager.getInstance().switchSceneRoom(this.currentSceneId);
      this.eventBus.emit('playmode:changed', { state: 'playing' });
    } catch (err) {
      this.consoleBridge.error('Failed to start Play Mode:', err);
      if (this.playState === 'edit') {
        if (this.cameraController) {
          this.cameraController.cameraEntity.enabled = true;
        }
        this.infiniteGrid?.setVisible(true);
      }
    }
  }

  pause(): void {
    if (!this.app || this.playState !== 'playing') return;
    this.app.timeScale = 0;
    if (this.app.systems.rigidbody && isAmmoLoaded()) {
      this.app.systems.rigidbody.timeScale = 0;
    }
    this.interactionRuntime?.setPaused(true);
    this.gameplayRuntime?.setPaused(true);
    this.playState = 'paused';
    this.eventBus.emit('playmode:changed', { state: 'paused' });
  }

  step(): void {
    if (!this.app || this.playState !== 'paused') return;
    const dt = 1 / 60;
    this.tickPlayModeAnimations(dt);
    this.interactionRuntime?.step(dt);
    this.scriptSandbox?.step(dt);
    this.gameplayRuntime?.step(dt);
    if (this.app.systems.rigidbody && isAmmoLoaded()) {
      this.app.systems.rigidbody.step(dt);
    }
  }

  stop(): void {
    if (!this.app || !this.sceneRoot || this.playState === 'edit') return;

    const gen = ++this.sceneGeneration;

    this.interactionRuntime?.destroy();
    this.interactionRuntime = null;
    this.scriptSandbox?.destroy();
    this.scriptSandbox = null;
    this.gameplayRuntime?.destroy();
    this.gameplayRuntime = null;
    this.playerController?.destroy();
    this.playerController = null;
    this.remotePlayerPool?.destroy();
    this.remotePlayerPool = null;
    this.stageAudioManager?.destroy();
    this.stageAudioManager = null;

    this.app.timeScale = 1;
    if (this.app.systems.rigidbody && isAmmoLoaded()) {
      this.app.systems.rigidbody.timeScale = 0;
    }

    for (const mat of this.trackedMaterials) {
      mat.destroy();
    }
    this.trackedMaterials.clear();

    for (const destroyGlb of this.glbDestroyCallbacks) {
      destroyGlb();
    }
    this.glbDestroyCallbacks = [];

    const hadSnapshot = Boolean(this.playSnapshot);
    if (this.playSnapshot) {
      const restored = deserializeScene(this.playSnapshot, this.app, this.sceneRoot);
      this.registerTrackerResources(restored.tracker);
      this.animationClips = this.playSnapshot.animations
        ? structuredClone(this.playSnapshot.animations)
        : {};
      this.playSnapshot = null;
    } else {
      destroySubtreeResources(this.sceneRoot, false);
    }
    this.playModeClipTimes.clear();

    // Restore EditorLayer & EditorCamera
    if (this.cameraController) {
      this.cameraController.cameraEntity.enabled = true;
      if (this.cameraController.cameraEntity.camera) {
        this.cameraController.cameraEntity.camera.enabled = true;
      }
    }
    this.infiniteGrid?.setVisible(true);

    this.playState = 'edit';
    this.selectEntities(this.selectedEntityIds);
    this.emitHierarchyChanged();
    this.eventBus.emit('playmode:changed', { state: 'edit' });

    if (hadSnapshot) {
      const sceneRoot = this.sceneRoot;
      const app = this.app;
      void restoreGlbEntities(sceneRoot, app, {
        registerDestroy: (fn) => this.glbDestroyCallbacks.push(fn),
        shouldAbort: () =>
          this.sceneGeneration !== gen || this.playState !== 'edit' || this.sceneRoot !== sceneRoot,
      })
        .then((restoredAny) => {
          if (restoredAny && this.sceneGeneration === gen && this.playState === 'edit') {
            this.emitHierarchyChanged();
          }
        })
        .catch((err) => {
          this.consoleBridge.error('Failed to restore GLB entities on Stop:', err);
        });
    }
  }

  getPlayState(): PlayModeState {
    return this.playState;
  }

  getStageAudioState(): StageMediaState | null {
    return this.stageAudioManager?.getState() ?? null;
  }

  setStageMedia(url: string, title?: string): void {
    this.stageAudioManager?.setMedia(url, title);
  }

  setStageYouTube(videoId: string, title?: string): void {
    this.stageAudioManager?.setYouTube(videoId, title);
  }

  setStageYouTubeQuality(quality: string): void {
    this.stageAudioManager?.setYouTubeQuality(quality);
  }

  getRenderResolutionScale(): number {
    return this.app?.graphicsDevice?.maxPixelRatio ?? (window.devicePixelRatio || 1);
  }

  setRenderResolutionScale(scale: number): void {
    if (!this.app?.graphicsDevice) return;
    const clamped = Math.max(0.5, Math.min(2, scale));
    this.app.graphicsDevice.maxPixelRatio = clamped;
    this.app.resizeCanvas();
  }

  setStagePlaying(playing: boolean): void {
    this.stageAudioManager?.setPlaying(playing);
  }

  setStageVolume(volume: number): void {
    this.stageAudioManager?.setVolume(volume);
  }

  setStageMuted(muted: boolean): void {
    this.stageAudioManager?.setMuted(muted);
  }

  setStageScreenOn(on: boolean): void {
    this.stageAudioManager?.setScreenOn(on);
  }

  syncStageToLiveEdge(): void {
    this.stageAudioManager?.syncToLiveEdge();
  }

  setNightMode(isNight: boolean): void {
    if (!this.app || !this.sceneRoot) return;
    if (this.app.scene) {
      this.app.scene.ambientLight = isNight
        ? new pc.Color(0.28, 0.32, 0.36)
        : new pc.Color(0.65, 0.6, 0.55);
    }
    const dirLight = this.sceneRoot.findByName('Directional Light');
    if (dirLight instanceof pc.Entity && dirLight.light) {
      dirLight.light.intensity = isNight ? 0.9 : 1.8;
      dirLight.light.color = isNight
        ? new pc.Color(1, 0.54, 0.4)
        : new pc.Color(1, 0.72, 0.3);
    }
  }

  getAnimationClips(): Record<string, AnimationClipData> {
    return structuredClone(this.animationClips);
  }

  createAnimationClip(name: string, targetEntityId?: string): AnimationClipData {
    const clip: AnimationClipData = {
      id: crypto.randomUUID(),
      name: name.trim() || 'New Clip',
      duration: 5,
      fps: 30,
      loopMode: 'loop',
      tracks: [],
    };
    if (targetEntityId) {
      clip.tracks.push({
        id: crypto.randomUUID(),
        targetEntityId,
        property: 'position',
        keyframes: [],
      });
    }
    this.animationClips[clip.id] = clip;
    return structuredClone(clip);
  }

  deleteAnimationClip(clipId: string): void {
    if (!this.animationClips[clipId]) return;
    delete this.animationClips[clipId];
    if (this.activeRecordingClipId === clipId) {
      this.activeRecordingClipId = null;
      this.isRecording = false;
    }
    this.playModeClipTimes.delete(clipId);
  }

  updateAnimationClipSettings(
    clipId: string,
    patch: { name?: string; duration?: number; loopMode?: LoopMode; fps?: number }
  ): void {
    const clip = this.animationClips[clipId];
    if (!clip) return;
    if (patch.name !== undefined) {
      clip.name = patch.name.trim() || clip.name;
    }
    if (patch.duration !== undefined && Number.isFinite(patch.duration)) {
      clip.duration = Math.max(0.1, patch.duration);
    }
    if (patch.loopMode !== undefined) {
      clip.loopMode = patch.loopMode;
    }
    if (patch.fps !== undefined && Number.isFinite(patch.fps)) {
      clip.fps = Math.max(1, Math.round(patch.fps));
    }
  }

  addPropertyTrack(clipId: string, entityId: string, property: AnimatablePropertyPath): void {
    const clip = this.animationClips[clipId];
    if (!clip) return;
    const exists = clip.tracks.some(
      (t) => t.targetEntityId === entityId && t.property === property
    );
    if (exists) return;
    clip.tracks.push({
      id: crypto.randomUUID(),
      targetEntityId: entityId,
      property,
      keyframes: [],
    });
  }

  recordKeyframe(
    clipId: string,
    entityId: string,
    property: AnimatablePropertyPath,
    time: number,
    value: number[],
    interpolation: InterpolationMode = 'linear'
  ): void {
    if (!this.animationClips[clipId]) return;
    const normalizedValue: number | Vec3 =
      property === 'material.opacity' || property === 'light.intensity'
        ? (value[0] ?? 0)
        : [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];

    const keyframe: KeyframeData = {
      id: crypto.randomUUID(),
      time: Math.max(0, time),
      value: normalizedValue,
      interpolation,
    };

    const cmd = new AddKeyframeCommand(
      this.keyframeCommandContext,
      clipId,
      entityId,
      property,
      keyframe
    );
    this.commandManager.execute(cmd);
  }

  moveKeyframe(clipId: string, trackIndex: number, keyframeId: string, newTime: number): void {
    const clip = this.animationClips[clipId];
    const track = clip?.tracks[trackIndex];
    const kf = track?.keyframes.find((k) => k.id === keyframeId);
    if (!kf) return;

    const cmd = new MoveKeyframeCommand(
      this.keyframeCommandContext,
      clipId,
      trackIndex,
      keyframeId,
      kf.time,
      Math.max(0, newTime)
    );
    this.commandManager.execute(cmd);
  }

  deleteKeyframe(clipId: string, trackIndex: number, keyframeId: string): void {
    const clip = this.animationClips[clipId];
    const track = clip?.tracks[trackIndex];
    const kf = track?.keyframes.find((k) => k.id === keyframeId);
    if (!kf) return;

    const cmd = new DeleteKeyframeCommand(
      this.keyframeCommandContext,
      clipId,
      trackIndex,
      keyframeId
    );
    this.commandManager.execute(cmd);
  }

  updateKeyframeInterpolation(
    clipId: string,
    trackIndex: number,
    keyframeId: string,
    interpolation: InterpolationMode
  ): void {
    const clip = this.animationClips[clipId];
    const track = clip?.tracks[trackIndex];
    const kf = track?.keyframes.find((k) => k.id === keyframeId);
    if (!kf || kf.interpolation === interpolation) return;

    const cmd = new UpdateKeyframeInterpolationCommand(
      this.keyframeCommandContext,
      clipId,
      trackIndex,
      keyframeId,
      kf.interpolation,
      interpolation
    );
    this.commandManager.execute(cmd);
  }

  scrubAnimation(clipId: string, time: number): void {
    const clampedTime = Math.max(0, time);
    this.currentPlayheadTime = clampedTime;

    const clip = this.animationClips[clipId];
    if (clip && this.sceneRoot) {
      this.evaluateClipInEditor(clip, clampedTime);
    }

    this.eventBus.emit('timeline:scrub', { clipId, time: clampedTime });
  }

  setRecording(recording: boolean, activeClipId?: string | null): void {
    this.isRecording = recording;
    if (activeClipId !== undefined) {
      this.activeRecordingClipId = activeClipId;
    }
  }

  newScene(): void {
    if (!this.app || !this.sceneRoot) return;
    if (this.playState !== 'edit') {
      this.stop();
    }
    void this.resetSceneById(this.currentSceneId).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.consoleBridge.error(`Failed to reset scene: ${msg}`);
    });
  }

  async resetSceneById(sceneId: string): Promise<void> {
    await ProjectRepository.deleteSceneDraft(sceneId);
    if (sceneId === this.currentSceneId || !this.currentSceneId) {
      await this.loadSceneById(sceneId, { resetToDefault: true });
    }
  }

  /**
   * Switches to a Unity-style scene by ID with real 0% -> 100% progress reporting,
   * releasing previous scene GPU/GLB memory and fetching ONLY assets required by `sceneId`.
   */
  async loadSceneById(
    sceneId: string,
    options?: {
      resetToDefault?: boolean;
      keepPlayMode?: boolean;
      onProgress?: SceneLoadProgressCallback;
    }
  ): Promise<void> {
    if (!this.app || !this.sceneRoot) {
      throw new Error('EditorEngine is not mounted');
    }
    if (this.sceneTransitionLock) return;
    this.sceneTransitionLock = true;
    const targetApp = this.app;

    const sceneDef = getSceneDefinition(sceneId);
    const report = (percent: number, label: string, loading = true) => {
      if (this.app !== targetApp) return;
      options?.onProgress?.({ percent, label });
      emitSceneLoadingProgress({
        loading,
        sceneId: sceneDef.id,
        sceneName: sceneDef.name,
        percent,
        label,
      });
    };

    try {
      report(2, `Đang chuẩn bị vào ${sceneDef.shortName}...`);

      if (this.playState === 'edit' && this.autoDraftReady && !options?.resetToDefault) {
        await this.saveAutoDraftNow();
      }
      if (this.app !== targetApp || !this.sceneRoot) return;

      if (this.playState !== 'edit') {
        this.teardownPlayRuntimesForSceneSwitch();
      }
      if (MultiplayerManager.getInstance().isConnected()) {
        await MultiplayerManager.getInstance().switchSceneRoom(sceneDef.id);
      }

      report(8, 'Đang giải phóng tài nguyên phòng cũ...');
      this.clearSceneResources();
      clearGlbContainerCache(this.app);
      clearGlbAssetBufferCache();

      const rawDraft =
        options?.resetToDefault || !this.allowAutoDraftSave
          ? null
          : await ProjectRepository.loadSceneDraft(sceneDef.id);
      if (this.app !== targetApp || !this.sceneRoot) return;

      const hasCameraInEntity = (ent: EntityData): boolean =>
        ent.components.some((c) => c.type === 'camera' && c.enabled !== false) ||
        ent.children.some(hasCameraInEntity);
      const savedDraft =
        rawDraft && rawDraft.scene?.children?.length > 0 && hasCameraInEntity(rawDraft.scene)
          ? rawDraft
          : null;

      if (rawDraft && !savedDraft) {
        void ProjectRepository.deleteSceneDraft(sceneDef.id);
      }

      if (savedDraft) {
        report(18, `Đang đọc dữ liệu ${sceneDef.shortName}...`);
        this.consoleBridge.logFrom('SceneLoader', `Loading "${sceneDef.name}" from IndexedDB scene draft`);
        await this.loadSceneSchemaAsync(savedDraft, (loaded, total, name) => {
          const pct = total > 0 ? 22 + (loaded / total) * 68 : 88;
          report(pct, `Đang tải tài nguyên: ${name} (${Math.round(pct)}%)`);
        });
        if (this.app !== targetApp || !this.sceneRoot) return;
        await useAssetStore.getState().loadAssets();
      } else {
        this.consoleBridge.logFrom('SceneLoader', `Loading "${sceneDef.name}" from default importer`);
        await importCaVanNgheSceneById(this, sceneDef.id, ({ percent, label }) => {
          report(Math.min(94, percent), label);
        });
      }

      if (this.app !== targetApp || !this.sceneRoot) return;

      report(96, 'Đang hoàn tất dựng hình 3D...');
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (this.app !== targetApp || !this.sceneRoot) return;

      if (options?.keepPlayMode) {
        report(98, 'Đang khởi tạo nhân vật & âm thanh...');
        await this.play();
      } else {
        await MultiplayerManager.getInstance().switchSceneRoom(sceneDef.id);
      }

      if (this.app !== targetApp) return;
      ProjectRepository.setLastActiveSceneId(sceneDef.id);
      report(100, `Đã sẵn sàng vào ${sceneDef.shortName}!`, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.consoleBridge.error(`Failed to load scene "${sceneDef.name}": ${msg}`);
      report(100, `Lỗi tải scene: ${msg}`, false);
      throw err;
    } finally {
      if (this.app === targetApp || !this.app) {
        this.sceneTransitionLock = false;
      }
    }
  }

  /**
   * Collects SceneSchemas for all checked scenes in Build Settings.
   */
  async collectSchemasForBuild(sceneIds: string[]): Promise<SceneSchema[]> {
    if (!this.app || !this.sceneRoot) {
      throw new Error('EditorEngine is not mounted');
    }

    const prevSceneId = this.currentSceneId;
    const wasPlaying = this.playState !== 'edit';

    if (this.playState === 'edit') {
      await this.saveAutoDraftNow();
    }

    const schemas: SceneSchema[] = [];
    let switchedScene = false;

    try {
      for (const id of sceneIds) {
        if (id === this.currentSceneId && this.playState === 'edit') {
          schemas.push(this.exportSceneSchema());
          continue;
        }
        const saved = await ProjectRepository.loadSceneDraft(id);
        if (saved) {
          schemas.push(saved);
          continue;
        }
        switchedScene = true;
        if (this.playState !== 'edit') {
          this.teardownPlayRuntimesForSceneSwitch();
        }
        await importCaVanNgheSceneById(this, id);
        const builtSchema = this.exportSceneSchema();
        await ProjectRepository.saveSceneDraft(id, builtSchema);
        schemas.push(builtSchema);
      }
    } finally {
      if (switchedScene && prevSceneId) {
        await this.loadSceneById(prevSceneId, { keepPlayMode: wasPlaying });
      }
    }

    return schemas;
  }

  private teardownPlayRuntimesForSceneSwitch(): void {
    this.interactionRuntime?.destroy();
    this.interactionRuntime = null;
    this.scriptSandbox?.destroy();
    this.scriptSandbox = null;
    this.gameplayRuntime?.destroy();
    this.gameplayRuntime = null;
    this.playerController?.destroy();
    this.playerController = null;
    this.remotePlayerPool?.destroy();
    this.remotePlayerPool = null;
    this.stageAudioManager?.destroy();
    this.stageAudioManager = null;

    this.playSnapshot = null;
    this.playModeClipTimes.clear();
    this.playState = 'edit';

    if (this.app) {
      this.app.timeScale = 1;
      if (this.app.systems.rigidbody && isAmmoLoaded()) {
        this.app.systems.rigidbody.timeScale = 0;
      }
    }

    if (this.cameraController) {
      this.cameraController.cameraEntity.enabled = true;
      if (this.cameraController.cameraEntity.camera) {
        this.cameraController.cameraEntity.camera.enabled = true;
      }
    }
    this.infiniteGrid?.setVisible(true);
    this.eventBus.emit('playmode:changed', { state: 'edit' });
  }

  private registerTrackerResources(tracker: ReturnType<typeof createResourceTracker>): void {
    for (const mat of tracker.materials) {
      this.trackedMaterials.add(mat);
    }
    for (const tex of tracker.textures) {
      this.glbDestroyCallbacks.push(() => tex.destroy());
    }
    for (const cleanup of tracker.cleanups) {
      this.glbDestroyCallbacks.push(cleanup);
    }
  }

  /**
   * Resets the scene to an empty SceneRoot without creating default entities.
   * Intended for custom scene importers (e.g. CaVanNgheImporter).
   */
  prepareEmptyScene(): void {
    if (!this.app || !this.sceneRoot) {
      throw new Error('EditorEngine is not mounted');
    }
    if (this.playState !== 'edit') {
      this.stop();
    }

    this.clearSceneResources();
    this.animationClips = {};
    this.isRecording = false;
    this.activeRecordingClipId = null;
    this.currentPlayheadTime = 0;
    this.playModeClipTimes.clear();
    this.commandManager.clear();
    this.selectEntities([]);
  }

  registerExternalMaterial(mat: pc.StandardMaterial): void {
    this.trackedMaterials.add(mat);
  }

  registerExternalResources(destroyFn: () => void): void {
    this.glbDestroyCallbacks.push(destroyFn);
  }

  notifySceneChanged(sceneId?: string, sceneName?: string): void {
    this.currentSceneId = sceneId || crypto.randomUUID();
    if (sceneName) {
      this.currentSceneName = sceneName;
    }
    ProjectRepository.setLastActiveSceneId(this.currentSceneId);
    this.autoDraftReady = false;
    this.eventBus.emit('scene:loaded', { sceneId: this.currentSceneId });
    this.emitHierarchyChanged();
    this.autoDraftReady = true;
    useEditorStore.getState().setDirty(false);
    void this.saveAutoDraftNow();
  }

  exportSceneSchema(): SceneSchema {
    if (!this.app || !this.sceneRoot) {
      throw new Error('EditorEngine is not mounted');
    }
    return serializeScene(this.sceneRoot, this.app, {
      editorLayerId: this.editorLayer?.id,
      animations: this.animationClips,
      metadata: {
        id: this.currentSceneId,
        name: this.currentSceneName,
      },
    });
  }

  loadSceneSchema(schema: SceneSchema): void {
    void this.loadSceneSchemaAsync(schema).catch((err) => {
      this.consoleBridge.error('Failed to restore GLB entities on scene load:', err);
    });
  }

  async loadSceneSchemaAsync(
    schema: SceneSchema,
    onGlbProgress?: (loadedCount: number, totalCount: number, assetName: string) => void
  ): Promise<void> {
    if (!this.app || !this.sceneRoot) {
      throw new Error('EditorEngine is not mounted');
    }
    if (this.playState !== 'edit') {
      this.stop();
    }

    this.clearSceneResources();
    this.animationClips = schema.animations ? structuredClone(schema.animations) : {};
    this.isRecording = false;
    this.activeRecordingClipId = null;
    this.currentPlayheadTime = 0;
    this.playModeClipTimes.clear();

    const restored = deserializeScene(schema, this.app, this.sceneRoot);
    this.registerTrackerResources(restored.tracker);

    this.currentSceneId = schema.metadata?.id || crypto.randomUUID();
    this.currentSceneName = schema.metadata?.name || 'Untitled Scene';
    ProjectRepository.setLastActiveSceneId(this.currentSceneId);
    this.autoDraftReady = false;
    this.commandManager.clear();
    this.selectEntities([]);
    this.eventBus.emit('scene:loaded', {
      sceneId: this.currentSceneId,
    });
    this.emitHierarchyChanged();
    useEditorStore.getState().setDirty(false);
    this.autoDraftReady = true;

    const gen = this.sceneGeneration;
    const sceneRoot = this.sceneRoot;
    const app = this.app;
    const restoredAny = await restoreGlbEntities(sceneRoot, app, {
      registerDestroy: (fn) => this.glbDestroyCallbacks.push(fn),
      shouldAbort: () => this.sceneGeneration !== gen || this.sceneRoot !== sceneRoot,
      onProgress: onGlbProgress,
    });
    if (restoredAny && this.sceneGeneration === gen) {
      const prevReady = this.autoDraftReady;
      this.autoDraftReady = false;
      this.emitHierarchyChanged();
      this.autoDraftReady = prevReady;
    }
  }

  serializeEntityToPrefab(entityId: string): PrefabData | null {
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot) return null;

    const root = serializeEntity(entity, this.editorLayer?.id);
    return {
      id: crypto.randomUUID(),
      name: entity.name,
      root,
      createdAt: new Date().toISOString(),
    };
  }

  updateDropGhost(canvasX: number | null, canvasY: number | null): void {
    if (!this.selectionPicker || this.playState !== 'edit') return;
    if (canvasX === null || canvasY === null) {
      this.selectionPicker.updateDropGhost(null);
      return;
    }
    const worldPos = this.selectionPicker.raycastDropPoint(canvasX, canvasY);
    this.selectionPicker.updateDropGhost(worldPos);
  }

  async spawnAssetAt(assetId: string, canvasX: number, canvasY: number): Promise<string | null> {
    if (!this.app || !this.sceneRoot || !this.selectionPicker || this.playState !== 'edit') {
      return null;
    }

    const manifest = await AssetRepository.getAssetManifest(assetId);
    if (!manifest) {
      return null;
    }

    const dropPos = this.selectionPicker.raycastDropPoint(canvasX, canvasY);

    if (manifest.type === 'glb' || manifest.type === 'gltf') {
      const buffer = await AssetRepository.getAssetBlob(manifest.indexedDbKey);
      if (!buffer) return null;

      const loaded = await loadGlbFromArrayBuffer(this.app, buffer, manifest.name);
      this.glbDestroyCallbacks.push(loaded.destroyResources);

      loaded.entity.setLocalPosition(dropPos.x, dropPos.y, dropPos.z);

      if (loaded.animTracks.length > 0) {
        const meta = getEntityMeta(loaded.entity);
        meta.anim = {
          defaultState: loaded.animTracks[0],
          states: loaded.animTracks.map((trackName) => ({
            name: trackName,
            clipAssetId: trackName,
            speed: 1,
            loop: true,
          })),
          transitions: [],
          keyframeClipIds: [],
        };
      }

      if (loaded.entity.render) {
        const meta = getEntityMeta(loaded.entity);
        meta.render = { ...(meta.render ?? {}), meshAssetId: assetId };
      }

      const cmd = new CreateEntityCommand(
        this.commandContext,
        () => loaded.entity,
        null,
        `Spawn ${manifest.name}`
      );
      this.commandManager.execute(cmd);
      return cmd.getCreatedEntityId();
    }

    if (manifest.type === 'prefab') {
      const prefab = await AssetRepository.getPrefabData(manifest.indexedDbKey);
      if (!prefab) return null;

      const clonedRoot = this.cloneEntityDataWithNewIds(prefab.root);
      const tracker = createResourceTracker();
      const entity = deserializeEntity(clonedRoot, tracker);
      this.registerTrackerResources(tracker);

      entity.setLocalPosition(dropPos.x, dropPos.y, dropPos.z);

      const tempRoot = new pc.Entity('__temp_prefab_root');
      tempRoot.addChild(entity);
      await restoreGlbEntities(tempRoot, this.app, {
        registerDestroy: (fn) => this.glbDestroyCallbacks.push(fn),
        shouldAbort: () => !this.app || !this.sceneRoot,
      });
      tempRoot.removeChild(entity);
      tempRoot.destroy();

      const cmd = new CreateEntityCommand(
        this.commandContext,
        () => entity,
        null,
        `Spawn ${manifest.name}`
      );
      this.commandManager.execute(cmd);
      return cmd.getCreatedEntityId();
    }

    return null;
  }

  private evaluateClipInEditor(clip: AnimationClipData, time: number): void {
    if (!this.sceneRoot) return;
    let selectedModified = false;

    evaluateClipAtTime(
      clip,
      time,
      (entityId) => {
        const entity = this.getEntityById(entityId);
        return entity && entity !== this.sceneRoot ? entity : null;
      },
      (entity) => {
        const entityId = entity.getGuid();
        if (this.selectedEntityIds.includes(entityId)) {
          selectedModified = true;
        }
        const pos = entity.getLocalPosition();
        const rot = entity.getLocalEulerAngles();
        const scale = entity.getLocalScale();
        this.eventBus.emit('entity:transform-updated', {
          entityId,
          transform: {
            position: [pos.x, pos.y, pos.z],
            rotation: [rot.x, rot.y, rot.z],
            scale: [scale.x, scale.y, scale.z],
          },
          fromGizmo: false,
        });
      }
    );

    if (selectedModified && this.selectedEntityIds.length > 0) {
      const selected = this.selectedEntityIds
        .map((id) => this.getEntityById(id))
        .filter((e): e is pc.Entity => e !== null && e !== this.sceneRoot);
      this.gizmoController?.attach(selected);
    }
  }

  private recordTransformKeyframes(entityId: string): void {
    if (!this.activeRecordingClipId || !this.animationClips[this.activeRecordingClipId]) {
      return;
    }
    const entity = this.getEntityById(entityId);
    if (!entity || entity === this.sceneRoot) return;

    const pos = entity.getLocalPosition();
    const rot = entity.getLocalEulerAngles();
    const scale = entity.getLocalScale();

    this.recordKeyframe(
      this.activeRecordingClipId,
      entityId,
      'position',
      this.currentPlayheadTime,
      [pos.x, pos.y, pos.z]
    );
    this.recordKeyframe(
      this.activeRecordingClipId,
      entityId,
      'rotation',
      this.currentPlayheadTime,
      [rot.x, rot.y, rot.z]
    );
    this.recordKeyframe(
      this.activeRecordingClipId,
      entityId,
      'scale',
      this.currentPlayheadTime,
      [scale.x, scale.y, scale.z]
    );
  }

  private playKeyframeClipFromRuntime(clipIdOrName: string): void {
    const clip =
      this.animationClips[clipIdOrName] ??
      Object.values(this.animationClips).find((c) => c.name === clipIdOrName);
    if (!clip) return;
    this.playModeClipTimes.set(clip.id, 0);
  }

  private initStageSweepRig(): void {
    if (!this.sceneRoot) return;
    this.stageSweepGeneration = this.sceneGeneration;
    this.stageMovingHeads = [];
    this.stageFresnelModels = [];
    this.stageSweepSpots = [];

    const housings: Array<{ entity: pc.Entity; meshCenter: pc.Vec3 }> = [];
    const lenses: Array<{ entity: pc.Entity; mat: pc.StandardMaterial; center: pc.Vec3 }> = [];

    const visit = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity && node !== this.sceneRoot) {
        const isSweep =
          node.tags.has('stage_sweep') ||
          node.name.startsWith('Stage Fresnel') ||
          node.name.startsWith('Acoustic Fresnel');
        if (isSweep && node.light) {
          this.stageSweepSpots.push(node);
        }

        const lower = node.name.toLowerCase();
        if (lower.includes('fresnel') && !node.light && node.render) {
          this.stageFresnelModels.push({
            node,
            phase: this.stageFresnelModels.length * 1.15,
            baseX: node.getPosition().x,
          });
        }

        if (node.render) {
          for (const mi of node.render.meshInstances) {
            const mat = mi.material;
            if (!(mat instanceof pc.StandardMaterial)) continue;
            const matName = (mat.name || '').toLowerCase();
            if (matName === 'parcan' && node.parent instanceof pc.Entity) {
              if (!housings.some((h) => h.entity === node.parent)) {
                housings.push({ entity: node.parent, meshCenter: mi.aabb.center.clone() });
              }
            } else if (/^light00[1-4]$/.test(matName)) {
              lenses.push({ entity: node, mat, center: mi.aabb.center.clone() });
            }
          }
        }
      }
      for (const child of node.children) {
        visit(child);
      }
    };
    visit(this.sceneRoot);

    const pairedLenses = new Set<pc.Entity>();
    const acousticSpots = this.stageSweepSpots.filter((s) => s.name.startsWith('Acoustic'));
    let spotIdx = 0;

    housings.forEach(({ entity: housing, meshCenter }, i) => {
      const origin = housing.getPosition();
      const canRotateInPlace = origin.distance(meshCenter) < 0.35;
      let bestDist = 0.6;
      let bestLens: { entity: pc.Entity; mat: pc.StandardMaterial; center: pc.Vec3 } | null = null;
      for (const l of lenses) {
        if (pairedLenses.has(l.entity)) continue;
        const d = meshCenter.distance(l.center);
        if (d < bestDist) {
          bestDist = d;
          bestLens = l;
        }
      }

      let glowMat: pc.StandardMaterial | null = null;
      if (bestLens) {
        pairedLenses.add(bestLens.entity);
        glowMat = bestLens.mat;
        glowMat.emissiveIntensity = 3.1;
        glowMat.update();

        // Keep lens attached to housing only if housing rotates in place
        const lensEnt = bestLens.entity;
        if (canRotateInPlace && lensEnt !== housing && lensEnt.parent !== housing) {
          const wPos = lensEnt.getPosition().clone();
          const wRot = lensEnt.getRotation().clone();
          housing.addChild(lensEnt);
          lensEnt.setPosition(wPos);
          lensEnt.setRotation(wRot);
        }
      }

      let spotEntity: pc.Entity | null = null;
      if (i % 4 === 0 && spotIdx < acousticSpots.length) {
        spotEntity = acousticSpots[spotIdx];
        spotIdx += 1;
        if (spotEntity.light && glowMat && (glowMat.emissive.r > 0.01 || glowMat.emissive.g > 0.01 || glowMat.emissive.b > 0.01)) {
          spotEntity.light.color = glowMat.emissive.clone();
        }
      }

      if (canRotateInPlace || spotEntity) {
        this.stageMovingHeads.push({
          node: housing,
          baseQuat: housing.getLocalRotation().clone(),
          glowMat: canRotateInPlace ? glowMat : null,
          spotEntity,
          phase: i * 0.92,
          speed: 0.46 + (i % 4) * 0.07,
          baseZ: meshCenter.z,
          front: meshCenter.x < 17,
          canRotate: canRotateInPlace,
          anchorPos: meshCenter.clone(),
        });
      }
    });
  }

  private tickStageSweepLights(): void {
    if (!this.sceneRoot) return;
    if (this.stageSweepGeneration !== this.sceneGeneration) {
      this.initStageSweepRig();
    }

    const t = performance.now() * 0.001;

    // 1. Gently pulse parcan lens emissive glow without detaching housings from truss
    for (const fix of this.stageMovingHeads) {
      if (fix.glowMat) {
        const pulse = Math.sin(t * fix.speed + fix.phase);
        fix.glowMat.emissiveIntensity = 2.6 + (pulse * 0.5 + 0.5) * 0.8;
        fix.glowMat.update();
      }
    }

    // 2. Smoothly sweep stage spotlights aimed accurately along PlayCanvas local -Y
    let acousticIdx = 0;
    let cinemaIdx = 0;
    for (const spot of this.stageSweepSpots) {
      if (!spot.light) continue;
      if (spot.name.startsWith('Acoustic')) {
        const isNorth = acousticIdx % 2 === 0;
        const sweep = Math.sin(t * 0.55 + (isNorth ? 0 : Math.PI));
        const aimZ = (isNorth ? 1.8 : 4.2) + sweep * 1.45;
        const aimY = 1.25 + Math.cos(t * 0.4 + acousticIdx) * 0.35;
        spot.lookAt(17.3, aimY, aimZ);
        spot.rotateLocal(90, 0, 0);
        acousticIdx += 1;
      } else {
        const pos = spot.getLocalPosition();
        const sweep = Math.sin(t * 0.58 + cinemaIdx * 1.45);
        spot.lookAt(pos.x * 0.35 + sweep * 2.4, 0.7, -12.6);
        spot.rotateLocal(90, 0, 0);
        cinemaIdx += 1;
      }
    }

    for (const fm of this.stageFresnelModels) {
      const sweep = Math.sin(t * 0.58 + fm.phase);
      fm.node.lookAt(fm.baseX * 0.25 + sweep * 2.2, 0.42, -11.6);
    }
  }

  private tickPlayModeAnimations(dt: number): void {
    if (!this.sceneRoot || dt <= 0) return;

    const clips = Object.values(this.animationClips);
    let hasActiveClip = false;
    for (let i = 0; i < clips.length; i++) {
      if (clips[i].tracks.length > 0) {
        hasActiveClip = true;
        break;
      }
    }
    if (!hasActiveClip) return;

    const clipSpeeds = this.playModeClipSpeeds;
    const explicitlyDisabledClips = this.playModeDisabledClips;
    clipSpeeds.clear();
    explicitlyDisabledClips.clear();

    const visit = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity && node !== this.sceneRoot) {
        const meta = getEntityMeta(node);
        const animMeta = meta.anim;
        if (node.anim && animMeta) {
          const active = node.enabled && node.anim.enabled && (node.anim.activate ?? true);
          const speed = typeof node.anim.speed === 'number' ? node.anim.speed : 1;
          for (const clipId of animMeta.keyframeClipIds ?? []) {
            if (active) {
              clipSpeeds.set(clipId, speed);
            } else {
              explicitlyDisabledClips.add(clipId);
            }
          }
        }
      }
      for (const child of node.children) {
        visit(child);
      }
    };
    visit(this.sceneRoot);

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (clip.tracks.length === 0) continue;
      if (explicitlyDisabledClips.has(clip.id) && !clipSpeeds.has(clip.id)) continue;

      const speed = clipSpeeds.get(clip.id) ?? 1;
      const prevTime = this.playModeClipTimes.get(clip.id) ?? 0;
      const nextTime = prevTime + dt * speed;
      this.playModeClipTimes.set(clip.id, nextTime);

      evaluateClipAtTime(clip, nextTime, (entityId) => {
        const entity = this.getEntityById(entityId);
        return entity && entity !== this.sceneRoot ? entity : null;
      });
    }
  }

  private clearSceneResources(): void {
    if (!this.sceneRoot) return;
    this.sceneGeneration++;

    this.pendingScrubOldTransform.clear();
    this.entityGuidCache.clear();
    this.stageSweepGeneration = -1;
    this.stageMovingHeads = [];
    this.stageFresnelModels = [];
    this.stageSweepSpots = [];

    for (const mat of this.trackedMaterials) {
      mat.destroy();
    }
    this.trackedMaterials.clear();

    for (const destroyGlb of this.glbDestroyCallbacks) {
      destroyGlb();
    }
    this.glbDestroyCallbacks = [];

    destroySubtreeResources(this.sceneRoot, false);
  }

  private cloneEntityDataWithNewIds(data: EntityData): EntityData {
    return {
      ...data,
      id: crypto.randomUUID(),
      tags: [...data.tags],
      transform: {
        position: [...data.transform.position],
        rotation: [...data.transform.rotation],
        scale: [...data.transform.scale],
      },
      components: data.components.map((comp) => ({
        ...structuredClone(comp),
        id: crypto.randomUUID(),
      })),
      children: data.children.map((child) => this.cloneEntityDataWithNewIds(child)),
    };
  }

  private findGameCamera(root: pc.Entity): pc.Entity | null {
    const cameras: pc.Entity[] = [];
    const visit = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity && node !== root && node.camera) {
        cameras.push(node);
      }
      for (const child of node.children) {
        visit(child);
      }
    };
    visit(root);
    if (cameras.length === 0) return null;
    const enabledCam = cameras.find((c) => c.enabled && c.camera?.enabled);
    if (enabledCam) return enabledCam;
    return cameras.find((c) => c.enabled) ?? cameras[0];
  }

  private createStandardMaterial(diffuse: pc.Color): pc.StandardMaterial {
    const mat = new pc.StandardMaterial();
    mat.diffuse = diffuse;
    mat.metalness = 0.1;
    mat.gloss = 0.6;
    mat.useMetalness = true;
    mat.update();
    this.trackedMaterials.add(mat);
    return mat;
  }

  private emitHierarchyChanged(): void {
    if (!this.sceneRoot) return;
    this.entityGuidCache.clear();
    this.eventBus.emit('hierarchy:changed', { rootId: this.sceneRoot.getGuid() });
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (this.playState !== 'edit' || e.button !== 0) {
      this.pointerDownPos = null;
      return;
    }
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    if (
      this.playState !== 'edit' ||
      e.button !== 0 ||
      !this.pointerDownPos ||
      !this.canvas ||
      !this.selectionPicker
    ) {
      this.pointerDownPos = null;
      return;
    }

    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    this.pointerDownPos = null;

    // Ignore drags, Alt+LMB orbit, or active gizmo drags
    if (dx * dx + dy * dy > 16 || e.altKey || this.gizmoController?.isDragging()) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = this.selectionPicker.pick(x, y);
    const multi = e.shiftKey || e.ctrlKey || e.metaKey;

    if (hit) {
      const hitId = hit.getGuid();
      if (multi) {
        const exists = this.selectedEntityIds.includes(hitId);
        const next = exists
          ? this.selectedEntityIds.filter((id) => id !== hitId)
          : [...this.selectedEntityIds, hitId];
        this.selectEntities(next);
      } else {
        this.selectEntities([hitId]);
      }
    } else if (!multi) {
      this.selectEntities([]);
    }
  };

  private readonly handleDoubleClick = (e: MouseEvent): void => {
    if (
      this.playState !== 'edit' ||
      e.button !== 0 ||
      e.altKey ||
      !this.canvas ||
      !this.selectionPicker
    ) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = this.selectionPicker.pick(x, y);
    if (hit) {
      this.selectEntities([hit.getGuid()]);
      this.focusSelected();
    }
  };
}
