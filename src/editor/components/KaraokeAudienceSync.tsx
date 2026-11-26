import React, { useEffect, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { MultiplayerManager, type NetworkKaraokeState } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { soundEffects } from '../../utils/audio';

interface KaraokeAudienceSyncProps {
  isSingingLocal: boolean;
}

export const KaraokeAudienceSync: React.FC<KaraokeAudienceSyncProps> = ({ isSingingLocal }) => {
  const [remoteKaraoke, setRemoteKaraoke] = useState<NetworkKaraokeState | null>(() =>
    MultiplayerManager.getInstance().getRemoteKaraokeState()
  );
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const mp = MultiplayerManager.getInstance();
    const voice = KaraokeVoiceManager.getInstance();
    voice.initListener();
    mp.setOnRemoteKaraoke((next) => setRemoteKaraoke(next.active ? next : null));

    const onRoomLeft = () => setRemoteKaraoke(null);
    window.addEventListener('cavannghe:room-left', onRoomLeft);
    return () => {
      window.removeEventListener('cavannghe:room-left', onRoomLeft);
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

  const handleClap = () => {
    soundEffects.playClapSound(0, 0.85);
    MultiplayerManager.getInstance().broadcastApplause();
  };

  if (isSingingLocal || !remoteKaraoke?.active) return null;

  return (
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
  );
};
