import React from 'react';
import type { CameraComponentData, ColorRGBA } from '../../../types';
import { ColorField } from './ColorField';
import { NumberScrubber } from './NumberScrubber';

export interface CameraInspectorProps {
  component: CameraComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

export const CameraInspector: React.FC<CameraInspectorProps> = ({ component, onUpdate }) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">FOV</span>
        <div className="w-24">
          <NumberScrubber
            value={component.fov}
            min={1}
            max={179}
            step={1}
            precision={1}
            onChange={(val) => onUpdate({ fov: val })}
          />
        </div>
      </div>

      <ColorField
        label="Clear Color"
        color={component.clearColor}
        hasAlpha
        onChange={(next) => onUpdate({ clearColor: next as ColorRGBA })}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Near Clip</span>
          <NumberScrubber
            value={component.nearClip}
            min={0.001}
            step={0.05}
            precision={3}
            onChange={(val) => onUpdate({ nearClip: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Far Clip</span>
          <NumberScrubber
            value={component.farClip}
            min={0.1}
            step={10}
            precision={1}
            onChange={(val) => onUpdate({ farClip: val })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">Priority</span>
        <div className="w-24">
          <NumberScrubber
            value={component.priority}
            step={1}
            precision={0}
            onChange={(val) => onUpdate({ priority: Math.round(val) })}
          />
        </div>
      </div>
    </div>
  );
};
