import React from 'react';
import type { InteractableComponentData, InteractableType, Vec3 } from '../../../types';
import { NumberScrubber } from './NumberScrubber';

export interface InteractableInspectorProps {
  component: InteractableComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

const TYPES: Array<{ value: InteractableType; label: string }> = [
  { value: 'event', label: 'Trigger Event' },
  { value: 'seat', label: 'Sit / Chair' },
  { value: 'collectible', label: 'Collectible Item' },
];

const KEYS = ['KeyE', 'KeyF', 'KeyG', 'Space'];

export const InteractableInspector: React.FC<InteractableInspectorProps> = ({
  component,
  onUpdate,
}) => {
  const updateSeatOffset = (axis: 0 | 1 | 2, val: number) => {
    const next: Vec3 = [...component.seatOffset];
    next[axis] = val;
    onUpdate({ seatOffset: next });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Type</label>
        <select
          value={component.interactType}
          onChange={(e) => onUpdate({ interactType: e.target.value as InteractableType })}
          className="w-36 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] text-gray-400 block">Prompt Text</label>
        <input
          type="text"
          value={component.promptText}
          onChange={(e) => onUpdate({ promptText: e.target.value })}
          className="w-full bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 block">Key</label>
          <select
            value={component.interactionKey}
            onChange={(e) => onUpdate({ interactionKey: e.target.value })}
            className="w-full bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
          >
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k.replace('Key', '')}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Radius (m)</span>
          <NumberScrubber
            value={component.radius}
            min={0.5}
            step={0.25}
            precision={2}
            onChange={(val) => onUpdate({ radius: val })}
          />
        </div>
      </div>

      {component.interactType === 'seat' && (
        <div className="space-y-2 pt-1 border-t border-[#262b36]">
          <span className="text-[10px] text-gray-400 block">Seat Offset (X / Y / Z)</span>
          <div className="grid grid-cols-3 gap-1">
            <NumberScrubber
              label="X"
              value={component.seatOffset[0]}
              step={0.05}
              precision={2}
              onChange={(v) => updateSeatOffset(0, v)}
            />
            <NumberScrubber
              label="Y"
              value={component.seatOffset[1]}
              step={0.05}
              precision={2}
              onChange={(v) => updateSeatOffset(1, v)}
            />
            <NumberScrubber
              label="Z"
              value={component.seatOffset[2]}
              step={0.05}
              precision={2}
              onChange={(v) => updateSeatOffset(2, v)}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">Seat Yaw (°)</span>
            <div className="w-24">
              <NumberScrubber
                value={component.seatYaw}
                step={5}
                precision={1}
                onChange={(val) => onUpdate({ seatYaw: val })}
              />
            </div>
          </div>
        </div>
      )}

      {component.interactType === 'collectible' && (
        <label className="flex items-center justify-between gap-2 text-[11px] text-gray-300 cursor-pointer">
          <span>Disable On Collect</span>
          <input
            type="checkbox"
            checked={component.destroyOnCollect}
            onChange={(e) => onUpdate({ destroyOnCollect: e.target.checked })}
            className="rounded border-[#2f3644] bg-[#12151b] text-blue-500"
          />
        </label>
      )}

      <div className="space-y-1 pt-1 border-t border-[#262b36]">
        <label className="text-[10px] text-gray-400 block">Emit Custom Event</label>
        <input
          type="text"
          value={component.emitEventName}
          placeholder="e.g. open_door"
          onChange={(e) => onUpdate({ emitEventName: e.target.value })}
          className="w-full bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 font-mono focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
};
