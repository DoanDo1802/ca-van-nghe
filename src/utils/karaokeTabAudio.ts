type TabCaptureDevices = MediaDevices & {
  setCaptureHandleConfig: (config: { handle: string; permittedOrigins: string[] }) => void;
};

type TabCaptureTrack = MediaStreamTrack & {
  getCaptureHandle?: () => { handle: string } | null;
};

export const KARAOKE_TAB_AUDIO_UNAVAILABLE =
  'Trình duyệt này không thể lấy tiếng YouTube để hát trong phòng. Bạn có thể chọn file nhạc bằng nút MP3.';

function getTabCaptureDevices(): TabCaptureDevices | null {
  const devices = navigator.mediaDevices as Partial<TabCaptureDevices> | undefined;
  if (
    typeof devices?.getDisplayMedia !== 'function' ||
    typeof devices.setCaptureHandleConfig !== 'function' ||
    typeof MediaStreamTrack === 'undefined' ||
    !('getCaptureHandle' in MediaStreamTrack.prototype)
  ) {
    return null;
  }
  return devices as TabCaptureDevices;
}

export function supportsKaraokeTabAudio(): boolean {
  return getTabCaptureDevices() !== null;
}

export async function captureKaraokeTabAudio(): Promise<{
  stream: MediaStream;
  isKaraokeTab: () => boolean;
}> {
  const devices = getTabCaptureDevices();
  if (!devices) {
    throw new Error(KARAOKE_TAB_AUDIO_UNAVAILABLE);
  }

  const handle = crypto.randomUUID();
  devices.setCaptureHandleConfig({ handle, permittedOrigins: [window.location.origin] });
  const stream = await devices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    systemAudio: 'exclude',
    surfaceSwitching: 'exclude',
  } as DisplayMediaStreamOptions);

  const video = stream.getVideoTracks()[0] as TabCaptureTrack | undefined;
  const isKaraokeTab = () => video?.getCaptureHandle?.()?.handle === handle;
  if (!isKaraokeTab() || !stream.getAudioTracks().some((track) => track.readyState === 'live')) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Chọn tab karaoke hiện tại và bật chia sẻ âm thanh, hoặc chọn file nhạc.');
  }
  return { stream, isKaraokeTab };
}
