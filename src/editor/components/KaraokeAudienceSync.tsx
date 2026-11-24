import React, { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { MultiplayerManager, type NetworkKaraokeState } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { loungeAudio } from '../../utils/audio';
import { DebugLogger } from '../../utils/debugLogger';

interface KaraokeAudienceSyncProps {
  isSingingLocal: boolean;
}

const AUDIENCE_VOLUME_KEY = 'cavannghe:audience-karaoke-volume';

function getSavedAudienceVolume(): number {
  try {
    const raw = Number(localStorage.getItem(AUDIENCE_VOLUME_KEY));
    if (Number.isFinite(raw) && raw >= 0 && raw <= 150) {
      return Math.round(raw);
    }
  } catch {
    // ignore
  }
  return 100;
}

function computeTargetSec(state: NetworkKaraokeState, offsetSec: number): number {
  const base = typeof state.currentTime === 'number' ? state.currentTime : 0;
  const elapsed = state.isPlaying ? Math.max(0, (Date.now() - state.updatedAt) / 1000) : 0;
  // Compensate ~200ms WebRTC voice latency so beat aligns closely with singer's voice
  return Math.max(0, base + elapsed + offsetSec - 0.2);
}

/**
 * Listens for remote Karaoke singer state (`karaoke:sync`), WebRTC stereo voice stream,
 * auto-ducking of ambient lounge music, YouTube beat drift correction, and 3D audience applause.
 */
export const KaraokeAudienceSync: React.FC<KaraokeAudienceSyncProps> = ({ isSingingLocal }) => {
  const [remoteKaraoke, setRemoteKaraoke] = useState<NetworkKaraokeState | null>(() =>
    MultiplayerManager.getInstance().getRemoteKaraokeState()
  );
  const [muted, setMuted] = useState(false);
  const [listenerVolume, setListenerVolume] = useState<number>(() => getSavedAudienceVolume());
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [syncOffsetSec, setSyncOffsetSec] = useState(0);
  const syncOffsetRef = useRef(0);
  const audienceYtTimeRef = useRef(0);
  const lastTrackKeyRef = useRef('');
  const ytRef = useRef<HTMLIFrameElement>(null);
  syncOffsetRef.current = syncOffsetSec;

  useEffect(() => {
    const mp = MultiplayerManager.getInstance();
    const voice = KaraokeVoiceManager.getInstance();
    voice.initListener();

    mp.setOnRemoteKaraoke((next) => {
      if (!next.active) {
        if (lastTrackKeyRef.current) {
          DebugLogger.log('KaraokeAudience', `Remote karaoke ended (${next.singerName})`);
        }
        lastTrackKeyRef.current = '';
        audienceYtTimeRef.current = 0;
        setRemoteKaraoke(null);
        setSyncOffsetSec(0);
        return;
      }
      const nextKey = `${next.singerId}:${next.youtubeVideoId ?? next.title}`;
      if (nextKey !== lastTrackKeyRef.current) {
        DebugLogger.log('KaraokeAudience', `Syncing remote karaoke: ${next.singerName} -> "${next.title}"`);
        lastTrackKeyRef.current = nextKey;
        audienceYtTimeRef.current = 0;
        setSyncOffsetSec(0);
        syncOffsetRef.current = 0;
      }
      setRemoteKaraoke(next);
    });

    const onRoomLeft = () => {
      setRemoteKaraoke(null);
      loungeAudio.setDucked(false);
    };

    const onRemoteApplause = (e: Event) => {
      const detail = (e as CustomEvent<{ playerId?: string; x?: number }>).detail;
      const remotes = mp.getRemotePlayers();
      const sender = detail?.playerId ? remotes.get(detail.playerId) : undefined;
      const pan = sender
        ? Math.max(-0.85, Math.min(0.85, (sender.x - 10) / 14))
        : (Math.random() - 0.5) * 0.9;
      loungeAudio.playClapSound(pan, 0.78);
    };

    window.addEventListener('cavannghe:room-left', onRoomLeft);
    window.addEventListener('cavannghe:remote-applause', onRemoteApplause);

    return () => {
      window.removeEventListener('cavannghe:room-left', onRoomLeft);
      window.removeEventListener('cavannghe:remote-applause', onRemoteApplause);
      mp.setOnRemoteKaraoke(null);
      voice.destroyListener();
      loungeAudio.setDucked(false);
    };
  }, []);

  useEffect(() => {
    if (!isSingingLocal) {
      loungeAudio.setDucked(Boolean(remoteKaraoke?.active));
    }
  }, [isSingingLocal, remoteKaraoke?.active]);

  const getEffectiveBeatVolume = (state?: NetworkKaraokeState | null, volPct = listenerVolume) => {
    const singerMusicVol =
      typeof state?.musicVolume === 'number' && Number.isFinite(state.musicVolume)
        ? Math.max(0, Math.min(100, state.musicVolume))
        : 60;
    return Math.max(0, Math.min(100, Math.round(singerMusicVol * (volPct / 100))));
  };

  const syncYoutubeState = (
    playing: boolean,
    shouldMute: boolean,
    seekSec?: number,
    beatVolume = getEffectiveBeatVolume(remoteKaraoke)
  ) => {
    const win = ytRef.current?.contentWindow;
    if (!win) return;
    if (typeof seekSec === 'number' && Number.isFinite(seekSec)) {
      audienceYtTimeRef.current = seekSec;
      win.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [seekSec, true] }),
        '*'
      );
    }
    win.postMessage(
      JSON.stringify({
        event: 'command',
        func: playing ? 'playVideo' : 'pauseVideo',
        args: [],
      }),
      '*'
    );
    win.postMessage(
      JSON.stringify({
        event: 'command',
        func: shouldMute || beatVolume <= 0 ? 'mute' : 'unMute',
        args: [],
      }),
      '*'
    );
    if (!shouldMute && beatVolume > 0) {
      win.postMessage(
        JSON.stringify({ event: 'command', func: 'setVolume', args: [beatVolume] }),
        '*'
      );
    }
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        typeof e.origin === 'string' &&
        !e.origin.includes('youtube.com') &&
        !e.origin.includes('youtube-nocookie.com')
      ) {
        return;
      }
      if (typeof e.data !== 'string') return;
      try {
        const parsed = JSON.parse(e.data) as {
          event?: string;
          info?: { currentTime?: number };
        };
        if (
          parsed?.event === 'infoDelivery' &&
          typeof parsed.info?.currentTime === 'number'
        ) {
          audienceYtTimeRef.current = parsed.info.currentTime;
        }
      } catch {
        // ignore non-json message
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const shouldMute = muted || isSingingLocal || listenerVolume <= 0;
    const isPlaying = Boolean(remoteKaraoke?.isPlaying) && !isSingingLocal;
    const voiceMgr = KaraokeVoiceManager.getInstance();
    voiceMgr.setAudienceVolume(listenerVolume / 100);
    voiceMgr.setAudienceMuted(shouldMute);

    if (!remoteKaraoke?.youtubeVideoId || isSingingLocal) {
      syncYoutubeState(false, true, undefined, 0);
      return;
    }

    const targetSec = computeTargetSec(remoteKaraoke, syncOffsetRef.current);
    const needsSeek =
      !isPlaying || Math.abs(audienceYtTimeRef.current - targetSec) > 0.85;
    syncYoutubeState(
      isPlaying,
      shouldMute,
      needsSeek ? targetSec : undefined,
      getEffectiveBeatVolume(remoteKaraoke, listenerVolume)
    );
  }, [
    muted,
    listenerVolume,
    isSingingLocal,
    remoteKaraoke?.isPlaying,
    remoteKaraoke?.youtubeVideoId,
    remoteKaraoke?.currentTime,
    remoteKaraoke?.musicVolume,
    remoteKaraoke?.updatedAt,
  ]);

  const handleNudgeSync = (deltaSec: number) => {
    const nextOffset = Math.max(-15, Math.min(15, syncOffsetSec + deltaSec));
    setSyncOffsetSec(nextOffset);
    syncOffsetRef.current = nextOffset;
    if (!remoteKaraoke) return;
    const targetSec = computeTargetSec(remoteKaraoke, nextOffset);
    audienceYtTimeRef.current = targetSec;
    const win = ytRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [targetSec, true] }),
      '*'
    );
  };

  const handleClap = () => {
    loungeAudio.playClapSound(0, 0.85);
    MultiplayerManager.getInstance().broadcastApplause();
  };

  if (isSingingLocal || !remoteKaraoke?.active) {
    return null;
  }

  // Keep iframe src strictly constant per videoId so Pause/Mute/Nudge never reloads the player
  const ytSrc = remoteKaraoke.youtubeVideoId
    ? `https://www.youtube.com/embed/${remoteKaraoke.youtubeVideoId}?autoplay=1&enablejsapi=1&controls=0&rel=0&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`
    : null;

  return (
    <>
      {ytSrc && (
        <iframe
          ref={ytRef}
          key={`${remoteKaraoke.singerId}-${remoteKaraoke.youtubeVideoId}`}
          src={ytSrc}
          title="Audience Karaoke Beat"
          allow="autoplay; encrypted-media"
          onLoad={() => {
            const win = ytRef.current?.contentWindow;
            win?.postMessage(
              JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
              '*'
            );
            const shouldMute = muted || isSingingLocal || listenerVolume <= 0;
            const isPlaying = Boolean(remoteKaraoke.isPlaying) && !isSingingLocal;
            const targetSec = computeTargetSec(remoteKaraoke, syncOffsetRef.current);
            const beatVol = getEffectiveBeatVolume(remoteKaraoke, listenerVolume);
            syncYoutubeState(isPlaying, shouldMute, targetSec, beatVol);
            window.setTimeout(() => {
              syncYoutubeState(
                Boolean(remoteKaraoke.isPlaying) && !isSingingLocal,
                muted || isSingingLocal || listenerVolume <= 0,
                computeTargetSec(remoteKaraoke, syncOffsetRef.current),
                getEffectiveBeatVolume(remoteKaraoke, listenerVolume)
              );
            }, 650);
          }}
          className="fixed w-px h-px opacity-0 pointer-events-none -left-[9999px] -top-[9999px]"
        />
      )}
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-3 right-16 sm:right-auto z-[85] pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121212]/90 border border-white/10 backdrop-blur-md shadow-xl text-xs text-white max-w-[calc(100vw-4.75rem)] sm:max-w-[420px]">
        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <Mic className="w-3.5 h-3.5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-white truncate">
            {remoteKaraoke.singerName} đang hát{!remoteKaraoke.isPlaying ? ' (Tạm dừng)' : ''}
          </p>
          <p className="text-[11px] text-neutral-400 truncate">{remoteKaraoke.title}</p>
        </div>

        {ytSrc && (
          <div className="flex items-center gap-1 shrink-0 border-l border-white/10 pl-2">
            <button
              type="button"
              onClick={() => handleNudgeSync(-0.5)}
              className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[10px] font-mono text-neutral-300 transition"
              title="Lùi nhịp nhạc beat -0.5s"
            >
              -0.5s
            </button>
            <button
              type="button"
              onClick={() => handleNudgeSync(0.5)}
              className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[10px] font-mono text-neutral-300 transition"
              title="Tăng nhịp nhạc beat +0.5s"
            >
              +0.5s
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleClap}
          className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] transition shrink-0"
          title="Vỗ tay cổ vũ ca sĩ"
        >
          👏
        </button>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsVolumeOpen((v) => !v)}
            className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-neutral-200 transition flex items-center gap-1"
            title="Điều chỉnh âm lượng đầu ra của người hát (chỉ trên máy bạn)"
          >
            {muted || listenerVolume <= 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-white" />
            )}
            <span className="text-[10px] font-mono text-neutral-200">
              {muted ? '0%' : `${listenerVolume}%`}
            </span>
          </button>

          {isVolumeOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-[#121212]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-3 space-y-2.5 text-xs text-neutral-200 z-[90]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white text-[11px]">
                  Âm lượng người hát (Giọng & Nhạc)
                </span>
                <span className="font-mono text-[11px] text-sky-300">
                  {muted ? 'Tắt' : `${listenerVolume}%`}
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={150}
                step={5}
                value={muted ? 0 : listenerVolume}
                onChange={(e) => {
                  const val = Math.round(Number(e.target.value));
                  setMuted(val === 0);
                  setListenerVolume(val);
                  try {
                    localStorage.setItem(AUDIENCE_VOLUME_KEY, String(val));
                  } catch {
                    // ignore
                  }
                }}
                className="w-full accent-sky-400"
              />

              <div className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
                <span>Chỉ chỉnh trên máy của bạn</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMuted(false);
                      setListenerVolume(100);
                      try {
                        localStorage.setItem(AUDIENCE_VOLUME_KEY, '100');
                      } catch {
                        // ignore
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-neutral-200"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className={`px-2 py-0.5 rounded ${
                      muted
                        ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                    }`}
                  >
                    {muted ? 'Bật tiếng' : 'Tắt tiếng'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
