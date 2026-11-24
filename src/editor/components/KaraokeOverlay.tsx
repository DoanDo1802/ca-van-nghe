import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GripHorizontal,
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
  Trash2,
  Upload,
  X,
  Youtube,
} from 'lucide-react';
import { KARAOKE_SONGS, karaokeAudio, type KaraokeSong } from '../../utils/karaokeAudio';
import { loungeAudio } from '../../utils/audio';
import { MultiplayerManager } from '../../network/MultiplayerManager';
import { KaraokeVoiceManager } from '../../network/KaraokeVoiceManager';
import { DebugLogger } from '../../utils/debugLogger';

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
  const [isPickerOpen, setIsPickerOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'search' | 'queue'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('Tất cả');

  const [ytResults, setYtResults] = useState<KaraokeSong[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [activeSong, setActiveSong] = useState<KaraokeSong | null>(null);
  const [queue, setQueue] = useState<KaraokeSong[]>([KARAOKE_SONGS[1], KARAOKE_SONGS[2]]);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [isPlayerCompact, setIsPlayerCompact] = useState(true);
  const [playerWidth, setPlayerWidth] = useState<number | null>(null);
  const [playerPos, setPlayerPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingPlayer, setIsDraggingPlayer] = useState(false);
  const [isResizingPlayer, setIsResizingPlayer] = useState(false);

  const [isFilePlaying, setIsFilePlaying] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [localMonitor, setLocalMonitor] = useState(() => karaokeAudio.isLocalMonitorEnabled());
  const [micPercent, setMicPercent] = useState(100);
  const [echoAmount, setEchoAmount] = useState(0.55);
  const [bassDb, setBassDb] = useState(3.5);
  const [trebleDb, setTrebleDb] = useState(4.5);
  const [activePreset, setActivePreset] = useState<'acoustic' | 'lounge' | 'stage' | null>('lounge');
  const [audienceMusicVolume, setAudienceMusicVolume] = useState(60);
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
    return Math.max(180, Math.min(maxW, Math.round(w)));
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
  }, [isOpen, isPlayerCompact, playerWidth, youtubeVideoId]);

  useEffect(() => {
    if (!isOpen) return;
    const onSubscribed = () => {
      if (youtubeVideoId) {
        MultiplayerManager.getInstance().broadcastKaraokeState({
          active: true,
          youtubeVideoId,
          title: activeSong?.title ?? 'YouTube Karaoke',
          isPlaying: lastYtPlayingRef.current ?? true,
          currentTime: ytCurrentTimeRef.current,
          musicVolume: audienceMusicVolume,
        });
      } else if (customFileName) {
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

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const enableSingerMic = async (): Promise<boolean> => {
    setMicError(null);
    const ok = await karaokeAudio.enableMic({
      deviceId: selectedDeviceId || undefined,
      echoCancellation,
      echoAmount,
      micSensitivity: micPercentToGain(micPercent),
      bassDb,
      trebleDb,
    });
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
      if (isOpenRef.current) {
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
    loungeAudio.setDucked(isOpen);
    if (!isOpen) {
      karaokeAudio.stop();
      karaokeAudio.disableMic();
      setMicEnabled(false);
      setMicError(null);
      setIsMenuOpen(false);
      setIsMixerOpen(false);
      setIsFilePlaying(false);
      setYoutubeVideoId(null);
      KaraokeVoiceManager.getInstance().stopBroadcasting();
      MultiplayerManager.getInstance().broadcastKaraokeState({
        active: false,
        youtubeVideoId: null,
        title: '',
        isPlaying: false,
      });
      return;
    }
    setIsPickerOpen(true);
    void enableSingerMic();
  }, [isOpen]);

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
    return () => {
      if (trailingVolumeTimerRef.current !== null) {
        window.clearTimeout(trailingVolumeTimerRef.current);
      }
      if (presenceVolumeTimerRef.current !== null) {
        window.clearTimeout(presenceVolumeTimerRef.current);
      }
      KaraokeVoiceManager.getInstance().stopBroadcasting();
      MultiplayerManager.getInstance().broadcastKaraokeState({
        active: false,
        youtubeVideoId: null,
        title: '',
        isPlaying: false,
      });
      karaokeAudio.disableMic();
      karaokeAudio.stop();
      loungeAudio.setDucked(false);
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
        typeof e.origin === 'string' &&
        !e.origin.includes('youtube.com') &&
        !e.origin.includes('youtube-nocookie.com')
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
      const nextPlaying = playerState === 1 ? true : playerState === 2 || playerState === 0 ? false : null;
      if (nextPlaying === null || lastYtPlayingRef.current === nextPlaying) return;
      lastYtPlayingRef.current = nextPlaying;
      lastTimeSyncSentRef.current = Date.now();
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
      const queryWithKaraoke = /karaoke|beat/i.test(raw) ? raw : `${raw} karaoke`;
      const res = await fetch(`/api/yt-search?q=${encodeURIComponent(queryWithKaraoke)}`);
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

  const playYouTubeSong = (song: KaraokeSong) => {
    DebugLogger.log('KaraokeOverlay', `Playing YouTube karaoke: "${song.title}" (${song.youtubeId})`);
    karaokeAudio.stop();
    setCustomFileName(null);
    setIsFilePlaying(false);
    setActiveSong(song);
    setYoutubeVideoId(song.youtubeId);
    ytCurrentTimeRef.current = 0;
    lastTimeSyncSentRef.current = Date.now();
    lastYtPlayingRef.current = true;
    setIsPickerOpen(false);
    MultiplayerManager.getInstance().broadcastKaraokeState({
      active: true,
      youtubeVideoId: song.youtubeId,
      title: song.title,
      isPlaying: true,
      currentTime: 0,
      musicVolume: audienceMusicVolume,
    });
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setYoutubeVideoId(null);
    const name = karaokeAudio.loadCustomFile(file);
    setCustomFileName(name);
    setActiveSong(null);
    karaokeAudio.setAudienceMusicVolume(audienceMusicVolume / 100);
    karaokeAudio.play(() => setIsFilePlaying(false));
    setIsFilePlaying(true);
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
    e.target.value = '';
  };

  const handleToggleFilePlay = () => {
    const next = !isFilePlaying;
    if (isFilePlaying) {
      karaokeAudio.pause();
      setIsFilePlaying(false);
    } else {
      karaokeAudio.play(() => setIsFilePlaying(false));
      setIsFilePlaying(true);
    }
    MultiplayerManager.getInstance().broadcastKaraokeState({
      active: true,
      youtubeVideoId: null,
      title: customFileName ?? 'Nhạc tải lên',
      isPlaying: next,
      currentTime: karaokeAudio.getCurrentTime(),
      musicVolume: audienceMusicVolume,
    });
  };

  const handleToggleMic = async () => {
    setMicError(null);
    if (micEnabled) {
      KaraokeVoiceManager.getInstance().stopBroadcasting();
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
    if (!micEnabled) return;
    const ok = await karaokeAudio.enableMic({
      deviceId: (overrides.deviceId ?? selectedDeviceId) || undefined,
      echoCancellation: overrides.echoCancellation ?? echoCancellation,
      echoAmount,
      micSensitivity: micPercentToGain(micPercent),
      bassDb,
      trebleDb,
    });
    if (ok) {
      const stream = karaokeAudio.getBroadcastStream();
      if (stream) {
        KaraokeVoiceManager.getInstance().startBroadcasting(stream);
      }
    } else {
      setMicError('Không thể chuyển sang thiết bị micro này');
    }
  };

  const applyPreset = (preset: 'acoustic' | 'lounge' | 'stage') => {
    const cfg =
      preset === 'acoustic'
        ? { micPct: 85, echo: 0.25, bass: 2.5, treble: 3.0 }
        : preset === 'lounge'
          ? { micPct: 100, echo: 0.55, bass: 3.5, treble: 4.5 }
          : { micPct: 120, echo: 0.78, bass: 4.5, treble: 5.5 };
    setActivePreset(preset);
    setMicPercent(cfg.micPct);
    setEchoAmount(cfg.echo);
    setBassDb(cfg.bass);
    setTrebleDb(cfg.treble);
    karaokeAudio.setMicVolume(micPercentToGain(cfg.micPct));
    karaokeAudio.setEchoAmount(cfg.echo);
    karaokeAudio.setToneEQ(cfg.bass, cfg.treble);
  };

  const handleToggleStyle = () => {
    const next = style === 'chill' ? 'dance' : 'chill';
    setStyle(next);
    window.dispatchEvent(new CustomEvent('cavannghe:karaoke-style', { detail: next }));
  };

  const handleAddToQueue = (song: KaraokeSong) => {
    setQueue((prev) => (prev.some((s) => s.youtubeId === song.youtubeId) ? prev : [...prev, song]));
  };

  const handleNextInQueue = () => {
    if (queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    playYouTubeSong(next);
  };

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] z-30">
      {/* Top Bar: Draggable Compact Player + Single-Row Controls */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-3">
        {/* Live YouTube Karaoke Video Player */}
        {youtubeVideoId ? (
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
                <span className="truncate">{activeSong?.title ?? 'YouTube Karaoke'}</span>
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
                  onClick={() => {
                    setYoutubeVideoId(null);
                    setActiveSong(null);
                    MultiplayerManager.getInstance().broadcastKaraokeState({
                      active: false,
                      youtubeVideoId: null,
                      title: '',
                      isPlaying: false,
                    });
                  }}
                  className="p-1 text-neutral-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="relative">
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
              {/* Bottom-right resize handle */}
              <div
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerEnd}
                onPointerCancel={handleResizePointerEnd}
                title="Kéo góc để co dãn khung YouTube"
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
              onClick={() => {
                karaokeAudio.stop();
                setCustomFileName(null);
                setIsFilePlaying(false);
                MultiplayerManager.getInstance().broadcastKaraokeState({
                  active: false,
                  youtubeVideoId: null,
                  title: '',
                  isPlaying: false,
                });
              }}
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="pointer-events-auto fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-40">
          <button
            type="button"
            onClick={() => {
              if (isMixerOpen) {
                setIsMixerOpen(false);
                setIsMenuOpen(true);
              } else {
                setIsMenuOpen((o) => !o);
              }
            }}
            aria-label="Mở menu Karaoke"
            className="relative w-10 h-10 rounded-xl bg-[#121212]/90 hover:bg-[#1e1e1e] border border-white/15 text-white backdrop-blur-xl shadow-xl flex items-center justify-center transition"
          >
            {isMenuOpen || isMixerOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            {micEnabled && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

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
                onClick={() => {
                  setIsMenuOpen(false);
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
                    setSelectedDeviceId(id);
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
                    setEchoCancellation(false);
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
                    setEchoCancellation(true);
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

              {/* Local Self-Monitoring Toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !localMonitor;
                  setLocalMonitor(next);
                  karaokeAudio.setLocalMonitor(next);
                }}
                className={`w-full py-1.5 px-2.5 rounded-lg text-[11px] font-medium border flex items-center justify-between transition ${
                  localMonitor
                    ? 'bg-white/10 text-white border-white/20'
                    : 'bg-white/5 text-neutral-400 border-white/10 hover:bg-white/10'
                }`}
              >
                <span>Tự nghe giọng mình (Monitor)</span>
                <span className="font-mono">{localMonitor ? 'BẬT' : 'TẮT'}</span>
              </button>

              {/* 3 Quick Presets */}
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'acoustic', label: 'Acoustic Mộc' },
                    { id: 'lounge', label: 'Phòng Trà' },
                    { id: 'stage', label: 'Sân Khấu' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className={`flex-1 py-1 rounded-lg border text-[11px] font-medium transition ${
                      activePreset === p.id
                        ? 'bg-amber-500 text-stone-950 border-amber-300'
                        : 'bg-white/5 hover:bg-white/15 border-white/10 text-neutral-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Focused Mixer Sliders */}
              <div className="space-y-2.5 pt-2 border-t border-white/10 text-[11px]">
                <div className="space-y-1">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-sky-300 font-medium">Nhạc nền (cho người nghe)</span>
                    <span className="w-10 text-right font-mono text-sky-200">{audienceMusicVolume}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={audienceMusicVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setAudienceMusicVolume(v);
                      karaokeAudio.setAudienceMusicVolume(v / 100);
                      scheduleAudienceMusicVolumeSync(v);
                    }}
                    className="w-full accent-sky-400"
                  />
                  <p className="text-[10px] text-neutral-400 leading-snug">
                    Chỉ chỉnh độ to nhạc phía người nghe. Nhạc của bạn tự chỉnh trên khung YouTube.
                  </p>
                </div>

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
                      setActivePreset(null);
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
                  onClick={() => {
                    setQueue((prev) => prev.filter((_, i) => i !== idx));
                    playYouTubeSong(song);
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
