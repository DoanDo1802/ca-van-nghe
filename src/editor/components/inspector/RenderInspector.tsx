import React from 'react';
import type { ColorRGB, RenderComponentData, RenderMeshType } from '../../../types';
import { ColorField } from './ColorField';
import { NumberScrubber } from './NumberScrubber';

export interface RenderInspectorProps {
  component: RenderComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

const PRIMITIVE_MESH_TYPES: RenderMeshType[] = [
  'box',
  'sphere',
  'plane',
  'cylinder',
  'capsule',
];

export const RenderInspector: React.FC<RenderInspectorProps> = ({ component, onUpdate }) => {
  const { material } = component;

  const updateMaterial = (matPatch: Partial<RenderComponentData['material']>) => {
    onUpdate({
      material: {
        ...material,
        ...matPatch,
      },
    });
  };

  return (
    <div className="space-y-2.5">
      {/* Mesh Type */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Mesh Type</label>
        <select
          value={component.meshType}
          onChange={(e) => onUpdate({ meshType: e.target.value as RenderMeshType })}
          className="w-32 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 capitalize focus:outline-none focus:border-blue-500"
        >
          {PRIMITIVE_MESH_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          {component.meshType === 'asset' && <option value="asset">asset</option>}
        </select>
      </div>

      {/* Shadow Flags */}
      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={component.castShadows}
            onChange={(e) => onUpdate({ castShadows: e.target.checked })}
            className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500"
          />
          <span>Cast Shadows</span>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={component.receiveShadows}
            onChange={(e) => onUpdate({ receiveShadows: e.target.checked })}
            className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500"
          />
          <span>Receive Shadows</span>
        </label>
      </div>

      {/* Material Editor */}
      <div className="pt-2 border-t border-[#2b313d] space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Material
        </div>

        <ColorField
          label="Diffuse Color"
          color={material.diffuseColor}
          onChange={(next) => updateMaterial({ diffuseColor: next as ColorRGB })}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">Metalness</span>
          <div className="flex items-center gap-2 flex-1 max-w-[140px]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={material.metalness}
              onChange={(e) => updateMaterial({ metalness: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 h-1 bg-[#2b313d] rounded cursor-pointer"
            />
            <span className="text-[10px] font-mono text-gray-300 w-7 text-right">
              {material.metalness.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">Gloss</span>
          <div className="flex items-center gap-2 flex-1 max-w-[140px]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={material.gloss}
              onChange={(e) => updateMaterial({ gloss: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 h-1 bg-[#2b313d] rounded cursor-pointer"
            />
            <span className="text-[10px] font-mono text-gray-300 w-7 text-right">
              {material.gloss.toFixed(2)}
            </span>
          </div>
        </div>

        <ColorField
          label="Emissive"
          color={material.emissiveColor}
          onChange={(next) => updateMaterial({ emissiveColor: next as ColorRGB })}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">Emissive Intensity</span>
          <div className="w-24">
            <NumberScrubber
              value={material.emissiveIntensity}
              min={0}
              step={0.1}
              precision={2}
              onChange={(val) => updateMaterial({ emissiveIntensity: val })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">Opacity</span>
          <div className="flex items-center gap-2 flex-1 max-w-[140px]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={material.opacity}
              onChange={(e) => updateMaterial({ opacity: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 h-1 bg-[#2b313d] rounded cursor-pointer"
            />
            <span className="text-[10px] font-mono text-gray-300 w-7 text-right">
              {material.opacity.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
