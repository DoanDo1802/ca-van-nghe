import React, { useMemo } from 'react';
import { useEditorStore } from '../../../store/useEditorStore';
import type { CameraRigComponentData, CameraRigMode, Vec3 } from '../../../types';
import { NumberScrubber } from './NumberScrubber';

export interface CameraRigInspectorProps {
  component: CameraRigComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

const RIG_MODES: Array<{ value: CameraRigMode; label: string }> = [
  { value: 'follow-orbit', label: 'Follow & Orbit' },
  { value: 'smooth-follow', label: 'Smooth Follow' },
  { value: 'look-at', label: 'Look At Target' },
];

export const CameraRigInspector: React.FC<CameraRigInspectorProps> = ({
  component,
  onUpdate,
}) => {
  const entitySummaries = useEditorStore((s) => s.entitySummaries);
  const entities = useMemo(() => Object.values(entitySummaries), [entitySummaries]);

  const handleTargetDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const entityId =
      e.dataTransfer.getData('application/x-editor-entity-id') ||
      e.dataTransfer.getData('application/x-pc-entity');
    if (entityId) {
      e.preventDefault();
      onUpdate({ targetEntityId: entityId });
    }
  };

  const updateOffset = (axis: 0 | 1 | 2, val: number) => {
    const next: Vec3 = [...component.offset];
    next[axis] = val;
    onUpdate({ offset: next });
  };

  return (
    <div className="space-y-2.5">
      <div
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes('application/x-editor-entity-id') ||
            e.dataTransfer.types.includes('application/x-pc-entity')
          ) {
            e.preventDefault();
          }
        }}
        onDrop={handleTargetDrop}
        className="space-y-1"
      >
        <label className="text-[10px] text-gray-400 block">
          Follow Target (Drag from Hierarchy)
        </label>
        <select
          value={component.targetEntityId ?? ''}
          onChange={(e) => onUpdate({ targetEntityId: e.target.value || null })}
          className="w-full bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">None</option>
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>
              {ent.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Rig Mode</label>
        <select
          value={component.mode}
          onChange={(e) => onUpdate({ mode: e.target.value as CameraRigMode })}
          className="w-36 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        >
          {RIG_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] text-gray-400 block">Offset (X / Y / Z)</span>
        <div className="grid grid-cols-3 gap-1">
          <NumberScrubber
            label="X"
            value={component.offset[0]}
            step={0.1}
            precision={2}
            onChange={(v) => updateOffset(0, v)}
          />
          <NumberScrubber
            label="Y"
            value={component.offset[1]}
            step={0.1}
            precision={2}
            onChange={(v) => updateOffset(1, v)}
          />
          <NumberScrubber
            label="Z"
            value={component.offset[2]}
            step={0.1}
            precision={2}
            onChange={(v) => updateOffset(2, v)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Damping</span>
          <NumberScrubber
            value={component.damping}
            min={0}
            max={30}
            step={0.5}
            precision={1}
            onChange={(val) => onUpdate({ damping: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Orbit Sens</span>
          <NumberScrubber
            value={component.orbitSensitivity}
            min={0.05}
            max={2}
            step={0.02}
            precision={2}
            onChange={(val) => onUpdate({ orbitSensitivity: val })}
          />
        </div>
      </div>

      <label className="flex items-center justify-between gap-2 text-[11px] text-gray-300 cursor-pointer">
        <span>Collision Avoidance</span>
        <input
          type="checkbox"
          checked={component.collisionAvoidance}
          onChange={(e) => onUpdate({ collisionAvoidance: e.target.checked })}
          className="rounded border-[#2f3644] bg-[#12151b] text-blue-500"
        />
      </label>
    </div>
  );
};
