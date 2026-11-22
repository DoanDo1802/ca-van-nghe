import React, { useEffect, useState } from 'react';
import { Crown, Mic, MicOff, Users } from 'lucide-react';
import {
  MultiplayerManager,
  type RoomStatusSnapshot,
  type RoomVoicePolicy,
} from '../network/MultiplayerManager';
import type { NameplateEntry } from '../engine/runtime/RemotePlayerPool';

export const RemoteNameplates: React.FC = () => {
  const [nameplates, setNameplates] = useState<NameplateEntry[]>([]);
  const [roomStatus, setRoomStatus] = useState<RoomStatusSnapshot>(() =>
    MultiplayerManager.getInstance().getRoomStatus()
  );
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(() =>
    MultiplayerManager.getInstance().getSpeakingPeerIds()
  );
  const [voicePolicy, setVoicePolicy] = useState<RoomVoicePolicy>(() =>
    MultiplayerManager.getInstance().getVoicePolicy()
  );

  useEffect(() => {
    const onNameplates = (e: Event) => {
      setNameplates((e as CustomEvent<NameplateEntry[]>).detail || []);
    };
    const onRoomStatus = (e: Event) => {
      setRoomStatus((e as CustomEvent<RoomStatusSnapshot>).detail);
    };
    const onSpeaking = (e: Event) => {
      setSpeakingIds(new Set((e as CustomEvent<Set<string>>).detail));
    };
    const onPolicy = (e: Event) => {
      const detail = (e as CustomEvent<RoomVoicePolicy>).detail;
      if (detail) setVoicePolicy(detail);
    };

    window.addEventListener('cavannghe:remote-nameplates', onNameplates);
    window.addEventListener('cavannghe:room-status', onRoomStatus);
    window.addEventListener('cavannghe:voice-speaking', onSpeaking);
    window.addEventListener('cavannghe:voice-policy', onPolicy);
    return () => {
      window.removeEventListener('cavannghe:remote-nameplates', onNameplates);
      window.removeEventListener('cavannghe:room-status', onRoomStatus);
      window.removeEventListener('cavannghe:voice-speaking', onSpeaking);
      window.removeEventListener('cavannghe:voice-policy', onPolicy);
    };
  }, []);

  return (
    <>
      {/* Remote Player Floating Nameplates */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
        {nameplates.map((np) => {
          const isSpeaking = speakingIds.has(np.id);
          return (
            <div
              key={np.id}
              style={{
                transform: `translate3d(${np.x}px, ${np.y}px, 0) translate(-50%, -100%)`,
              }}
              className={`absolute top-0 left-0 px-2 py-0.5 rounded-full bg-black/70 border text-[11px] font-medium text-white whitespace-nowrap flex items-center gap-1 shadow-md backdrop-blur-sm transition-colors ${
                isSpeaking ? 'border-emerald-400/70' : 'border-white/15'
              }`}
            >
              {np.isHost && <Crown className="w-3 h-3 text-amber-400" />}
              <span>{np.name}</span>
              {isSpeaking && <Mic className="w-3 h-3 text-emerald-400 animate-pulse" />}
            </div>
          );
        })}
      </div>

      {/* Compact Room Status Pill */}
      {roomStatus.connected && (
        <div className="pointer-events-auto fixed top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-neutral-950/80 border border-white/15 backdrop-blur-md flex items-center gap-2.5 text-[11px] text-neutral-200 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-neutral-300">{roomStatus.roomId}</span>
          <span className="text-white/20">•</span>
          <span className="flex items-center gap-1 text-sky-300 font-medium">
            <Users className="w-3.5 h-3.5" />
            {roomStatus.playerCount} người
          </span>
          <span className="text-white/20">•</span>
          {roomStatus.isHost ? (
            <span className="flex items-center gap-1 text-amber-300 font-semibold">
              <Crown className="w-3.5 h-3.5" />
              Chủ phòng
            </span>
          ) : (
            <span className="text-neutral-400">
              Chủ phòng: <strong className="text-neutral-200">{roomStatus.hostName}</strong>
            </span>
          )}
          {voicePolicy.mode === 'muted_all' && (
            <>
              <span className="text-white/20">•</span>
              <span className="flex items-center gap-1 text-rose-300 font-medium">
                <MicOff className="w-3 h-3" />
                Tắt mic phòng
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
};
