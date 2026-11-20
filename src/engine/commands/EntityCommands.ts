import * as pc from 'playcanvas';
import type { ICommand } from '../../types';

export interface EntityCommandContext {
  getSceneRoot(): pc.Entity;
  getEntityById(id: string): pc.Entity | null;
  getSelectedEntityIds(): string[];
  selectEntities(ids: string[]): void;
  notifyHierarchyChanged(): void;
  notifyPropertyChanged(entityId: string, property: string, componentId?: string): void;
}

export class CreateEntityCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  private readonly context: EntityCommandContext;
  private readonly parentId: string | null;
  private readonly createFn: () => pc.Entity;
  private createdEntity: pc.Entity | null = null;
  private previousSelection: string[] = [];

  constructor(
    context: EntityCommandContext,
    createFn: () => pc.Entity,
    parentId: string | null = null,
    label = 'Create Entity'
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.createFn = createFn;
    this.parentId = parentId;
    this.label = label;
  }

  getCreatedEntityId(): string | null {
    return this.createdEntity ? this.createdEntity.getGuid() : null;
  }

  execute(): void {
    this.previousSelection = [...this.context.getSelectedEntityIds()];
    if (!this.createdEntity) {
      this.createdEntity = this.createFn();
    }

    const parent =
      (this.parentId ? this.context.getEntityById(this.parentId) : null) ??
      this.context.getSceneRoot();

    if (this.createdEntity.parent !== parent) {
      parent.addChild(this.createdEntity);
    }

    this.context.notifyHierarchyChanged();
    this.context.selectEntities([this.createdEntity.getGuid()]);
  }

  undo(): void {
    if (!this.createdEntity) return;
    if (this.createdEntity.parent) {
      this.createdEntity.parent.removeChild(this.createdEntity);
    }
    this.context.notifyHierarchyChanged();
    this.context.selectEntities(this.previousSelection);
  }
}

interface DeletedEntityRecord {
  entity: pc.Entity;
  parent: pc.Entity;
  index: number;
}

export class DeleteEntityCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  private readonly context: EntityCommandContext;
  private readonly targetIds: string[];
  private records: DeletedEntityRecord[] = [];
  private previousSelection: string[] = [];

  constructor(context: EntityCommandContext, entityIds: string[], label?: string) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.targetIds = [...entityIds];
    this.label = label ?? (entityIds.length === 1 ? 'Delete Entity' : `Delete ${entityIds.length} Entities`);
  }

  execute(): void {
    const sceneRoot = this.context.getSceneRoot();
    this.previousSelection = [...this.context.getSelectedEntityIds()];

    if (this.records.length === 0) {
      const targetSet = new Set(this.targetIds);
      for (const id of this.targetIds) {
        const entity = this.context.getEntityById(id);
        if (!entity || entity === sceneRoot) continue;
        // Skip if an ancestor is also being deleted
        let hasDeletedAncestor = false;
        let p = entity.parent;
        while (p && p !== sceneRoot) {
          if (targetSet.has((p as pc.Entity).getGuid())) {
            hasDeletedAncestor = true;
            break;
          }
          p = p.parent;
        }
        if (hasDeletedAncestor) continue;

        const parent = entity.parent as pc.Entity | null;
        if (!parent) continue;
        const index = parent.children.indexOf(entity);
        this.records.push({ entity, parent, index });
      }
      // Sort descending by index so removal doesn't shift earlier indices
      this.records.sort((a, b) => b.index - a.index);
    }

    for (const rec of this.records) {
      if (rec.entity.parent === rec.parent) {
        rec.parent.removeChild(rec.entity);
      }
    }

    this.context.notifyHierarchyChanged();
    this.context.selectEntities([]);
  }

  undo(): void {
    // Re-insert in ascending index order
    const ascending = [...this.records].sort((a, b) => a.index - b.index);
    const restoredIds: string[] = [];
    for (const rec of ascending) {
      const insertAt = Math.min(rec.index, rec.parent.children.length);
      rec.parent.insertChild(rec.entity, insertAt);
      restoredIds.push(rec.entity.getGuid());
    }

    this.context.notifyHierarchyChanged();
    this.context.selectEntities(this.previousSelection.length > 0 ? this.previousSelection : restoredIds);
  }
}

interface DuplicatedRecord {
  clone: pc.Entity;
  parent: pc.Entity;
  insertIndex: number;
}

export class DuplicateEntityCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  private readonly context: EntityCommandContext;
  private readonly targetIds: string[];
  private records: DuplicatedRecord[] = [];
  private previousSelection: string[] = [];

  constructor(context: EntityCommandContext, entityIds: string[], label?: string) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.targetIds = [...entityIds];
    this.label =
      label ?? (entityIds.length === 1 ? 'Duplicate Entity' : `Duplicate ${entityIds.length} Entities`);
  }

  getDuplicatedIds(): string[] {
    return this.records.map((r) => r.clone.getGuid());
  }

  execute(): void {
    const sceneRoot = this.context.getSceneRoot();
    this.previousSelection = [...this.context.getSelectedEntityIds()];

    if (this.records.length === 0) {
      for (const id of this.targetIds) {
        const source = this.context.getEntityById(id);
        if (!source || source === sceneRoot || !source.parent) continue;

        const parent = source.parent as pc.Entity;
        const clone = source.clone() as pc.Entity;
        clone.name = `${source.name} (Copy)`;
        const sourceIdx = parent.children.indexOf(source);
        this.records.push({
          clone,
          parent,
          insertIndex: sourceIdx >= 0 ? sourceIdx + 1 : parent.children.length,
        });
      }
    }

    const newIds: string[] = [];
    for (const rec of this.records) {
      const idx = Math.min(rec.insertIndex, rec.parent.children.length);
      rec.parent.insertChild(rec.clone, idx);
      newIds.push(rec.clone.getGuid());
    }

    this.context.notifyHierarchyChanged();
    this.context.selectEntities(newIds);
  }

  undo(): void {
    for (const rec of this.records) {
      if (rec.clone.parent === rec.parent) {
        rec.parent.removeChild(rec.clone);
      }
    }
    this.context.notifyHierarchyChanged();
    this.context.selectEntities(this.previousSelection);
  }
}

export class RenameEntityCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  private readonly context: EntityCommandContext;
  private readonly entityId: string;
  private readonly oldName: string;
  private readonly newName: string;

  constructor(context: EntityCommandContext, entityId: string, oldName: string, newName: string) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.entityId = entityId;
    this.oldName = oldName;
    this.newName = newName;
    this.label = `Rename ${oldName} to ${newName}`;
  }

  execute(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;
    entity.name = this.newName;
    this.context.notifyPropertyChanged(this.entityId, 'name');
    this.context.notifyHierarchyChanged();
  }

  undo(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;
    entity.name = this.oldName;
    this.context.notifyPropertyChanged(this.entityId, 'name');
    this.context.notifyHierarchyChanged();
  }
}

export class ToggleEntityEnabledCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  private readonly context: EntityCommandContext;
  private readonly entityId: string;
  private readonly oldEnabled: boolean;
  private readonly newEnabled: boolean;

  constructor(
    context: EntityCommandContext,
    entityId: string,
    oldEnabled: boolean,
    newEnabled: boolean
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.entityId = entityId;
    this.oldEnabled = oldEnabled;
    this.newEnabled = newEnabled;
    this.label = newEnabled ? 'Enable Entity' : 'Disable Entity';
  }

  execute(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;
    entity.enabled = this.newEnabled;
    this.context.notifyPropertyChanged(this.entityId, 'enabled');
    this.context.notifyHierarchyChanged();
  }

  undo(): void {
    const entity = this.context.getEntityById(this.entityId);
    if (!entity) return;
    entity.enabled = this.oldEnabled;
    this.context.notifyPropertyChanged(this.entityId, 'enabled');
    this.context.notifyHierarchyChanged();
  }
}

export class ReparentEntityCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  private readonly context: EntityCommandContext;
  private readonly entityId: string;
  private readonly newParentId: string;
  private readonly insertIndex?: number;
  private oldParentId: string | null = null;
  private oldIndex = -1;

  constructor(
    context: EntityCommandContext,
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

  private isDescendantOrSelf(candidate: pc.GraphNode, ancestor: pc.GraphNode): boolean {
    let current: pc.GraphNode | null = candidate;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  private reparentPreservingWorldTransform(
    entity: pc.Entity,
    targetParent: pc.Entity,
    index?: number
  ): void {
    const worldPos = entity.getPosition().clone();
    const worldRot = entity.getRotation().clone();
    const worldScale = entity.getScale().clone();

    const currentParent = entity.parent as pc.Entity | null;
    let targetIndex = index;
    if (currentParent === targetParent && targetIndex !== undefined) {
      const currentIdx = currentParent.children.indexOf(entity);
      if (currentIdx >= 0 && currentIdx < targetIndex) {
        targetIndex -= 1;
      }
    }

    if (currentParent) {
      currentParent.removeChild(entity);
    }

    if (targetIndex !== undefined) {
      const clamped = Math.max(0, Math.min(targetIndex, targetParent.children.length));
      targetParent.insertChild(entity, clamped);
    } else {
      targetParent.addChild(entity);
    }

    entity.setPosition(worldPos);
    entity.setRotation(worldRot);

    const parentScale = targetParent.getScale();
    const eps = 1e-6;
    const localScale = entity.getLocalScale();
    const sx = Math.abs(parentScale.x) > eps ? worldScale.x / parentScale.x : localScale.x;
    const sy = Math.abs(parentScale.y) > eps ? worldScale.y / parentScale.y : localScale.y;
    const sz = Math.abs(parentScale.z) > eps ? worldScale.z / parentScale.z : localScale.z;
    entity.setLocalScale(sx, sy, sz);
  }

  execute(): void {
    const sceneRoot = this.context.getSceneRoot();
    const entity = this.context.getEntityById(this.entityId);
    const newParent = this.context.getEntityById(this.newParentId);

    if (!entity || !newParent || entity === sceneRoot) return;
    if (this.isDescendantOrSelf(newParent, entity)) return;

    const currentParent = entity.parent as pc.Entity | null;
    if (!currentParent) return;

    if (this.oldParentId === null) {
      this.oldParentId = currentParent.getGuid();
      this.oldIndex = currentParent.children.indexOf(entity);
    }

    if (currentParent === newParent && this.insertIndex === undefined) {
      return;
    }

    this.reparentPreservingWorldTransform(entity, newParent, this.insertIndex);
    this.context.notifyPropertyChanged(this.entityId, 'transform');
    this.context.notifyHierarchyChanged();
  }

  undo(): void {
    if (!this.oldParentId) return;
    const entity = this.context.getEntityById(this.entityId);
    const oldParent = this.context.getEntityById(this.oldParentId);
    if (!entity || !oldParent) return;

    const restoreIndex = this.oldIndex >= 0 ? this.oldIndex : undefined;
    this.reparentPreservingWorldTransform(entity, oldParent, restoreIndex);
    this.context.notifyPropertyChanged(this.entityId, 'transform');
    this.context.notifyHierarchyChanged();
  }
}
