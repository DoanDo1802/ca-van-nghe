import React, { useEffect, useState } from 'react';
import {
  Crown,
  Headphones,
  HeadphoneOff,
  Lock,
  Mic,
  MicOff,
  Radio,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import {
  LobbyVoiceManager,
  formatKeyCodeLabel,
  type LobbyVoiceSnapshot,
  type VoiceMicMode,
} from '../network/LobbyVoiceManager';
import { MultiplayerManager, type RoomStatusSnapshot } from '../network/MultiplayerManager';

interface VoiceChatBarProps {
  isKaraokeOpen: boolean;
}

export const VoiceChatBar: React.FC<VoiceChatBarProps> = ({ isKaraokeOpen }) => {
  const voice = LobbyVoiceManager.getInstance();
  const [snap, setSnap] = useState<LobbyVoiceSnapshot>(() => voice.getSnapshot());
  const [isHost, setIsHost] = useState(() => MultiplayerManager.getInstance().isHost());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRebindingKey, setIsRebindingKey] = useState(false);

  useEffect(() => {
    voice.init();
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<LobbyVoiceSnapshot>).detail;
      if (detail) setSnap(detail);
    };
    const onRoom = (e: Event) => {
      const detail = (e as CustomEvent<RoomStatusSnapshot>).detail;
      if (detail) setIsHost(detail.isHost);
    };

    window.addEventListener('cavannghe:lobby-voice-state', onState);
    window.addEventListener('cavannghe:room-status', onRoom);
    return () => {
      window.removeEventListener('cavannghe:lobby-voice-state', onState);
      window.removeEventListener('cavannghe:room-status', onRoom);
      voice.destroy();
    };
  }, [voice]);

  useEffect(() => {
    voice.setPausedForKaraoke(isKaraokeOpen);
  }, [isKaraokeOpen, voice]);

  useEffect(() => {
    if (!isRebindingKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setIsRebindingKey(false);
        return;
      }
      voice.setPttKey(e.code);
      setIsRebindingKey(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isRebindingKey, voice]);

  const handleToggleHostPolicy = () => {
    if (!isHost) return;
    const next = snap.voicePolicy.mode === 'muted_all' ? 'free' : 'muted_all';
    MultiplayerManager.getInstance().broadcastVoicePolicy(next);
  };

  const pttLabel = formatKeyCodeLabel(snap.pttKey);

  let micStatusText = 'Mic Tắt';
  if (snap.isForcedMutedByHost) {
    micStatusText = 'Bị khóa mic';
  } else if (snap.pausedForKaraoke) {
    micStatusText = 'Karaoke';
  } else if (!snap.isMuted) {
    if (snap.micMode === 'ptt') {
      micStatusText = snap.pttHeld ? 'Đang nói' : `Giữ [${pttLabel}]`;
    } else if (snap.micMode === 'vad') {
      micStatusText = snap.isTransmitting ? 'Đang nói' : 'Tự động';
    } else {
      micStatusText = 'Mic Mở';
    }
  }

  const micBtnClass = snap.isForcedMutedByHost
    ? 'bg-rose-950/85 text-rose-200 border-rose-500/40 cursor-not-allowed'
    : snap.isTransmitting
      ? 'bg-emerald-600/90 text-white border-emerald-400/60 shadow-emerald-500/20'
      : !snap.isMuted && !snap.pausedForKaraoke
        ? 'bg-sky-600/80 text-white border-sky-400/50'
        : 'bg-[#121212]/85 hover:bg-[#1d1d1d] text-neutral-300 border-white/15';

  return (
    <div className="fixed bottom-4 right-4 z-30 pointer-events-auto flex flex-col items-end gap-2">
      {/* Settings Popover */}
      {isSettingsOpen && (
        <div className="w-80 rounded-2xl bg-[#121212]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-3.5 text-xs text-neutral-200 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              Cài đặt Voice Chat
            </span>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Host Controls */}
          {isHost && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/25 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5" />
                  Quyền Chủ phòng
                </span>
                <span className="text-[10px] text-amber-200/80">
                  {snap.voicePolicy.mode === 'muted_all' ? 'Đang tắt cả phòng' : 'Đang mở tự do'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => MultiplayerManager.getInstance().broadcastVoicePolicy('free')}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition ${
                    snap.voicePolicy.mode === 'free'
                      ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  Tự do bật mic
                </button>
                <button
                  type="button"
                  onClick={() => MultiplayerManager.getInstance().broadcastVoicePolicy('muted_all')}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition ${
                    snap.voicePolicy.mode === 'muted_all'
                      ? 'bg-rose-500/25 text-rose-200 border-rose-400/50'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  Tắt tất cả lobby
                </button>
              </div>
            </div>
          )}

          {/* Mic Mode Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-neutral-400 font-medium">Chế độ Micro</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'ptt', label: 'Push-to-Talk' },
                  { id: 'vad', label: 'Tự động (VAD)' },
                  { id: 'open', label: 'Mở liên tục' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void voice.setMicMode(m.id as VoiceMicMode)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition ${
                    snap.micMode === m.id
                      ? 'bg-sky-500 text-white border-sky-300'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* PTT Key Rebind */}
          {snap.micMode === 'ptt' && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-neutral-300">Phím giữ để nói:</span>
              <button
                type="button"
                onClick={() => setIsRebindingKey(true)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold border transition ${
                  isRebindingKey
                    ? 'bg-amber-500 text-stone-950 border-amber-300 animate-pulse'
                    : 'bg-black/40 text-white border-white/20 hover:border-sky-400'
                }`}
              >
                {isRebindingKey ? 'Nhấn phím bất kỳ...' : `[${pttLabel}] Đổi phím`}
              </button>
            </div>
          )}

          {/* VAD Sensitivity */}
          {snap.micMode === 'vad' && (
            <div className="space-y-1.5 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-neutral-300">Độ nhạy nhận giọng</span>
                <span className="font-mono text-neutral-400">
                  {Math.round((1 - snap.vadThreshold / 0.25) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.005}
                max={0.15}
                step={0.005}
                value={snap.vadThreshold}
                onChange={(e) => voice.setVadThreshold(parseFloat(e.target.value))}
                className="w-full accent-sky-400"
              />
              <div className="w-full h-1.5 rounded-full bg-black/50 overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-75 ${
                    snap.isTransmitting ? 'bg-emerald-400' : 'bg-sky-400/60'
                  }`}
                  style={{ width: `${Math.round(snap.micLevel * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Incoming Volume */}
          <label className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-neutral-300 flex items-center gap-1 shrink-0">
              <Volume2 className="w-3.5 h-3.5 text-sky-400" />
              Âm lượng nghe
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={snap.incomingVolume}
              onChange={(e) => voice.setIncomingVolume(parseFloat(e.target.value))}
              className="flex-1 accent-sky-400"
            />
            <span className="w-9 text-right font-mono">
              {Math.round(snap.incomingVolume * 100)}%
            </span>
          </label>

          {snap.micError && (
            <p className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1">
              {snap.micError}
            </p>
          )}
        </div>
      )}

      {/* Compact Voice Pill Bar */}
      <div className="flex items-center gap-1.5">
        {isHost && (
          <button
            type="button"
            onClick={handleToggleHostPolicy}
            title={
              snap.voicePolicy.mode === 'muted_all'
                ? 'Đang tắt mic cả phòng — Nhấn để cho tự do bật mic'
                : 'Đang cho tự do bật mic — Nhấn để tắt tất cả lobby'
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg ${
              snap.voicePolicy.mode === 'muted_all'
                ? 'bg-rose-600/90 text-white border-rose-400/60'
                : 'bg-[#121212]/85 hover:bg-[#1d1d1d] text-amber-300 border-amber-400/30'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {snap.voicePolicy.mode === 'muted_all' ? 'Đang tắt Lobby' : 'Tắt cả phòng'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (!snap.isForcedMutedByHost) {
              void voice.toggleMute();
            }
          }}
          disabled={snap.isForcedMutedByHost}
          title={
            snap.isForcedMutedByHost
              ? 'Chủ phòng đã tắt mic toàn lobby'
              : snap.isMuted
                ? 'Bật Micro Voice Chat'
                : 'Tắt Micro Voice Chat'
          }
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg ${micBtnClass}`}
        >
          {snap.isForcedMutedByHost ? (
            <Lock className="w-3.5 h-3.5" />
          ) : snap.isMuted || snap.pausedForKaraoke ? (
            <MicOff className="w-3.5 h-3.5" />
          ) : (
            <Mic className={`w-3.5 h-3.5 ${snap.isTransmitting ? 'animate-pulse' : ''}`} />
          )}
          <span>{micStatusText}</span>
        </button>

        <button
          type="button"
          onClick={() => voice.toggleDeafen()}
          title={snap.isDeafened ? 'Bật nghe Voice Chat' : 'Tắt tiếng nghe Voice Chat'}
          className={`p-2 rounded-xl backdrop-blur-md border transition shadow-lg ${
            snap.isDeafened
              ? 'bg-rose-600/85 text-white border-rose-400/50'
              : 'bg-[#121212]/85 hover:bg-[#1d1d1d] text-neutral-300 border-white/15'
          }`}
        >
          {snap.isDeafened ? (
            <HeadphoneOff className="w-4 h-4" />
          ) : (
            <Headphones className="w-4 h-4" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setIsSettingsOpen((o) => !o)}
          title="Cài đặt Voice Chat (Push-to-Talk, VAD, Quyền phòng)"
          className={`p-2 rounded-xl backdrop-blur-md border transition shadow-lg ${
            isSettingsOpen
              ? 'bg-sky-500 text-white border-sky-300'
              : 'bg-[#121212]/85 hover:bg-[#1d1d1d] text-neutral-300 border-white/15'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
