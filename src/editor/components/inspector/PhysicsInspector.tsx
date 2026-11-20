import React from 'react';
import type {
  CollisionComponentData,
  CollisionShape,
  RigidBodyComponentData,
  RigidBodyType,
  Vec3,
} from '../../../types';
import { NumberScrubber } from './NumberScrubber';

export interface CollisionInspectorProps {
  component: CollisionComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

const COLLISION_SHAPES: CollisionShape[] = ['box', 'sphere', 'capsule', 'mesh'];

export const CollisionInspector: React.FC<CollisionInspectorProps> = ({
  component,
  onUpdate,
}) => {
  const updateHalfExtent = (index: 0 | 1 | 2, val: number) => {
    const next: Vec3 = [...component.halfExtents];
    next[index] = val;
    onUpdate({ halfExtents: next });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Shape</label>
        <select
          value={component.shape}
          onChange={(e) => onUpdate({ shape: e.target.value as CollisionShape })}
          className="w-32 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 capitalize focus:outline-none focus:border-blue-500"
        >
          {COLLISION_SHAPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {component.shape === 'box' && (
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Half Extents</span>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberScrubber
              label="X"
              labelColorClass="text-rose-400"
              value={component.halfExtents[0]}
              min={0.001}
              step={0.05}
              onChange={(val) => updateHalfExtent(0, val)}
            />
            <NumberScrubber
              label="Y"
              labelColorClass="text-emerald-400"
              value={component.halfExtents[1]}
              min={0.001}
              step={0.05}
              onChange={(val) => updateHalfExtent(1, val)}
            />
            <NumberScrubber
              label="Z"
              labelColorClass="text-sky-400"
              value={component.halfExtents[2]}
              min={0.001}
              step={0.05}
              onChange={(val) => updateHalfExtent(2, val)}
            />
          </div>
        </div>
      )}

      {(component.shape === 'sphere' || component.shape === 'capsule') && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">Radius</span>
          <div className="w-24">
            <NumberScrubber
              value={component.radius}
              min={0.001}
              step={0.05}
              onChange={(val) => onUpdate({ radius: val })}
            />
          </div>
        </div>
      )}

      {component.shape === 'capsule' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">Height</span>
          <div className="w-24">
            <NumberScrubber
              value={component.height}
              min={0.001}
              step={0.05}
              onChange={(val) => onUpdate({ height: val })}
            />
          </div>
        </div>
      )}

      <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer pt-0.5">
        <input
          type="checkbox"
          checked={component.isTrigger}
          onChange={(e) => onUpdate({ isTrigger: e.target.checked })}
          className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500"
        />
        <span>Is Trigger</span>
      </label>
    </div>
  );
};

export interface RigidBodyInspectorProps {
  component: RigidBodyComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

const BODY_TYPES: RigidBodyType[] = ['static', 'dynamic', 'kinematic'];

export const RigidBodyInspector: React.FC<RigidBodyInspectorProps> = ({
  component,
  onUpdate,
}) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Body Type</label>
        <select
          value={component.bodyType}
          onChange={(e) => onUpdate({ bodyType: e.target.value as RigidBodyType })}
          className="w-32 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 capitalize focus:outline-none focus:border-blue-500"
        >
          {BODY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">Mass</span>
        <div className="w-24">
          <NumberScrubber
            value={component.mass}
            min={0}
            step={0.1}
            disabled={component.bodyType === 'static'}
            onChange={(val) => onUpdate({ mass: val })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">Friction</span>
        <div className="w-24">
          <NumberScrubber
            value={component.friction}
            min={0}
            max={10}
            step={0.05}
            onChange={(val) => onUpdate({ friction: val })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">Restitution</span>
        <div className="w-24">
          <NumberScrubber
            value={component.restitution}
            min={0}
            max={1}
            step={0.05}
            onChange={(val) => onUpdate({ restitution: val })}
          />
        </div>
      </div>
    </div>
  );
};
