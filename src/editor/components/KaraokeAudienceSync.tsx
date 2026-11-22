import React, { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { MultiplayerManager, type NetworkKaraokeState } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';

interface KaraokeAudienceSyncProps {
  isSingingLocal: boolean;
}

/**
 * Listens for remote Karaoke singer state (`karaoke:sync`) and WebRTC voice stream
 * so audience members in Phòng Trà hear both the singer's voice and YouTube beat.
 */
export const KaraokeAudienceSync: React.FC<KaraokeAudienceSyncProps> = ({ isSingingLocal }) => {
  const [remoteKaraoke, setRemoteKaraoke] = useState<NetworkKaraokeState | null>(() =>
    MultiplayerManager.getInstance().getRemoteKaraokeState()
  );
  const [muted, setMuted] = useState(false);
  const ytRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const mp = MultiplayerManager.getInstance();
    const voice = KaraokeVoiceManager.getInstance();
    voice.initListener();

    mp.setOnRemoteKaraoke((next) => {
      setRemoteKaraoke(next.active ? next : null);
    });

    return () => {
      mp.setOnRemoteKaraoke(null);
      voice.destroyListener();
    };
  }, []);

  useEffect(() => {
    KaraokeVoiceManager.getInstance().setAudienceMuted(muted || isSingingLocal);
    const win = ytRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({
        event: 'command',
        func: muted || isSingingLocal ? 'mute' : 'unMute',
        args: [],
      }),
      '*'
    );
    if (!muted && !isSingingLocal) {
      win.postMessage(
        JSON.stringify({ event: 'command', func: 'setVolume', args: [38] }),
        '*'
      );
    }
  }, [muted, isSingingLocal]);

  if (isSingingLocal || !remoteKaraoke?.active || !remoteKaraoke.youtubeVideoId) {
    return null;
  }

  const startOffsetSec = Math.max(
    0,
    Math.floor((Date.now() - remoteKaraoke.updatedAt) / 1000)
  );
  const ytSrc = `https://www.youtube.com/embed/${remoteKaraoke.youtubeVideoId}?autoplay=1&enablejsapi=1&controls=0&rel=0&start=${startOffsetSec}&mute=${muted ? 1 : 0}`;

  return (
    <>
      <iframe
        ref={ytRef}
        key={`${remoteKaraoke.singerId}-${remoteKaraoke.youtubeVideoId}-${remoteKaraoke.updatedAt}`}
        src={ytSrc}
        title="Audience Karaoke Beat"
        allow="autoplay; encrypted-media"
        className="fixed w-px h-px opacity-0 pointer-events-none -left-[9999px] -top-[9999px]"
      />
      <div className="fixed bottom-4 left-4 z-[85] pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#121212]/90 border border-white/10 backdrop-blur-md shadow-xl text-xs text-white max-w-[320px]">
        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <Mic className="w-3.5 h-3.5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-white truncate">
            {remoteKaraoke.singerName} đang hát
          </p>
          <p className="text-[11px] text-neutral-400 truncate">{remoteKaraoke.title}</p>
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-neutral-200 transition shrink-0"
          title={muted ? 'Bật tiếng' : 'Tắt tiếng'}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5 text-neutral-400" /> : <Volume2 className="w-3.5 h-3.5 text-white" />}
        </button>
      </div>
    </>
  );
};
