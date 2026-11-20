import * as pc from 'playcanvas';
import type {
  ComponentData,
  ComponentType,
  ICommand,
  TransformData,
} from '../../types';
import {
  applyComponentDataToEntity,
  createDefaultComponentData,
  removeComponentByType,
} from '../serialization/EntityComponentHelper';
import { serializeEntity } from '../serialization/SceneSerializer';

export interface ComponentCommandContext {
  getSceneRoot(): pc.Entity;
  getEntityById(id: string): pc.Entity | null;
  trackMaterial(mat: pc.StandardMaterial): void;
  notifyHierarchyChanged(): void;
  notifyPropertyChanged(entityId: string, property: string, componentId?: string): void;
  notifyTransformUpdated(entityId: string, transform: TransformData, fromGizmo?: boolean): void;
}

function cloneTransform(t: TransformData): TransformData {
  return {
    position: [t.position[0], t.position[1], t.position[2]],
    rotation: [t.rotation[0], t.rotation[1], t.rotation[2]],
    scale: [t.scale[0], t.scale[1], t.scale[2]],
  };
}

function applyLocalTransform(entity: pc.Entity, t: TransformData): void {
  entity.setLocalPosition(t.position[0], t.position[1], t.position[2]);
  entity.setLocalEulerAngles(t.rotation[0], t.rotation[1], t.rotation[2]);
  entity.setLocalScale(t.scale[0], t.scale[1], t.scale[2]);
}

function findComponentOnEntity(entity: pc.Entity, componentId: string): ComponentData | null {
  const data = serializeEntity(entity);
  return data.components.find((c) => c.id === componentId) ?? null;
}

function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let curr: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = curr[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      curr[key] = {};
    }
    curr = curr[key] as Record<string, unknown>;
  }
  curr[parts[parts.length - 1]] = structuredClone(value);
}

function deepMergeRecord(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'type') continue;
    if (key.includes('.')) {
      setByPath(target, key, value);
      continue;
    }
    const existing = target[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      deepMergeRecord(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = structuredClone(value);
    }
  }
}

export function mergeComponentPatch(
  base: ComponentData,
  patch: Record<string, unknown>
): ComponentData {
  const next = structuredClone(base) as unknown as Record<string, unknown>;
  deepMergeRecord(next, patch);
  return next as unknown as ComponentData;
}

export class AddComponentCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;

  private readonly context: ComponentCommandContext;
  private readonly entityId: string;
  private readonly componentType: ComponentType;
  private componentData: ComponentData | null = null;
  private added = false;

  constructor(
    context: ComponentCommandContext,
    entityId: string,
    componentType: ComponentType,
    label?: string
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.entityId = entityId;
    this.componentType = componentType;
    this.label = label ?? `Add ${componentType} Component`;
  }

  execute(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;

    const existing = serializeEntity(entity).components.find(
      (c) => c.type === this.componentType
    );
    if (existing) {
      this.added = false;
      return;
    }

    if (!this.componentData) {
      this.componentData = createDefaultComponentData(this.componentType);
    }

    applyComponentDataToEntity(entity, this.componentData, (mat) =>
      this.context.trackMaterial(mat)
    );
    this.added = true;
    this.context.notifyPropertyChanged(this.entityId, 'components', this.componentData.id);
    this.context.notifyHierarchyChanged();
  }

  undo(): void {
    if (!this.added || !this.componentData) return;
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;

    removeComponentByType(entity, this.componentData.type);
    this.context.notifyPropertyChanged(this.entityId, 'components', this.componentData.id);
    this.context.notifyHierarchyChanged();
  }
}

export class RemoveComponentCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;

  private readonly context: ComponentCommandContext;
  private readonly entityId: string;
  private readonly componentId: string;
  private capturedData: ComponentData | null = null;

  constructor(
    context: ComponentCommandContext,
    entityId: string,
    componentId: string,
    label = 'Remove Component'
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.entityId = entityId;
    this.componentId = componentId;
    this.label = label;
  }

  execute(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;

    if (!this.capturedData) {
      this.capturedData = findComponentOnEntity(entity, this.componentId);
    }
    if (!this.capturedData) return;

    removeComponentByType(entity, this.capturedData.type);
    this.context.notifyPropertyChanged(this.entityId, 'components', this.componentId);
    this.context.notifyHierarchyChanged();
  }

  undo(): void {
    if (!this.capturedData) return;
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;

    applyComponentDataToEntity(entity, this.capturedData, (mat) =>
      this.context.trackMaterial(mat)
    );
    this.context.notifyPropertyChanged(this.entityId, 'components', this.capturedData.id);
    this.context.notifyHierarchyChanged();
  }
}

export class UpdateComponentPropertyCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;

  private readonly context: ComponentCommandContext;
  private readonly entityId: string;
  private readonly componentId: string;
  private readonly patch: Record<string, unknown>;
  private oldData: ComponentData | null = null;
  private newData: ComponentData | null = null;

  constructor(
    context: ComponentCommandContext,
    entityId: string,
    componentId: string,
    patch: Record<string, unknown>,
    label = 'Update Component'
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.entityId = entityId;
    this.componentId = componentId;
    this.patch = structuredClone(patch);
    this.label = label;
  }

  execute(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;

    if (!this.oldData) {
      this.oldData = findComponentOnEntity(entity, this.componentId);
      if (!this.oldData) return;
      this.newData = mergeComponentPatch(this.oldData, this.patch);
    }

    if (!this.newData) return;
    applyComponentDataToEntity(entity, this.newData, (mat) =>
      this.context.trackMaterial(mat)
    );
    const firstKey = Object.keys(this.patch)[0] ?? 'component';
    this.context.notifyPropertyChanged(this.entityId, firstKey, this.componentId);
  }

  undo(): void {
    if (!this.oldData) return;
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;

    applyComponentDataToEntity(entity, this.oldData, (mat) =>
      this.context.trackMaterial(mat)
    );
    const firstKey = Object.keys(this.patch)[0] ?? 'component';
    this.context.notifyPropertyChanged(this.entityId, firstKey, this.componentId);
  }
}

export class UpdateTransformCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;

  private readonly context: ComponentCommandContext;
  private readonly entityId: string;
  private readonly oldTransform: TransformData;
  private readonly newTransform: TransformData;

  constructor(
    context: ComponentCommandContext,
    entityId: string,
    oldTransform: TransformData,
    newTransform: TransformData,
    label = 'Update Transform'
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.entityId = entityId;
    this.oldTransform = cloneTransform(oldTransform);
    this.newTransform = cloneTransform(newTransform);
    this.label = label;
  }

  execute(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;
    applyLocalTransform(entity, this.newTransform);
    this.context.notifyTransformUpdated(this.entityId, cloneTransform(this.newTransform), false);
  }

  undo(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;
    applyLocalTransform(entity, this.oldTransform);
    this.context.notifyTransformUpdated(this.entityId, cloneTransform(this.oldTransform), false);
  }
}

function reparentPreservingWorldTransform(
  entity: pc.Entity,
  newParent: pc.Entity,
  insertIndex?: number
): void {
  const worldPos = entity.getPosition().clone();
  const worldRot = entity.getRotation().clone();
  const worldScale = entity.getWorldTransform().getScale().clone();

  if (entity.parent) {
    entity.parent.removeChild(entity);
  }

  if (insertIndex !== undefined && insertIndex >= 0) {
    const clamped = Math.min(insertIndex, newParent.children.length);
    newParent.insertChild(entity, clamped);
  } else {
    newParent.addChild(entity);
  }

  entity.setPosition(worldPos);
  entity.setRotation(worldRot);

  const parentWorldScale = newParent.getWorldTransform().getScale();
  entity.setLocalScale(
    parentWorldScale.x !== 0 ? worldScale.x / parentWorldScale.x : worldScale.x,
    parentWorldScale.y !== 0 ? worldScale.y / parentWorldScale.y : worldScale.y,
    parentWorldScale.z !== 0 ? worldScale.z / parentWorldScale.z : worldScale.z
  );
}

export class ReparentEntityCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;

  private readonly context: ComponentCommandContext;
  private readonly entityId: string;
  private readonly newParentId: string;
  private readonly insertIndex?: number;
  private oldParentId: string | null = null;
  private oldIndex = -1;

  constructor(
    context: ComponentCommandContext,
    entityId: string,
    newParentId: string,
    insertIndex?: number,
    label = 'Reparent Entity'
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.entityId = entityId;
    this.newParentId = newParentId;
    this.insertIndex = insertIndex;
    this.label = label;
  }

  execute(): void {
    const entity = this.context.getEntityById(this.entityId);
    const newParent = this.context.getEntityById(this.newParentId);
    const sceneRoot = this.context.getSceneRoot();
    if (!entity || !newParent || entity === sceneRoot || entity === newParent) return;

    // Prevent cycles (newParent cannot be a descendant of entity)
    let ancestor: pc.GraphNode | null = newParent;
    while (ancestor) {
      if (ancestor === entity) return;
      ancestor = ancestor.parent;
    }

    if (this.oldParentId === null && entity.parent instanceof pc.Entity) {
      this.oldParentId = entity.parent.getGuid();
      this.oldIndex = entity.parent.children.indexOf(entity);
    }

    reparentPreservingWorldTransform(entity, newParent, this.insertIndex);

    const pos = entity.getLocalPosition();
    const rot = entity.getLocalEulerAngles();
    const scale = entity.getLocalScale();
    this.context.notifyTransformUpdated(
      this.entityId,
      {
        position: [pos.x, pos.y, pos.z],
        rotation: [rot.x, rot.y, rot.z],
        scale: [scale.x, scale.y, scale.z],
      },
      false
    );
    this.context.notifyHierarchyChanged();
  }

  undo(): void {
    if (!this.oldParentId) return;
    const entity = this.context.getEntityById(this.entityId);
    const oldParent = this.context.getEntityById(this.oldParentId);
    if (!entity || !oldParent) return;

    reparentPreservingWorldTransform(
      entity,
      oldParent,
      this.oldIndex >= 0 ? this.oldIndex : undefined
    );

    const pos = entity.getLocalPosition();
    const rot = entity.getLocalEulerAngles();
    const scale = entity.getLocalScale();
    this.context.notifyTransformUpdated(
      this.entityId,
      {
        position: [pos.x, pos.y, pos.z],
        rotation: [rot.x, rot.y, rot.z],
        scale: [scale.x, scale.y, scale.z],
      },
      false
    );
    this.context.notifyHierarchyChanged();
  }
}
