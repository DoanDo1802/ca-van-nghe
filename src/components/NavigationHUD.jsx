import React, { useEffect, useState } from 'react';
import { DoorOpen, MapPin, Settings } from 'lucide-react';
import { LOBBY_SCENE_ID } from '../engine/serialization/SceneRegistry';

export default function NavigationHUD({
  onOpenSettings,
  nearbyPrompt,
  isSitting,
  onTriggerInteract,
  cameraMode,
  isDecoMode = false,
  hideHeader = false,
  currentSceneId = LOBBY_SCENE_ID,
  currentSceneName = 'Sảnh Chờ (Lobby)',
  onGoToLobby,
}) {
  const isInLobby = currentSceneId === LOBBY_SCENE_ID;
  const [showFps, setShowFps] = useState(
    () => localStorage.getItem('cavannghe:show-fps') === '1'
  );
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const onToggle = (e) => {
      setShowFps(Boolean(e.detail));
    };
    window.addEventListener('cavannghe:show-fps', onToggle);
    return () => window.removeEventListener('cavannghe:show-fps', onToggle);
  }, []);

  useEffect(() => {
    if (!showFps) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now) => {
      frames += 1;
      const elapsed = now - last;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showFps]);

  return (
    <>
      {/* Top Left Current Scene Badge + Quick Return to Lobby */}
      {!isDecoMode && !hideHeader && (
        <div className="fixed top-3 left-3 z-40 pointer-events-auto select-none flex items-center gap-2">
          <div className="px-3 py-2 rounded-xl bg-[#121212]/90 backdrop-blur-md text-neutral-200 border border-white/10 text-xs font-medium flex items-center gap-2 shadow-lg">
            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
            <span>{currentSceneName}</span>
          </div>

          {!isInLobby && onGoToLobby && (
            <button
              type="button"
              onClick={onGoToLobby}
              title="Quay về Sảnh Chờ để chọn phòng khác"
              className="px-3 py-2 rounded-xl bg-[#121212]/90 hover:bg-[#1f1f1f] backdrop-blur-md text-neutral-200 hover:text-white border border-white/10 hover:border-white/25 text-xs font-medium flex items-center gap-1.5 transition shadow-lg"
            >
              <DoorOpen className="w-3.5 h-3.5 text-neutral-400" />
              <span>Về Sảnh Chờ</span>
            </button>
          )}
        </div>
      )}

      {/* Minimal Settings Trigger & Optional FPS on Top Right */}
      {!isDecoMode && !hideHeader && (
        <div className="fixed top-3 right-3 z-40 pointer-events-auto select-none flex items-center gap-2">
          {showFps && (
            <div className="px-2.5 py-2 rounded-xl bg-[#121212]/90 backdrop-blur-md text-neutral-300 border border-white/10 font-mono text-xs shadow-lg">
              {fps} FPS
            </div>
          )}
          <button
            onClick={onOpenSettings}
            title="Cài đặt (Phím tắt: Tab)"
            className="px-3 py-2 rounded-xl bg-[#121212]/90 hover:bg-[#1f1f1f] backdrop-blur-md text-neutral-200 hover:text-white border border-white/10 hover:border-white/25 text-xs font-medium flex items-center space-x-2 transition shadow-lg group"
          >
            <Settings className="w-4 h-4 text-neutral-400 group-hover:rotate-45 transition-transform duration-300" />
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
            className="bg-[#121212]/95 backdrop-blur-md px-4 py-2.5 rounded-xl flex items-center space-x-2.5 text-neutral-200 shadow-2xl border border-white/10 hover:border-white/25 hover:text-white transition"
          >
            <kbd className="w-5 h-5 rounded bg-white/10 border border-white/15 text-white font-mono text-[11px] font-semibold flex items-center justify-center">
              E
            </kbd>
            <span className="text-xs font-medium">
              {isSitting
                ? 'Đứng dậy'
                : nearbyPrompt?.type === 'door'
                  ? nearbyPrompt.targetSceneId === LOBBY_SCENE_ID
                    ? `Quay về: ${nearbyPrompt.title}`
                    : `Vào phòng: ${nearbyPrompt.title}`
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
