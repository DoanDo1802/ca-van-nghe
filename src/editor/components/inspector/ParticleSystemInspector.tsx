import React from 'react';
import type {
  ColorRGB,
  ParticleEmissionShape,
  ParticleSystemComponentData,
} from '../../../types';
import { ColorField } from './ColorField';
import { NumberScrubber } from './NumberScrubber';

export interface ParticleSystemInspectorProps {
  component: ParticleSystemComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

const SHAPES: ParticleEmissionShape[] = ['cone', 'sphere', 'box'];

export const ParticleSystemInspector: React.FC<ParticleSystemInspectorProps> = ({
  component,
  onUpdate,
}) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Shape</label>
        <select
          value={component.shape}
          onChange={(e) => onUpdate({ shape: e.target.value as ParticleEmissionShape })}
          className="w-28 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 capitalize focus:outline-none focus:border-blue-500"
        >
          {SHAPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={component.playOnAwake}
            onChange={(e) => onUpdate({ playOnAwake: e.target.checked })}
            className="rounded border-[#2f3644] bg-[#12151b] text-blue-500"
          />
          <span>Play On Awake</span>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={component.loop}
            onChange={(e) => onUpdate({ loop: e.target.checked })}
            className="rounded border-[#2f3644] bg-[#12151b] text-blue-500"
          />
          <span>Loop</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Rate (/s)</span>
          <NumberScrubber
            value={component.emissionRate}
            min={1}
            max={200}
            step={1}
            precision={0}
            onChange={(val) => onUpdate({ emissionRate: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Max Particles</span>
          <NumberScrubber
            value={component.maxParticles}
            min={1}
            max={500}
            step={5}
            precision={0}
            onChange={(val) => onUpdate({ maxParticles: val })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Lifetime (s)</span>
          <NumberScrubber
            value={component.lifetime}
            min={0.1}
            step={0.1}
            precision={2}
            onChange={(val) => onUpdate({ lifetime: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Start Speed</span>
          <NumberScrubber
            value={component.startSpeed}
            min={0}
            step={0.2}
            precision={2}
            onChange={(val) => onUpdate({ startSpeed: val })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Start Size</span>
          <NumberScrubber
            value={component.startSize}
            min={0.01}
            step={0.02}
            precision={2}
            onChange={(val) => onUpdate({ startSize: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">End Size</span>
          <NumberScrubber
            value={component.endSize}
            min={0}
            step={0.02}
            precision={2}
            onChange={(val) => onUpdate({ endSize: val })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Gravity</span>
          <NumberScrubber
            value={component.gravity}
            step={0.2}
            precision={2}
            onChange={(val) => onUpdate({ gravity: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Spread (°)</span>
          <NumberScrubber
            value={component.spreadAngle}
            min={0}
            max={90}
            step={1}
            precision={0}
            onChange={(val) => onUpdate({ spreadAngle: val })}
          />
        </div>
      </div>

      <ColorField
        label="Start Color"
        color={component.startColor}
        onChange={(next) => onUpdate({ startColor: next as ColorRGB })}
      />
      <ColorField
        label="End Color"
        color={component.endColor}
        onChange={(next) => onUpdate({ endColor: next as ColorRGB })}
      />
    </div>
  );
};
