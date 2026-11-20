import type * as pc from 'playcanvas';
import type { EditorEventMap, ICommand, TransformData, TypedEventBus } from '../../types';

export interface TransformCommandEntry {
  entity: pc.Entity;
  oldTransform: TransformData;
  newTransform: TransformData;
}

function applyTransform(entity: pc.Entity, transform: TransformData): void {
  entity.setLocalPosition(transform.position[0], transform.position[1], transform.position[2]);
  entity.setLocalEulerAngles(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
  entity.setLocalScale(transform.scale[0], transform.scale[1], transform.scale[2]);
}

function cloneTransform(t: TransformData): TransformData {
  return {
    position: [t.position[0], t.position[1], t.position[2]],
    rotation: [t.rotation[0], t.rotation[1], t.rotation[2]],
    scale: [t.scale[0], t.scale[1], t.scale[2]],
  };
}

export class TransformCommand implements ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  private readonly entries: TransformCommandEntry[];
  private readonly eventBus?: TypedEventBus<EditorEventMap>;

  constructor(
    entries: TransformCommandEntry[],
    eventBus?: TypedEventBus<EditorEventMap>,
    label?: string
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.entries = entries.map((entry) => ({
      entity: entry.entity,
      oldTransform: cloneTransform(entry.oldTransform),
      newTransform: cloneTransform(entry.newTransform),
    }));
    this.eventBus = eventBus;
    this.label =
      label ??
      (this.entries.length === 1
        ? `Transform ${this.entries[0].entity.name}`
        : `Transform ${this.entries.length} entities`);
  }

  execute(): void {
    for (const entry of this.entries) {
      applyTransform(entry.entity, entry.newTransform);
      this.eventBus?.emit('entity:transform-updated', {
        entityId: entry.entity.getGuid(),
        transform: cloneTransform(entry.newTransform),
        fromGizmo: false,
      });
    }
  }

  undo(): void {
    for (const entry of this.entries) {
      applyTransform(entry.entity, entry.oldTransform);
      this.eventBus?.emit('entity:transform-updated', {
        entityId: entry.entity.getGuid(),
        transform: cloneTransform(entry.oldTransform),
        fromGizmo: false,
      });
    }
  }
}
