import type { EditorEventMap, ICommand, TypedEventBus } from '../types';

export class CommandManager {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private readonly maxHistory: number;
  private readonly eventBus: TypedEventBus<EditorEventMap>;

  constructor(eventBus: TypedEventBus<EditorEventMap>, maxHistory = 100) {
    this.eventBus = eventBus;
    this.maxHistory = maxHistory;
  }

  execute(command: ICommand): void {
    command.execute();

    const prev = this.undoStack[this.undoStack.length - 1];
    if (prev?.merge?.(command)) {
      // Merged into previous command
    } else {
      this.undoStack.push(command);
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
    }

    this.redoStack.length = 0;
    this.emitExecuted(command.label);
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;

    command.undo();
    this.redoStack.push(command);
    this.emitExecuted(`Undo: ${command.label}`);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;

    command.execute();
    this.undoStack.push(command);
    this.emitExecuted(`Redo: ${command.label}`);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.emitExecuted('Clear History');
  }

  private emitExecuted(label: string): void {
    this.eventBus.emit('command:executed', {
      label,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    });
  }
}
