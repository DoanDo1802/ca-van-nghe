import { useEffect, useRef } from 'react';
import { EditorEngine } from '../../engine/EditorEngine';
import { useConsoleStore } from '../../store/useConsoleStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useTimelineStore } from '../../store/useTimelineStore';
import { DebugLogger } from '../../utils/debugLogger';

const TRANSFORM_THROTTLE_MS = 50;

/**
 * Bridges `EditorEngine.getInstance().eventBus` events into Zustand UI stores.
 * Throttles high-frequency transform updates so React never re-renders at 60fps.
 */
export function useEngineSync(): void {
  const lastTransformBumpRef = useRef<number>(0);
  const pendingTransformTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const engine = EditorEngine.getInstance();
    const bus = engine.eventBus;
    const uninstallHooks = DebugLogger.installGlobalHooks();
    const unsubDebugLogger = DebugLogger.subscribe((entry) => {
      useConsoleStore.getState().addLog(entry);
    }, true);

    const syncHierarchy = () => {
      const list = engine.getEntitySummaries();
      const summaries: Record<string, (typeof list)[number]> = {};
      for (const item of list) {
        summaries[item.id] = item;
      }
      const rootId = engine.getSceneRoot()?.getGuid() ?? null;
      useEditorStore.getState().setEntitySummaries(summaries, rootId);
    };

    const unsubs = [
      bus.on('engine:ready', ({ version }) => {
        const store = useEditorStore.getState();
        store.setEngineReady(true);
        syncHierarchy();
        useConsoleStore.getState().addLog({
          level: 'log',
          message: `PlayCanvas v${version} initialized`,
          source: 'Engine',
        });
      }),

      bus.on('scene:loaded', ({ sceneId }) => {
        const store = useEditorStore.getState();
        store.clearSelection();
        syncHierarchy();
        const rootId = engine.getSceneRoot()?.getGuid() ?? '';
        store.setSceneMeta(sceneId, engine.getSceneName(), rootId);
        store.setDirty(false);
        useTimelineStore.getState().syncFromEngine();
      }),

      bus.on('hierarchy:changed', () => {
        syncHierarchy();
      }),

      bus.on('selection:changed', ({ entityIds }) => {
        useEditorStore.getState().setSelectedEntityIds(entityIds);
      }),

      bus.on('entity:transform-updated', () => {
        const now = performance.now();
        const elapsed = now - lastTransformBumpRef.current;
        if (elapsed >= TRANSFORM_THROTTLE_MS) {
          lastTransformBumpRef.current = now;
          useEditorStore.getState().bumpInspectorVersion();
        } else if (pendingTransformTimerRef.current === null) {
          pendingTransformTimerRef.current = window.setTimeout(() => {
            pendingTransformTimerRef.current = null;
            lastTransformBumpRef.current = performance.now();
            useEditorStore.getState().bumpInspectorVersion();
          }, TRANSFORM_THROTTLE_MS - elapsed);
        }
      }),

      bus.on('entity:property-changed', () => {
        syncHierarchy();
        useEditorStore.getState().bumpInspectorVersion();
      }),

      bus.on('tool:changed', ({ tool, space }) => {
        const store = useEditorStore.getState();
        store.setActiveTool(tool);
        store.setCoordSpace(space);
      }),

      bus.on('playmode:changed', ({ state }) => {
        const prevState = useEditorStore.getState().playState;
        if (prevState === 'edit' && state === 'playing' && useConsoleStore.getState().clearOnPlay) {
          DebugLogger.clearBuffer();
          useConsoleStore.getState().clearLogs();
        }
        useEditorStore.getState().setPlayState(state);
        if (state === 'edit') {
          syncHierarchy();
        }
        useEditorStore.getState().bumpInspectorVersion();
      }),

      bus.on('command:executed', ({ label, canUndo, canRedo }) => {
        useEditorStore.getState().setCommandHistoryState(canUndo, canRedo, label);
      }),

      bus.on('timeline:keyframe-recorded', () => {
        useTimelineStore.getState().syncFromEngine();
      }),

      bus.on('console:message', (payload) => {
        useConsoleStore.getState().addLog(payload);
      }),
    ];

    return () => {
      unsubDebugLogger();
      uninstallHooks();
      if (pendingTransformTimerRef.current !== null) {
        window.clearTimeout(pendingTransformTimerRef.current);
        pendingTransformTimerRef.current = null;
      }
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, []);
}
