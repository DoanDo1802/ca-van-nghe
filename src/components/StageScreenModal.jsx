import React, { useState } from 'react';
import { Tv, X, Play, Volume2, VolumeX, Power, Youtube, Sparkles, Check } from 'lucide-react';

function parseYouTubeVideoId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const match = str.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

const PRESET_VIDEOS = [
  {
    id: 'lTRiuFIWV54',
    title: '1 A.M Study Session - Lofi Hip Hop Beats',
    tag: 'Lofi Chill',
    desc: 'Âm thanh êm dịu, ấm cúng hoàn hảo cho không gian lounge'
  },
  {
    id: 'fEvM-OUbaKs',
    title: 'Coffee Jazz Lounge - Soft Jazz Instrumental',
    tag: 'Jazz Lounge',
    desc: 'Giai điệu Jazz quý phái, chuẩn phong cách quán bar đêm sang trọng'
  },
  {
    id: 'DWcJFNfaw9c',
    title: 'Lofi Hip Hop Radio - Beats to Sleep/Chill',
    tag: 'Acoustic & Lofi',
    desc: 'Âm nhạc mộc mạc lắng đọng cho không gian Ca Văn Nghệ'
  },
  {
    id: 'S-Xm7s9eGxU',
    title: 'Erik Satie - Gymnopédie No.1 Piano Classical',
    tag: 'Piano Solo',
    desc: 'Giai điệu dương cầm cổ điển bất hủ đầy cảm xúc'
  }
];

export default function StageScreenModal({
  isOpen,
  onClose,
  currentVideoId,
  onChangeVideo,
  isMuted,
  onToggleMute,
  isScreenOn,
  onToggleScreen
}) {
  const [inputUrl, setInputUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [justApplied, setJustApplied] = useState(false);

  if (!isOpen) return null;

  const handleApply = (e) => {
    e?.preventDefault();
    setErrorMsg('');
    const id = parseYouTubeVideoId(inputUrl);
    if (!id) {
      setErrorMsg('Vui lòng nhập đúng định dạng link YouTube (vd: https://youtube.com/watch?v=... hoặc https://youtu.be/...)');
      return;
    }
    onChangeVideo(id);
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 2000);
  };

  const handleSelectPreset = (id) => {
    setErrorMsg('');
    setInputUrl('');
    onChangeVideo(id);
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 2000);
  };

  const parsedPreviewId = parseYouTubeVideoId(inputUrl) || currentVideoId;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Màn Hình LED Sân Khấu 3D
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 border border-red-500/30 font-mono">
                  YouTube Live
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Phát video YouTube trực tiếp lên màn hình LED 10.4m x 5.85m giữa sân khấu
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
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Controls Bar */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950 border border-white/10">
            <div className="flex items-center space-x-2">
              <button
                onClick={onToggleScreen}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition ${
                  isScreenOn
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                    : 'bg-white/5 text-neutral-400 border border-white/10 hover:text-white'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isScreenOn ? 'Màn hình: BẬT' : 'Màn hình: TẮT'}</span>
              </button>

              <button
                onClick={onToggleMute}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition ${
                  !isMuted
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                    : 'bg-white/5 text-neutral-400 border border-white/10 hover:text-white'
                }`}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'Âm thanh: TẮT (Mute)' : 'Âm thanh: BẬT'}</span>
              </button>
            </div>

            <div className="text-[11px] font-mono text-neutral-400">
              ID: <span className="text-white font-bold">{currentVideoId || 'None'}</span>
            </div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleApply} className="space-y-2">
            <label className="block text-xs font-medium text-neutral-300">
              Nhập link hoặc Video ID từ YouTube:
            </label>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => {
                    setInputUrl(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="https://www.youtube.com/watch?v=... hoặc https://youtu.be/..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-white text-xs placeholder:text-neutral-500 focus:outline-none focus:border-red-500 transition"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow-lg shadow-red-900/40 transition shrink-0"
              >
                {justApplied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-200" />
                    <span>Đã phát!</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Phát video</span>
                  </>
                )}
              </button>
            </div>

            {errorMsg && <p className="text-xs text-rose-400 mt-1">{errorMsg}</p>}
          </form>

          {/* Current Thumbnail Preview */}
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
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Gợi ý video không gian Ca Văn Nghệ / Lounge:</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESET_VIDEOS.map((preset) => {
                const isActive = currentVideoId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset.id)}
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
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-neutral-950/60 flex items-center justify-between">
          <p className="text-[11px] text-neutral-500">
            Mẹo: Bạn cũng có thể bấm vào màn hình ở giữa sân khấu để đổi video bất cứ lúc nào.
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

