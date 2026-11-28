import React, { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { MultiplayerManager, type NetworkKaraokeState } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { soundEffects } from '../../utils/audio';
import { DebugLogger } from '../../utils/debugLogger';
import {
  configureYouTubeIframe,
  loadYouTubeIframeApi,
  YOUTUBE_EMBED_HOSTS,
  type YTPlayerInstance,
} from '../../utils/youtubeApi';

interface KaraokeAudienceSyncProps {
  isSingingLocal: boolean;
}

export const KaraokeAudienceSync: React.FC<KaraokeAudienceSyncProps> = ({ isSingingLocal }) => {
  const [remoteKaraoke, setRemoteKaraoke] = useState<NetworkKaraokeState | null>(() =>
    MultiplayerManager.getInstance().getRemoteKaraokeState()
  );
  const [muted, setMuted] = useState(false);
  const [liveVolume, setLiveVolume] = useState<number>(60);
  const [ytHostIndex, setYtHostIndex] = useState(0);
  const [needsTapAudio, setNeedsTapAudio] = useState(false);

  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const receivedAtRef = useRef<number>(performance.now());
  const lastSeekAtRef = useRef<number>(0);
  const hasUserGestureRef = useRef<boolean>(false);
  const lastUnmuteAttemptRef = useRef<number>(0);

  const syncStateRef = useRef<{
    remote: NetworkKaraokeState | null;
    muted: boolean;
    volume: number;
  }>({ remote: remoteKaraoke, muted, volume: liveVolume });
  syncStateRef.current = { remote: remoteKaraoke, muted, volume: liveVolume };

  const applyPlayerSync = (
    player: YTPlayerInstance,
    state: NetworkKaraokeState,
    isMuted: boolean,
    vol: number,
    forceSeek = false
  ) => {
    const elapsed = state.isPlaying
      ? Math.max(0, (performance.now() - receivedAtRef.current) / 1000)
      : 0;
    const targetSec = Math.max(0, (state.currentTime ?? 0) + elapsed - 0.25);
    const ytNow = player.getCurrentTime?.() ?? 0;
    const nowPerf = performance.now();
    if (
      Math.abs(ytNow - targetSec) > 2.5 &&
      (forceSeek || nowPerf - lastSeekAtRef.current >= 4000)
    ) {
      lastSeekAtRef.current = nowPerf;
      player.seekTo?.(targetSec, true);
    }

    if (isMuted || vol <= 0) {
      player.mute();
      player.setVolume(0);
      setNeedsTapAudio(false);
    } else if (hasUserGestureRef.current) {
      lastUnmuteAttemptRef.current = nowPerf;
      player.unMute();
      player.setVolume(vol);
      setNeedsTapAudio(false);
    } else {
      player.mute();
      player.setVolume(0);
      if (state.isPlaying) {
        setNeedsTapAudio(true);
      }
    }

    if (state.isPlaying) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  };

  useEffect(() => {
    const mp = MultiplayerManager.getInstance();
    const voice = KaraokeVoiceManager.getInstance();
    voice.initListener();
    mp.setOnRemoteKaraoke((next) => {
      const activeNext = next.active ? next : null;
      receivedAtRef.current = performance.now();
      setRemoteKaraoke((prev) => {
        if (prev?.youtubeVideoId !== activeNext?.youtubeVideoId) {
          setYtHostIndex(0);
        }
        return activeNext;
      });
      if (activeNext && typeof activeNext.musicVolume === 'number') {
        setLiveVolume(activeNext.musicVolume);
      }
    });

    const onRemoteVolume = (event: Event) => {
      const detail = (event as CustomEvent<{ singerId?: string; musicVolume?: number }>).detail;
      if (
        detail &&
        typeof detail.musicVolume === 'number' &&
        detail.singerId === syncStateRef.current.remote?.singerId
      ) {
        setLiveVolume(detail.musicVolume);
      }
    };

    const onRoomLeft = () => {
      setRemoteKaraoke(null);
      setNeedsTapAudio(false);
    };
    window.addEventListener('cavannghe:room-left', onRoomLeft);
    window.addEventListener('cavannghe:remote-karaoke-volume', onRemoteVolume);
    return () => {
      window.removeEventListener('cavannghe:room-left', onRoomLeft);
      window.removeEventListener('cavannghe:remote-karaoke-volume', onRemoteVolume);
      mp.setOnRemoteKaraoke(null);
      voice.destroyListener();
    };
  }, []);

  useEffect(() => {
    KaraokeVoiceManager.getInstance().setAudienceMuted(muted || isSingingLocal);
  }, [muted, isSingingLocal]);

  useEffect(() => {
    // Applause is already broadcast to listeners. Keep it out of the singer's tab capture.
    if (isSingingLocal) return;
    const onRemoteApplause = (event: Event) => {
      const playerId = (event as CustomEvent<{ playerId?: string }>).detail?.playerId;
      const sender = playerId ? MultiplayerManager.getInstance().getRemotePlayers().get(playerId) : undefined;
      const pan = sender
        ? Math.max(-0.85, Math.min(0.85, (sender.x - 10) / 14))
        : (Math.random() - 0.5) * 0.9;
      soundEffects.playClapSound(pan, 0.78);
    };
    window.addEventListener('cavannghe:remote-applause', onRemoteApplause);
    return () => window.removeEventListener('cavannghe:remote-applause', onRemoteApplause);
  }, [isSingingLocal]);

  const shouldSyncYouTubeAudio = Boolean(
    !isSingingLocal &&
      remoteKaraoke?.active &&
      remoteKaraoke.youtubeVideoId &&
      remoteKaraoke.syncYouTubeAudio
  );

  // Create or destroy the hidden synced YouTube audio player for mobile-hosted karaoke.
  useEffect(() => {
    if (!shouldSyncYouTubeAudio || !remoteKaraoke?.youtubeVideoId) {
      ytReadyRef.current = false;
      loadedVideoIdRef.current = null;
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = null;
      setNeedsTapAudio(false);
      return;
    }

    const videoId = remoteKaraoke.youtubeVideoId;
    let cancelled = false;

    void loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !ytHostRef.current || !window.YT?.Player) return;

        if (ytPlayerRef.current && ytReadyRef.current && ytHostIndex === 0) {
          if (loadedVideoIdRef.current !== videoId) {
            loadedVideoIdRef.current = videoId;
            const cur = syncStateRef.current;
            if (cur.remote?.isPlaying) {
              ytPlayerRef.current.loadVideoById({ videoId });
            } else if (ytPlayerRef.current.cueVideoById) {
              ytPlayerRef.current.cueVideoById({ videoId });
            } else {
              ytPlayerRef.current.loadVideoById({ videoId });
              ytPlayerRef.current.pauseVideo();
            }
          }
          return;
        }

        ytPlayerRef.current?.destroy();
        ytReadyRef.current = false;
        loadedVideoIdRef.current = videoId;

        const mountEl = document.createElement('div');
        ytHostRef.current.innerHTML = '';
        ytHostRef.current.appendChild(mountEl);

        const embedHost = YOUTUBE_EMBED_HOSTS[ytHostIndex] ?? YOUTUBE_EMBED_HOSTS[0];
        const player = new window.YT.Player(mountEl, {
          width: 200,
          height: 200,
          host: embedHost,
          videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            playsinline: 1,
            controls: 0,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) {
                e.target.destroy();
                return;
              }
              ytReadyRef.current = true;
              configureYouTubeIframe(e.target.getIframe?.());
              const cur = syncStateRef.current;
              if (cur.remote) {
                applyPlayerSync(e.target, cur.remote, cur.muted, cur.volume, true);
              }
            },
            onStateChange: (e) => {
              if (cancelled) return;
              const cur = syncStateRef.current;
              if (
                e.data === 2 &&
                cur.remote?.isPlaying &&
                performance.now() - lastUnmuteAttemptRef.current < 1200
              ) {
                // Browser blocked unmuted playback -> keep playing muted & show tap-to-unmute CTA
                e.target.mute();
                e.target.playVideo();
                if (!cur.muted && cur.volume > 0) {
                  setNeedsTapAudio(true);
                }
              }
            },
            onError: (e) => {
              if (cancelled) return;
              if ((e.data === 153 || e.data === 5) && ytHostIndex === 0) {
                DebugLogger.warn(
                  'KaraokeAudienceSync',
                  `YouTube error ${e.data} on youtube.com, retrying with youtube-nocookie.com`
                );
                setYtHostIndex(1);
                return;
              }
              DebugLogger.warn('KaraokeAudienceSync', `Synced YouTube playback error: code ${e.data}`);
            },
          },
        });
        ytPlayerRef.current = player;
        configureYouTubeIframe(player.getIframe?.());
      })
      .catch((err) => {
        if (!cancelled) {
          DebugLogger.warn('KaraokeAudienceSync', 'Failed to load YouTube IFrame API', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shouldSyncYouTubeAudio, remoteKaraoke?.youtubeVideoId, ytHostIndex]);

  // Sync play/pause, seek drift, and volume updates to the active hidden player.
  useEffect(() => {
    if (!shouldSyncYouTubeAudio || !ytPlayerRef.current || !ytReadyRef.current || !remoteKaraoke) {
      return;
    }
    applyPlayerSync(ytPlayerRef.current, remoteKaraoke, muted, liveVolume);
  }, [shouldSyncYouTubeAudio, remoteKaraoke, muted, liveVolume]);

  // Unlock browser autoplay with sound on first user gesture if blocked initially.
  useEffect(() => {
    if (!shouldSyncYouTubeAudio) return;
    const unlock = () => {
      hasUserGestureRef.current = true;
      const player = ytPlayerRef.current;
      const cur = syncStateRef.current;
      if (!player || !ytReadyRef.current || !cur.remote) return;
      if (!cur.muted && cur.volume > 0) {
        lastUnmuteAttemptRef.current = performance.now();
        player.unMute();
        player.setVolume(cur.volume);
        setNeedsTapAudio(false);
      }
      if (cur.remote.isPlaying) {
        player.playVideo();
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [shouldSyncYouTubeAudio]);

  // Destroy player on unmount.
  useEffect(() => {
    return () => {
      ytReadyRef.current = false;
      loadedVideoIdRef.current = null;
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = null;
    };
  }, []);

  const handleClap = () => {
    soundEffects.playClapSound(0, 0.85);
    MultiplayerManager.getInstance().broadcastApplause();
  };

  const handleTapEnableAudio = () => {
    hasUserGestureRef.current = true;
    const player = ytPlayerRef.current;
    const cur = syncStateRef.current;
    setNeedsTapAudio(false);
    if (!player || !ytReadyRef.current || !cur.remote) return;
    if (!cur.muted && cur.volume > 0) {
      lastUnmuteAttemptRef.current = performance.now();
      player.unMute();
      player.setVolume(cur.volume);
    }
    if (cur.remote.isPlaying) {
      player.playVideo();
    }
  };

  const handleToggleMute = () => {
    hasUserGestureRef.current = true;
    setMuted((prev) => {
      const nextMuted = !prev;
      const player = ytPlayerRef.current;
      const cur = syncStateRef.current;
      if (player && ytReadyRef.current && cur.remote) {
        if (nextMuted || cur.volume <= 0) {
          player.mute();
          player.setVolume(0);
        } else {
          lastUnmuteAttemptRef.current = performance.now();
          player.unMute();
          player.setVolume(cur.volume);
          setNeedsTapAudio(false);
          if (cur.remote.isPlaying) player.playVideo();
        }
      }
      return nextMuted;
    });
  };

  if (isSingingLocal || !remoteKaraoke?.active) return null;

  return (
    <>
      {shouldSyncYouTubeAudio && (
        <div
          aria-hidden="true"
          className="fixed bottom-0 right-0 w-[200px] h-[200px] opacity-[0.001] pointer-events-none -z-10 overflow-hidden"
        >
          <div ref={ytHostRef} className="w-[200px] h-[200px]" />
        </div>
      )}

      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-3 right-[8.25rem] sm:right-auto z-[85] pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121212]/90 border border-white/10 backdrop-blur-md shadow-xl text-xs text-white max-w-[calc(100vw-9rem)] sm:max-w-[420px]">
        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <Mic className="w-3.5 h-3.5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-white truncate">
            {remoteKaraoke.singerName} đang hát{!remoteKaraoke.isPlaying ? ' (Tạm dừng)' : ''}
          </p>
          <p className="text-[11px] text-neutral-400 truncate">{remoteKaraoke.title}</p>
        </div>

        {needsTapAudio && !muted && (
          <button
            type="button"
            onClick={handleTapEnableAudio}
            className="px-2 py-1 rounded-full bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/40 text-amber-200 text-[10px] font-semibold transition shrink-0"
            title="Chạm để bật tiếng nhạc đồng bộ"
          >
            Bật nhạc
          </button>
        )}

        <button
          type="button"
          onClick={handleClap}
          className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] transition shrink-0"
          title="Vỗ tay cổ vũ ca sĩ"
        >
          👏
        </button>

        <button
          type="button"
          onClick={handleToggleMute}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-neutral-200 transition shrink-0"
          title={muted ? 'Bật âm thanh người hát' : 'Tắt âm thanh người hát'}
        >
          {muted ? (
            <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-white" />
          )}
        </button>
      </div>
    </>
  );
};
