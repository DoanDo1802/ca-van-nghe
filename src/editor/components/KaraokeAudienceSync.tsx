import React, { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { MultiplayerManager, type NetworkKaraokeState } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { soundEffects } from '../../utils/audio';
import { loadYouTubeIframeApi, type YTPlayerInstance } from '../../utils/youtubeApi';

interface KaraokeAudienceSyncProps {
  isSingingLocal: boolean;
}

export const KaraokeAudienceSync: React.FC<KaraokeAudienceSyncProps> = ({ isSingingLocal }) => {
  const [remoteKaraoke, setRemoteKaraoke] = useState<NetworkKaraokeState | null>(() =>
    MultiplayerManager.getInstance().getRemoteKaraokeState()
  );
  const [muted, setMuted] = useState(false);
  const [liveVolume, setLiveVolume] = useState<number>(60);

  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);

  const syncStateRef = useRef<{
    remote: NetworkKaraokeState | null;
    muted: boolean;
    volume: number;
  }>({ remote: remoteKaraoke, muted, volume: liveVolume });
  syncStateRef.current = { remote: remoteKaraoke, muted, volume: liveVolume };

  const applyPlayerSync = (player: YTPlayerInstance, state: NetworkKaraokeState, isMuted: boolean, vol: number) => {
    const elapsed = state.isPlaying ? Math.max(0, (Date.now() - state.updatedAt) / 1000) : 0;
    const targetSec = Math.max(0, (state.currentTime ?? 0) + elapsed - 0.25);
    const ytNow = player.getCurrentTime?.() ?? 0;
    if (Math.abs(ytNow - targetSec) > 1.2) {
      player.seekTo?.(targetSec, true);
    }

    if (isMuted || vol <= 0) {
      player.mute();
      player.setVolume(0);
    } else {
      player.unMute();
      player.setVolume(vol);
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
      setRemoteKaraoke(activeNext);
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

    const onRoomLeft = () => setRemoteKaraoke(null);
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
      return;
    }

    const videoId = remoteKaraoke.youtubeVideoId;
    let cancelled = false;

    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !ytHostRef.current || !window.YT?.Player) return;

      if (ytPlayerRef.current && ytReadyRef.current) {
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

      ytReadyRef.current = false;
      loadedVideoIdRef.current = videoId;
      ytPlayerRef.current = new window.YT.Player(ytHostRef.current, {
        width: 1,
        height: 1,
        videoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          controls: 0,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) {
              e.target.destroy();
              return;
            }
            ytReadyRef.current = true;
            const cur = syncStateRef.current;
            if (cur.remote) {
              applyPlayerSync(e.target, cur.remote, cur.muted, cur.volume);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [shouldSyncYouTubeAudio, remoteKaraoke?.youtubeVideoId]);

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
      const player = ytPlayerRef.current;
      const cur = syncStateRef.current;
      if (!player || !ytReadyRef.current || !cur.remote) return;
      if (!cur.muted && cur.volume > 0) {
        player.unMute();
        player.setVolume(cur.volume);
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

  const handleToggleMute = () => {
    setMuted((prev) => {
      const nextMuted = !prev;
      const player = ytPlayerRef.current;
      const cur = syncStateRef.current;
      if (player && ytReadyRef.current && cur.remote) {
        if (nextMuted || cur.volume <= 0) {
          player.mute();
          player.setVolume(0);
        } else {
          player.unMute();
          player.setVolume(cur.volume);
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
          className="fixed -left-[9999px] -top-[9999px] w-px h-px opacity-0 pointer-events-none"
        >
          <div ref={ytHostRef} />
        </div>
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
