import { useEffect } from 'react';
import { EditorEngine } from '../../engine/EditorEngine';
import { useEditorStore } from '../../store/useEditorStore';
import type { TransformTool } from '../../types';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

/**
 * Global editor keyboard shortcuts:
 * - Q / W / E / R: Select / Move / Rotate / Scale
 * - F: Focus camera on selected entity
 * - Ctrl+Z: Undo
 * - Ctrl+Y / Ctrl+Shift+Z: Redo
 * - Ctrl+D: Duplicate selected entities
 * - Delete: Delete selected entities
 * - F2: Rename primary selected entity
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) {
        return;
      }

      const engine = EditorEngine.getInstance();
      const store = useEditorStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            engine.redo();
          } else {
            engine.undo();
          }
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          engine.redo();
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          const deletable = store.selectedEntityIds.filter((id) => id !== store.rootEntityId);
          if (deletable.length > 0) {
            engine.duplicateEntities(deletable);
          }
          return;
        }
        return;
      }

      if (e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'q': {
          const tool: TransformTool = 'select';
          store.setActiveTool(tool);
          engine.setTool(tool);
          break;
        }
        case 'w': {
          const tool: TransformTool = 'move';
          store.setActiveTool(tool);
          engine.setTool(tool);
          break;
        }
        case 'e': {
          const tool: TransformTool = 'rotate';
          store.setActiveTool(tool);
          engine.setTool(tool);
          break;
        }
        case 'r': {
          const tool: TransformTool = 'scale';
          store.setActiveTool(tool);
          engine.setTool(tool);
          break;
        }
        case 'f': {
          engine.focusSelected();
          break;
        }
        case 'delete': {
          const deletable = store.selectedEntityIds.filter((id) => id !== store.rootEntityId);
          if (deletable.length > 0) {
            e.preventDefault();
            engine.deleteEntities(deletable);
          }
          break;
        }
        case 'f2': {
          const primaryId = store.selectedEntityIds[0];
          if (primaryId && primaryId !== store.rootEntityId) {
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent('editor:rename-entity', { detail: { entityId: primaryId } })
            );
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
