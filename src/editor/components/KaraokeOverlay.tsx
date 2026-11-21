import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ListMusic,
  Loader2,
  LogOut,
  Maximize2,
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
  const [isPlayerCompact, setIsPlayerCompact] = useState(false);

  const [isFilePlaying, setIsFilePlaying] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [micGain, setMicGain] = useState(3.4);
  const [echoAmount, setEchoAmount] = useState(0.55);
  const [bassDb, setBassDb] = useState(3.5);
  const [trebleDb, setTrebleDb] = useState(4.5);
  const [activePreset, setActivePreset] = useState<'acoustic' | 'lounge' | 'stage' | null>('lounge');
  const [musicVolume, setMusicVolume] = useState(35);
  const [style, setStyle] = useState<'chill' | 'dance'>('chill');
  const [micLevel, setMicLevel] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ytIframeRef = useRef<HTMLIFrameElement>(null);

  const applyYoutubeVolume = (vol: number) => {
    const win = ytIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [Math.round(vol)] }),
      '*'
    );
  };

  useEffect(() => {
    if (!isOpen) {
      karaokeAudio.stop();
      setIsFilePlaying(false);
      setYoutubeVideoId(null);
      return;
    }
    setIsPickerOpen(true);
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
      karaokeAudio.disableMic();
      karaokeAudio.stop();
    };
  }, []);

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
    } catch {
      setSearchError('Không tìm được trực tiếp trên YouTube lúc này — đang lọc danh sách có sẵn.');
      setYtResults(null);
    } finally {
      setIsSearching(false);
    }
  };

  const playYouTubeSong = (song: KaraokeSong) => {
    karaokeAudio.stop();
    setCustomFileName(null);
    setIsFilePlaying(false);
    setActiveSong(song);
    setYoutubeVideoId(song.youtubeId);
    setIsPickerOpen(false);
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setYoutubeVideoId(null);
    const name = karaokeAudio.loadCustomFile(file);
    setCustomFileName(name);
    setActiveSong(null);
    karaokeAudio.play(() => setIsFilePlaying(false));
    setIsFilePlaying(true);
    setIsPickerOpen(false);
    e.target.value = '';
  };

  const handleToggleFilePlay = () => {
    if (isFilePlaying) {
      karaokeAudio.pause();
      setIsFilePlaying(false);
    } else {
      karaokeAudio.play(() => setIsFilePlaying(false));
      setIsFilePlaying(true);
    }
  };

  const handleToggleMic = async () => {
    setMicError(null);
    if (micEnabled) {
      karaokeAudio.disableMic();
      setMicEnabled(false);
      return;
    }
    const ok = await karaokeAudio.enableMic({
      deviceId: selectedDeviceId || undefined,
      echoCancellation,
      echoAmount,
      micSensitivity: micGain,
      bassDb,
      trebleDb,
    });
    if (ok) {
      setMicEnabled(true);
      const list = await karaokeAudio.listInputDevices();
      setInputDevices(list);
      if (!selectedDeviceId && list[0]?.deviceId) {
        setSelectedDeviceId(list[0].deviceId);
      }
    } else {
      setMicError('Chưa cấp quyền Micro trên trình duyệt');
    }
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
      micSensitivity: micGain,
      bassDb,
      trebleDb,
    });
    if (!ok) {
      setMicError('Không thể chuyển sang thiết bị micro này');
    }
  };

  const applyPreset = (preset: 'acoustic' | 'lounge' | 'stage') => {
    const cfg =
      preset === 'acoustic'
        ? { gain: 3.0, echo: 0.25, bass: 2.5, treble: 3.0 }
        : preset === 'lounge'
          ? { gain: 3.6, echo: 0.55, bass: 3.5, treble: 4.5 }
          : { gain: 4.2, echo: 0.78, bass: 4.5, treble: 5.5 };
    setActivePreset(preset);
    setMicGain(cfg.gain);
    setEchoAmount(cfg.echo);
    setBassDb(cfg.bass);
    setTrebleDb(cfg.treble);
    karaokeAudio.setMicVolume(cfg.gain);
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
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-5 z-30">
      {/* Top Bar: Player + Stage Pill Controls */}
      <div className="flex items-start justify-between gap-3">
        {/* Live YouTube Karaoke Video Player */}
        {youtubeVideoId ? (
          <div
            className={`pointer-events-auto rounded-xl overflow-hidden bg-black border border-white/15 shadow-2xl transition-all ${
              isPlayerCompact ? 'w-60 sm:w-72' : 'w-80 sm:w-[440px]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0f0f0f] text-xs text-neutral-200">
              <span className="inline-flex items-center gap-1.5 font-medium truncate">
                <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="truncate">{activeSong?.title ?? 'YouTube Karaoke'}</span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {queue.length > 0 && (
                  <button
                    onClick={handleNextInQueue}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold"
                    title="Bài tiếp theo trong hàng chờ"
                  >
                    Bài tiếp ({queue.length})
                  </button>
                )}
                <button
                  onClick={() => setIsPlayerCompact((c) => !c)}
                  className="p-1 text-neutral-400 hover:text-white"
                  title={isPlayerCompact ? 'Phóng to màn hình hát' : 'Thu nhỏ màn hình hát'}
                >
                  {isPlayerCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setYoutubeVideoId(null)}
                  className="p-1 text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <iframe
              ref={ytIframeRef}
              key={youtubeVideoId}
              className="w-full aspect-video"
              src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
              title="YouTube Karaoke Player"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              onLoad={() => {
                applyYoutubeVolume(musicVolume);
                window.setTimeout(() => applyYoutubeVolume(musicVolume), 600);
                window.setTimeout(() => applyYoutubeVolume(musicVolume), 1500);
              }}
            />
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
              }}
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="pointer-events-auto relative flex flex-col items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => setIsPickerOpen((p) => !p)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl border transition shadow-lg ${
                isPickerOpen
                  ? 'bg-red-600 text-white border-red-400/50'
                  : 'bg-neutral-950/80 hover:bg-neutral-900 text-white border-white/15'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              Chọn bài hát
              {queue.length > 0 && (
                <span className="ml-0.5 px-1.5 rounded-full bg-white/20 text-[10px]">
                  {queue.length}
                </span>
              )}
            </button>

            <button
              onClick={handleToggleMic}
              title={micError ?? 'Bật Micro thật với hiệu ứng Echo'}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl border transition shadow-lg ${
                micEnabled
                  ? 'bg-emerald-600/85 text-white border-emerald-400/50'
                  : 'bg-neutral-950/80 hover:bg-neutral-900 text-neutral-200 border-white/15'
              }`}
            >
              {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              <span>{micEnabled ? 'Mic Bật' : 'Mic'}</span>
              {micEnabled && (
                <span className="w-8 h-1.5 rounded-full bg-black/40 overflow-hidden">
                  <span
                    className="block h-full bg-emerald-200 transition-[width] duration-75"
                    style={{ width: `${Math.round(micLevel * 100)}%` }}
                  />
                </span>
              )}
            </button>

            <button
              onClick={handleToggleStyle}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl border transition shadow-lg ${
                style === 'dance'
                  ? 'bg-fuchsia-600/80 text-white border-fuchsia-400/50'
                  : 'bg-neutral-950/80 hover:bg-neutral-900 text-neutral-200 border-white/15'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {style === 'dance' ? 'Phiêu' : 'Nhẹ'}
            </button>

            <button
              onClick={() => {
                setIsMixerOpen((o) => {
                  const next = !o;
                  if (next) {
                    void karaokeAudio.listInputDevices().then(setInputDevices);
                  }
                  return next;
                });
              }}
              title="Cài đặt đầu vào & Âm thanh Mic"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl border transition shadow-lg ${
                isMixerOpen
                  ? 'bg-amber-500 text-stone-950 border-amber-300'
                  : 'bg-neutral-950/80 hover:bg-neutral-900 text-neutral-200 border-white/15'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Âm thanh
            </button>

            <button
              onClick={onExit}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-950/80 hover:bg-rose-600/85 text-neutral-200 hover:text-white border border-white/15 text-xs font-semibold backdrop-blur-xl transition shadow-lg"
            >
              <LogOut className="w-3.5 h-3.5" />
              Xuống (E)
            </button>
          </div>

          {isMixerOpen && (
            <div className="absolute right-0 top-full mt-2 z-40 w-80 rounded-2xl bg-[#121212]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-3.5 text-xs text-neutral-200 space-y-3">
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
              <div className="space-y-2 pt-1 border-t border-white/10 text-[11px]">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-sky-300 w-20">Nhạc nền</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={musicVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setMusicVolume(v);
                      applyYoutubeVolume(v);
                      karaokeAudio.setMusicVolume(v / 100);
                    }}
                    className="flex-1 accent-sky-400"
                  />
                  <span className="w-9 text-right font-mono">{musicVolume}%</span>
                </label>

                <label className="flex items-center justify-between gap-2">
                  <span className="text-emerald-300 w-20">Âm lượng Mic</span>
                  <input
                    type="range"
                    min={1.0}
                    max={6.5}
                    step={0.2}
                    value={micGain}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setActivePreset(null);
                      setMicGain(v);
                      karaokeAudio.setMicVolume(v);
                    }}
                    className="flex-1 accent-emerald-400"
                  />
                  <span className="w-9 text-right font-mono">{micGain.toFixed(1)}x</span>
                </label>

                <label className="flex items-center justify-between gap-2">
                  <span className="text-amber-300 w-20">Echo / Vang</span>
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
                  <span className="w-9 text-right font-mono">{Math.round(echoAmount * 100)}%</span>
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
