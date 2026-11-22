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
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-[#090b10]/95 backdrop-blur-md text-neutral-100 px-6 select-none"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#121620] border border-amber-500/25 p-6 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
            <DoorOpen className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400/90">
              Đang Chuyển Scene
            </div>
            <h2 className="text-base font-bold text-white truncate">
              {progress.sceneName}
            </h2>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-3 w-full rounded-full bg-neutral-900 border border-white/10 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-sky-400 transition-all duration-200 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-neutral-300 truncate pr-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
              <span className="truncate">{progress.label}</span>
            </span>
            <span className="font-mono font-bold text-amber-300 shrink-0">{pct}%</span>
          </div>
        </div>

        <div className="text-[11px] text-neutral-400 text-center">
          Vui lòng chờ tải hoàn tất tài nguyên 3D của phòng trước khi bước vào...
        </div>
      </div>
    </div>
  );
};
