import React, { useState } from 'react';
import {
  X,
  Sliders,
  Tv,
  Volume2,
  VolumeX,
  Eye,
  User,
  Hammer,
  Moon,
  Sun,
  RotateCcw,
  Utensils,
  Calendar,
  Keyboard,
  Sparkles,
  MessageSquare,
  Hand,
  ChevronDown,
  Footprints,
  Gauge,
} from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  cameraMode,
  onToggleCameraMode,
  isDecoMode,
  onToggleDecoMode,
  isScreenOn,
  onToggleScreen,
  isStageVideoMuted,
  onToggleStageMute,
  onOpenStageScreenModal,
  karaokeTurnControl = /** @type {React.ReactNode} */ (null),
  isNightMode,
  onToggleNightMode,
  onOpenMenu,
  onOpenReservation,
  onResetLayout,
  activeEmote,
  onTriggerEmote,
  renderScale = 1,
  onChangeRenderScale,
}) {
  const [activeTab, setActiveTab] = useState('modes'); // 'modes' | 'audio' | 'graphics' | 'shortcuts'
  const [resetConfirm, setResetConfirm] = useState(false);
  const [camSensitivity, setCamSensitivity] = useState(() => {
    const saved = Number(localStorage.getItem('cavannghe:cam-sensitivity'));
    return Number.isFinite(saved) && saved >= 0.2 && saved <= 3 ? saved : 1.0;
  });
  const [showFps, setShowFps] = useState(
    () => localStorage.getItem('cavannghe:show-fps') === '1'
  );
  const [showPing, setShowPing] = useState(
    () => localStorage.getItem('cavannghe:show-ping') !== '0'
  );

  if (!isOpen) return null;

  const handleSensitivityChange = (val) => {
    setCamSensitivity(val);
    localStorage.setItem('cavannghe:cam-sensitivity', String(val));
    window.dispatchEvent(new CustomEvent('cavannghe:camera-sensitivity', { detail: val }));
  };

  const handleToggleFps = () => {
    const next = !showFps;
    setShowFps(next);
    localStorage.setItem('cavannghe:show-fps', next ? '1' : '0');
    window.dispatchEvent(new CustomEvent('cavannghe:show-fps', { detail: next }));
  };

  const handleTogglePing = () => {
    const next = !showPing;
    setShowPing(next);
    localStorage.setItem('cavannghe:show-ping', next ? '1' : '0');
    window.dispatchEvent(new CustomEvent('cavannghe:show-ping', { detail: next }));
  };

  const handleResetClick = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 4000);
      return;
    }
    if (onResetLayout) onResetLayout();
    setResetConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-neutral-300" />
            <h2 className="text-sm font-semibold text-white">Cài đặt</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-neutral-400 font-mono">
              Tab
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 overflow-x-auto">
          {[
            { id: 'modes', label: 'Điều khiển & Camera', icon: User },
            { id: 'audio', label: 'Sân khấu & Âm thanh', icon: Tv },
            { id: 'graphics', label: 'Đồ họa & FPS', icon: Gauge },
            { id: 'shortcuts', label: 'Phím tắt', icon: Keyboard },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 shrink-0 ${
                  active
                    ? 'bg-white text-black font-semibold'
                    : 'bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-3 text-sm">
          {/* TAB 1: ĐIỀU KHIỂN & CAMERA */}
          {activeTab === 'modes' && (
            <div className="space-y-3">
              {/* Camera Sensitivity */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Độ nhạy xoay camera</h4>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Điều chỉnh tốc độ xoay góc nhìn theo chuột
                    </p>
                  </div>
                  <span className="text-xs font-mono text-white bg-white/10 px-2 py-0.5 rounded">
                    {camSensitivity.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={2.5}
                  step={0.1}
                  value={camSensitivity}
                  onChange={(e) => handleSensitivityChange(Number(e.target.value))}
                  className="w-full accent-white cursor-pointer"
                />
              </div>

              {/* Camera Mode */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                    <Eye className="w-4 h-4 text-neutral-400" />
                    Góc nhìn camera
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Chuyển giữa góc nhìn thứ 3 và góc nhìn thứ 1
                  </p>
                </div>
                <button
                  onClick={onToggleCameraMode}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white/5 hover:bg-white/10 text-neutral-200 border-white/10 transition shrink-0"
                >
                  {cameraMode === 'first' ? 'Thứ 1 [V]' : 'Thứ 3 [V]'}
                </button>
              </div>

              {onToggleDecoMode && (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                      <Hammer className="w-4 h-4 text-neutral-400" />
                      Chế độ Decor
                    </h4>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Sắp xếp bàn ghế và đồ vật trong phòng
                    </p>
                  </div>
                  <button
                    onClick={onToggleDecoMode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition shrink-0 ${
                      isDecoMode
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {isDecoMode ? 'Đang bật [B]' : 'Bật Decor [B]'}
                  </button>
                </div>
              )}

              {/* Character Emotes */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">Động tác nhân vật (1 - 5)</h4>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'talk', key: '1', label: 'Giao tiếp', icon: MessageSquare },
                    { id: 'interact', key: '2', label: 'Chào hỏi', icon: Hand },
                    { id: 'dance', key: '3', label: 'Nhún nhảy', icon: Sparkles },
                    { id: 'crouch', key: '4', label: 'Khuỵu gối', icon: ChevronDown },
                    { id: 'walkFormal', key: '5', label: 'Đi quý phái', icon: Footprints },
                    { id: 'samba', key: '6', label: 'Nhảy Samba', icon: Sparkles },
                    { id: 'hiphop', key: '7', label: 'Slide Hip Hop', icon: Sparkles },
                    { id: 'swing', key: '8', label: 'Swing Dance', icon: Sparkles },
                    { id: 'wavehiphop', key: '9', label: 'Wave Hip Hop', icon: Sparkles },
                    { id: 'twerk', key: '0', label: 'Dancing Twerk', icon: Sparkles },
                  ].map((em) => {
                    const IconComp = em.icon;
                    const isActive = activeEmote === em.id;
                    return (
                      <button
                        key={em.id}
                        onClick={() => onTriggerEmote?.(em.id)}
                        className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition ${
                          isActive
                            ? 'bg-white text-black border-white'
                            : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <IconComp className="w-3.5 h-3.5" />
                          <span>{em.label}</span>
                        </div>
                        <kbd
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                            isActive ? 'bg-black/10 text-black' : 'bg-white/10 text-neutral-400'
                          }`}
                        >
                          {em.key}
                        </kbd>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SÂN KHẤU & ÂM THANH */}
          {activeTab === 'audio' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                    <Tv className="w-4 h-4 text-neutral-400" />
                    Màn hình sân khấu
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Bật/tắt hoặc đổi video trình chiếu trên sân khấu
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={onToggleScreen}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isScreenOn
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-neutral-300 border-white/10'
                    }`}
                  >
                    {isScreenOn ? 'Đang BẬT' : 'Đang TẮT'}
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenStageScreenModal?.();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/10 transition"
                  >
                    Đổi video
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                    {isStageVideoMuted ? (
                      <VolumeX className="w-4 h-4 text-neutral-400" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-neutral-400" />
                    )}
                    Âm thanh sân khấu
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Bật hoặc tắt tiếng loa sân khấu [M]
                  </p>
                </div>
                <button
                  onClick={onToggleStageMute}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition shrink-0 ${
                    isStageVideoMuted
                      ? 'bg-white/5 text-neutral-400 border-white/10'
                      : 'bg-white text-black border-white'
                  }`}
                >
                  {isStageVideoMuted ? 'Đang tắt [M]' : 'Đang bật [M]'}
                </button>
              </div>

              {karaokeTurnControl}
            </div>
          )}

          {/* TAB 3: ĐỒ HỌA & FPS */}
          {activeTab === 'graphics' && (
            <div className="space-y-3">
              {/* Show FPS */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-white">Hiển thị FPS</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Hiện bộ đếm khung hình ở góc trên bên phải
                  </p>
                </div>
                <button
                  onClick={handleToggleFps}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition shrink-0 ${
                    showFps
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {showFps ? 'Đang bật' : 'Đang tắt'}
                </button>
              </div>

              {/* Show Ping */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-white">Hiển thị Ping mạng</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Hiện độ trễ kết nối phòng (ms) ở góc trên bên phải
                  </p>
                </div>
                <button
                  onClick={handleTogglePing}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition shrink-0 ${
                    showPing
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {showPing ? 'Đang bật' : 'Đang tắt'}
                </button>
              </div>

              {/* Render Scale */}
              {onChangeRenderScale && (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white">Độ nét đồ họa (Render Scale)</h4>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        Giảm xuống 0.75x để tăng FPS trên máy yếu
                      </p>
                    </div>
                    <span className="text-xs font-mono text-white bg-white/10 px-2 py-0.5 rounded">
                      {renderScale}x
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[0.75, 1, 1.25, 1.5].map((scale) => (
                      <button
                        key={scale}
                        onClick={() => onChangeRenderScale(scale)}
                        className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                          renderScale === scale
                            ? 'bg-white text-black border-white'
                            : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {scale}x
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Day/Night Lighting */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                    {isNightMode ? (
                      <Moon className="w-4 h-4 text-neutral-400" />
                    ) : (
                      <Sun className="w-4 h-4 text-neutral-400" />
                    )}
                    Ánh sáng không gian
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Đổi giữa chế độ Đêm và Hoàng hôn
                  </p>
                </div>
                <button
                  onClick={onToggleNightMode}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 transition shrink-0"
                >
                  {isNightMode ? 'Đêm' : 'Hoàng hôn'}
                </button>
              </div>

              {(onOpenMenu || onOpenReservation) && (
                <div className="grid grid-cols-2 gap-2.5">
                  {onOpenMenu && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenMenu();
                      }}
                      className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-left transition flex items-center gap-2.5"
                    >
                      <Utensils className="w-4 h-4 text-neutral-400" />
                      <span className="text-xs font-medium text-neutral-200">Xem Thực Đơn</span>
                    </button>
                  )}

                  {onOpenReservation && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenReservation();
                      }}
                      className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-left transition flex items-center gap-2.5"
                    >
                      <Calendar className="w-4 h-4 text-neutral-400" />
                      <span className="text-xs font-medium text-neutral-200">Đặt Bàn Lounge</span>
                    </button>
                  )}
                </div>
              )}

              {onResetLayout && (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-neutral-200 text-xs flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
                      Khôi phục bố cục gốc
                    </h4>
                  </div>
                  <button
                    onClick={handleResetClick}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      resetConfirm
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {resetConfirm ? 'Xác nhận?' : 'Khôi phục'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PHÍM TẮT */}
          {activeTab === 'shortcuts' && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { key: 'Tab', desc: 'Mở / Đóng bảng Cài đặt' },
                { key: 'W A S D', desc: 'Di chuyển nhân vật' },
                { key: 'Shift', desc: 'Chạy nhanh' },
                { key: 'Space', desc: 'Nhảy' },
                { key: 'E', desc: 'Tương tác / Ngồi ghế / Hát' },
                { key: 'V', desc: 'Đổi góc nhìn thứ 1 / thứ 3' },
                { key: 'Cuộn chuột', desc: 'Đưa camera lại gần / ra xa' },
                { key: 'M', desc: 'Bật / Tắt loa sân khấu' },
                { key: '1 - 5', desc: 'Động tác nhân vật' },
                { key: 'Esc', desc: 'Nhả chuột / Đóng bảng' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] border border-white/10"
                >
                  <span className="text-neutral-400 text-[11px]">{item.desc}</span>
                  <span className="px-2 py-0.5 rounded bg-white/10 font-mono text-[11px] text-white">
                    {item.key}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/10">
          <span className="text-[11px] text-neutral-400">
            Nhấn <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-neutral-300">Tab</kbd> hoặc <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-neutral-300">Esc</kbd> để đóng
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition"
          >
            Đóng [Tab]
          </button>
        </div>
      </div>
    </div>
  );
}
