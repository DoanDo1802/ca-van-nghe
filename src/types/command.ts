import type { TransformData } from './scene';

export interface TransformSnapshot {
  entityId: string;
  transform: TransformData;
}

export interface ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  execute(): void;
  undo(): void;
  merge?(next: ICommand): boolean;
}
