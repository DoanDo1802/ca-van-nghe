import React, { useEffect, useState } from 'react';
import { DoorOpen, Loader2 } from 'lucide-react';
import type { SceneLoadingProgress } from '../engine/serialization/SceneRegistry';

export interface SceneLoadingOverlayProps {
  initialProgress?: SceneLoadingProgress | null;
}

export const SceneLoadingOverlay: React.FC<SceneLoadingOverlayProps> = ({
  initialProgress = null,
}) => {
  const [progress, setProgress] = useState<SceneLoadingProgress | null>(initialProgress);

  useEffect(() => {
    setProgress(initialProgress);
  }, [initialProgress]);

  useEffect(() => {
    const onLoading = (e: Event) => {
      const detail = (e as CustomEvent<SceneLoadingProgress>).detail;
      if (!detail) return;
      setProgress(detail);
    };
    window.addEventListener('cavannghe:scene-loading', onLoading);
    return () => {
      window.removeEventListener('cavannghe:scene-loading', onLoading);
    };
  }, []);

  if (!progress || !progress.loading) return null;

  const pct = Math.max(0, Math.min(100, Math.round(progress.percent)));

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm text-neutral-100 px-6 select-none"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#121212] border border-white/10 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <DoorOpen className="w-4 h-4 text-neutral-400 shrink-0" />
            <h2 className="text-sm font-semibold text-white truncate">
              {progress.sceneName}
            </h2>
          </div>
          <span className="text-xs font-mono text-neutral-400 shrink-0">{pct}%</span>
        </div>

        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400 shrink-0" />
          <span className="truncate">{progress.label}</span>
        </div>
      </div>
    </div>
  );
};
