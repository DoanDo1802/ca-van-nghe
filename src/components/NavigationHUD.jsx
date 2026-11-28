import React, { useEffect, useState } from 'react';
import { Crown, DoorOpen, LogOut, MapPin, Menu, Settings, ShieldCheck, Users, Wifi, WifiOff, X } from 'lucide-react';
import { LOBBY_SCENE_ID } from '../engine/serialization/SceneRegistry';
import { MultiplayerManager } from '../network/MultiplayerManager';

/**
 * @param {{
 *   onOpenSettings: () => void;
 *   nearbyPrompt: any;
 *   isSitting: boolean;
 *   onTriggerInteract: () => void;
 *   cameraMode: 'third' | 'first';
 *   isDecoMode?: boolean;
 *   hideHeader?: boolean;
 *   currentSceneId?: string;
 *   currentSceneName?: string;
 *   onGoToLobby?: () => void;
 *   onOpenLobbyHub?: () => void;
 *   onLeaveLobby?: () => void;
 *   roomStatus?: {
 *     connected: boolean;
 *     roomId: string;
 *     playerCount: number;
 *     isHost: boolean;
 *     hostName: string | null;
 *     localIsAdmin: boolean;
 *   } | null;
 *   canOpenSettings?: boolean;
 * }} props
 */
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
  onOpenLobbyHub,
  onLeaveLobby,
  roomStatus = null,
  canOpenSettings = true,
}) {
  const isInLobby = currentSceneId === LOBBY_SCENE_ID;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showFps, setShowFps] = useState(
    () => localStorage.getItem('cavannghe:show-fps') === '1'
  );
  const [fps, setFps] = useState(0);
  const [showPing, setShowPing] = useState(
    () => localStorage.getItem('cavannghe:show-ping') !== '0'
  );
  const [pingInfo, setPingInfo] = useState(() =>
    MultiplayerManager.getInstance().getNetworkPing()
  );

  useEffect(() => {
    const onToggle = (e) => {
      setShowFps(Boolean(e.detail));
    };
    const onTogglePing = (e) => {
      setShowPing(Boolean(e.detail));
    };
    const onPingUpdate = (e) => {
      if (e.detail) {
        setPingInfo(e.detail);
      }
    };
    window.addEventListener('cavannghe:show-fps', onToggle);
    window.addEventListener('cavannghe:show-ping', onTogglePing);
    window.addEventListener('cavannghe:network-ping', onPingUpdate);
    return () => {
      window.removeEventListener('cavannghe:show-fps', onToggle);
      window.removeEventListener('cavannghe:show-ping', onTogglePing);
      window.removeEventListener('cavannghe:network-ping', onPingUpdate);
    };
  }, []);

  useEffect(() => {
    if (hideHeader) {
      setIsMenuOpen(false);
    }
  }, [hideHeader]);

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
      {/* Unified Top-Right Hamburger Menu (Scene, Room Status, Lobby, Host/Admin Settings) */}
      {!isDecoMode && !hideHeader && (
        <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-40 pointer-events-auto select-none flex items-center gap-2">
          {showPing && (roomStatus?.connected || pingInfo.pingMs !== null) && (
            <div
              title={
                pingInfo.pingMs !== null
                  ? `Độ trễ mạng: ${pingInfo.pingMs} ms`
                  : 'Đang đo độ trễ mạng...'
              }
              className={`px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-xl bg-[#121212]/90 border border-white/10 font-mono text-[11px] sm:text-xs shadow-lg flex items-center gap-1.5 ${
                pingInfo.status === 'good'
                  ? 'text-emerald-300'
                  : pingInfo.status === 'fair'
                    ? 'text-amber-300'
                    : pingInfo.status === 'poor'
                      ? 'text-rose-300'
                      : 'text-neutral-400'
              }`}
            >
              {pingInfo.status === 'offline' ? (
                <WifiOff className="w-3 h-3 shrink-0 text-neutral-400" />
              ) : (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    pingInfo.status === 'good'
                      ? 'bg-emerald-400'
                      : pingInfo.status === 'fair'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                  }`}
                />
              )}
              <span>{pingInfo.pingMs !== null ? `${pingInfo.pingMs} ms` : '-- ms'}</span>
            </div>
          )}

          {showFps && (
            <div className="px-2.5 py-2 rounded-xl bg-[#121212]/90 text-neutral-300 border border-white/10 font-mono text-xs shadow-lg">
              {fps} FPS
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="Mở menu phòng"
              className="relative w-10 h-10 rounded-xl bg-[#121212]/90 hover:bg-[#1e1e1e] border border-white/15 text-white shadow-xl flex items-center justify-center transition"
            >
              {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              {roomStatus?.connected && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-[#121212]/95 border border-white/15 shadow-2xl p-2 space-y-1.5 text-xs text-neutral-200">
                {/* Current Area */}
                <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center gap-2 text-white font-medium">
                    <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span className="truncate">{currentSceneName}</span>
                  </div>

                  {roomStatus?.connected && (
                    <div className="pt-1 border-t border-white/10 space-y-1 text-[11px] text-neutral-300">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-neutral-200 truncate">
                          {roomStatus.roomId}
                        </span>
                        <span className="flex items-center gap-1 text-sky-300 font-medium shrink-0">
                          <Users className="w-3 h-3" />
                          {roomStatus.playerCount} người
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        {roomStatus.isHost ? (
                          <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                            <Crown className="w-3 h-3" />
                            Chủ phòng
                          </span>
                        ) : (
                          <span className="text-neutral-400 truncate">
                            Chủ phòng:{' '}
                            <strong className="text-neutral-200">
                              {roomStatus.hostName || 'Ẩn danh'}
                            </strong>
                          </span>
                        )}

                        {roomStatus.localIsAdmin && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[9px] font-bold uppercase inline-flex items-center gap-1 shrink-0">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            ADMIN
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-neutral-400 flex items-center gap-1">
                          <Wifi className="w-3 h-3" />
                          Ping mạng
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            pingInfo.status === 'good'
                              ? 'text-emerald-300'
                              : pingInfo.status === 'fair'
                                ? 'text-amber-300'
                                : pingInfo.status === 'poor'
                                  ? 'text-rose-300'
                                  : 'text-neutral-400'
                          }`}
                        >
                          {pingInfo.pingMs !== null ? `${pingInfo.pingMs} ms` : 'Đang đo...'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Return to Lobby */}
                {!isInLobby && onGoToLobby && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onGoToLobby();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-neutral-100 font-medium transition"
                  >
                    <DoorOpen className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Về Sảnh Chờ</span>
                  </button>
                )}

                {/* Lobby Room / Account / Avatar Hub */}
                {onOpenLobbyHub && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenLobbyHub();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-neutral-100 font-medium transition"
                  >
                    <Users className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Phòng Lobby & Nhân vật</span>
                  </button>
                )}

                {/* Settings (Only Host / Admin when in a room, or offline) */}
                {canOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-neutral-100 font-medium transition"
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Cài đặt</span>
                    </span>
                    <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-[10px] font-mono text-neutral-300">
                      Tab
                    </kbd>
                  </button>
                )}

                {/* Leave Current Lobby Room (Out Lobby to create/join from Entry Gate) */}
                {roomStatus?.connected && onLeaveLobby && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onLeaveLobby();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-rose-500/20 text-rose-300 hover:text-rose-100 font-medium transition border-t border-white/10 pt-2.5"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Rời phòng Lobby</span>
                  </button>
                )}
              </div>
            )}
          </div>
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
        <div className="fixed bottom-32 sm:bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-auto max-w-[calc(100vw-2rem)]">
          <button
            onClick={onTriggerInteract}
            className="bg-[#121212]/95 px-4 py-2.5 rounded-xl flex items-center space-x-2.5 text-neutral-200 shadow-2xl border border-white/10 hover:border-white/25 hover:text-white transition"
          >
            <kbd className="w-5 h-5 rounded bg-white/10 border border-white/15 text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
              E
            </kbd>
            <span className="text-xs font-medium truncate">
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
