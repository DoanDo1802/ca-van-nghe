import React from 'react';
import { Music, Settings } from 'lucide-react';

export default function NavigationHUD({
  onOpenSettings,
  nearbyPrompt,
  isSitting,
  onTriggerInteract,
  cameraMode,
  isDecoMode = false
}) {
  return (
    <>
      {/* ───────────────────────────────────────────────────────────── */}
      {/* TOP HEADER: Clean & Minimal (Brand on Left, [Tab] on Right)    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {!isDecoMode && (
        <header className="fixed top-3 left-3 right-3 z-40 flex items-center justify-between pointer-events-none select-none">
          {/* Brand identity & controls hint */}
          <div className="bg-neutral-950/75 backdrop-blur-xl border border-white/10 px-3.5 py-2 rounded-xl pointer-events-auto flex items-center space-x-3 shadow-xl">
            <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center">
              <Music className="w-3.5 h-3.5 text-neutral-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-serif font-bold text-xs sm:text-sm tracking-wider text-neutral-100">
                  CA VĂN NGHỆ
                </h1>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  LIVE
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 font-sans hidden sm:block">
                WASD: Đi • Shift: Chạy • [Tab]: Cài đặt & Chế độ
              </p>
            </div>
          </div>

          {/* Minimal Settings Trigger on Top Right */}
          <div className="flex items-center pointer-events-auto">
            <button
              onClick={onOpenSettings}
              title="Cài đặt & Chọn chế độ (Phím tắt: Tab)"
              className="px-3.5 py-2 rounded-xl bg-neutral-950/80 hover:bg-neutral-900 backdrop-blur-xl text-neutral-200 hover:text-white border border-white/15 text-xs font-medium flex items-center space-x-2 transition shadow-lg hover:border-amber-400/50 group"
            >
              <Settings className="w-4 h-4 text-amber-300 group-hover:rotate-45 transition-transform duration-300" />
              <span className="font-mono text-xs font-semibold">[Tab] Cài đặt</span>
            </button>
          </div>
        </header>
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
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
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
                  : `Khám phá ${nearbyPrompt?.title}`}
            </span>
          </button>
        </div>
      )}
    </>
  );
}

