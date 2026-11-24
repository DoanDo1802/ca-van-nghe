import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { MultiplayerManager, type NetworkKaraokeState } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { loungeAudio } from '../../utils/audio';
import { DebugLogger } from '../../utils/debugLogger';
import { loadYouTubeIframeApi, type YTPlayerInstance } from '../../utils/youtubeApi';

interface KaraokeAudienceSyncProps {
  isSingingLocal: boolean;
}

function computeTargetSec(state: NetworkKaraokeState): number {
  const base = typeof state.currentTime === 'number' ? state.currentTime : 0;
  const elapsed = state.isPlaying ? Math.max(0, (Date.now() - state.updatedAt) / 1000) : 0;
  // Compensate ~200ms WebRTC voice latency so beat aligns closely with singer's voice
  return Math.max(0, base + elapsed - 0.2);
}

/**
 * Maps singer's audience music setting (0..100) onto YouTube's linear 0..100 scale
 * via a perceptual curve matching human hearing:
 * - 0% -> 0 (muted)
 * - 5% -> 1, 20% -> 2, 40% -> 8, 60% -> 23, 80% -> 47, 100% -> 82
 */
function computeEffectiveBeatVolume(singerMusicVol: number): number {
  const cleanSingerVol = Number.isFinite(singerMusicVol)
    ? Math.max(0, Math.min(100, singerMusicVol))
    : 60;
  if (cleanSingerVol <= 0) return 0;
  const perceptual = Math.round(Math.min(100, Math.pow(cleanSingerVol / 100, 2.5) * 82));
  return Math.max(1, perceptual);
}

/**
 * Listens for remote Karaoke singer state (`karaoke:sync` + `karaoke:volume`), WebRTC stereo voice stream,
 * auto-ducking of ambient lounge music, YouTube beat drift correction via YT.Player, and 3D audience applause.
 */
export const KaraokeAudienceSync: React.FC<KaraokeAudienceSyncProps> = ({ isSingingLocal }) => {
  const [remoteKaraoke, setRemoteKaraoke] = useState<NetworkKaraokeState | null>(() =>
    MultiplayerManager.getInstance().getRemoteKaraokeState()
  );
  const [singerMusicVolume, setSingerMusicVolume] = useState<number>(() => {
    const init = MultiplayerManager.getInstance().getRemoteKaraokeState();
    return typeof init?.musicVolume === 'number' ? init.musicVolume : 60;
  });
  const [muted, setMuted] = useState(false);

  const audienceYtTimeRef = useRef(0);
  const lastTrackKeyRef = useRef('');
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const readyRef = useRef(false);
  const verifyTimersRef = useRef<number[]>([]);

  const latestKaraokeRef = useRef(remoteKaraoke);
  latestKaraokeRef.current = remoteKaraoke;
  const latestSingingLocalRef = useRef(isSingingLocal);
  latestSingingLocalRef.current = isSingingLocal;
  const latestVolumeStateRef = useRef({ shouldMute: false, beatVolume: 23 });

  const shouldMuteAll = muted || isSingingLocal;
  const effectiveBeatVol = shouldMuteAll ? 0 : computeEffectiveBeatVolume(singerMusicVolume);
  latestVolumeStateRef.current = {
    shouldMute: shouldMuteAll,
    beatVolume: effectiveBeatVol,
  };

  const clearVerifyTimers = useCallback(() => {
    for (const id of verifyTimersRef.current) {
      window.clearTimeout(id);
    }
    verifyTimersRef.current = [];
  }, []);

  /**
   * Safely enforces mute & volume on YT.Player without clobbering `setVolume` via redundant `unMute()` calls.
   */
  const applyPlayerBeatVolume = useCallback(
    (player: YTPlayerInstance, muteTarget: boolean, volTarget: number) => {
      clearVerifyTimers();
      if (muteTarget || volTarget <= 0) {
        player.mute();
        return;
      }

      const currentlyMuted = typeof player.isMuted === 'function' ? player.isMuted() : false;
      if (currentlyMuted) {
        player.unMute();
      }
      player.setVolume(volTarget);

      const enforce = () => {
        if (!readyRef.current || playerRef.current !== player) return;
        const { shouldMute: curMute, beatVolume: curVol } = latestVolumeStateRef.current;
        if (curMute || curVol <= 0) {
          player.mute();
          return;
        }
        if (typeof player.isMuted === 'function' && player.isMuted()) {
          player.unMute();
        }
        if (typeof player.getVolume !== 'function' || player.getVolume() !== curVol) {
          player.setVolume(curVol);
        }
      };

      verifyTimersRef.current.push(
        window.setTimeout(enforce, 80),
        window.setTimeout(enforce, 240)
      );
    },
    [clearVerifyTimers]
  );

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
      }
      if (typeof next.musicVolume === 'number' && Number.isFinite(next.musicVolume)) {
        setSingerMusicVolume(Math.max(0, Math.min(100, Math.round(next.musicVolume))));
      }
      setRemoteKaraoke(next);
    });

    const onRemoteVolume = (e: Event) => {
      const detail = (e as CustomEvent<{ singerId: string; musicVolume: number }>).detail;
      if (!detail || typeof detail.musicVolume !== 'number') return;
      const cur = latestKaraokeRef.current;
      if (cur && cur.singerId !== detail.singerId) return;
      setSingerMusicVolume(Math.max(0, Math.min(100, Math.round(detail.musicVolume))));
    };

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

    window.addEventListener('cavannghe:remote-karaoke-volume', onRemoteVolume);
    window.addEventListener('cavannghe:room-left', onRoomLeft);
    window.addEventListener('cavannghe:remote-applause', onRemoteApplause);

    return () => {
      clearVerifyTimers();
      window.removeEventListener('cavannghe:remote-karaoke-volume', onRemoteVolume);
      window.removeEventListener('cavannghe:room-left', onRoomLeft);
      window.removeEventListener('cavannghe:remote-applause', onRemoteApplause);
      mp.setOnRemoteKaraoke(null);
      voice.destroyListener();
      loungeAudio.setDucked(false);
    };
  }, [clearVerifyTimers]);

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
      clearVerifyTimers();
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      return;
    }

    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !playerHostRef.current || !window.YT?.Player) return;

      clearVerifyTimers();
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
              const targetSec = computeTargetSec(cur);
              if (targetSec > 1 && ev.target.seekTo) {
                audienceYtTimeRef.current = targetSec;
                ev.target.seekTo(targetSec, true);
              }
              if (cur.isPlaying) {
                ev.target.playVideo();
                applyPlayerBeatVolume(ev.target, shouldMute, beatVolume);
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
              applyPlayerBeatVolume(ev.target, shouldMute, beatVolume);
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
      const player = playerRef.current;
      if (!readyRef.current || !player || !cur?.active || latestSingingLocalRef.current) return;

      const isCurrentlyMuted = typeof player.isMuted === 'function' ? player.isMuted() : false;
      if (!shouldMute && beatVolume > 0 && isCurrentlyMuted) {
        applyPlayerBeatVolume(player, false, beatVolume);
      }
      if (cur.isPlaying) {
        player.playVideo();
      }
    };
    window.addEventListener('pointerdown', onUserGesture, { passive: true });
    window.addEventListener('keydown', onUserGesture, { passive: true });

    return () => {
      cancelled = true;
      clearVerifyTimers();
      window.removeEventListener('pointerdown', onUserGesture);
      window.removeEventListener('keydown', onUserGesture);
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [activeYoutubeId, applyPlayerBeatVolume, clearVerifyTimers]);

  // Poll YouTube playback time every 1s for accurate drift detection
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

  // Apply mute/unmute & singer-driven beat volume to WebRTC voice & YouTube beat
  useEffect(() => {
    const voiceMgr = KaraokeVoiceManager.getInstance();
    voiceMgr.setAudienceVolume(1.0);
    voiceMgr.setAudienceMuted(shouldMuteAll);

    if (readyRef.current && playerRef.current) {
      applyPlayerBeatVolume(playerRef.current, shouldMuteAll, effectiveBeatVol);
    }
  }, [shouldMuteAll, effectiveBeatVol, applyPlayerBeatVolume]);

  // Sync play/pause & time drift without reloading or resetting volume
  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    if (!remoteKaraoke?.youtubeVideoId || !remoteKaraoke.active || isSingingLocal) {
      playerRef.current.pauseVideo();
      return;
    }

    const targetSec = computeTargetSec(remoteKaraoke);
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
      clearVerifyTimers();
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [clearVerifyTimers]);

  const handleClap = () => {
    loungeAudio.playClapSound(0, 0.85);
    MultiplayerManager.getInstance().broadcastApplause();
  };

  if (isSingingLocal || !remoteKaraoke?.active) {
    return null;
  }

  return (
    <>
      {/* Keep inside viewport behind canvas (z-0) so Chromium never throttles cross-origin YouTube subframe */}
      {activeYoutubeId && (
        <div
          ref={playerHostRef}
          aria-hidden="true"
          className="fixed bottom-0 left-0 z-0 w-[240px] h-[135px] opacity-[0.002] pointer-events-none overflow-hidden"
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
          onClick={() => setMuted((m) => !m)}
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
