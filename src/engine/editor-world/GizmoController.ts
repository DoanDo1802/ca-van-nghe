import * as pc from 'playcanvas';
import type {
  CoordinateSpace,
  EditorEventMap,
  ICommand,
  TransformData,
  TransformTool,
  TypedEventBus,
} from '../../types';
import type { CommandManager } from '../CommandManager';

export interface GizmoSnapSettings {
  enabled: boolean;
  move: number;
  rotate: number;
  scale: number;
}

interface EntityTransformSnapshot {
  entity: pc.Entity;
  entityId: string;
  oldTransform: TransformData;
  newTransform: TransformData;
}

const THROTTLE_MS = 32;

function readEntityTransform(entity: pc.Entity): TransformData {
  const pos = entity.getLocalPosition();
  const rot = entity.getLocalEulerAngles();
  const scale = entity.getLocalScale();
  return {
    position: [pos.x, pos.y, pos.z],
    rotation: [rot.x, rot.y, rot.z],
    scale: [scale.x, scale.y, scale.z],
  };
}

function applyEntityTransform(entity: pc.Entity, t: TransformData): void {
  entity.setLocalPosition(t.position[0], t.position[1], t.position[2]);
  entity.setLocalEulerAngles(t.rotation[0], t.rotation[1], t.rotation[2]);
  entity.setLocalScale(t.scale[0], t.scale[1], t.scale[2]);
}

function transformsEqual(a: TransformData, b: TransformData): boolean {
  const eps = 1e-5;
  return (
    Math.abs(a.position[0] - b.position[0]) < eps &&
    Math.abs(a.position[1] - b.position[1]) < eps &&
    Math.abs(a.position[2] - b.position[2]) < eps &&
    Math.abs(a.rotation[0] - b.rotation[0]) < eps &&
    Math.abs(a.rotation[1] - b.rotation[1]) < eps &&
    Math.abs(a.rotation[2] - b.rotation[2]) < eps &&
    Math.abs(a.scale[0] - b.scale[0]) < eps &&
    Math.abs(a.scale[1] - b.scale[1]) < eps &&
    Math.abs(a.scale[2] - b.scale[2]) < eps
  );
}

export class GizmoController {
  private readonly eventBus: TypedEventBus<EditorEventMap>;
  private readonly commandManager: CommandManager;

  private readonly translateGizmo: pc.TranslateGizmo;
  private readonly rotateGizmo: pc.RotateGizmo;
  private readonly scaleGizmo: pc.ScaleGizmo;

  private activeGizmo: pc.TransformGizmo | null = null;
  private activeTool: TransformTool = 'select';
  private coordSpace: CoordinateSpace = 'world';
  private snapSettings: GizmoSnapSettings = {
    enabled: false,
    move: 0.5,
    rotate: 15,
    scale: 0.1,
  };

  private attachedEntities: pc.Entity[] = [];
  private dragging = false;
  private lastEmitTime = 0;
  private startSnapshots: Map<string, { entity: pc.Entity; transform: TransformData }> = new Map();
  private destroyed = false;

  constructor(
    app: pc.Application,
    camera: pc.CameraComponent,
    editorLayer: pc.Layer,
    eventBus: TypedEventBus<EditorEventMap>,
    commandManager: CommandManager
  ) {
    void app;
    this.eventBus = eventBus;
    this.commandManager = commandManager;

    this.translateGizmo = new pc.TranslateGizmo(camera, editorLayer);
    this.rotateGizmo = new pc.RotateGizmo(camera, editorLayer);
    this.scaleGizmo = new pc.ScaleGizmo(camera, editorLayer);

    this.wireGizmoEvents(this.translateGizmo);
    this.wireGizmoEvents(this.rotateGizmo);
    this.wireGizmoEvents(this.scaleGizmo);

    this.applyCoordSpace();
    this.applySnapSettings();
  }

  public attach(entities: pc.Entity[]): void {
    if (this.destroyed) return;
    this.attachedEntities = entities.filter((e) => e.parent !== null);

    if (!this.activeGizmo) return;

    if (this.attachedEntities.length === 0) {
      this.activeGizmo.detach();
    } else {
      this.activeGizmo.attach(this.attachedEntities);
    }
  }

  public setTool(tool: TransformTool): void {
    if (this.destroyed || this.activeTool === tool) return;
    this.activeTool = tool;

    if (this.activeGizmo) {
      this.activeGizmo.detach();
      this.activeGizmo = null;
    }

    switch (tool) {
      case 'move':
        this.activeGizmo = this.translateGizmo;
        break;
      case 'rotate':
        this.activeGizmo = this.rotateGizmo;
        break;
      case 'scale':
        this.activeGizmo = this.scaleGizmo;
        break;
      case 'select':
      default:
        this.activeGizmo = null;
        break;
    }

    if (this.activeGizmo && this.attachedEntities.length > 0) {
      this.activeGizmo.attach(this.attachedEntities);
    }
  }

  public setCoordSpace(space: CoordinateSpace): void {
    if (this.destroyed) return;
    this.coordSpace = space;
    this.applyCoordSpace();
  }

  public setSnap(snap: GizmoSnapSettings): void {
    if (this.destroyed) return;
    this.snapSettings = { ...snap };
    this.applySnapSettings();
  }

  public isDragging(): boolean {
    return this.dragging;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dragging = false;
    this.attachedEntities = [];
    this.startSnapshots.clear();

    this.translateGizmo.destroy();
    this.rotateGizmo.destroy();
    this.scaleGizmo.destroy();
    this.activeGizmo = null;
  }

  private applyCoordSpace(): void {
    this.translateGizmo.coordSpace = this.coordSpace;
    this.rotateGizmo.coordSpace = this.coordSpace;
    // ScaleGizmo always operates in local space in PlayCanvas, but setting coordSpace is safe
    this.scaleGizmo.coordSpace = 'local';
  }

  private applySnapSettings(): void {
    const { enabled, move, rotate, scale } = this.snapSettings;

    this.translateGizmo.snap = enabled;
    this.translateGizmo.snapIncrement = move;

    this.rotateGizmo.snap = enabled;
    this.rotateGizmo.snapAngleIncrement = rotate;

    this.scaleGizmo.snap = enabled;
    this.scaleGizmo.snapIncrement = scale;
  }

  private wireGizmoEvents(gizmo: pc.TransformGizmo): void {
    gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMSTART, () => {
      if (this.destroyed) return;
      this.dragging = true;
      this.lastEmitTime = 0;
      this.startSnapshots.clear();

      const entityIds: string[] = [];
      for (const entity of this.attachedEntities) {
        if (!entity.parent) continue;
        const id = entity.getGuid();
        entityIds.push(id);
        this.startSnapshots.set(id, {
          entity,
          transform: readEntityTransform(entity),
        });
      }

      this.eventBus.emit('gizmo:drag-start', { entityIds });
    });

    gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMMOVE, () => {
      if (this.destroyed || !this.dragging) return;
      const now = performance.now();
      if (now - this.lastEmitTime < THROTTLE_MS) return;
      this.lastEmitTime = now;

      for (const entity of this.attachedEntities) {
        if (!entity.parent) continue;
        this.eventBus.emit('entity:transform-updated', {
          entityId: entity.getGuid(),
          transform: readEntityTransform(entity),
          fromGizmo: true,
        });
      }
    });

    gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMEND, () => {
      if (this.destroyed) return;
      this.dragging = false;

      const entityIds: string[] = [];
      const changes: EntityTransformSnapshot[] = [];

      for (const [entityId, start] of this.startSnapshots.entries()) {
        if (!start.entity.parent) continue;
        entityIds.push(entityId);
        const newTransform = readEntityTransform(start.entity);

        this.eventBus.emit('entity:transform-updated', {
          entityId,
          transform: newTransform,
          fromGizmo: true,
        });

        if (!transformsEqual(start.transform, newTransform)) {
          changes.push({
            entity: start.entity,
            entityId,
            oldTransform: start.transform,
            newTransform,
          });
        }
      }

      this.startSnapshots.clear();
      this.eventBus.emit('gizmo:drag-end', { entityIds });

      if (changes.length > 0) {
        const command = this.createTransformBatchCommand(changes);
        this.commandManager.execute(command);
      }
    });
  }

  private createTransformBatchCommand(changes: EntityTransformSnapshot[]): ICommand {
    const labelPrefix =
      this.activeTool === 'rotate'
        ? 'Rotate'
        : this.activeTool === 'scale'
          ? 'Scale'
          : 'Move';
    const label =
      changes.length === 1
        ? `${labelPrefix} ${changes[0].entity.name}`
        : `${labelPrefix} ${changes.length} entities`;

    return {
      id: `transform_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      timestamp: Date.now(),
      execute: () => {
        for (const item of changes) {
          if (!item.entity.parent) continue;
          applyEntityTransform(item.entity, item.newTransform);
          this.eventBus.emit('entity:transform-updated', {
            entityId: item.entityId,
            transform: item.newTransform,
            fromGizmo: false,
          });
        }
        this.refreshAttachedGizmo();
      },
      undo: () => {
        for (const item of changes) {
          if (!item.entity.parent) continue;
          applyEntityTransform(item.entity, item.oldTransform);
          this.eventBus.emit('entity:transform-updated', {
            entityId: item.entityId,
            transform: item.oldTransform,
            fromGizmo: false,
          });
        }
        this.refreshAttachedGizmo();
      },
    };
  }

  private refreshAttachedGizmo(): void {
    if (this.activeGizmo && this.attachedEntities.length > 0) {
      this.activeGizmo.attach(this.attachedEntities);
    }
  }
}
