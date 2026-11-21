import React, { useEffect, useRef, useState } from 'react';
import type { ScreenProjectionData, StageMediaState } from '../engine/runtime/StageAudioManager';

interface YTPlayerInstance {
  loadVideoById: (opts: { videoId: string; suggestedQuality?: string }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (vol: number) => void;
  setPlaybackQuality: (quality: string) => void;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          width?: string | number;
          height?: string | number;
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void;
            onStateChange?: (e: { target: YTPlayerInstance; data: number }) => void;
            onError?: (e: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function getYouTubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'ID/Link video YouTube không hợp lệ.';
    case 100:
      return 'Video YouTube không tồn tại hoặc đang ở chế độ Riêng tư.';
    case 101:
    case 150:
      return 'Chủ sở hữu video YouTube đã tắt quyền nhúng phát trên web khác.';
    default:
      return `Không thể phát video YouTube này (mã lỗi ${code}).`;
  }
}

/**
 * Renders the 1280x720 YouTube IFrame Player (or fallback DOM `<video>` for non-CORS external links)
 * behind the transparent WebGL `<canvas>` (`z-0`), aligned via `matrix3d` to `LED Screen Panel`.
 * Because `LED Screen Panel` writes a transparent depth-tested punch-hole in WebGL, characters and
 * 3D objects in front of the TV naturally occlude the video just like a real TV in the 3D scene.
 */
export const YouTubeStagePlayer: React.FC = () => {
  const [stageState, setStageState] = useState<{
    videoId: string | null;
    domVideoUrl: string | null;
    quality: string;
    isPlaying: boolean;
    isScreenOn: boolean;
    isMuted: boolean;
  }>({
    videoId: null,
    domVideoUrl: null,
    quality: 'hd720',
    isPlaying: true,
    isScreenOn: true,
    isMuted: false,
  });

  const stagePlaneRef = useRef<HTMLDivElement>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const domVideoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const readyRef = useRef(false);
  const liveVolRef = useRef(80);
  const latestStateRef = useRef(stageState);
  latestStateRef.current = stageState;

  useEffect(() => {
    const onStageAudio = (e: Event) => {
      const detail = (e as CustomEvent<StageMediaState>).detail;
      if (!detail) return;
      setStageState({
        videoId: detail.sourceType === 'youtube' ? detail.youtubeVideoId : null,
        domVideoUrl: detail.sourceType === 'media' && detail.domVideoFallback ? detail.mediaUrl : null,
        quality: detail.youtubeQuality || 'hd720',
        isPlaying: detail.isPlaying,
        isScreenOn: detail.isScreenOn,
        isMuted: detail.isMuted,
      });
    };

    const onVolume = (e: Event) => {
      const vol = (e as CustomEvent<number>).detail;
      liveVolRef.current = vol;
      if (readyRef.current && playerRef.current) {
        playerRef.current.setVolume(vol);
      }
      if (domVideoRef.current) {
        domVideoRef.current.volume = Math.max(0, Math.min(1, vol / 100));
      }
    };

    const onProjection = (e: Event) => {
      const { visible, matrix3d } = (e as CustomEvent<ScreenProjectionData>).detail;
      const el = stagePlaneRef.current;
      if (!el) return;
      if (!visible || !matrix3d) {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
      } else {
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.transform = matrix3d;
      }
    };

    const onUserGesture = () => {
      const cur = latestStateRef.current;
      if (readyRef.current && playerRef.current && cur.videoId) {
        if (!cur.isMuted) {
          playerRef.current.unMute();
          playerRef.current.setVolume(cur.isPlaying && cur.isScreenOn ? liveVolRef.current : 0);
        }
        if (cur.isPlaying && cur.isScreenOn) {
          playerRef.current.playVideo();
        }
      }
      if (domVideoRef.current && cur.domVideoUrl) {
        const v = domVideoRef.current;
        v.muted = cur.isMuted;
        v.volume = Math.max(0, Math.min(1, liveVolRef.current / 100));
        if (cur.isPlaying && cur.isScreenOn && v.paused) {
          void v.play().catch(() => {});
        }
      }
    };

    window.addEventListener('cavannghe:stage-audio-changed', onStageAudio);
    window.addEventListener('cavannghe:youtube-volume', onVolume);
    window.addEventListener('cavannghe:screen-projection', onProjection);
    window.addEventListener('pointerdown', onUserGesture, { passive: true });
    window.addEventListener('keydown', onUserGesture, { passive: true });
    window.addEventListener('focus', onUserGesture, { passive: true });
    document.addEventListener('visibilitychange', onUserGesture);
    return () => {
      window.removeEventListener('cavannghe:stage-audio-changed', onStageAudio);
      window.removeEventListener('cavannghe:youtube-volume', onVolume);
      window.removeEventListener('cavannghe:screen-projection', onProjection);
      window.removeEventListener('pointerdown', onUserGesture);
      window.removeEventListener('keydown', onUserGesture);
      window.removeEventListener('focus', onUserGesture);
      document.removeEventListener('visibilitychange', onUserGesture);
    };
  }, []);

  useEffect(() => {
    const { videoId, quality } = stageState;
    if (!videoId) {
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      return;
    }

    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !playerHostRef.current || !window.YT?.Player) return;

      if (playerRef.current && readyRef.current) {
        playerRef.current.loadVideoById({ videoId, suggestedQuality: quality });
        return;
      }

      playerRef.current?.destroy();
      readyRef.current = false;

      const mountEl = document.createElement('div');
      playerHostRef.current.innerHTML = '';
      playerHostRef.current.appendChild(mountEl);

      playerRef.current = new window.YT.Player(mountEl, {
        width: 1280,
        height: 720,
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          loop: 1,
          playlist: videoId,
        },
        events: {
          onReady: (ev) => {
            if (cancelled) return;
            readyRef.current = true;
            const cur = latestStateRef.current;
            if (cur.quality && cur.quality !== 'default') {
              ev.target.setPlaybackQuality(cur.quality);
            }
            // Start muted so browser autoplay policy never blocks playback,
            // then unmute once PLAYING starts (or on user gesture).
            ev.target.mute();
            if (cur.isPlaying && cur.isScreenOn) {
              ev.target.playVideo();
            } else {
              ev.target.pauseVideo();
            }
          },
          onStateChange: (ev) => {
            if (cancelled) return;
            const cur = latestStateRef.current;
            // YT.PlayerState.PLAYING === 1, CUED === 5, UNSTARTED === -1
            if (ev.data === 1 && !cur.isMuted && cur.isPlaying && cur.isScreenOn) {
              ev.target.unMute();
              ev.target.setVolume(liveVolRef.current);
            } else if ((ev.data === 5 || ev.data === -1) && cur.isPlaying && cur.isScreenOn) {
              ev.target.mute();
              ev.target.playVideo();
            }
          },
          onError: (ev) => {
            if (cancelled) return;
            window.dispatchEvent(
              new CustomEvent<string>('cavannghe:stage-media-error', {
                detail: getYouTubeErrorMessage(ev.data),
              })
            );
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [stageState.videoId]);

  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    if (stageState.quality && stageState.quality !== 'default') {
      playerRef.current.setPlaybackQuality(stageState.quality);
    }
  }, [stageState.quality]);

  useEffect(() => {
    if (readyRef.current && playerRef.current) {
      if (stageState.isMuted) playerRef.current.mute();
      else playerRef.current.unMute();

      if (stageState.isPlaying && stageState.isScreenOn) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    }

    if (domVideoRef.current && stageState.domVideoUrl) {
      const v = domVideoRef.current;
      v.muted = stageState.isMuted;
      v.volume = Math.max(0, Math.min(1, liveVolRef.current / 100));
      if (stageState.isPlaying && stageState.isScreenOn) {
        void v.play().catch(() => {
          // Fallback to muted autoplay if browser blocks unmuted playback
          v.muted = true;
          void v.play().catch(() => {});
        });
      } else {
        v.pause();
      }
    }
  }, [stageState.domVideoUrl, stageState.isPlaying, stageState.isScreenOn, stageState.isMuted]);

  useEffect(() => {
    return () => {
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  if (!stageState.videoId && !stageState.domVideoUrl) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      <div
        ref={stagePlaneRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1280px',
          height: '720px',
          transformOrigin: '0 0',
          backgroundColor: '#050608',
          pointerEvents: 'none',
          visibility: 'hidden',
          opacity: 0,
          willChange: 'transform',
        }}
      >
        {stageState.videoId ? (
          <div ref={playerHostRef} className="w-full h-full pointer-events-none" />
        ) : (
          <video
            ref={domVideoRef}
            src={stageState.domVideoUrl ?? undefined}
            loop
            playsInline
            autoPlay
            muted={stageState.isMuted}
            onError={() => {
              window.dispatchEvent(
                new CustomEvent<string>('cavannghe:stage-media-error', {
                  detail:
                    'Không thể phát video từ link này. Vui lòng kiểm tra lại đường dẫn trực tiếp (.mp4/.webm) hoặc dùng link YouTube.',
                })
              );
            }}
            className="w-full h-full object-cover pointer-events-none"
          />
        )}
      </div>
    </div>
  );
};
