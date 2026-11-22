import React, { useEffect, useRef, useState } from 'react';
import {
  Tv,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Power,
  Youtube,
  Sparkles,
  Check,
  Upload,
  Radio,
  Link2,
  RefreshCw,
} from 'lucide-react';

function parseYouTubeVideoId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const match = str.match(
    /(?:youtu\.be\/|(?:youtube|youtube-nocookie)\.com\/(?:embed\/|v\/|live\/|shorts\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

const PRESET_VIDEOS = [
  {
    id: 'lTRiuFIWV54',
    title: '1 A.M Study Session - Lofi Hip Hop Beats',
    tag: 'Lofi Chill',
    desc: 'Âm thanh êm dịu, ấm cúng hoàn hảo cho không gian lounge',
  },
  {
    id: 'fEvM-OUbaKs',
    title: 'Coffee Jazz Lounge - Soft Jazz Instrumental',
    tag: 'Jazz Lounge',
    desc: 'Giai điệu Jazz quý phái, chuẩn phong cách quán bar đêm sang trọng',
  },
  {
    id: 'DWcJFNfaw9c',
    title: 'Lofi Hip Hop Radio - Beats to Sleep/Chill',
    tag: 'Acoustic & Lofi',
    desc: 'Âm nhạc mộc mạc lắng đọng cho không gian Ca Văn Nghệ',
  },
  {
    id: 'S-Xm7s9eGxU',
    title: 'Erik Satie - Gymnopédie No.1 Piano Classical',
    tag: 'Piano Solo',
    desc: 'Giai điệu dương cầm cổ điển bất hủ đầy cảm xúc',
  },
];

const SPATIAL_MEDIA_PRESETS = [
  {
    url: '/media/bello-ballo.mp4',
    title: 'Live Acoustic Session — Bello Ballo',
    tag: 'Video + 3D Audio',
    desc: 'Phát trực tiếp lên màn hình LED chính và 2 loa trước sân khấu',
  },
];

/**
 * @param {{
 *   isOpen: boolean;
 *   onClose: () => void;
 *   currentVideoId?: string;
 *   onChangeVideo?: (id: string) => void;
 *   spatialMode?: boolean;
 *   isHost?: boolean;
 *   onResyncStage?: () => void;
 *   onSyncLiveEdge?: () => void;
 *   sourceType?: 'media' | 'youtube';
 *   currentMediaUrl?: string;
 *   currentMediaTitle?: string;
 *   youtubeQuality?: string;
 *   onChangeYouTubeQuality?: (quality: string) => void;
 *   renderScale?: number;
 *   onChangeRenderScale?: (scale: number) => void;
 *   isPlaying?: boolean;
 *   onTogglePlay?: () => void;
 *   volume?: number;
 *   onVolumeChange?: (volume: number) => void;
 *   onChangeMedia?: (url: string, title?: string) => void;
 *   onChangeYouTube?: (videoId: string, title?: string) => void;
 *   isMuted: boolean;
 *   onToggleMute: () => void;
 *   isScreenOn: boolean;
 *   onToggleScreen: () => void;
 * }} props
 */
export default function StageScreenModal({
  isOpen,
  onClose,
  currentVideoId = '',
  onChangeVideo,
  spatialMode = false,
  isHost = true,
  onResyncStage,
  onSyncLiveEdge,
  sourceType = 'media',
  currentMediaUrl = '',
  currentMediaTitle = '',
  youtubeQuality = 'hd720',
  onChangeYouTubeQuality,
  renderScale = 1,
  onChangeRenderScale,
  isPlaying = true,
  onTogglePlay,
  volume = 0.8,
  onVolumeChange,
  onChangeMedia,
  onChangeYouTube,
  isMuted,
  onToggleMute,
  isScreenOn,
  onToggleScreen,
}) {
  const [inputUrl, setInputUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [justApplied, setJustApplied] = useState(false);
  const [justSyncedLive, setJustSyncedLive] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const onMediaError = (e) => {
      const msg = e?.detail;
      if (typeof msg === 'string' && msg) {
        setJustApplied(false);
        setErrorMsg(msg);
      }
    };
    window.addEventListener('cavannghe:stage-media-error', onMediaError);
    return () => window.removeEventListener('cavannghe:stage-media-error', onMediaError);
  }, []);

  if (!isOpen) return null;

  const triggerAppliedFeedback = () => {
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 2000);
  };

  const handleSyncLiveEdge = () => {
    if (!isHost || !onSyncLiveEdge) return;
    onSyncLiveEdge();
    setJustSyncedLive(true);
    setTimeout(() => setJustSyncedLive(false), 2000);
  };

  const handleApply = (e) => {
    e?.preventDefault();
    setErrorMsg('');

    if (spatialMode) {
      const trimmed = inputUrl.trim();
      if (!trimmed) {
        setErrorMsg('Vui lòng nhập link YouTube, đường dẫn .mp4/.mp3 hoặc chọn file từ máy.');
        return;
      }
      const ytId = parseYouTubeVideoId(trimmed);
      if (ytId && onChangeYouTube) {
        onChangeYouTube(ytId, `YouTube (${ytId})`);
        triggerAppliedFeedback();
        return;
      }
      if (onChangeMedia) {
        const fileName = trimmed.split('/').pop()?.split('?')[0] || 'Media tùy chỉnh';
        onChangeMedia(trimmed, fileName);
        triggerAppliedFeedback();
      }
      return;
    }

    const id = parseYouTubeVideoId(inputUrl);
    if (!id) {
      setErrorMsg(
        'Vui lòng nhập đúng định dạng link YouTube (vd: https://youtube.com/watch?v=... hoặc https://youtu.be/...)'
      );
      return;
    }
    onChangeVideo?.(id);
    triggerAppliedFeedback();
  };

  const handleSelectPreset = (preset) => {
    setErrorMsg('');
    setInputUrl('');
    if (spatialMode && onChangeYouTube) {
      onChangeYouTube(preset.id, preset.title);
    } else {
      onChangeVideo?.(preset.id);
    }
    triggerAppliedFeedback();
  };

  const handleSelectSpatialPreset = (preset) => {
    setErrorMsg('');
    setInputUrl('');
    onChangeMedia?.(preset.url, preset.title);
    triggerAppliedFeedback();
  };

  const handleLocalFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !onChangeMedia) return;
    setErrorMsg('');
    const blobUrl = URL.createObjectURL(file);
    onChangeMedia(blobUrl, file.name);
    triggerAppliedFeedback();
    e.target.value = '';
  };

  const parsedPreviewId = !spatialMode ? parseYouTubeVideoId(inputUrl) || currentVideoId : null;
  const volumePercent = Math.round((isMuted ? 0 : volume) * 100);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Màn Hình LED Sân Khấu 3D
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  {spatialMode ? '3D Spatial Audio • 2 Loa Trước' : 'YouTube Live'}
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                {spatialMode
                  ? 'Phát video & âm thanh 3D (HRTF) từ 2 loa phía trước sân khấu'
                  : 'Phát video YouTube trực tiếp lên màn hình LED 10.4m x 5.85m giữa sân khấu'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {spatialMode && !isHost && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
              <span>
                Bạn đang ở chế độ <strong>Khách</strong> — Chỉ <strong>Chủ phòng</strong> mới có quyền đổi video/nhạc sân khấu.
              </span>
              {onResyncStage && (
                <button
                  type="button"
                  onClick={onResyncStage}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-medium transition"
                >
                  Đồng bộ lại
                </button>
              )}
            </div>
          )}

          {/* Quick Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-neutral-950 border border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onToggleScreen}
                disabled={spatialMode && !isHost}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition disabled:opacity-45 disabled:cursor-not-allowed ${
                  isScreenOn
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                    : 'bg-white/5 text-neutral-400 border border-white/10 hover:text-white'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isScreenOn ? 'Màn hình: BẬT' : 'Màn hình: TẮT'}</span>
              </button>

              {spatialMode && onTogglePlay && (
                <button
                  onClick={onTogglePlay}
                  disabled={!isHost}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition disabled:opacity-45 disabled:cursor-not-allowed ${
                    isPlaying
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30'
                      : 'bg-white/5 text-neutral-300 border border-white/10 hover:text-white'
                  }`}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Đang phát' : 'Tạm dừng'}</span>
                </button>
              )}

              <button
                onClick={onToggleMute}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition ${
                  !isMuted
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                    : 'bg-white/5 text-neutral-400 border border-white/10 hover:text-white'
                }`}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'Loa: TẮT (Mute)' : 'Loa: BẬT'}</span>
              </button>

              {spatialMode && onSyncLiveEdge && isHost && (
                <button
                  type="button"
                  onClick={handleSyncLiveEdge}
                  disabled={sourceType === 'media' && currentMediaUrl.startsWith('blob:')}
                  title={
                    sourceType === 'media' && currentMediaUrl.startsWith('blob:')
                      ? 'File chọn từ máy không phải luồng live'
                      : 'Cập nhật luồng live tới điểm mới nhất cho chủ phòng và tất cả người xem'
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition disabled:opacity-45 disabled:cursor-not-allowed ${
                    justSyncedLive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                  }`}
                >
                  {justSyncedLive ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Đã bắt Live!</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Cập nhật Live</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {!spatialMode && (
              <div className="text-[11px] font-mono text-neutral-400">
                ID: <span className="text-white font-bold">{currentVideoId || 'None'}</span>
              </div>
            )}
          </div>

          {/* 3D Speaker Volume Slider */}
          {spatialMode && onVolumeChange && (
            <div className="p-4 rounded-xl bg-neutral-950 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-200 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-amber-400" />
                  Âm lượng 2 loa trước sân khấu (3D Spatial)
                </span>
                <span className="font-mono text-amber-300 font-bold">{volumePercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={volumePercent}
                onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[11px] text-neutral-400">
                Âm thanh được phát 3D từ cặp loa phía trước. Di chuyển lại gần hoặc xoay góc nhìn để nghe hiệu ứng trái/phải.
              </p>
            </div>
          )}

          {/* Resolution & Video Quality Controls */}
          {spatialMode && (onChangeYouTubeQuality || onChangeRenderScale) && (
            <div className="p-4 rounded-xl bg-neutral-950 border border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {onChangeYouTubeQuality && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-300">
                    Độ phân giải Video (YouTube)
                  </label>
                  <select
                    value={youtubeQuality}
                    onChange={(e) => onChangeYouTubeQuality(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="default">Tự động (Auto)</option>
                    <option value="small">240p (Siêu nhẹ)</option>
                    <option value="medium">360p (Nhẹ)</option>
                    <option value="large">480p (Tiêu chuẩn)</option>
                    <option value="hd720">720p HD</option>
                    <option value="hd1080">1080p Full HD</option>
                  </select>
                </div>
              )}

              {onChangeRenderScale && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-300">
                    Độ phân giải Render 3D
                  </label>
                  <select
                    value={String(renderScale)}
                    onChange={(e) => onChangeRenderScale(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="0.5">0.5x (Hiệu năng cao)</option>
                    <option value="0.75">0.75x (Cân bằng)</option>
                    <option value="1">1.0x (Chuẩn Native)</option>
                    <option value="1.5">1.5x (Sắc nét)</option>
                    <option value="2">2.0x (Ultra HD)</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Input Form */}
          {(!spatialMode || isHost) && (
          <form onSubmit={handleApply} className="space-y-2">
            <label className="block text-xs font-medium text-neutral-300">
              {spatialMode
                ? 'Dán link YouTube, link Video/Audio (.mp4, .mp3) hoặc chọn file từ máy:'
                : 'Nhập link hoặc Video ID từ YouTube:'}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                {spatialMode ? (
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
                ) : (
                  <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                )}
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => {
                    setInputUrl(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder={
                    spatialMode
                      ? 'https://youtube.com/watch?v=... hoặc /media/bello-ballo.mp4'
                      : 'https://www.youtube.com/watch?v=... hoặc https://youtu.be/...'
                  }
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-white text-xs placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow-lg shadow-amber-900/30 transition shrink-0"
              >
                {justApplied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-100" />
                    <span>Đã phát!</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Phát lên màn</span>
                  </>
                )}
              </button>

              {spatialMode && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,audio/*"
                    onChange={handleLocalFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-neutral-200 font-medium text-xs flex items-center space-x-1.5 transition shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Chọn file máy</span>
                  </button>
                </>
              )}
            </div>

            {errorMsg && <p className="text-xs text-rose-400 mt-1">{errorMsg}</p>}
          </form>
          )}

          {/* Now Playing Banner (Spatial Mode) */}
          {spatialMode && (
            <div className="p-3.5 rounded-xl bg-neutral-950 border border-amber-500/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isPlaying && isScreenOn ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {currentMediaTitle || currentMediaUrl || 'Chưa chọn media'}
                  </p>
                  <p className="text-[11px] font-mono text-neutral-400 truncate">
                    {sourceType === 'youtube'
                      ? `YouTube (${currentVideoId}) • Âm lượng theo khoảng cách 2 loa trước`
                      : currentMediaUrl}
                  </p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono shrink-0">
                {isPlaying && isScreenOn ? 'LIVE 3D' : 'PAUSED'}
              </span>
            </div>
          )}

          {/* Current Thumbnail Preview (Legacy YouTube Mode) */}
          {parsedPreviewId && (
            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-neutral-950 aspect-video max-h-44 flex items-center justify-center group">
              <img
                src={`https://img.youtube.com/vi/${parsedPreviewId}/hqdefault.jpg`}
                alt="YouTube Preview"
                className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono text-[11px] truncate">Đang chọn: {parsedPreviewId}</span>
                </div>
                <span className="text-[10px] bg-red-600/80 px-2 py-0.5 rounded font-mono">16:9 IMAX</span>
              </div>
            </div>
          )}

          {/* Curated Presets */}
          {(!spatialMode || isHost) && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {spatialMode
                  ? 'Nguồn phát 3D có sẵn:'
                  : 'Gợi ý video không gian Ca Văn Nghệ / Lounge:'}
              </span>
            </div>

            {spatialMode && (
              <div className="grid grid-cols-1 gap-2.5">
                {SPATIAL_MEDIA_PRESETS.map((preset) => {
                  const isActive = sourceType === 'media' && currentMediaUrl === preset.url;
                  return (
                    <button
                      key={preset.url}
                      onClick={() => handleSelectSpatialPreset(preset)}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition ${
                        isActive
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-neutral-950 hover:bg-neutral-800 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">
                            {preset.tag}
                          </span>
                          {isActive && (
                            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Đang chọn
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-white truncate mt-1">{preset.title}</p>
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">{preset.desc}</p>
                      </div>
                      <Play className="w-4 h-4 text-amber-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESET_VIDEOS.map((preset) => {
                const isActive =
                  (!spatialMode || sourceType === 'youtube') && currentVideoId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-3 rounded-xl border text-left flex items-start space-x-3 transition ${
                      isActive
                        ? 'bg-red-500/10 border-red-500/40'
                        : 'bg-neutral-950 hover:bg-neutral-800 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="w-12 h-10 rounded-lg overflow-hidden shrink-0 bg-neutral-800 border border-white/10">
                      <img
                        src={`https://img.youtube.com/vi/${preset.id}/mqdefault.jpg`}
                        alt={preset.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-neutral-300">
                          {preset.tag}
                        </span>
                        {isActive && (
                          <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Đang phát
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-white truncate mt-1">{preset.title}</p>
                      <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">{preset.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-neutral-950/60 flex items-center justify-between">
          <p className="text-[11px] text-neutral-500">
            Mẹo: Lại gần màn hình sân khấu và nhấn E để mở bảng điều khiển âm thanh 3D.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
