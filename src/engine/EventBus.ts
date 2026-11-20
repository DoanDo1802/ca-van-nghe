import type { EditorEventMap, EventHandler, TypedEventBus } from '../types';

export class EventBus<TMap extends object = EditorEventMap> implements TypedEventBus<TMap> {
  private listeners = new Map<keyof TMap, Set<EventHandler<unknown>>>();

  on<K extends keyof TMap>(event: K, handler: EventHandler<TMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as EventHandler<unknown>);
    return () => this.off(event, handler);
  }

  once<K extends keyof TMap>(event: K, handler: EventHandler<TMap[K]>): () => void {
    const wrapper: EventHandler<TMap[K]> = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof TMap>(event: K, handler: EventHandler<TMap[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as EventHandler<unknown>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      (handler as EventHandler<TMap[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
