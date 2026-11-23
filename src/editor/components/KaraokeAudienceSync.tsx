import React, { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { MultiplayerManager, type NetworkKaraokeState } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { loungeAudio } from '../../utils/audio';

interface KaraokeAudienceSyncProps {
  isSingingLocal: boolean;
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
        lastTrackKeyRef.current = '';
        audienceYtTimeRef.current = 0;
        setRemoteKaraoke(null);
        setSyncOffsetSec(0);
        return;
      }
      const nextKey = `${next.singerId}:${next.youtubeVideoId ?? next.title}`;
      if (nextKey !== lastTrackKeyRef.current) {
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

  const syncYoutubeState = (playing: boolean, shouldMute: boolean, seekSec?: number) => {
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
        func: shouldMute ? 'mute' : 'unMute',
        args: [],
      }),
      '*'
    );
    if (!shouldMute) {
      win.postMessage(
        JSON.stringify({ event: 'command', func: 'setVolume', args: [38] }),
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
    const shouldMute = muted || isSingingLocal;
    const isPlaying = Boolean(remoteKaraoke?.isPlaying) && !isSingingLocal;
    KaraokeVoiceManager.getInstance().setAudienceMuted(shouldMute);

    if (!remoteKaraoke?.youtubeVideoId || isSingingLocal) {
      syncYoutubeState(false, true);
      return;
    }

    const targetSec = computeTargetSec(remoteKaraoke, syncOffsetRef.current);
    const needsSeek =
      !isPlaying || Math.abs(audienceYtTimeRef.current - targetSec) > 0.85;
    syncYoutubeState(isPlaying, shouldMute, needsSeek ? targetSec : undefined);
  }, [
    muted,
    isSingingLocal,
    remoteKaraoke?.isPlaying,
    remoteKaraoke?.youtubeVideoId,
    remoteKaraoke?.currentTime,
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
            const shouldMute = muted || isSingingLocal;
            const isPlaying = Boolean(remoteKaraoke.isPlaying) && !isSingingLocal;
            const targetSec = computeTargetSec(remoteKaraoke, syncOffsetRef.current);
            syncYoutubeState(isPlaying, shouldMute, targetSec);
            window.setTimeout(() => {
              syncYoutubeState(
                Boolean(remoteKaraoke.isPlaying) && !isSingingLocal,
                muted || isSingingLocal,
                computeTargetSec(remoteKaraoke, syncOffsetRef.current)
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

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-neutral-200 transition shrink-0"
          title={muted ? 'Bật tiếng' : 'Tắt tiếng'}
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
