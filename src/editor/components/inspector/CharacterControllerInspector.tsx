import React, { useMemo } from 'react';
import { useEditorStore } from '../../../store/useEditorStore';
import type {
  CharacterControllerComponentData,
  CharacterControllerMode,
} from '../../../types';
import { NumberScrubber } from './NumberScrubber';

export interface CharacterControllerInspectorProps {
  component: CharacterControllerComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

const MODES: Array<{ value: CharacterControllerMode; label: string }> = [
  { value: 'third-person', label: 'Third-Person (TPS)' },
  { value: 'first-person', label: 'First-Person (FPS)' },
  { value: 'top-down', label: 'Top-Down' },
];

export const CharacterControllerInspector: React.FC<CharacterControllerInspectorProps> = ({
  component,
  onUpdate,
}) => {
  const entitySummaries = useEditorStore((s) => s.entitySummaries);
  const entities = useMemo(() => Object.values(entitySummaries), [entitySummaries]);

  const handleCameraDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const entityId =
      e.dataTransfer.getData('application/x-editor-entity-id') ||
      e.dataTransfer.getData('application/x-pc-entity');
    if (entityId) {
      e.preventDefault();
      onUpdate({ cameraEntityId: entityId });
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Mode</label>
        <select
          value={component.mode}
          onChange={(e) => onUpdate({ mode: e.target.value as CharacterControllerMode })}
          className="w-36 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Walk Speed</span>
          <NumberScrubber
            value={component.walkSpeed}
            min={0.1}
            step={0.2}
            precision={2}
            onChange={(val) => onUpdate({ walkSpeed: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Run Speed</span>
          <NumberScrubber
            value={component.runSpeed}
            min={0.1}
            step={0.2}
            precision={2}
            onChange={(val) => onUpdate({ runSpeed: val })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Jump Force</span>
          <NumberScrubber
            value={component.jumpForce}
            min={0}
            step={0.2}
            precision={2}
            onChange={(val) => onUpdate({ jumpForce: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Gravity</span>
          <NumberScrubber
            value={component.gravity}
            max={0}
            step={0.5}
            precision={2}
            onChange={(val) => onUpdate({ gravity: val })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Step Offset</span>
          <NumberScrubber
            value={component.stepOffset}
            min={0}
            max={2}
            step={0.05}
            precision={2}
            onChange={(val) => onUpdate({ stepOffset: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Eye Height</span>
          <NumberScrubber
            value={component.eyeHeight}
            min={0.2}
            max={5}
            step={0.05}
            precision={2}
            onChange={(val) => onUpdate({ eyeHeight: val })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">Look Sensitivity</span>
        <div className="w-24">
          <NumberScrubber
            value={component.mouseSensitivity}
            min={0.05}
            max={2}
            step={0.02}
            precision={2}
            onChange={(val) => onUpdate({ mouseSensitivity: val })}
          />
        </div>
      </div>

      <div
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes('application/x-editor-entity-id') ||
            e.dataTransfer.types.includes('application/x-pc-entity')
          ) {
            e.preventDefault();
          }
        }}
        onDrop={handleCameraDrop}
        className="space-y-1 pt-1 border-t border-[#262b36]"
      >
        <label className="text-[10px] text-gray-400 block">
          Camera Entity (Auto or Drag from Hierarchy)
        </label>
        <select
          value={component.cameraEntityId ?? ''}
          onChange={(e) => onUpdate({ cameraEntityId: e.target.value || null })}
          className="w-full bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">Auto-detect Main Camera</option>
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>
              {ent.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
