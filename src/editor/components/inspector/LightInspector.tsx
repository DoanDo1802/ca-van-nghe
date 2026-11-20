import React from 'react';
import type { ColorRGB, LightComponentData, LightType } from '../../../types';
import { ColorField } from './ColorField';
import { NumberScrubber } from './NumberScrubber';

export interface LightInspectorProps {
  component: LightComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

const LIGHT_TYPES: LightType[] = ['directional', 'point', 'spot'];

export const LightInspector: React.FC<LightInspectorProps> = ({ component, onUpdate }) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Light Type</label>
        <select
          value={component.lightType}
          onChange={(e) => onUpdate({ lightType: e.target.value as LightType })}
          className="w-32 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 capitalize focus:outline-none focus:border-blue-500"
        >
          {LIGHT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <ColorField
        label="Color"
        color={component.color}
        onChange={(next) => onUpdate({ color: next as ColorRGB })}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">Intensity</span>
        <div className="w-24">
          <NumberScrubber
            value={component.intensity}
            min={0}
            step={0.1}
            precision={2}
            onChange={(val) => onUpdate({ intensity: val })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">Range</span>
        <div className="w-24">
          <NumberScrubber
            value={component.range}
            min={0.01}
            step={0.5}
            precision={2}
            disabled={component.lightType === 'directional'}
            onChange={(val) => onUpdate({ range: val })}
          />
        </div>
      </div>

      {component.lightType === 'spot' && (
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 block">Inner Cone</span>
            <NumberScrubber
              value={component.innerConeAngle}
              min={0}
              max={90}
              step={1}
              precision={1}
              onChange={(val) => onUpdate({ innerConeAngle: val })}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 block">Outer Cone</span>
            <NumberScrubber
              value={component.outerConeAngle}
              min={0}
              max={90}
              step={1}
              precision={1}
              onChange={(val) => onUpdate({ outerConeAngle: val })}
            />
          </div>
        </div>
      )}

      <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer pt-0.5">
        <input
          type="checkbox"
          checked={component.castShadows}
          onChange={(e) => onUpdate({ castShadows: e.target.checked })}
          className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500"
        />
        <span>Cast Shadows</span>
      </label>
    </div>
  );
};
