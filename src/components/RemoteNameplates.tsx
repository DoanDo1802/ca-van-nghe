import React, { useEffect, useState } from 'react';
import { Crown, Mic } from 'lucide-react';
import { MultiplayerManager, type ChatMessage } from '../network/MultiplayerManager';
import type { NameplateEntry } from '../engine/runtime/RemotePlayerPool';

interface OverheadBubble {
  id: string;
  text: string;
  expiresAt: number;
}

export const RemoteNameplates: React.FC = () => {
  const [nameplates, setNameplates] = useState<NameplateEntry[]>([]);
  const [bubbles, setBubbles] = useState<Record<string, OverheadBubble>>({});
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(() =>
    MultiplayerManager.getInstance().getSpeakingPeerIds()
  );

  useEffect(() => {
    const onNameplates = (e: Event) => {
      setNameplates((e as CustomEvent<NameplateEntry[]>).detail || []);
    };
    const onSpeaking = (e: Event) => {
      setSpeakingIds(new Set((e as CustomEvent<Set<string>>).detail));
    };
    const onChatMessage = (e: Event) => {
      const msg = (e as CustomEvent<ChatMessage>).detail;
      if (!msg || msg.kind === 'system' || !msg.text?.trim()) return;
      const durationMs = Math.min(7000, Math.max(4000, 3500 + msg.text.length * 45));
      setBubbles((prev) => ({
        ...prev,
        [msg.senderId]: {
          id: msg.id,
          text: msg.text,
          expiresAt: Date.now() + durationMs,
        },
      }));
    };
    const onRoomLeft = () => {
      setBubbles({});
    };

    window.addEventListener('cavannghe:remote-nameplates', onNameplates);
    window.addEventListener('cavannghe:voice-speaking', onSpeaking);
    window.addEventListener('cavannghe:chat-message', onChatMessage);
    window.addEventListener('cavannghe:room-left', onRoomLeft);
    return () => {
      window.removeEventListener('cavannghe:remote-nameplates', onNameplates);
      window.removeEventListener('cavannghe:voice-speaking', onSpeaking);
      window.removeEventListener('cavannghe:chat-message', onChatMessage);
      window.removeEventListener('cavannghe:room-left', onRoomLeft);
    };
  }, []);

  const hasBubbles = Object.keys(bubbles).length > 0;
  useEffect(() => {
    if (!hasBubbles) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setBubbles((prev) => {
        let changed = false;
        const next: Record<string, OverheadBubble> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.expiresAt > now) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [hasBubbles]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
      {nameplates.map((np) => {
        const isSpeaking = speakingIds.has(np.id);
        const bubble = bubbles[np.id];
        const showBubble = Boolean(
          bubble && bubble.expiresAt > Date.now() && (np.distance ?? 0) < 20
        );

        if (np.isLocal && !showBubble) {
          return null;
        }

        return (
          <div
            key={np.id}
            style={{
              transform: `translate3d(${np.x}px, ${np.y}px, 0) translate(-50%, -100%)`,
            }}
            className="absolute top-0 left-0 flex flex-col items-center"
          >
            {showBubble && bubble && (
              <div className="flex flex-col items-center mb-1.5">
                <div className="max-w-[190px] px-2.5 py-1.5 rounded-xl bg-white/95 text-neutral-950 text-[11px] font-medium leading-snug shadow-xl border border-black/10 break-words text-center">
                  <p className="line-clamp-3">{bubble.text}</p>
                </div>
                <div className="w-2 h-2 bg-white/95 rotate-45 -mt-1 border-r border-b border-black/10" />
              </div>
            )}

            {!np.isLocal && (
              <div
                className={`px-2 py-0.5 rounded-full bg-black/70 border text-[11px] font-medium text-white whitespace-nowrap flex items-center gap-1 shadow-md backdrop-blur-sm transition-colors ${
                  isSpeaking ? 'border-emerald-400/70' : 'border-white/15'
                }`}
              >
                {np.isAdmin && (
                  <span className="px-1 py-0.2 rounded bg-rose-500/25 border border-rose-400/50 text-rose-200 text-[9px] font-bold tracking-wide uppercase">
                    ADMIN
                  </span>
                )}
                {np.isHost && <Crown className="w-3 h-3 text-amber-400" />}
                <span>{np.name}</span>
                {isSpeaking && <Mic className="w-3 h-3 text-emerald-400 animate-pulse" />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
