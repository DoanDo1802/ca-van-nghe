import React, { useEffect, useRef, useState } from 'react';
import type { ScreenProjectionData, StageMediaState } from '../engine/runtime/StageAudioManager';
import { DebugLogger } from '../utils/debugLogger';
import { loadYouTubeIframeApi, type YTPlayerInstance } from '../utils/youtubeApi';

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
    currentTime?: number;
    timeUpdatedAt?: number;
  }>({
    videoId: null,
    domVideoUrl: null,
    quality: 'hd720',
    isPlaying: true,
    isScreenOn: true,
    isMuted: false,
  });

  const [interactiveMode, setInteractiveMode] = useState(false);
  const [fallbackMiniMode, setFallbackMiniMode] = useState(false);
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
        currentTime: detail.currentTime,
        timeUpdatedAt: detail.timeUpdatedAt,
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
      const { visible, matrix3d, tooSmall } = (e as CustomEvent<ScreenProjectionData>).detail;
      setFallbackMiniMode(Boolean(!visible || !matrix3d || tooSmall));
      const el = stagePlaneRef.current;
      if (!el) return;
      if (!visible || !matrix3d || tooSmall) {
        el.style.transform = 'none';
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

    const onSyncLive = () => {
      const cur = latestStateRef.current;
      if (readyRef.current && playerRef.current && cur.videoId) {
        const videoData = playerRef.current.getVideoData?.();
        // Skip seeking to duration if YouTube explicitly reports this is not a live stream (VOD)
        if (!videoData || videoData.isLive !== false) {
          const duration = playerRef.current.getDuration?.() ?? 0;
          if (Number.isFinite(duration) && duration > 0 && playerRef.current.seekTo) {
            playerRef.current.seekTo(duration, true);
          } else {
            playerRef.current.loadVideoById({ videoId: cur.videoId, suggestedQuality: cur.quality });
          }
          if (cur.isPlaying && cur.isScreenOn) {
            playerRef.current.playVideo();
          }
        }
      }
      if (domVideoRef.current && cur.domVideoUrl) {
        const v = domVideoRef.current;
        if (!Number.isFinite(v.duration) && v.seekable && v.seekable.length > 0) {
          const liveEnd = v.seekable.end(v.seekable.length - 1);
          if (Number.isFinite(liveEnd) && liveEnd > 0) {
            v.currentTime = liveEnd;
          }
        }
        if (cur.isPlaying && cur.isScreenOn && v.paused) {
          void v.play().catch(() => {});
        }
      }
    };

    const onStageSeekTime = (e: Event) => {
      const detail = (e as CustomEvent<{ targetSec: number; isPlaying: boolean }>).detail;
      if (!detail || !Number.isFinite(detail.targetSec)) return;
      const cur = latestStateRef.current;

      if (readyRef.current && playerRef.current && cur.videoId) {
        const videoData = playerRef.current.getVideoData?.();
        if (!videoData?.isLive && playerRef.current.seekTo) {
          const ytNow = playerRef.current.getCurrentTime?.() ?? 0;
          if (!detail.isPlaying || Math.abs(ytNow - detail.targetSec) > 1.5) {
            playerRef.current.seekTo(detail.targetSec, true);
          }
          if (detail.isPlaying && cur.isScreenOn) {
            playerRef.current.playVideo();
          } else {
            playerRef.current.pauseVideo();
          }
        }
      }

      if (domVideoRef.current && cur.domVideoUrl) {
        const v = domVideoRef.current;
        if (Number.isFinite(v.duration) && v.duration > 1) {
          if (!detail.isPlaying || Math.abs(v.currentTime - detail.targetSec) > 1.5) {
            v.currentTime = Math.min(v.duration - 0.5, Math.max(0, detail.targetSec));
          }
        }
      }
    };

    window.addEventListener('cavannghe:stage-audio-changed', onStageAudio);
    window.addEventListener('cavannghe:youtube-volume', onVolume);
    window.addEventListener('cavannghe:screen-projection', onProjection);
    window.addEventListener('cavannghe:stage-sync-live', onSyncLive);
    window.addEventListener('cavannghe:stage-seek-time', onStageSeekTime);
    window.addEventListener('pointerdown', onUserGesture, { passive: true });
    window.addEventListener('keydown', onUserGesture, { passive: true });
    window.addEventListener('focus', onUserGesture, { passive: true });
    document.addEventListener('visibilitychange', onUserGesture);
    return () => {
      window.removeEventListener('cavannghe:stage-audio-changed', onStageAudio);
      window.removeEventListener('cavannghe:youtube-volume', onVolume);
      window.removeEventListener('cavannghe:screen-projection', onProjection);
      window.removeEventListener('cavannghe:stage-sync-live', onSyncLive);
      window.removeEventListener('cavannghe:stage-seek-time', onStageSeekTime);
      window.removeEventListener('pointerdown', onUserGesture);
      window.removeEventListener('keydown', onUserGesture);
      window.removeEventListener('focus', onUserGesture);
      document.removeEventListener('visibilitychange', onUserGesture);
    };
  }, []);

  useEffect(() => {
    if (!stageState.videoId) return;
    const timer = window.setInterval(() => {
      if (!readyRef.current || !playerRef.current) return;
      const currentTime = playerRef.current.getCurrentTime?.();
      const isLive = Boolean(playerRef.current.getVideoData?.()?.isLive);
      if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
        window.dispatchEvent(
          new CustomEvent('cavannghe:youtube-time-update', {
            detail: { currentTime, isLive },
          })
        );
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [stageState.videoId]);

  useEffect(() => {
    const { videoId, quality } = stageState;
    if (!videoId) {
      readyRef.current = false;
      setInteractiveMode(false);
      playerRef.current?.destroy();
      playerRef.current = null;
      return;
    }

    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !playerHostRef.current || !window.YT?.Player) return;

      if (playerRef.current && readyRef.current) {
        const cur = latestStateRef.current;
        const startSec =
          typeof cur.currentTime === 'number' && cur.currentTime > 1
            ? cur.currentTime +
              (cur.isPlaying && cur.timeUpdatedAt
                ? Math.max(0, (Date.now() - cur.timeUpdatedAt) / 1000)
                : 0)
            : 0;
        if (cur.isPlaying && cur.isScreenOn) {
          playerRef.current.loadVideoById({ videoId, suggestedQuality: quality });
          if (startSec > 1 && playerRef.current.seekTo) {
            playerRef.current.seekTo(startSec, true);
          }
        } else if (playerRef.current.cueVideoById) {
          playerRef.current.cueVideoById({ videoId, startSeconds: startSec, suggestedQuality: quality });
        } else {
          playerRef.current.loadVideoById({ videoId, suggestedQuality: quality });
          playerRef.current.pauseVideo();
        }
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
          controls: 1,
          rel: 0,
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
            const videoData = ev.target.getVideoData?.();
            if (
              !videoData?.isLive &&
              typeof cur.currentTime === 'number' &&
              cur.currentTime > 1 &&
              ev.target.seekTo
            ) {
              const elapsed =
                cur.isPlaying && cur.timeUpdatedAt
                  ? Math.max(0, (Date.now() - cur.timeUpdatedAt) / 1000)
                  : 0;
              ev.target.seekTo(cur.currentTime + elapsed, true);
            }
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
            const errMsg = getYouTubeErrorMessage(ev.data);
            DebugLogger.error('YouTubeStage', `YouTube player error (code ${ev.data}): ${errMsg}`);
            window.dispatchEvent(
              new CustomEvent<string>('cavannghe:stage-media-error', {
                detail: errMsg,
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

  const isForegroundInteractive = Boolean(stageState.videoId && (interactiveMode || fallbackMiniMode));
  const useMiniDock = Boolean(stageState.videoId && fallbackMiniMode && !interactiveMode);

  return (
    <>
      <div
        className={`fixed inset-0 overflow-hidden ${
          isForegroundInteractive ? 'z-[84] pointer-events-none' : 'z-0 pointer-events-none'
        }`}
      >
        <div
          ref={stagePlaneRef}
          style={
            interactiveMode && stageState.videoId
              ? {
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  width: 'min(854px, calc(100vw - 2rem))',
                  height: 'min(480px, calc((100vw - 2rem) * 9 / 16))',
                  minWidth: '356px',
                  minHeight: '200px',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: '#050608',
                  pointerEvents: 'auto',
                  visibility: 'visible',
                  opacity: 1,
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
                }
              : useMiniDock
                ? {
                    position: 'fixed',
                    bottom: '12px',
                    left: '12px',
                    width: '356px',
                    height: '200px',
                    maxWidth: 'calc(100vw - 1.5rem)',
                    transform: 'none',
                    backgroundColor: '#050608',
                    pointerEvents: 'auto',
                    visibility: 'visible',
                    opacity: 1,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.15)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.65)',
                  }
                : {
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
                  }
          }
        >
          {stageState.videoId ? (
            <div
              ref={playerHostRef}
              className={`w-full h-full ${isForegroundInteractive ? 'pointer-events-auto' : 'pointer-events-none'}`}
            />
          ) : (
            <video
              ref={domVideoRef}
              src={stageState.domVideoUrl ?? undefined}
              loop
              playsInline
              autoPlay
              muted={stageState.isMuted}
              onError={() => {
                const msg =
                  'Không thể phát video từ link này. Vui lòng kiểm tra lại đường dẫn trực tiếp (.mp4/.webm) hoặc dùng link YouTube.';
                DebugLogger.error('YouTubeStage', `DOM video fallback playback error for URL: ${stageState.domVideoUrl}`);
                window.dispatchEvent(
                  new CustomEvent<string>('cavannghe:stage-media-error', {
                    detail: msg,
                  })
                );
              }}
              className="w-full h-full object-cover pointer-events-none"
            />
          )}
        </div>
      </div>

      {stageState.videoId && (
        <button
          type="button"
          onClick={() => setInteractiveMode((v) => !v)}
          className="fixed bottom-3 right-3 z-[86] pointer-events-auto px-3 py-1.5 rounded-full bg-black/80 hover:bg-black text-xs text-white border border-white/20 shadow-lg backdrop-blur-md transition"
          title="Chuyển giữa màn hình 3D và chế độ tương tác trực tiếp YouTube"
        >
          {interactiveMode ? 'Thu về màn hình 3D' : 'Tương tác YouTube'}
        </button>
      )}
    </>
  );
};
