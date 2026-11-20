import * as pc from 'playcanvas';
import type { ScriptAttributeValue, ScriptComponentData } from '../../types';
import { getEntityMeta } from '../serialization/EntityComponentHelper';
import type { ConsoleBridge, ScopedConsole } from './ConsoleBridge';

export interface ScriptSandboxOptions {
  app: pc.Application;
  sceneRoot: pc.Entity;
  consoleBridge: ConsoleBridge;
  getEntityById: (id: string) => pc.Entity | null;
  emitEvent?: (eventName: string, payload?: unknown) => void;
}

interface CompiledScriptHooks {
  onStart?: (...args: unknown[]) => unknown;
  onUpdate?: (...args: unknown[]) => unknown;
  onClick?: (...args: unknown[]) => unknown;
  onCollision?: (...args: unknown[]) => unknown;
}

interface ScriptInstance {
  entity: pc.Entity;
  source: string;
  hooks: CompiledScriptHooks;
  collisionCleanup?: () => void;
}

type ScriptFactory = (
  entity: pc.Entity,
  app: pc.Application,
  attributes: Record<string, unknown>,
  console: ScopedConsole,
  emitEvent: (eventName: string, payload?: unknown) => void,
  playcanvas: typeof pc
) => CompiledScriptHooks;

function transformUserCode(rawCode: string): string {
  // Strip ES module `export` modifiers so `new Function` can compile user scripts.
  let transformed = rawCode.replace(
    /^\s*export\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b|class\b)/gm,
    ''
  );
  transformed = transformed.replace(/^\s*export\s+default\s+/gm, 'const __defaultExport = ');
  transformed = transformed.replace(/^\s*export\s*\{[^}]*\}\s*;?/gm, '');

  return `"use strict";
let __defaultExport;
${transformed}
const __exp = (__defaultExport && typeof __defaultExport === 'object') ? __defaultExport : {};
return {
  onStart: typeof onStart === 'function' ? onStart : (typeof __exp.onStart === 'function' ? __exp.onStart : undefined),
  onUpdate: typeof onUpdate === 'function' ? onUpdate : (typeof __exp.onUpdate === 'function' ? __exp.onUpdate : undefined),
  onClick: typeof onClick === 'function' ? onClick : (typeof __exp.onClick === 'function' ? __exp.onClick : undefined),
  onCollision: typeof onCollision === 'function' ? onCollision : (typeof __exp.onCollision === 'function' ? __exp.onCollision : undefined),
};`;
}

function buildAttributesObject(
  attrs: ScriptAttributeValue[],
  getEntityById: (id: string) => pc.Entity | null
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const attr of attrs) {
    if (!attr.name) continue;
    if (attr.type === 'entity' && typeof attr.value === 'string') {
      result[attr.name] = getEntityById(attr.value);
    } else if (Array.isArray(attr.value)) {
      result[attr.name] = [...attr.value];
    } else {
      result[attr.name] = attr.value;
    }
  }
  return result;
}

export class ScriptSandbox {
  private readonly app: pc.Application;
  private readonly sceneRoot: pc.Entity;
  private readonly consoleBridge: ConsoleBridge;
  private readonly getEntityById: (id: string) => pc.Entity | null;
  private readonly emitEvent: (eventName: string, payload?: unknown) => void;

  private instances: ScriptInstance[] = [];
  private instanceByEntity = new Map<pc.Entity, ScriptInstance[]>();
  private started = false;
  private destroyed = false;

  constructor(options: ScriptSandboxOptions) {
    this.app = options.app;
    this.sceneRoot = options.sceneRoot;
    this.consoleBridge = options.consoleBridge;
    this.getEntityById = options.getEntityById;
    this.emitEvent = options.emitEvent ?? (() => {});
  }

  start(): void {
    if (this.destroyed || this.started) return;
    this.started = true;

    this.collectScripts(this.sceneRoot);

    for (const instance of this.instances) {
      if (!instance.entity.enabled) continue;
      this.invokeStart(instance);
    }
  }

  update(dt: number): void {
    if (this.destroyed || !this.started) return;
    this.tickScripts(dt);
  }

  step(dt: number): void {
    if (this.destroyed || !this.started) return;
    this.tickScripts(dt);
  }

  handleEntityClick(entity: pc.Entity): void {
    if (this.destroyed || !this.started || !entity.enabled) return;
    const list = this.instanceByEntity.get(entity);
    if (!list) return;

    for (const instance of list) {
      const fn = instance.hooks.onClick;
      if (!fn) continue;
      try {
        if (fn.length >= 1) {
          fn(instance.entity);
        } else {
          fn();
        }
      } catch (err) {
        this.consoleBridge.errorFrom(instance.source, err);
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;

    for (const instance of this.instances) {
      instance.collisionCleanup?.();
    }
    this.instances = [];
    this.instanceByEntity.clear();
  }

  private tickScripts(dt: number): void {
    for (const instance of this.instances) {
      if (!instance.entity.enabled) continue;
      const fn = instance.hooks.onUpdate;
      if (!fn) continue;
      try {
        if (fn.length >= 2) {
          fn(instance.entity, dt);
        } else if (fn.length === 1) {
          fn(dt);
        } else {
          fn();
        }
      } catch (err) {
        this.consoleBridge.errorFrom(instance.source, err);
      }
    }
  }

  private invokeStart(instance: ScriptInstance): void {
    const fn = instance.hooks.onStart;
    if (!fn) return;
    try {
      if (fn.length >= 1) {
        fn(instance.entity);
      } else {
        fn();
      }
    } catch (err) {
      this.consoleBridge.errorFrom(instance.source, err);
    }
  }

  private collectScripts(node: pc.GraphNode): void {
    if (node instanceof pc.Entity && node !== this.sceneRoot) {
      const meta = getEntityMeta(node);
      if (meta.script && meta.script.enabled) {
        this.compileAndRegister(node, meta.script);
      }
    }
    for (const child of node.children) {
      this.collectScripts(child);
    }
  }

  private compileAndRegister(entity: pc.Entity, scriptData: ScriptComponentData): void {
    const scriptName = scriptData.scriptName?.trim() || 'Script';
    const source = `${entity.name}/${scriptName}`;
    const scopedConsole = this.consoleBridge.createScopedConsole(source);
    const attributes = buildAttributesObject(scriptData.attributes ?? [], this.getEntityById);

    let hooks: CompiledScriptHooks;
    try {
      const body = transformUserCode(scriptData.code ?? '');
      const factory = new Function(
        'entity',
        'app',
        'attributes',
        'console',
        'emitEvent',
        'pc',
        body
      ) as ScriptFactory;

      hooks = factory(
        entity,
        this.app,
        attributes,
        scopedConsole,
        (eventName: string, payload?: unknown) => this.emitEvent(eventName, payload),
        pc
      );
    } catch (err) {
      this.consoleBridge.errorFrom(source, err);
      return;
    }

    const instance: ScriptInstance = {
      entity,
      source,
      hooks,
    };

    if (hooks.onCollision && entity.collision) {
      const onCollisionStart = (result: pc.ContactResult) => {
        if (this.destroyed || !entity.enabled) return;
        this.invokeCollision(instance, result?.other);
      };
      const onTriggerEnter = (other: pc.Entity) => {
        if (this.destroyed || !entity.enabled) return;
        this.invokeCollision(instance, other);
      };

      entity.collision.on('collisionstart', onCollisionStart);
      entity.collision.on('triggerenter', onTriggerEnter);
      instance.collisionCleanup = () => {
        entity.collision?.off('collisionstart', onCollisionStart);
        entity.collision?.off('triggerenter', onTriggerEnter);
      };
    }

    this.instances.push(instance);
    const existing = this.instanceByEntity.get(entity);
    if (existing) {
      existing.push(instance);
    } else {
      this.instanceByEntity.set(entity, [instance]);
    }
  }

  private invokeCollision(instance: ScriptInstance, other: pc.Entity | undefined): void {
    const fn = instance.hooks.onCollision;
    if (!fn || !other) return;
    try {
      if (fn.length >= 2) {
        fn(instance.entity, other);
      } else {
        fn(other);
      }
    } catch (err) {
      this.consoleBridge.errorFrom(instance.source, err);
    }
  }
}
