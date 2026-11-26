import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';

interface KaraokeLocalVideoProps {
  video: HTMLVideoElement;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onExternalPause?: () => void;
}

function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function KaraokeLocalVideo({ video, isPlaying, onTogglePlay, onExternalPause }: KaraokeLocalVideoProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoHostRef = useRef<HTMLDivElement>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const onExternalPauseRef = useRef(onExternalPause);
  onExternalPauseRef.current = onExternalPause;
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const host = videoHostRef.current;
    if (!host) return;
    host.replaceChildren(video);

    const updateTime = () => {
      setTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      setDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
    };
    const handlePause = () => {
      if (!video.ended && isPlayingRef.current) {
        onExternalPauseRef.current?.();
      }
    };
    const events = ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked'];
    events.forEach((event) => video.addEventListener(event, updateTime));
    video.addEventListener('pause', handlePause);
    updateTime();

    return () => {
      events.forEach((event) => video.removeEventListener(event, updateTime));
      video.removeEventListener('pause', handlePause);
      video.remove();
    };
  }, [video]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const seek = (seconds: number) => {
    if (!duration || !Number.isFinite(seconds)) return;
    const nextTime = Math.min(Math.max(seconds, 0), duration);
    video.currentTime = nextTime;
    setTime(nextTime);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement === playerRef.current) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void playerRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  const iconButton = 'inline-flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-neutral-200 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
  const playLabel = isPlaying ? 'Tạm dừng' : 'Phát';
  const fullscreenLabel = isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình';

  return (
    <div ref={playerRef} className="bg-black fullscreen:flex fullscreen:flex-col">
      <div
        ref={videoHostRef}
        className={isFullscreen ? 'flex min-h-0 flex-1 items-center justify-center [&>video]:max-h-full [&>video]:object-contain' : ''}
      />
      <div className="border-t border-white/10 bg-[#141414] px-2 pb-1 pr-6">
        <input
          aria-label="Tua video karaoke"
          aria-valuetext={`${formatTime(time)} trên ${formatTime(duration)}`}
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          disabled={!duration}
          value={Math.min(time, duration)}
          onChange={(event) => seek(event.currentTarget.valueAsNumber)}
          className="block h-5 w-full cursor-pointer accent-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:cursor-default"
        />
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label={playLabel} title={playLabel} onClick={onTogglePlay}
            className={`${iconButton} text-amber-300 hover:text-amber-100`}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button type="button" aria-label="Lùi 5 giây" title="Lùi 5 giây" onClick={() => seek(video.currentTime - 5)}
            disabled={!duration} className={iconButton}>
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Tiến 5 giây" title="Tiến 5 giây" onClick={() => seek(video.currentTime + 5)}
            disabled={!duration} className={iconButton}>
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-0 flex-1 whitespace-nowrap text-center font-mono text-[10px] tabular-nums text-neutral-300">
            {formatTime(time)} / {formatTime(duration)}
          </span>
          {document.fullscreenEnabled && (
            <button type="button" aria-label={fullscreenLabel} title={fullscreenLabel} onClick={toggleFullscreen}
              className={iconButton}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
