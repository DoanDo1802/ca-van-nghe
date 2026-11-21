import React from 'react';
import { Settings } from 'lucide-react';

export default function NavigationHUD({
  onOpenSettings,
  nearbyPrompt,
  isSitting,
  onTriggerInteract,
  cameraMode,
  isDecoMode = false,
  hideHeader = false
}) {
  return (
    <>
      {/* Minimal Settings Trigger on Top Right */}
      {!isDecoMode && !hideHeader && (
        <div className="fixed top-3 right-3 z-40 pointer-events-auto select-none">
          <button
            onClick={onOpenSettings}
            title="Cài đặt & Chọn chế độ (Phím tắt: Tab)"
            className="px-3 py-2 rounded-xl bg-neutral-950/75 hover:bg-neutral-900 backdrop-blur-xl text-neutral-200 hover:text-white border border-white/15 text-xs font-medium flex items-center space-x-2 transition shadow-lg hover:border-amber-400/50 group"
          >
            <Settings className="w-4 h-4 text-amber-300 group-hover:rotate-45 transition-transform duration-300" />
            <span className="font-mono text-xs font-semibold">[Tab]</span>
          </button>
        </div>
      )}

      {/* Crosshair for First-Person View */}
      {cameraMode === 'first' && !isDecoMode && (
        <div className="fixed inset-0 pointer-events-none z-20 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white/70 shadow-sm" />
            <div className="absolute w-5 h-5 rounded-full border border-white/20" />
          </div>
        </div>
      )}

      {/* Center-Bottom Dynamic Proximity Prompt */}
      {!isDecoMode && (nearbyPrompt || isSitting) && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
          <button
            onClick={onTriggerInteract}
            className="bg-neutral-950/90 backdrop-blur-xl px-4 py-2.5 rounded-xl flex items-center space-x-2.5 text-neutral-200 shadow-2xl border border-white/15 hover:border-white/30 hover:text-white transition group"
          >
            <kbd className="w-5 h-5 rounded bg-white/15 border border-white/20 text-white font-mono text-[11px] font-semibold flex items-center justify-center">
              E
            </kbd>
            <span className="text-xs font-medium">
              {isSitting
                ? 'Đứng dậy (hoặc ấn WASD)'
                : nearbyPrompt?.type === 'chair'
                  ? `Ngồi xuống ${nearbyPrompt.title}`
                  : nearbyPrompt?.id === 'karaoke_stage'
                    ? 'Cầm mic hát Karaoke'
                    : `Khám phá ${nearbyPrompt?.title}`}
            </span>
          </button>
        </div>
      )}
    </>
  );
}
