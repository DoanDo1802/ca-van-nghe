import React from 'react';
import type { ColorRGB, ColorRGBA } from '../../../types';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function toHexByte(v: number): string {
  return Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, '0');
}

export function rgbToHex(rgb: ColorRGB | ColorRGBA): string {
  return `#${toHexByte(rgb[0])}${toHexByte(rgb[1])}${toHexByte(rgb[2])}`;
}

export function hexToRgb(hex: string): ColorRGB {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [1, 1, 1];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [
    Number.isFinite(r) ? r : 1,
    Number.isFinite(g) ? g : 1,
    Number.isFinite(b) ? b : 1,
  ];
}

export interface ColorFieldProps {
  label: string;
  color: ColorRGB | ColorRGBA;
  hasAlpha?: boolean;
  onChange: (next: ColorRGB | ColorRGBA) => void;
}

export const ColorField: React.FC<ColorFieldProps> = ({
  label,
  color,
  hasAlpha = false,
  onChange,
}) => {
  const hex = rgbToHex(color);
  const alpha = color.length === 4 ? color[3] : 1;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">{label}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={hex}
            onChange={(e) => {
              const rgb = hexToRgb(e.target.value);
              if (hasAlpha) {
                onChange([rgb[0], rgb[1], rgb[2], alpha]);
              } else {
                onChange(rgb);
              }
            }}
            className="w-7 h-5 rounded bg-[#12151b] border border-[#2f3644] cursor-pointer p-0.5"
          />
          <span className="text-[10px] font-mono text-gray-400 uppercase w-14 text-right">
            {hex}
          </span>
        </div>
      </div>

      {hasAlpha && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">Alpha</span>
          <div className="flex items-center gap-2 flex-1 max-w-[140px]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={alpha}
              onChange={(e) => {
                const nextA = clamp01(parseFloat(e.target.value));
                onChange([color[0], color[1], color[2], nextA]);
              }}
              className="w-full accent-blue-500 h-1 bg-[#2b313d] rounded cursor-pointer"
            />
            <span className="text-[10px] font-mono text-gray-300 w-7 text-right">
              {alpha.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
