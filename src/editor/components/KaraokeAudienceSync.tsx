import React, { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { MultiplayerManager, type NetworkKaraokeState } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { loungeAudio } from '../../utils/audio';
import { DebugLogger } from '../../utils/debugLogger';
import { loadYouTubeIframeApi, type YTPlayerInstance } from '../../utils/youtubeApi';

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
 * Converts singer's audience music setting (0..100) and listener's local output multiplier (0..150)
 * through a perceptual power curve so low percentages (5%, 10%) sound genuinely soft and distinct.
 */
function computeEffectiveBeatVolume(
  state: NetworkKaraokeState | null | undefined,
  listenerVolPct: number
): number {
  const singerMusicVol =
    typeof state?.musicVolume === 'number' && Number.isFinite(state.musicVolume)
      ? Math.max(0, Math.min(100, state.musicVolume))
      : 60;
  if (singerMusicVol <= 0 || listenerVolPct <= 0) return 0;
  const combinedRatio = (singerMusicVol / 100) * (listenerVolPct / 100);
  const perceptual = Math.round(Math.min(100, Math.pow(combinedRatio, 1.35) * 85));
  return Math.max(1, perceptual);
}

/**
 * Listens for remote Karaoke singer state (`karaoke:sync`), WebRTC stereo voice stream,
 * auto-ducking of ambient lounge music, YouTube beat drift correction via YT.Player, and 3D audience applause.
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
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const readyRef = useRef(false);

  const latestKaraokeRef = useRef(remoteKaraoke);
  latestKaraokeRef.current = remoteKaraoke;
  const latestSingingLocalRef = useRef(isSingingLocal);
  latestSingingLocalRef.current = isSingingLocal;
  const latestVolumeStateRef = useRef({ shouldMute: false, beatVolume: 43 });

  syncOffsetRef.current = syncOffsetSec;

  const shouldMuteAll = muted || isSingingLocal || listenerVolume <= 0;
  const effectiveBeatVol = shouldMuteAll
    ? 0
    : computeEffectiveBeatVolume(remoteKaraoke, listenerVolume);
  latestVolumeStateRef.current = {
    shouldMute: shouldMuteAll,
    beatVolume: effectiveBeatVol,
  };

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
        DebugLogger.log(
          'KaraokeAudience',
          `Syncing remote karaoke: ${next.singerName} -> "${next.title}"`
        );
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

  const activeYoutubeId =
    !isSingingLocal && remoteKaraoke?.active ? remoteKaraoke.youtubeVideoId : null;

  // Create & manage official YT.Player instance per active song
  useEffect(() => {
    if (!activeYoutubeId) {
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      return;
    }

    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !playerHostRef.current || !window.YT?.Player) return;

      readyRef.current = false;
      playerRef.current?.destroy();

      const mountEl = document.createElement('div');
      playerHostRef.current.innerHTML = '';
      playerHostRef.current.appendChild(mountEl);

      playerRef.current = new window.YT.Player(mountEl, {
        width: 240,
        height: 135,
        videoId: activeYoutubeId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (ev) => {
            if (cancelled) return;
            readyRef.current = true;
            const cur = latestKaraokeRef.current;
            const { shouldMute, beatVolume } = latestVolumeStateRef.current;
            ev.target.mute();
            if (cur && cur.active && !latestSingingLocalRef.current) {
              const targetSec = computeTargetSec(cur, syncOffsetRef.current);
              if (targetSec > 1 && ev.target.seekTo) {
                audienceYtTimeRef.current = targetSec;
                ev.target.seekTo(targetSec, true);
              }
              if (cur.isPlaying) {
                ev.target.playVideo();
                if (!shouldMute && beatVolume > 0) {
                  ev.target.unMute();
                  ev.target.setVolume(beatVolume);
                }
              } else {
                ev.target.pauseVideo();
              }
            } else {
              ev.target.pauseVideo();
            }
          },
          onStateChange: (ev) => {
            if (cancelled) return;
            const cur = latestKaraokeRef.current;
            const { shouldMute, beatVolume } = latestVolumeStateRef.current;
            if (!cur || !cur.active || latestSingingLocalRef.current) return;
            // YT.PlayerState.PLAYING === 1, CUED === 5, UNSTARTED === -1
            if (ev.data === 1 && cur.isPlaying) {
              if (shouldMute || beatVolume <= 0) {
                ev.target.mute();
              } else {
                ev.target.unMute();
                ev.target.setVolume(beatVolume);
              }
            } else if ((ev.data === 5 || ev.data === -1) && cur.isPlaying) {
              ev.target.mute();
              ev.target.playVideo();
            }
          },
        },
      });
    });

    const onUserGesture = () => {
      const cur = latestKaraokeRef.current;
      const { shouldMute, beatVolume } = latestVolumeStateRef.current;
      if (readyRef.current && playerRef.current && cur?.active && !latestSingingLocalRef.current) {
        if (shouldMute || beatVolume <= 0) {
          playerRef.current.mute();
        } else {
          playerRef.current.unMute();
          playerRef.current.setVolume(beatVolume);
        }
        if (cur.isPlaying) {
          playerRef.current.playVideo();
        }
      }
    };
    window.addEventListener('pointerdown', onUserGesture, { passive: true });
    window.addEventListener('keydown', onUserGesture, { passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', onUserGesture);
      window.removeEventListener('keydown', onUserGesture);
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [activeYoutubeId]);

  // Poll YouTube playback time every 1s for accurate drift detection & nudge controls
  useEffect(() => {
    if (!activeYoutubeId) return;
    const timer = window.setInterval(() => {
      if (!readyRef.current || !playerRef.current) return;
      const t = playerRef.current.getCurrentTime?.();
      if (typeof t === 'number' && Number.isFinite(t)) {
        audienceYtTimeRef.current = t;
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeYoutubeId]);

  // Apply combined output volume to BOTH WebRTC singer voice AND YouTube beat (isolated from play/seek)
  useEffect(() => {
    const voiceMgr = KaraokeVoiceManager.getInstance();
    voiceMgr.setAudienceVolume(listenerVolume / 100);
    voiceMgr.setAudienceMuted(shouldMuteAll);

    if (readyRef.current && playerRef.current) {
      if (shouldMuteAll || effectiveBeatVol <= 0) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
        playerRef.current.setVolume(effectiveBeatVol);
      }
    }
  }, [shouldMuteAll, listenerVolume, effectiveBeatVol]);

  // Sync play/pause & time drift without reloading or resetting volume
  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    if (!remoteKaraoke?.youtubeVideoId || !remoteKaraoke.active || isSingingLocal) {
      playerRef.current.pauseVideo();
      return;
    }

    const targetSec = computeTargetSec(remoteKaraoke, syncOffsetRef.current);
    const liveTime = playerRef.current.getCurrentTime?.() ?? audienceYtTimeRef.current;
    const needsSeek = !remoteKaraoke.isPlaying || Math.abs(liveTime - targetSec) > 1.0;

    if (needsSeek && playerRef.current.seekTo) {
      audienceYtTimeRef.current = targetSec;
      playerRef.current.seekTo(targetSec, true);
    }
    if (remoteKaraoke.isPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [
    isSingingLocal,
    remoteKaraoke?.active,
    remoteKaraoke?.isPlaying,
    remoteKaraoke?.youtubeVideoId,
    remoteKaraoke?.currentTime,
    remoteKaraoke?.updatedAt,
  ]);

  useEffect(() => {
    return () => {
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const handleNudgeSync = (deltaSec: number) => {
    const nextOffset = Math.max(-15, Math.min(15, syncOffsetSec + deltaSec));
    setSyncOffsetSec(nextOffset);
    syncOffsetRef.current = nextOffset;
    if (!remoteKaraoke || !readyRef.current || !playerRef.current?.seekTo) return;
    const targetSec = computeTargetSec(remoteKaraoke, nextOffset);
    audienceYtTimeRef.current = targetSec;
    playerRef.current.seekTo(targetSec, true);
  };

  const handleClap = () => {
    loungeAudio.playClapSound(0, 0.85);
    MultiplayerManager.getInstance().broadcastApplause();
  };

  if (isSingingLocal || !remoteKaraoke?.active) {
    return null;
  }

  return (
    <>
      {activeYoutubeId && (
        <div
          ref={playerHostRef}
          aria-hidden="true"
          className="fixed w-[240px] h-[135px] opacity-0 pointer-events-none -left-[9999px] -top-[9999px]"
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

        {activeYoutubeId && (
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
            title="Điều chỉnh chung âm lượng giọng hát & nhạc nền (chỉ trên máy bạn)"
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
