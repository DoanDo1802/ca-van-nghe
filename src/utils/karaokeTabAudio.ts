type TabCaptureDevices = MediaDevices & {
  setCaptureHandleConfig?: (config: { handle: string; permittedOrigins: string[] }) => void;
};

type TabCaptureTrack = MediaStreamTrack & {
  getCaptureHandle?: () => { handle: string } | null;
};

export async function captureKaraokeTabAudio(): Promise<{
  stream: MediaStream;
  isKaraokeTab: () => boolean;
}> {
  const devices = navigator.mediaDevices as TabCaptureDevices | undefined;
  if (!devices?.getDisplayMedia || !devices.setCaptureHandleConfig) {
    throw new Error('Trình duyệt này chưa hỗ trợ thu tiếng tab karaoke. Hãy chọn file nhạc.');
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
