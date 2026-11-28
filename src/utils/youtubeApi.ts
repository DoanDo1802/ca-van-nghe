export interface YTPlayerInstance {
  loadVideoById: (opts: { videoId: string; suggestedQuality?: string }) => void;
  cueVideoById?: (opts: {
    videoId: string;
    startSeconds?: number;
    suggestedQuality?: string;
  }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted?: () => boolean;
  setVolume: (vol: number) => void;
  getVolume?: () => number;
  setPlaybackQuality: (quality: string) => void;
  getDuration?: () => number;
  getCurrentTime?: () => number;
  getPlayerState?: () => number;
  getIframe?: () => HTMLIFrameElement;
  getVideoData?: () => { isLive?: boolean; video_id?: string; title?: string };
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
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
          host?: string;
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

export const YOUTUBE_EMBED_HOSTS = [
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
] as const;

export function configureYouTubeIframe(iframe: HTMLIFrameElement | null | undefined): void {
  if (!iframe) return;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.setAttribute(
    'allow',
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen'
  );
  iframe.setAttribute('allowfullscreen', '');
}

export function getYouTubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'ID/Link video YouTube không hợp lệ.';
    case 5:
      return 'Trình duyệt gặp lỗi giải mã HTML5 khi phát video YouTube này.';
    case 100:
      return 'Video YouTube không tồn tại hoặc đang ở chế độ Riêng tư.';
    case 101:
    case 150:
      return 'Chủ sở hữu video YouTube đã tắt quyền nhúng phát trên web khác.';
    case 153:
      return 'Trình duyệt/mạng chặn thông tin Referrer của YouTube (lỗi 153). Hãy thử đổi máy chủ dự phòng hoặc tắt chặn theo dõi.';
    default:
      return `Không thể phát video YouTube này (mã lỗi ${code}).`;
  }
}

let ytApiPromise: Promise<void> | null = null;

/**
 * Loads the official YouTube IFrame Player API script once and resolves when `window.YT.Player` is ready.
 * Resets on script error or timeout so subsequent attempts can retry cleanly.
 */
export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let pollTimer: number | null = null;
    let timeoutTimer: number | null = null;
    let scriptEl: HTMLScriptElement | null = null;

    const cleanup = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      if (timeoutTimer !== null) {
        window.clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    };

    const finishOk = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const finishErr = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      ytApiPromise = null;
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
      reject(new Error(reason));
    };

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT?.Player) {
        finishOk();
      }
    };

    timeoutTimer = window.setTimeout(() => {
      if (window.YT?.Player) {
        finishOk();
      } else {
        finishErr('YouTube IFrame API load timed out');
      }
    }, 10_000);

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="youtube.com/iframe_api"]'
    );
    if (existingScript) {
      scriptEl = existingScript;
      pollTimer = window.setInterval(() => {
        if (window.YT?.Player) {
          finishOk();
        }
      }, 60);
      return;
    }

    const tag = document.createElement('script');
    scriptEl = tag;
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => {
      finishErr('Failed to load YouTube IFrame API script');
    };
    document.head.appendChild(tag);
  });

  return ytApiPromise;
}
