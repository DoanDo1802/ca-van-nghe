import { EditorEngine } from '../../engine/EditorEngine';
import { ProjectRepository } from '../../storage';
import { useConsoleStore } from '../../store/useConsoleStore';
import { useEditorStore } from '../../store/useEditorStore';

/**
 * Saves the current scene both to the saved projects store and to the auto-draft slot
 * so that refreshing the browser always restores the latest saved state.
 */
export async function saveCurrentProject(): Promise<boolean> {
  const engine = EditorEngine.getInstance();
  const store = useEditorStore.getState();

  if (store.playState !== 'edit') {
    useConsoleStore.getState().addLog({
      level: 'warn',
      source: 'File',
      message: 'Stop Play Mode before saving the project.',
    });
    return false;
  }

  try {
    const schema = engine.exportSceneSchema();
    await ProjectRepository.saveProject(schema);
    await ProjectRepository.saveAutoDraft(schema);
    store.setDirty(false);
    useConsoleStore.getState().addLog({
      level: 'log',
      source: 'File',
      message: `Saved project "${schema.metadata.name}" to IndexedDB.`,
    });
    return true;
  } catch (err) {
    useConsoleStore.getState().addLog({
      level: 'error',
      source: 'File',
      message: `Save Project failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return false;
  }
}
