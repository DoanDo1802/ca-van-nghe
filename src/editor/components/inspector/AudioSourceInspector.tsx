import React, { useMemo, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { AssetRepository } from '../../../storage';
import { useAssetStore } from '../../../store/useAssetStore';
import type { AudioSourceComponentData } from '../../../types';
import { NumberScrubber } from './NumberScrubber';

export interface AudioSourceInspectorProps {
  component: AudioSourceComponentData;
  onUpdate: (patch: Record<string, unknown>) => void;
}

export const AudioSourceInspector: React.FC<AudioSourceInspectorProps> = ({
  component,
  onUpdate,
}) => {
  const assets = useAssetStore((s) => s.assets);
  const audioAssets = useMemo(() => assets.filter((a) => a.type === 'audio'), [assets]);
  const [previewing, setPreviewing] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewing(false);
  };

  const togglePreview = async () => {
    if (previewing) {
      stopPreview();
      return;
    }
    if (!component.audioAssetId) return;
    const blob = await AssetRepository.getAssetBlob(component.audioAssetId);
    if (!blob) return;
    const url = URL.createObjectURL(new Blob([blob]));
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, component.volume));
    audio.playbackRate = Math.max(0.1, Math.min(3, component.pitch));
    audio.onended = () => stopPreview();
    previewAudioRef.current = audio;
    previewUrlRef.current = url;
    setPreviewing(true);
    await audio.play().catch(() => stopPreview());
  };

  const handleAssetDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const raw = e.dataTransfer.getData('application/x-pc-asset');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { assetId?: string };
      if (parsed.assetId) {
        e.preventDefault();
        onUpdate({ audioAssetId: parsed.assetId });
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-2.5">
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-pc-asset')) e.preventDefault();
        }}
        onDrop={handleAssetDrop}
        className="space-y-1"
      >
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-gray-400">Audio Clip (Drop .mp3/.wav)</label>
          <button
            type="button"
            disabled={!component.audioAssetId}
            onClick={() => void togglePreview()}
            className="px-1.5 py-0.5 rounded bg-[#232834] hover:bg-[#2c3342] disabled:opacity-40 text-[10px] text-gray-200 flex items-center gap-1"
          >
            {previewing ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
            <span>{previewing ? 'Stop' : 'Preview'}</span>
          </button>
        </div>
        <select
          value={component.audioAssetId ?? ''}
          onChange={(e) => onUpdate({ audioAssetId: e.target.value || null })}
          className="w-full bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">None</option>
          {audioAssets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
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
          <span className="text-[10px] text-gray-400 block">Volume</span>
          <NumberScrubber
            value={component.volume}
            min={0}
            max={1}
            step={0.05}
            precision={2}
            onChange={(val) => onUpdate({ volume: val })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-gray-400 block">Pitch</span>
          <NumberScrubber
            value={component.pitch}
            min={0.1}
            max={3}
            step={0.05}
            precision={2}
            onChange={(val) => onUpdate({ pitch: val })}
          />
        </div>
      </div>

      <label className="flex items-center justify-between gap-2 text-[11px] text-gray-300 cursor-pointer pt-1 border-t border-[#262b36]">
        <span>3D Spatial Audio</span>
        <input
          type="checkbox"
          checked={component.spatial}
          onChange={(e) => onUpdate({ spatial: e.target.checked })}
          className="rounded border-[#2f3644] bg-[#12151b] text-blue-500"
        />
      </label>

      {component.spatial && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 block">Min Distance</span>
            <NumberScrubber
              value={component.minDistance}
              min={0.1}
              step={0.5}
              precision={1}
              onChange={(val) => onUpdate({ minDistance: val })}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 block">Max Distance</span>
            <NumberScrubber
              value={component.maxDistance}
              min={0.5}
              step={1}
              precision={1}
              onChange={(val) => onUpdate({ maxDistance: val })}
            />
          </div>
        </div>
      )}
    </div>
  );
};
