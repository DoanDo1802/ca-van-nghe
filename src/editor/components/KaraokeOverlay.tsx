import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Circle,
  Download,
  GripHorizontal,
  Headphones,
  ListMusic,
  Loader2,
  LogOut,
  Maximize2,
  Menu,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
import { KARAOKE_SONGS, karaokeAudio, type KaraokeSong } from '../../utils/karaokeAudio';
import {
  AUTOTUNE_PRESETS,
  MUSICAL_KEYS,
  SCALE_DEFINITIONS,
  type AutoTuneConfig,
  type AutoTuneTelemetry,
  type MusicalKey,
  type ScaleType,
} from '../../utils/rapAutoTune';
import { captureKaraokeTabAudio } from '../../utils/karaokeTabAudio';
import { karaokeRecorder } from '../../utils/karaokeRecorder';
import { MultiplayerManager } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { DebugLogger } from '../../utils/debugLogger';
import { KaraokeLocalVideo } from './KaraokeLocalVideo';

interface KaraokeOverlayProps {
  isOpen: boolean;
  onExit: () => void;
}

type CategoryFilter = 'Tất cả' | 'Acoustic' | 'Trữ tình' | 'Sôi động';

function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

export const KaraokeOverlay: React.FC<KaraokeOverlayProps> = ({ isOpen, onExit }) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'queue'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('Tất cả');

  const [ytResults, setYtResults] = useState<KaraokeSong[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [downloadedVideo, setDownloadedVideo] = useState<HTMLVideoElement | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [activeSong, setActiveSong] = useState<KaraokeSong | null>(null);
  const [queue, setQueue] = useState<KaraokeSong[]>([]);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [isPlayerCompact, setIsPlayerCompact] = useState(true);
  const [playerWidth, setPlayerWidth] = useState<number | null>(null);
  const [playerPos, setPlayerPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingPlayer, setIsDraggingPlayer] = useState(false);
  const [isResizingPlayer, setIsResizingPlayer] = useState(false);

  const [isFilePlaying, setIsFilePlaying] = useState(false);
  const isFileSessionActiveRef = useRef(false);
  const micChangeIdRef = useRef(0);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isRecordingsOpen, setIsRecordingsOpen] = useState(false);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const recState = useSyncExternalStore(karaokeRecorder.subscribe, karaokeRecorder.getSnapshot);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [localMonitor, setLocalMonitor] = useState(() => karaokeAudio.isLocalMonitorEnabled());
  const [micPercent, setMicPercent] = useState(40);
  const [echoAmount, setEchoAmount] = useState(0.55);
  const [bassDb, setBassDb] = useState(0);
  const [trebleDb, setTrebleDb] = useState(0);
  const [activePreset, setActivePreset] = useState<'acoustic' | 'lounge' | 'stage' | 'rapper' | null>('lounge');
  const [autoTune, setAutoTune] = useState<AutoTuneConfig>(() => karaokeAudio.getAutoTuneConfig());
  const [pitchTelemetry, setPitchTelemetry] = useState<AutoTuneTelemetry | null>(null);
  const [audienceMusicVolume] = useState(60);
  const [style, setStyle] = useState<'chill' | 'dance'>('chill');
  const [micLevel, setMicLevel] = useState(0);

  const micPercentToGain = (pct: number) => {
    const clamped = Math.max(0, Math.min(150, pct));
    if (clamped <= 0) return 0;
    return Math.pow(clamped / 100, 1.8);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ytIframeRef = useRef<HTMLIFrameElement>(null);
  const lastYtPlayingRef = useRef<boolean | null>(null);
  const ytCurrentTimeRef = useRef<number>(0);
  const lastTimeSyncSentRef = useRef<number>(0);
  const lastVolumeSyncSentRef = useRef<number>(0);
  const audienceMusicVolumeRef = useRef<number>(audienceMusicVolume);
  audienceMusicVolumeRef.current = audienceMusicVolume;
  const trailingVolumeTimerRef = useRef<number | null>(null);
  const presenceVolumeTimerRef = useRef<number | null>(null);
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const clampPlayerWidth = (w: number) => {
    const maxW = Math.max(220, Math.min(720, window.innerWidth - 16));
    return Math.max(215, Math.min(maxW, Math.round(w)));
  };

  const clampPlayerPos = (x: number, y: number) => {
    const boxW = playerBoxRef.current?.offsetWidth ?? 240;
    const boxH = playerBoxRef.current?.offsetHeight ?? 165;
    const maxX = Math.max(8, window.innerWidth - boxW - 8);
    const maxY = Math.max(8, window.innerHeight - boxH - 8);
    return {
      x: Math.max(8, Math.min(maxX, x)),
      y: Math.max(8, Math.min(maxY, y)),
    };
  };

  useEffect(() => {
    const onResize = () => {
      setPlayerWidth((prev) => (prev !== null ? clampPlayerWidth(prev) : null));
      setPlayerPos((prev) => (prev ? clampPlayerPos(prev.x, prev.y) : null));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPlayerPos((prev) => (prev ? clampPlayerPos(prev.x, prev.y) : null));
  }, [isOpen, isPlayerCompact, playerWidth, youtubeVideoId, downloadedVideo]);

  useEffect(() => {
    if (!isOpen) return;
    const onSubscribed = () => {
      if (youtubeVideoId) {
        MultiplayerManager.getInstance().broadcastKaraokeState({
          active: true,
          youtubeVideoId,
          title: activeSong?.title ?? 'YouTube Karaoke',
          isPlaying: lastYtPlayingRef.current === true,
          currentTime: ytCurrentTimeRef.current,
          musicVolume: audienceMusicVolume,
        });
      } else if (customFileName && isFileSessionActiveRef.current) {
        MultiplayerManager.getInstance().broadcastKaraokeState({
          active: true,
          youtubeVideoId: null,
          title: customFileName,
          isPlaying: isFilePlaying,
          currentTime: karaokeAudio.getCurrentTime(),
          musicVolume: audienceMusicVolume,
        });
      }
    };
    window.addEventListener('cavannghe:channel-subscribed', onSubscribed);
    return () => window.removeEventListener('cavannghe:channel-subscribed', onSubscribed);
  }, [isOpen, youtubeVideoId, activeSong?.title, customFileName, isFilePlaying, audienceMusicVolume]);

  const handlePlayerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const box = playerBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    setIsDraggingPlayer(true);
    setPlayerPos(clampPlayerPos(rect.left, rect.top));
  };

  const handlePlayerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setPlayerPos(clampPlayerPos(e.clientX - drag.offsetX, e.clientY - drag.offsetY));
  };

  const handlePlayerPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    setIsDraggingPlayer(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const box = playerBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    resizeStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: rect.width,
    };
    setIsResizingPlayer(true);
    setPlayerWidth(clampPlayerWidth(rect.width));
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rs = resizeStateRef.current;
    if (!rs || rs.pointerId !== e.pointerId) return;
    const nextW = clampPlayerWidth(rs.startWidth + (e.clientX - rs.startX));
    setPlayerWidth(nextW);
    setPlayerPos((prev) => (prev ? clampPlayerPos(prev.x, prev.y) : null));
  };

  const handleResizePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const rs = resizeStateRef.current;
    if (!rs || rs.pointerId !== e.pointerId) return;
    resizeStateRef.current = null;
    setIsResizingPlayer(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const scheduleAudienceMusicVolumeSync = (vol: number) => {
    audienceMusicVolumeRef.current = vol;
    const now = Date.now();
    const elapsed = now - lastVolumeSyncSentRef.current;

    if (trailingVolumeTimerRef.current !== null) {
      window.clearTimeout(trailingVolumeTimerRef.current);
      trailingVolumeTimerRef.current = null;
    }

    if (elapsed >= 60) {
      lastVolumeSyncSentRef.current = now;
      MultiplayerManager.getInstance().broadcastKaraokeVolume(vol, { updatePresence: false });
    } else {
      trailingVolumeTimerRef.current = window.setTimeout(() => {
        trailingVolumeTimerRef.current = null;
        lastVolumeSyncSentRef.current = Date.now();
        MultiplayerManager.getInstance().broadcastKaraokeVolume(audienceMusicVolumeRef.current, {
          updatePresence: false,
        });
      }, 60 - elapsed);
    }

    if (presenceVolumeTimerRef.current !== null) {
      window.clearTimeout(presenceVolumeTimerRef.current);
    }
    presenceVolumeTimerRef.current = window.setTimeout(() => {
      presenceVolumeTimerRef.current = null;
      MultiplayerManager.getInstance().broadcastKaraokeVolume(audienceMusicVolumeRef.current, {
        updatePresence: true,
      });
    }, 260);
  };
  void scheduleAudienceMusicVolumeSync;

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const tabCaptureRef = useRef<{ stream: MediaStream; cleanup: () => void } | null>(null);
  const captureRequestRef = useRef(0);
  const capturePendingRef = useRef(false);
  const downloadRef = useRef<AbortController | null>(null);
  const recordRequestRef = useRef(0);
  const useLocalVideoDownload = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

  const cancelVideoDownload = () => {
    downloadRef.current?.abort();
    downloadRef.current = null;
    setIsDownloadingVideo(false);
  };

  const stopTabCapture = () => {
    captureRequestRef.current++;
    const capture = tabCaptureRef.current;
    if (!capture) return;
    tabCaptureRef.current = null;
    capture.cleanup();
    karaokeAudio.setBroadcastTabAudio(null);
    capture.stream.getTracks().forEach((track) => track.stop());
  };

  const enableSingerMic = async (): Promise<boolean> => {
    const changeId = ++micChangeIdRef.current;
    setMicError(null);
    const ok = await karaokeAudio.enableMic({
      deviceId: selectedDeviceId || undefined,
      echoCancellation,
      echoAmount,
      micSensitivity: micPercentToGain(micPercent),
      bassDb,
      trebleDb,
    });
    if (changeId !== micChangeIdRef.current) return false;
    if (!isOpenRef.current) {
      if (ok) {
        karaokeAudio.disableMic();
        KaraokeVoiceManager.getInstance().stopBroadcasting();
      }
      return false;
    }
    if (ok) {
      setMicEnabled(true);
      const stream = karaokeAudio.getBroadcastStream();
      if (stream) {
        KaraokeVoiceManager.getInstance().startBroadcasting(stream);
      }
      const list = await karaokeAudio.listInputDevices();
      if (isOpenRef.current && changeId === micChangeIdRef.current) {
        setInputDevices(list);
        if (!selectedDeviceId && list[0]?.deviceId) {
          setSelectedDeviceId(list[0].deviceId);
        }
      }
      return true;
    }
    DebugLogger.warn('KaraokeOverlay', 'Microphone permission denied or unavailable');
    setMicError('Chưa cấp quyền Micro trên trình duyệt');
    return false;
  };

  useEffect(() => {
    if (!isOpen) {
      stopTabCapture();
      cancelVideoDownload();
      recordRequestRef.current++;
      karaokeAudio.clearCustomFile();
      setCustomFileName(null);
      setDownloadedVideo(null);
      micChangeIdRef.current++;
      isFileSessionActiveRef.current = false;
      if (karaokeRecorder.getSnapshot().isRecording) {
        void karaokeRecorder.stop();
      }
      karaokeAudio.stop();
      karaokeAudio.disableMic();
      const resetAt = karaokeAudio.setAutoTuneConfig({ enabled: false });
      setAutoTune(resetAt);
      setPitchTelemetry(null);
      setActivePreset('lounge');
      setMicEnabled(false);
      setMicError(null);
      setIsMenuOpen(false);
      setIsMixerOpen(false);
      setIsRecordingsOpen(false);
      setIsFilePlaying(false);
      setYoutubeVideoId(null);
      setActiveSong(null);
      setSearchError(null);
      window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
      KaraokeVoiceManager.getInstance().stopBroadcasting();
      MultiplayerManager.getInstance().broadcastKaraokeState({
        active: false,
        youtubeVideoId: null,
        title: '',
        isPlaying: false,
      });
      return;
    }
    setIsPickerOpen(false);
    void enableSingerMic();
  }, [isOpen]);

  useEffect(() => {
    if (!recState.isRecording || !recState.recordingStartedAt) {
      setRecordingElapsedSec(0);
      return;
    }
    const updateElapsed = () => {
      setRecordingElapsedSec(
        Math.max(0, Math.floor((Date.now() - (recState.recordingStartedAt ?? Date.now())) / 1000))
      );
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 500);
    return () => window.clearInterval(timer);
  }, [recState.isRecording, recState.recordingStartedAt]);

  const handleToggleRecord = async () => {
    if (recState.isProcessing) return;
    const request = ++recordRequestRef.current;
    if (recState.isRecording) {
      await karaokeRecorder.stop();
      setIsMenuOpen(false);
      setIsMixerOpen(false);
      setIsRecordingsOpen(true);
      return;
    }
    if (!karaokeRecorder.isSupported()) {
      setMicError('Trình duyệt không hỗ trợ ghi âm MediaRecorder');
      return;
    }
    if (!micEnabled) {
      const ok = await enableSingerMic();
      if (!ok) return;
    }

    if (!isOpenRef.current || request !== recordRequestRef.current) return;
    let tabAudioStream: MediaStream | null = null;
    if (youtubeVideoId && !tabCaptureRef.current && navigator.mediaDevices?.getDisplayMedia) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            suppressLocalAudioPlayback: false,
          } as MediaTrackConstraints,
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          systemAudio: 'include',
        } as DisplayMediaStreamOptions);
        if (!isOpenRef.current || request !== recordRequestRef.current) {
          displayStream.getTracks().forEach((track) => track.stop());
          return;
        }
        displayStream.getVideoTracks().forEach((t) => t.stop());
        if (displayStream.getAudioTracks().length > 0) {
          tabAudioStream = displayStream;
        } else {
          displayStream.getTracks().forEach((t) => t.stop());
          setMicError('Chưa bật "Chia sẻ âm thanh tab" — đang ghi âm chỉ có giọng hát.');
        }
      } catch {
        if (!isOpenRef.current || request !== recordRequestRef.current) return;
        setMicError('Chưa chia sẻ âm thanh tab — đang ghi âm chỉ có giọng hát.');
      }
    }

    const recSession = karaokeAudio.createRecordingStream(tabAudioStream);
    if (!recSession) {
      tabAudioStream?.getTracks().forEach((t) => t.stop());
      setMicError('Chưa có luồng âm thanh Micro để ghi âm');
      return;
    }
    const singerName = MultiplayerManager.getInstance().getRoomStatus().localPlayerName || 'Ca sĩ';
    const songTitle =
      activeSong?.title ||
      customFileName ||
      (youtubeVideoId ? `YouTube (${youtubeVideoId})` : 'Bản thu Karaoke');
    const started = await karaokeRecorder.start(
      recSession,
      { title: songTitle, singerName },
      recSession.cleanup
    );
    if (!started) {
      recSession.cleanup();
      setMicError('Không thể bắt đầu ghi âm trên trình duyệt này');
      return;
    }
    if (!isOpenRef.current || request !== recordRequestRef.current) {
      void karaokeRecorder.stop();
    }
  };

  const formatDurationSec = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!isOpen || !micEnabled) {
      setMicLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setMicLevel(karaokeAudio.getEnergy().mic);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, micEnabled]);

  useEffect(() => {
    if (!isOpen) return;
    return karaokeAudio.subscribeAutoTuneConfig((cfg) => {
      setAutoTune(cfg);
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !micEnabled || !autoTune.enabled) {
      setPitchTelemetry(null);
      return;
    }
    return karaokeAudio.subscribeAutoTuneTelemetry((t) => {
      setPitchTelemetry(t);
    });
  }, [isOpen, micEnabled, autoTune.enabled]);

  useEffect(() => {
    return () => {
      if (trailingVolumeTimerRef.current !== null) {
        window.clearTimeout(trailingVolumeTimerRef.current);
      }
      if (presenceVolumeTimerRef.current !== null) {
        window.clearTimeout(presenceVolumeTimerRef.current);
      }
      stopTabCapture();
      downloadRef.current?.abort();
      recordRequestRef.current++;
      if (karaokeRecorder.getSnapshot().isRecording) {
        void karaokeRecorder.stop();
      }
      karaokeAudio.clearCustomFile();
      KaraokeVoiceManager.getInstance().stopBroadcasting();
      MultiplayerManager.getInstance().broadcastKaraokeState({
        active: false,
        youtubeVideoId: null,
        title: '',
        isPlaying: false,
      });
      karaokeAudio.disableMic();
      karaokeAudio.stop();
      window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !youtubeVideoId) {
      lastYtPlayingRef.current = null;
      ytCurrentTimeRef.current = 0;
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (
        !ytIframeRef.current || e.source !== ytIframeRef.current.contentWindow ||
        e.origin !== 'https://www.youtube.com'
      ) {
        return;
      }
      if (typeof e.data !== 'string') return;
      let parsed: {
        event?: string;
        info?: number | { playerState?: number; currentTime?: number };
      } | null = null;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!parsed) return;
      if (
        parsed.event === 'infoDelivery' &&
        typeof parsed.info === 'object' &&
        parsed.info !== null &&
        typeof parsed.info.currentTime === 'number'
      ) {
        const prevTime = ytCurrentTimeRef.current;
        const nextTime = parsed.info.currentTime;
        const jumped = Math.abs(nextTime - prevTime) > 1.8;
        ytCurrentTimeRef.current = nextTime;
        const now = Date.now();
        if (
          lastYtPlayingRef.current === true &&
          (parsed.info.playerState === undefined || parsed.info.playerState === 1) &&
          (jumped || now - lastTimeSyncSentRef.current >= 3000)
        ) {
          lastTimeSyncSentRef.current = now;
          MultiplayerManager.getInstance().broadcastKaraokeState(
            {
              active: true,
              youtubeVideoId,
              title: activeSong?.title ?? 'YouTube Karaoke',
              isPlaying: true,
              currentTime: nextTime,
              musicVolume: audienceMusicVolumeRef.current,
            },
            { updatePresence: false }
          );
        }
      }
      let playerState: number | undefined;
      if (
        parsed.event === 'infoDelivery' &&
        typeof parsed.info === 'object' &&
        parsed.info !== null &&
        typeof parsed.info.playerState === 'number'
      ) {
        playerState = parsed.info.playerState;
      } else if (parsed.event === 'onStateChange' && typeof parsed.info === 'number') {
        playerState = parsed.info;
      }
      if (playerState === undefined) return;
      const nextPlaying = playerState === 1;
      if (![0, 1, 2].includes(playerState) || lastYtPlayingRef.current === nextPlaying) return;
      lastYtPlayingRef.current = nextPlaying;
      lastTimeSyncSentRef.current = Date.now();
      window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: nextPlaying }));
      MultiplayerManager.getInstance().broadcastKaraokeState({
        active: true,
        youtubeVideoId,
        title: activeSong?.title ?? 'YouTube Karaoke',
        isPlaying: nextPlaying,
        currentTime: ytCurrentTimeRef.current,
        musicVolume: audienceMusicVolumeRef.current,
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isOpen, youtubeVideoId, activeSong?.title]);

  const displayedSongs = useMemo(() => {
    if (ytResults) return ytResults;
    const q = searchQuery.trim().toLowerCase();
    return KARAOKE_SONGS.filter((s) => {
      const catOk = category === 'Tất cả' || s.category === category;
      if (!catOk) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.channel.toLowerCase().includes(q)
      );
    });
  }, [ytResults, searchQuery, category]);

  if (!isOpen) return null;

  const isSharingTabAudio = tabCaptureRef.current !== null;
  const needsTabAudioPermission = !useLocalVideoDownload && MultiplayerManager.getInstance().getRoomStatus().joiningOrInRoom && !isSharingTabAudio;
  const pastedYtId = extractYoutubeId(searchQuery);

  const handleSearchYouTube = async (overrideQuery?: string) => {
    const raw = (overrideQuery ?? searchQuery).trim();
    const directId = extractYoutubeId(raw);
    if (directId) {
      playYouTubeSong({
        id: directId,
        youtubeId: directId,
        title: `YouTube Karaoke (${directId})`,
        artist: 'YouTube',
        channel: 'YouTube',
        views: '',
        durationLabel: 'HD',
        category: 'YouTube',
        thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
      });
      return;
    }

    if (!raw) {
      setYtResults(null);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setActiveTab('search');
    try {
      const res = await fetch(`/api/yt-search?q=${encodeURIComponent(raw)}`);
      if (!res.ok) throw new Error('Search request failed');
      const data = (await res.json()) as { items?: KaraokeSong[] };
      if (Array.isArray(data.items) && data.items.length > 0) {
        setYtResults(data.items);
      } else {
        setYtResults([]);
      }
    } catch (err) {
      DebugLogger.warn('KaraokeOverlay', `YouTube search failed for "${raw}", falling back to preset songs`, err);
      setSearchError('Không tìm được trực tiếp trên YouTube lúc này — đang lọc danh sách có sẵn.');
      setYtResults(null);
    } finally {
      setIsSearching(false);
    }
  };

  const stopYouTubeSong = () => {
    stopTabCapture();
    ytIframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
      'https://www.youtube.com',
    );
    setYoutubeVideoId(null);
    setActiveSong(null);
    window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
    MultiplayerManager.getInstance().broadcastKaraokeState({
      active: false,
      youtubeVideoId: null,
      title: '',
      isPlaying: false,
    });
  };

  const playYouTubeSong = async (song: KaraokeSong): Promise<boolean> => {
    const mp = MultiplayerManager.getInstance();
    if (useLocalVideoDownload) {
      if (downloadRef.current) return false;
      const controller = new AbortController();
      downloadRef.current = controller;
      setIsDownloadingVideo(true);
      setSearchError(null);
      try {
        const response = await fetch(`/api/dev/karaoke-video?id=${encodeURIComponent(song.youtubeId)}`, {
          method: 'POST',
          signal: controller.signal,
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error ?? 'Không tải được video.');
        }
        const blob = await response.blob();
        if (!isOpenRef.current || controller.signal.aborted) return false;
        const video = document.createElement('video');
        video.playsInline = true;
        video.className = 'block w-full aspect-video bg-black';
        playLocalFile(new File([blob], song.title, { type: 'video/mp4' }), video);
        return true;
      } catch (error) {
        if (!controller.signal.aborted && isOpenRef.current) {
          setSearchError(error instanceof Error ? error.message : 'Không tải được video.');
          setIsPickerOpen(true);
        }
        return false;
      } finally {
        if (downloadRef.current === controller) {
          downloadRef.current = null;
          setIsDownloadingVideo(false);
        }
      }
    }
    if (mp.getRoomStatus().joiningOrInRoom && !tabCaptureRef.current) {
      if (capturePendingRef.current) return false;
      capturePendingRef.current = true;
      const request = ++captureRequestRef.current;
      let stream: MediaStream | undefined;
      try {
        const capture = await captureKaraokeTabAudio();
        stream = capture.stream;
        if (!isOpenRef.current || request !== captureRequestRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }

        // A previously playing file would otherwise enter the live mix on both inputs.
        karaokeAudio.stop();
        karaokeAudio.setBroadcastTabAudio(stream);
        karaokeAudio.setBackingMusicVolume(audienceMusicVolumeRef.current / 100);
        const broadcastStream = karaokeAudio.getBroadcastStream();
        if (broadcastStream) KaraokeVoiceManager.getInstance().startBroadcasting(broadcastStream);

        const onEnded = () => {
          if (tabCaptureRef.current?.stream !== stream) return;
          stopYouTubeSong();
          setIsPickerOpen(true);
          setSearchError('Đã ngừng chia sẻ tiếng tab. Chọn lại bài YouTube hoặc chọn file nhạc.');
        };
        const onHandleChange = () => {
          if (!capture.isKaraokeTab()) onEnded();
        };
        const tracks = stream.getTracks();
        const videoTrack = stream.getVideoTracks()[0];
        for (const track of tracks) track.addEventListener('ended', onEnded);
        videoTrack?.addEventListener('capturehandlechange', onHandleChange);
        tabCaptureRef.current = {
          stream,
          cleanup: () => {
            for (const track of tracks) track.removeEventListener('ended', onEnded);
            videoTrack?.removeEventListener('capturehandlechange', onHandleChange);
          },
        };
      } catch (error) {
        stream?.getTracks().forEach((track) => track.stop());
        if (isOpenRef.current && request === captureRequestRef.current) {
          karaokeAudio.setBroadcastTabAudio(null);
          setIsPickerOpen(true);
          setSearchError(
            error instanceof Error && !(error instanceof DOMException)
              ? error.message
              : 'Chưa chia sẻ tiếng tab. Chọn lại bài YouTube hoặc chọn file nhạc.',
          );
        }
        return false;
      } finally {
        capturePendingRef.current = false;
      }
    }

    setSearchError(null);
    DebugLogger.log('KaraokeOverlay', `Playing YouTube karaoke: "${song.title}" (${song.youtubeId})`);
    isFileSessionActiveRef.current = false;
    karaokeAudio.stop();
    karaokeAudio.clearCustomFile();
    setCustomFileName(null);
    setDownloadedVideo(null);
    setIsFilePlaying(false);
    setActiveSong(song);
    setYoutubeVideoId(song.youtubeId);
    ytCurrentTimeRef.current = 0;
    lastTimeSyncSentRef.current = Date.now();
    lastYtPlayingRef.current = null;
    setIsPickerOpen(false);
    window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
    MultiplayerManager.getInstance().broadcastKaraokeState({
      active: true,
      youtubeVideoId: song.youtubeId,
      title: song.title,
      isPlaying: false,
      currentTime: 0,
      musicVolume: audienceMusicVolume,
    });
    return true;
  };

  const handleFileEnded = (title: string, temporaryVideo = false) => {
    if (temporaryVideo) {
      karaokeAudio.clearCustomFile();
      setDownloadedVideo(null);
      setCustomFileName(null);
    }
    isFileSessionActiveRef.current = false;
    setIsFilePlaying(false);
    window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
    MultiplayerManager.getInstance().broadcastKaraokeState({
      active: false,
      youtubeVideoId: null,
      title,
      isPlaying: false,
    });
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    cancelVideoDownload();
    playLocalFile(file);
    e.target.value = '';
  };

  const playLocalFile = (file: File, video?: HTMLVideoElement) => {
    stopTabCapture();
    setYoutubeVideoId(null);
    const name = karaokeAudio.loadCustomFile(file, video);
    setDownloadedVideo(video ?? null);
    setCustomFileName(name);
    setActiveSong(null);
    karaokeAudio.setBackingMusicVolume(audienceMusicVolume / 100);
    isFileSessionActiveRef.current = true;
    karaokeAudio.play(
      () => handleFileEnded(name, Boolean(video)),
      video ? () => {
        setIsFilePlaying(false);
        window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
        MultiplayerManager.getInstance().broadcastKaraokeState({
          active: true, youtubeVideoId: null, title: name, isPlaying: false, currentTime: 0,
        });
      } : undefined,
    );
    setIsFilePlaying(true);
    window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: true }));
    setIsPickerOpen(false);
    const stream = karaokeAudio.getBroadcastStream();
    if (stream) {
      KaraokeVoiceManager.getInstance().startBroadcasting(stream);
    }
    MultiplayerManager.getInstance().broadcastKaraokeState({
      active: true,
      youtubeVideoId: null,
      title: name,
      isPlaying: true,
      currentTime: 0,
      musicVolume: audienceMusicVolume,
    });
  };

  const closeLocalFile = () => {
    const title = customFileName ?? '';
    karaokeAudio.clearCustomFile();
    setDownloadedVideo(null);
    setCustomFileName(null);
    handleFileEnded(title);
  };

  const handleExternalFilePause = () => {
    if (!isFilePlaying) return;
    const title = customFileName ?? 'Nhạc tải lên';
    karaokeAudio.pause();
    setIsFilePlaying(false);
    window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
    MultiplayerManager.getInstance().broadcastKaraokeState({
      active: true,
      youtubeVideoId: null,
      title,
      isPlaying: false,
      currentTime: karaokeAudio.getCurrentTime(),
      musicVolume: audienceMusicVolume,
    });
  };

  const handleToggleFilePlay = () => {
    const next = !isFilePlaying;
    const title = customFileName ?? 'Nhạc tải lên';
    if (isFilePlaying) {
      karaokeAudio.pause();
      setIsFilePlaying(false);
      window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
    } else {
      isFileSessionActiveRef.current = true;
      karaokeAudio.play(
        () => handleFileEnded(title, Boolean(downloadedVideo)),
        () => {
          setIsFilePlaying(false);
          window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: false }));
          MultiplayerManager.getInstance().broadcastKaraokeState({
            active: true,
            youtubeVideoId: null,
            title,
            isPlaying: false,
            currentTime: karaokeAudio.getCurrentTime(),
            musicVolume: audienceMusicVolume,
          });
        }
      );
      setIsFilePlaying(true);
      window.dispatchEvent(new CustomEvent('cavannghe:karaoke-playing', { detail: true }));
    }
    MultiplayerManager.getInstance().broadcastKaraokeState({
      active: true,
      youtubeVideoId: null,
      title,
      isPlaying: next,
      currentTime: karaokeAudio.getCurrentTime(),
      musicVolume: audienceMusicVolume,
    });
  };

  const handleToggleMic = async () => {
    setMicError(null);
    if (micEnabled) {
      micChangeIdRef.current++;
      karaokeAudio.disableMic();
      setMicEnabled(false);
      return;
    }
    await enableSingerMic();
  };

  const restartMicWith = async (overrides: {
    deviceId?: string;
    echoCancellation?: boolean;
  }) => {
    const deviceId = overrides.deviceId ?? selectedDeviceId;
    const nextEchoCancellation = overrides.echoCancellation ?? echoCancellation;
    if (!micEnabled) {
      setSelectedDeviceId(deviceId);
      setEchoCancellation(nextEchoCancellation);
      return;
    }
    const changeId = ++micChangeIdRef.current;
    setMicError(null);
    const ok = await karaokeAudio.enableMic({
      deviceId: deviceId || undefined,
      echoCancellation: nextEchoCancellation,
      echoAmount,
      micSensitivity: micPercentToGain(micPercent),
      bassDb,
      trebleDb,
    });
    if (changeId !== micChangeIdRef.current || !isOpenRef.current) return;
    if (ok) {
      setSelectedDeviceId(deviceId);
      setEchoCancellation(nextEchoCancellation);
    } else {
      setMicEnabled(karaokeAudio.hasLiveMic());
      setMicError('Không thể chuyển sang thiết bị micro này');
    }
  };

  const updateAutoTune = (partial: Partial<AutoTuneConfig>) => {
    const next = karaokeAudio.setAutoTuneConfig(partial);
    setAutoTune(next);
    if (partial.enabled === false) {
      setPitchTelemetry(null);
    }
  };

  const applyPreset = (preset: 'acoustic' | 'lounge' | 'stage' | 'rapper') => {
    const cfg =
      preset === 'acoustic'
        ? { echo: 0.25, bass: 0, treble: -0.5 }
        : preset === 'lounge'
          ? { echo: 0.55, bass: 0.5, treble: 0 }
          : preset === 'stage'
            ? { echo: 0.78, bass: 1.0, treble: 1.0 }
            : { echo: 0.3, bass: 0, treble: 0 };
    setActivePreset(preset);
    setEchoAmount(cfg.echo);
    setBassDb(cfg.bass);
    setTrebleDb(cfg.treble);
    karaokeAudio.setEchoAmount(cfg.echo);
    karaokeAudio.setToneEQ(cfg.bass, cfg.treble);
    if (preset === 'rapper') {
      updateAutoTune({
        enabled: true,
        retuneSpeedMs: 0,
        humanize: 0,
        formantPreserve: true,
        mix: 1.0,
      });
    } else {
      updateAutoTune({ enabled: false });
    }
  };

  const toggleRapperMode = () => {
    if (autoTune.enabled) {
      applyPreset('lounge');
    } else {
      applyPreset('rapper');
    }
  };

  const handleToggleStyle = () => {
    const next = style === 'chill' ? 'dance' : 'chill';
    setStyle(next);
    window.dispatchEvent(new CustomEvent('cavannghe:karaoke-style', { detail: next }));
  };

  const handleAddToQueue = (song: KaraokeSong) => {
    setQueue((prev) => (prev.some((s) => s.youtubeId === song.youtubeId) ? prev : [...prev, song]));
  };

  const handleNextInQueue = async () => {
    const [next] = queue;
    if (next && await playYouTubeSong(next)) {
      setQueue((previous) => previous.filter((song) => song.youtubeId !== next.youtubeId));
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] z-30">
      {/* Top Bar: Draggable Compact Player + Single-Row Controls */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-3">
        {/* Karaoke video player */}
        {youtubeVideoId || downloadedVideo ? (
          <div
            ref={playerBoxRef}
            style={{
              ...(playerPos ? { left: playerPos.x, top: playerPos.y } : {}),
              ...(playerWidth !== null ? { width: playerWidth } : {}),
            }}
            className={`pointer-events-auto rounded-xl overflow-hidden bg-black/95 border border-white/15 shadow-2xl ${
              playerPos ? 'fixed z-40' : 'relative'
            } ${
              playerWidth !== null
                ? ''
                : isPlayerCompact
                  ? 'w-[215px] sm:w-[240px]'
                  : 'w-[min(295px,calc(100vw-1.25rem))] sm:w-[360px]'
            }`}
          >
            <div
              onPointerDown={handlePlayerPointerDown}
              onPointerMove={handlePlayerPointerMove}
              onPointerUp={handlePlayerPointerEnd}
              onPointerCancel={handlePlayerPointerEnd}
              title="Kéo để di chuyển khung video"
              className="flex items-center justify-between gap-1.5 px-2.5 py-1 bg-[#0f0f0f] text-[11px] text-neutral-200 touch-none cursor-grab active:cursor-grabbing select-none"
            >
              <span className="inline-flex items-center gap-1 font-medium truncate min-w-0">
                <GripHorizontal className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="truncate">{downloadedVideo ? customFileName : activeSong?.title ?? 'YouTube Karaoke'}</span>
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                {queue.length > 0 && (
                  <button
                    onClick={handleNextInQueue}
                    className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold"
                    title="Bài tiếp theo trong hàng chờ"
                  >
                    Tiếp ({queue.length})
                  </button>
                )}
                <button
                  onClick={() => {
                    setPlayerWidth(null);
                    setIsPlayerCompact((c) => !c);
                  }}
                  className="p-1 text-neutral-400 hover:text-white"
                  title={isPlayerCompact ? 'Phóng to màn hình hát' : 'Thu nhỏ màn hình hát'}
                >
                  {isPlayerCompact ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                </button>
                <button
                  onClick={downloadedVideo ? closeLocalFile : stopYouTubeSong}
                  aria-label="Đóng video karaoke"
                  className="p-1 text-neutral-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="relative">
              {downloadedVideo ? (
                <KaraokeLocalVideo
                  video={downloadedVideo}
                  isPlaying={isFilePlaying}
                  onTogglePlay={handleToggleFilePlay}
                  onExternalPause={handleExternalFilePause}
                />
              ) : (
                <iframe
                  ref={ytIframeRef}
                  key={youtubeVideoId}
                  className={`w-full aspect-video block ${isDraggingPlayer || isResizingPlayer ? 'pointer-events-none' : ''}`}
                  src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                  title="YouTube Karaoke Player"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  onLoad={() => {
                    const sendListening = () => {
                      const win = ytIframeRef.current?.contentWindow;
                      win?.postMessage(
                        JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
                        '*'
                      );
                    };
                    sendListening();
                    window.setTimeout(sendListening, 500);
                    window.setTimeout(sendListening, 1400);
                  }}
                />
              )}
              {/* Bottom-right resize handle */}
              <div
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerEnd}
                onPointerCancel={handleResizePointerEnd}
                title="Kéo góc để đổi kích thước video"
                className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none flex items-end justify-end p-1 bg-gradient-to-tl from-black/70 via-black/25 to-transparent hover:from-white/30 transition select-none z-10"
              >
                <span className="w-2.5 h-2.5 border-r-2 border-b-2 border-white/75 rounded-br-[2px]" />
              </div>
            </div>
          </div>
        ) : customFileName ? (
          <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-neutral-950/85 backdrop-blur-xl border border-white/15 text-xs text-white shadow-xl">
            <button
              onClick={handleToggleFilePlay}
              className="p-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition"
            >
              {isFilePlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <span className="truncate max-w-[200px] font-medium">{customFileName}</span>
            <button
              onClick={closeLocalFile}
              aria-label="Đóng file karaoke"
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="pointer-events-auto fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-40">
          <div className="flex items-start gap-2">
            {autoTune.enabled && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsRecordingsOpen(false);
                  setIsMixerOpen(true);
                  void karaokeAudio.listInputDevices().then(setInputDevices);
                }}
                title="Chế độ Rapper (Auto-Tune) đang bật — Nhấn để chỉnh Tone / Scale"
                className="h-10 px-2.5 rounded-xl border border-fuchsia-400/50 bg-gradient-to-r from-violet-600/80 to-fuchsia-600/80 hover:from-violet-500/90 hover:to-fuchsia-500/90 text-white backdrop-blur-xl shadow-lg shadow-fuchsia-950/50 flex items-center gap-1.5 text-xs font-semibold transition"
              >
                <Zap className="w-3.5 h-3.5 text-fuchsia-200" />
                <span className="hidden sm:inline">
                  {pitchTelemetry?.voiced
                    ? `${pitchTelemetry.detectedNote} → ${pitchTelemetry.targetNote}`
                    : `Rapper • ${autoTune.key} ${SCALE_DEFINITIONS[autoTune.scale].shortLabel}`}
                </span>
                <span className="sm:hidden font-mono text-[11px]">
                  {pitchTelemetry?.voiced ? pitchTelemetry.targetNote : 'RAP'}
                </span>
              </button>
            )}

            {recState.recordings.length > 0 && !recState.isRecording && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsMixerOpen(false);
                  setIsRecordingsOpen((v) => !v);
                }}
                title="Nghe lại & tải về bản thu"
                className={`h-10 px-2.5 rounded-xl border backdrop-blur-xl shadow-xl flex items-center gap-1.5 text-xs font-medium transition ${
                  isRecordingsOpen
                    ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                    : 'bg-[#121212]/90 hover:bg-[#1e1e1e] border-white/15 text-neutral-100'
                }`}
              >
                <Headphones className="w-3.5 h-3.5 text-amber-400" />
                <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-[10px] font-mono">
                  {recState.recordings.length}
                </span>
              </button>
            )}

            <div className="flex flex-col items-stretch gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={recState.isProcessing}
                  onClick={() => void handleToggleRecord()}
                  title={
                    recState.isProcessing
                      ? 'Đang xuất bản thu MP3...'
                      : recState.isRecording
                        ? 'Dừng ghi âm & nghe lại'
                        : 'Ghi âm giọng hát'
                  }
                  className={`h-10 px-3 rounded-xl border backdrop-blur-xl shadow-xl flex items-center gap-2 text-xs font-semibold transition ${
                    recState.isProcessing
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 cursor-wait'
                      : recState.isRecording
                        ? 'bg-rose-600/90 hover:bg-rose-500 border-rose-300/40 text-white'
                        : 'bg-[#121212]/90 hover:bg-[#1e1e1e] border-white/15 text-neutral-100'
                  }`}
                >
                  {recState.isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                      <span className="hidden sm:inline">Xuất MP3...</span>
                    </>
                  ) : recState.isRecording ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current animate-pulse" />
                      <span className="font-mono">{formatDurationSec(recordingElapsedSec)}</span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                      <span className="hidden sm:inline">Ghi âm</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isMixerOpen || isRecordingsOpen) {
                      setIsMixerOpen(false);
                      setIsRecordingsOpen(false);
                      setIsMenuOpen(true);
                    } else {
                      setIsMenuOpen((o) => !o);
                    }
                  }}
                  aria-label="Mở menu Karaoke"
                  className="relative w-10 h-10 rounded-xl bg-[#121212]/90 hover:bg-[#1e1e1e] border border-white/15 text-white backdrop-blur-xl shadow-xl flex items-center justify-center transition"
                >
                  {isMenuOpen || isMixerOpen || isRecordingsOpen ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <Menu className="w-4 h-4" />
                  )}
                  {micEnabled && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsPickerOpen((p) => !p);
                  setIsMenuOpen(false);
                }}
                title="Tìm và chọn bài hát trên YouTube hoặc tải file nhạc"
                className={`w-full h-9 px-3 rounded-xl border shadow-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition ${
                  isPickerOpen
                    ? 'bg-red-600/90 hover:bg-red-500 border-red-300/40 text-white'
                    : 'bg-[#121212]/90 hover:bg-[#1e1e1e] border-white/15 text-neutral-100'
                }`}
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span>Chọn bài</span>
                {queue.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-[10px] font-mono leading-none">
                    {queue.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-[#121212]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-1.5 space-y-1 text-xs text-neutral-200">
              <button
                type="button"
                onClick={() => {
                  setIsPickerOpen((p) => !p);
                  setIsMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl font-medium transition ${
                  isPickerOpen ? 'bg-red-600/85 text-white' : 'hover:bg-white/10 text-neutral-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" />
                  <span>Chọn bài hát</span>
                </span>
                {queue.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-[10px] font-mono">
                    {queue.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => void handleToggleMic()}
                title={micError ?? 'Bật Micro thật với hiệu ứng Echo'}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl font-medium transition ${
                  micEnabled
                    ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-400/35'
                    : 'hover:bg-white/10 text-neutral-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  <span>Micro</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {micEnabled && (
                    <span className="w-8 h-1.5 rounded-full bg-black/40 overflow-hidden">
                      <span
                        className="block h-full bg-emerald-300 transition-[width] duration-75"
                        style={{ width: `${Math.round(micLevel * 100)}%` }}
                      />
                    </span>
                  )}
                  <span className="text-[11px] text-neutral-400">
                    {micEnabled ? 'Đang bật' : 'Đang tắt'}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleToggleStyle}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-white/10 font-medium text-neutral-200 transition"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Phong cách</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    style === 'dance'
                      ? 'bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/35'
                      : 'bg-white/10 text-neutral-300'
                  }`}
                >
                  {style === 'dance' ? 'Phiêu' : 'Nhẹ'}
                </span>
              </button>

              <button
                type="button"
                onClick={toggleRapperMode}
                title="Bật/tắt Auto-Tune T-Pain (Chế độ Rapper)"
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl font-medium transition ${
                  autoTune.enabled
                    ? 'bg-gradient-to-r from-violet-600/35 to-fuchsia-600/35 text-fuchsia-100 border border-fuchsia-400/40'
                    : 'hover:bg-white/10 text-neutral-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Zap className={`w-3.5 h-3.5 ${autoTune.enabled ? 'text-fuchsia-300' : ''}`} />
                  <span>Chế độ Rapper</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    autoTune.enabled
                      ? 'bg-fuchsia-500/30 text-fuchsia-100 border border-fuchsia-300/30'
                      : 'bg-white/10 text-neutral-400'
                  }`}
                >
                  {autoTune.enabled
                    ? `${autoTune.key} ${SCALE_DEFINITIONS[autoTune.scale].shortLabel}`
                    : 'Tắt'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsRecordingsOpen(false);
                  setIsMixerOpen(true);
                  void karaokeAudio.listInputDevices().then(setInputDevices);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-white/10 font-medium text-neutral-200 transition"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Âm thanh</span>
                </span>
                <span className="text-[11px] text-neutral-400">Mixer</span>
              </button>

              <button
                type="button"
                disabled={recState.isProcessing}
                onClick={() => {
                  setIsMenuOpen(false);
                  void handleToggleRecord();
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl font-medium transition ${
                  recState.isProcessing
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/35 cursor-wait'
                    : recState.isRecording
                      ? 'bg-rose-600/30 text-rose-200 border border-rose-400/35'
                      : 'hover:bg-white/10 text-neutral-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  {recState.isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  ) : recState.isRecording ? (
                    <Square className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                  )}
                  <span>
                    {recState.isProcessing
                      ? 'Xuất MP3...'
                      : recState.isRecording
                        ? 'Dừng ghi âm'
                        : 'Ghi âm'}
                  </span>
                </span>
                <span className="text-[11px] font-mono text-neutral-400">
                  {recState.isProcessing
                    ? 'MP3'
                    : recState.isRecording
                      ? formatDurationSec(recordingElapsedSec)
                      : 'REC'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsMixerOpen(false);
                  setIsRecordingsOpen(true);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-white/10 font-medium text-neutral-200 transition"
              >
                <span className="flex items-center gap-2">
                  <Headphones className="w-3.5 h-3.5 text-amber-400" />
                  <span>Nghe lại & Tải về</span>
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-mono text-neutral-300">
                  {recState.recordings.length}
                </span>
              </button>

              <div className="border-t border-white/10 my-1" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onExit();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-rose-600/80 text-rose-300 hover:text-white font-medium transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Xuống sân khấu</span>
              </button>
            </div>
          )}

          {isRecordingsOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 w-[min(340px,calc(100vw-1.5rem))] max-h-[75dvh] overflow-y-auto rounded-2xl bg-[#121212]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-3.5 text-xs text-neutral-200 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5 text-amber-400" />
                  Bản thu âm & Nghe lại
                </span>
                <button
                  type="button"
                  onClick={() => setIsRecordingsOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {recState.isProcessing && (
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-200">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Đang xuất bản thu MP3...</span>
                </div>
              )}

              {recState.recordings.length === 0 && !recState.isProcessing ? (
                <div className="py-5 text-center space-y-2 text-neutral-400">
                  <p>Chưa có bản thu nào.</p>
                  <p className="text-[11px] text-neutral-500">
                    Nhấn nút <span className="text-rose-400 font-semibold">Ghi âm</span> khi hát để lưu lại giọng hát kèm nhạc nền & hiệu ứng Echo/Reverb.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recState.recordings.map((rec) => {
                    const sec = Math.max(1, Math.round(rec.durationMs / 1000));
                    const sizeKb = Math.max(1, Math.round(rec.sizeBytes / 1024));
                    return (
                      <div
                        key={rec.id}
                        className="rounded-xl bg-white/5 border border-white/10 p-2.5 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{rec.title}</p>
                            <p className="text-[11px] text-neutral-400 truncate">
                              {rec.singerName} • {formatDurationSec(sec)} • {sizeKb} KB •{' '}
                              {rec.extension.toUpperCase()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => karaokeRecorder.downloadRecording(rec)}
                              title="Tải về file MP3"
                              className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-400/30 transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => karaokeRecorder.deleteRecording(rec.id)}
                              title="Xóa bản thu"
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/25 text-neutral-400 hover:text-rose-200 border border-white/10 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <audio controls preload="metadata" src={rec.url} className="w-full h-8" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isMixerOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 w-[min(320px,calc(100vw-1.5rem))] max-h-[75dvh] overflow-y-auto rounded-2xl bg-[#121212]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-3.5 text-xs text-neutral-200 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  Cài đặt Micro & Âm thanh
                </span>
                <button
                  onClick={() => setIsMixerOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Input Device Selector */}
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-400">Đầu vào Micro</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    void restartMicWith({ deviceId: id });
                  }}
                  className="w-full bg-[#1e1e1e] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                >
                  {inputDevices.length === 0 ? (
                    <option value="">Mặc định hệ thống (Bật Mic để quét)</option>
                  ) : (
                    inputDevices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Micro ${idx + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Monitoring Mode: Headphones Studio vs Speaker Anti-Howl */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    void restartMicWith({ echoCancellation: false });
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition ${
                    !echoCancellation
                      ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  Tai nghe (Studio)
                </button>
                <button
                  onClick={() => {
                    void restartMicWith({ echoCancellation: true });
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition ${
                    echoCancellation
                      ? 'bg-amber-500/25 text-amber-200 border-amber-400/40'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  Loa ngoài (Chống hú)
                </button>
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  disabled={isSharingTabAudio}
                  aria-pressed={localMonitor && !isSharingTabAudio}
                  aria-describedby={isSharingTabAudio ? 'karaoke-monitor-sharing-note' : undefined}
                  onClick={() => {
                    const next = !localMonitor;
                    setLocalMonitor(next);
                    karaokeAudio.setLocalMonitor(next);
                  }}
                  className={`w-full py-1.5 px-2.5 rounded-lg text-[11px] font-medium border flex items-center justify-between transition disabled:opacity-60 disabled:cursor-not-allowed ${
                    localMonitor && !isSharingTabAudio
                      ? 'bg-white/10 text-white border-white/20'
                      : 'bg-white/5 text-neutral-400 border-white/10 enabled:hover:bg-white/10'
                  }`}
                >
                  <span>Tự nghe giọng mình (Monitor)</span>
                  <span className="font-mono">{isSharingTabAudio ? 'TẠM TẮT' : localMonitor ? 'BẬT' : 'TẮT'}</span>
                </button>
                {isSharingTabAudio && (
                  <p id="karaoke-monitor-sharing-note" className="text-[10px] text-neutral-400">
                    Tạm tắt khi thu tiếng YouTube để khán giả không nghe giọng bị lặp. Mic vẫn được gửi.
                  </p>
                )}
              </div>

              {/* 4 Quick Presets */}
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'acoustic', label: 'Acoustic Mộc' },
                    { id: 'lounge', label: 'Phòng Trà' },
                    { id: 'stage', label: 'Sân Khấu' },
                    { id: 'rapper', label: 'Rapper (Auto-Tune)' },
                  ] as const
                ).map((p) => {
                  const isActive = activePreset === p.id;
                  const isRapper = p.id === 'rapper';
                  return (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1 transition ${
                        isActive
                          ? isRapper
                            ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white border-fuchsia-300 shadow-sm shadow-fuchsia-900/50'
                            : 'bg-amber-500 text-stone-950 border-amber-300'
                          : isRapper
                            ? 'bg-violet-500/10 hover:bg-violet-500/20 border-fuchsia-400/25 text-fuchsia-200'
                            : 'bg-white/5 hover:bg-white/15 border-white/10 text-neutral-200'
                      }`}
                    >
                      {isRapper && <Zap className="w-3 h-3 shrink-0" />}
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Rapper Mode (Real-Time Hard-Tune Auto-Tune) */}
              <div className="rounded-xl bg-gradient-to-br from-violet-950/55 via-[#181224] to-fuchsia-950/40 border border-fuchsia-400/25 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-fuchsia-200 text-[11px]">
                    <Zap className="w-3.5 h-3.5 text-fuchsia-400" />
                    Auto-Tune (T-Pain)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextEnabled = !autoTune.enabled;
                      setActivePreset(nextEnabled ? 'rapper' : null);
                      updateAutoTune({ enabled: nextEnabled });
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition ${
                      autoTune.enabled
                        ? 'bg-fuchsia-500 text-white border-fuchsia-300'
                        : 'bg-white/10 text-neutral-300 border-white/15 hover:bg-white/20'
                    }`}
                  >
                    {autoTune.enabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                  </button>
                </div>

                {autoTune.enabled && (
                  <>
                    <div className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between text-[10px]">
                      <span className="text-neutral-400">
                        {micEnabled ? 'Cao độ trực tiếp:' : 'Micro đang tắt'}
                      </span>
                      <span className="font-mono font-semibold text-fuchsia-200">
                        {!micEnabled
                          ? 'Hãy bật Micro'
                          : pitchTelemetry?.voiced
                            ? `${pitchTelemetry.detectedNote} (${Math.round(pitchTelemetry.detectedFreq)}Hz) → ${pitchTelemetry.targetNote}`
                            : `${autoTune.key} ${SCALE_DEFINITIONS[autoTune.scale].shortLabel} • Chờ giọng...`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateAutoTune({ autoMatchTone: !autoTune.autoMatchTone })
                        }
                        className={`flex-1 py-1 px-2 rounded-lg border flex items-center justify-between text-[10px] font-medium transition ${
                          autoTune.autoMatchTone
                            ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
                            : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                        }`}
                        title="Tự động nghe nhạc nền để chọn Tone & Scale phù hợp"
                      >
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-sky-300" />
                          <span>Tự Match Tone</span>
                        </span>
                        <span className="font-mono font-bold">
                          {autoTune.autoMatchTone
                            ? karaokeAudio.isAutoMatchToneLocked()
                              ? `${autoTune.key} ${SCALE_DEFINITIONS[autoTune.scale].shortLabel}`
                              : 'Đang dò...'
                            : 'TẮT'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      {AUTOTUNE_PRESETS.map((preset) => {
                        const isMatch =
                          autoTune.retuneSpeedMs === preset.config.retuneSpeedMs &&
                          Math.abs(autoTune.humanize - preset.config.humanize) < 0.01 &&
                          autoTune.formantPreserve === preset.config.formantPreserve &&
                          Math.abs(autoTune.mix - preset.config.mix) < 0.01;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => updateAutoTune(preset.config)}
                            title={preset.subtitle}
                            className={`py-1 px-1.5 rounded-lg border text-center transition ${
                              isMatch
                                ? 'bg-fuchsia-500/30 border-fuchsia-300/60 text-white'
                                : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                            }`}
                          >
                            <div className="text-[10px] font-semibold leading-tight">{preset.label}</div>
                            <div className="text-[9px] text-neutral-400 leading-tight truncate">
                              {preset.subtitle}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-[74px_1fr] gap-1.5">
                      <select
                        value={autoTune.key}
                        onChange={(e) =>
                          updateAutoTune({ key: e.target.value as MusicalKey, autoMatchTone: false })
                        }
                        aria-label="Tone gốc (Key)"
                        className="bg-[#1b1526] border border-fuchsia-400/25 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-fuchsia-400"
                      >
                        {MUSICAL_KEYS.map((k) => (
                          <option key={k} value={k}>
                            Tone {k}
                          </option>
                        ))}
                      </select>
                      <select
                        value={autoTune.scale}
                        onChange={(e) =>
                          updateAutoTune({ scale: e.target.value as ScaleType, autoMatchTone: false })
                        }
                        aria-label="Âm giai (Scale)"
                        className="bg-[#1b1526] border border-fuchsia-400/25 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-fuchsia-400"
                      >
                        {(Object.keys(SCALE_DEFINITIONS) as ScaleType[]).map((s) => (
                          <option key={s} value={s}>
                            {SCALE_DEFINITIONS[s].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <label className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-fuchsia-200/90 w-24 shrink-0">Retune Speed</span>
                      <input
                        type="range"
                        min={0}
                        max={80}
                        step={1}
                        value={autoTune.retuneSpeedMs}
                        onChange={(e) =>
                          updateAutoTune({ retuneSpeedMs: parseFloat(e.target.value) })
                        }
                        className="flex-1 accent-fuchsia-400"
                      />
                      <span className="w-16 text-right font-mono text-[10px] text-fuchsia-200">
                        {autoTune.retuneSpeedMs === 0 ? '0ms (T-Pain)' : `${autoTune.retuneSpeedMs}ms`}
                      </span>
                    </label>

                    <label className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-fuchsia-200/90 w-24 shrink-0">Humanize</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={autoTune.humanize}
                        onChange={(e) =>
                          updateAutoTune({ humanize: parseFloat(e.target.value) })
                        }
                        className="flex-1 accent-fuchsia-400"
                      />
                      <span className="w-16 text-right font-mono text-[10px] text-fuchsia-200">
                        {Math.round(autoTune.humanize * 100)}%
                      </span>
                    </label>

                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          updateAutoTune({ formantPreserve: !autoTune.formantPreserve })
                        }
                        className={`flex-1 py-1 px-2 rounded-lg border flex items-center justify-between text-[10px] font-medium transition ${
                          autoTune.formantPreserve
                            ? 'bg-emerald-500/20 border-emerald-400/35 text-emerald-200'
                            : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                        }`}
                      >
                        <span>Giữ Formant (Tự nhiên)</span>
                        <span className="font-mono font-bold">
                          {autoTune.formantPreserve ? 'BẬT' : 'TẮT'}
                        </span>
                      </button>
                    </div>

                    <label className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-fuchsia-200/90 w-24 shrink-0">Độ trộn (Mix)</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={autoTune.mix}
                        onChange={(e) => updateAutoTune({ mix: parseFloat(e.target.value) })}
                        className="flex-1 accent-fuchsia-400"
                      />
                      <span className="w-10 text-right font-mono text-[10px] text-fuchsia-200">
                        {Math.round(autoTune.mix * 100)}%
                      </span>
                    </label>
                  </>
                )}
              </div>

              {/* Focused Mixer Sliders */}
              <div className="space-y-2.5 pt-2 border-t border-white/10 text-[11px]">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-emerald-300 w-24 shrink-0">Giọng hát (Mic)</span>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    step={5}
                    value={micPercent}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setMicPercent(v);
                      karaokeAudio.setMicVolume(micPercentToGain(v));
                    }}
                    className="flex-1 accent-emerald-400"
                  />
                  <span className="w-10 text-right font-mono">{micPercent}%</span>
                </label>

                <label className="flex items-center justify-between gap-2">
                  <span className="text-amber-300 w-24 shrink-0">Echo / Vang</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={echoAmount}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setActivePreset(null);
                      setEchoAmount(v);
                      karaokeAudio.setEchoAmount(v);
                    }}
                    className="flex-1 accent-amber-400"
                  />
                  <span className="w-10 text-right font-mono">{Math.round(echoAmount * 100)}%</span>
                </label>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <label className="flex flex-col gap-1">
                    <span className="flex justify-between text-neutral-400">
                      <span>Bass (Ấm)</span>
                      <span className="font-mono text-neutral-200">{bassDb > 0 ? `+${bassDb}` : bassDb}dB</span>
                    </span>
                    <input
                      type="range"
                      min={-6}
                      max={8}
                      step={0.5}
                      value={bassDb}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setActivePreset(null);
                        setBassDb(v);
                        karaokeAudio.setToneEQ(v, trebleDb);
                      }}
                      className="w-full accent-amber-400"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="flex justify-between text-neutral-400">
                      <span>Treble (Sáng)</span>
                      <span className="font-mono text-neutral-200">{trebleDb > 0 ? `+${trebleDb}` : trebleDb}dB</span>
                    </span>
                    <input
                      type="range"
                      min={-6}
                      max={8}
                      step={0.5}
                      value={trebleDb}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setActivePreset(null);
                        setTrebleDb(v);
                        karaokeAudio.setToneEQ(bassDb, v);
                      }}
                      className="w-full accent-amber-400"
                    />
                  </label>
                </div>
              </div>

              {micError && <p className="text-[11px] text-rose-300">{micError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Center YouTube-Style Live Search & Song Picker Panel */}
      {isPickerOpen && (
        <div className="pointer-events-auto self-center w-full max-w-2xl rounded-2xl bg-[#0f0f0f]/95 backdrop-blur-2xl border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden text-neutral-100">
          {/* YouTube-Style Search Header */}
          <div className="p-3.5 border-b border-white/10 flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-red-500 font-bold text-sm shrink-0 pr-1">
              <Youtube className="w-5 h-5" />
              <span className="hidden sm:inline text-white tracking-tight">Karaoke</span>
            </div>

            <div className="flex-1 flex items-center bg-[#121212] border border-white/15 focus-within:border-blue-500 rounded-full overflow-hidden">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) setYtResults(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSearchYouTube();
                }}
                placeholder="Tìm bài hát trên YouTube (vd: Sơn Tùng, Bolero) hoặc dán link..."
                className="w-full bg-transparent px-4 py-2 text-xs sm:text-sm text-white placeholder-neutral-400 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setYtResults(null);
                    setSearchError(null);
                  }}
                  className="p-1.5 text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => void handleSearchYouTube()}
                className="px-4 py-2 bg-[#222222] hover:bg-[#303030] border-l border-white/10 text-neutral-200 flex items-center justify-center"
                title="Tìm kiếm trên YouTube"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </button>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-medium shrink-0 transition"
              title="Chọn file MP3/WAV từ máy"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">MP3</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleUploadFile}
            />

            <button
              onClick={() => setIsPickerOpen(false)}
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Chips & Queue Tab */}
          <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              {(['Tất cả', 'Acoustic', 'Trữ tình', 'Sôi động'] as CategoryFilter[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveTab('search');
                    setCategory(cat);
                    setYtResults(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    activeTab === 'search' && !ytResults && category === cat
                      ? 'bg-white text-black'
                      : 'bg-white/10 hover:bg-white/20 text-neutral-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
              {ytResults && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-600/25 text-red-200 border border-red-500/30">
                  Kết quả YouTube ({ytResults.length})
                </span>
              )}
            </div>

            <button
              onClick={() => setActiveTab((t) => (t === 'queue' ? 'search' : 'queue'))}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                activeTab === 'queue'
                  ? 'bg-red-600 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-neutral-200'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              Hàng chờ ({queue.length})
            </button>
          </div>

          {isDownloadingVideo && (
            <p role="status" className="mx-3.5 mt-3 text-[11px] text-amber-200">Đang tải video karaoke…</p>
          )}

          {needsTabAudioPermission && (
            <p className="mx-3.5 mt-3 text-[11px] text-neutral-400">
              Khi chọn bài YouTube, hãy cho phép chia sẻ tiếng tab hiện tại. Khán giả chỉ nhận âm thanh đã trộn.
            </p>
          )}

          {searchError && (
            <div className="mx-3.5 mt-2.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/30 text-[11px] text-amber-200">
              {searchError}
            </div>
          )}

          {/* Direct YouTube URL Match Banner */}
          {pastedYtId && (
            <div className="mx-3.5 mt-3 p-2.5 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-red-100">
                <Youtube className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  Phát trực tiếp video YouTube ID: <b>{pastedYtId}</b>
                </span>
              </div>
              <button
                onClick={() => void handleSearchYouTube()}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shrink-0"
              >
                Phát ngay
              </button>
            </div>
          )}

          {/* YouTube-Style Video Results / Queue List */}
          <div className="max-h-80 overflow-y-auto p-3 space-y-2">
            {activeTab === 'search' ? (
              isSearching ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-neutral-400">
                  <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                  Đang tìm kiếm video Karaoke trên YouTube...
                </div>
              ) : displayedSongs.length === 0 ? (
                <div className="py-10 text-center text-xs text-neutral-400">
                  Không tìm thấy kết quả. Nhấn Enter hoặc nút kính lúp để tìm trực tiếp trên YouTube.
                </div>
              ) : (
                displayedSongs.map((song) => {
                  const isCurrent = youtubeVideoId === song.youtubeId;
                  return (
                    <div
                      key={song.id}
                      onClick={() => playYouTubeSong(song)}
                      className={`group flex items-center gap-3 p-2 rounded-xl cursor-pointer transition ${
                        isCurrent ? 'bg-white/12' : 'hover:bg-white/8'
                      }`}
                    >
                      {/* Real YouTube 16:9 Thumbnail */}
                      <div className="relative w-32 sm:w-40 aspect-video rounded-lg bg-neutral-900 shrink-0 overflow-hidden border border-white/10">
                        <img
                          src={song.thumbnail}
                          alt={song.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/35 flex items-center justify-center transition">
                          <div className="w-8 h-8 rounded-full bg-black/65 group-hover:bg-red-600 flex items-center justify-center transition opacity-90 group-hover:opacity-100">
                            <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-mono text-white">
                          {song.durationLabel}
                        </span>
                      </div>

                      {/* Video Metadata */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 group-hover:text-amber-300 transition">
                          {song.title}
                        </h4>
                        <p className="text-[11px] text-neutral-400 mt-1 truncate">
                          {song.channel} {song.views ? `• ${song.views}` : ''}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/25 text-[10px]">
                            YouTube Karaoke
                          </span>
                          {song.category !== 'YouTube' && (
                            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-neutral-300">
                              {song.category}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Add to Queue */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToQueue(song);
                        }}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white shrink-0 transition"
                        title="Thêm vào hàng chờ"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )
            ) : queue.length === 0 ? (
              <div className="py-10 text-center text-xs text-neutral-400">
                Hàng chờ đang trống. Nhấn dấu + ở danh sách bài để thêm vào.
              </div>
            ) : (
              queue.map((song, idx) => (
                <div
                  key={`${song.id}-${idx}`}
                  onClick={async () => {
                    if (await playYouTubeSong(song)) {
                      setQueue((previous) => previous.filter((item) => item.youtubeId !== song.youtubeId));
                    }
                  }}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/8 cursor-pointer transition"
                >
                  <span className="w-5 text-center text-xs font-mono text-neutral-400">
                    {idx + 1}
                  </span>
                  <img
                    src={song.thumbnail}
                    alt={song.title}
                    className="w-20 aspect-video rounded object-cover shrink-0 border border-white/10"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-white truncate">
                      {song.title}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {song.channel} • {song.durationLabel}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQueue((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-neutral-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div />
    </div>
  );
};
