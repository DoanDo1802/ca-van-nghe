import React, { useState } from 'react';
import {
  Settings,
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
  Music,
  Sparkles,
  Check,
  MessageSquare,
  Hand,
  ChevronDown,
  Footprints
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
  isNightMode,
  onToggleNightMode,
  isAudioPlaying,
  onToggleAudio,
  onOpenMenu,
  onOpenReservation,
  onResetLayout,
  activeEmote,
  onTriggerEmote
}) {
  const [activeTab, setActiveTab] = useState('modes'); // 'modes' | 'audio' | 'graphics' | 'shortcuts'
  const [resetConfirm, setResetConfirm] = useState(false);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl bg-neutral-950/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Cài Đặt & Chế Độ Trải Nghiệm
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 border border-white/15 font-mono">
                  [Tab]
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Tuỳ chỉnh góc nhìn, chế độ điều khiển, âm thanh và không gian 3D
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-neutral-950/40 px-6 pt-2 space-x-2">
          <button
            onClick={() => setActiveTab('modes')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'modes'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Chế độ & Góc nhìn</span>
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'audio'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Sân khấu & Âm thanh</span>
          </button>

          <button
            onClick={() => setActiveTab('graphics')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'graphics'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Không gian & Tiện ích</span>
          </button>

          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'shortcuts'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Phím tắt</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* TAB 1: CHẾ ĐỘ & GÓC NHÌN */}
          {activeTab === 'modes' && (
            <div className="space-y-4">
              {/* Mode Toggle: Visitor vs Decor */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-neutral-200 flex items-center gap-2">
                      <Hammer className="w-4 h-4 text-amber-400" />
                      Chế độ Decor / Thiết Kế Bố Cục
                    </h4>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Chuyển sang chế độ tự do di chuyển, xoay và sắp xếp lại bàn ghế trong lounge
                    </p>
                  </div>
                  <button
                    onClick={onToggleDecoMode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isDecoMode
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {isDecoMode ? 'Đang bật Decor [B]' : 'Bật chế độ Decor [B]'}
                  </button>
                </div>
              </div>

              {/* Camera Mode: 3rd Person vs 1st Person */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-neutral-200 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-emerald-400" />
                      Góc Nhìn Camera Nhân Vật
                    </h4>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Chọn giữa góc nhìn toàn thân người thứ 3 hoặc góc nhìn thứ nhất (mắt nhìn)
                    </p>
                  </div>
                  <button
                    onClick={onToggleCameraMode}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white/5 hover:bg-white/10 text-neutral-200 border-white/10 transition flex items-center space-x-1.5"
                  >
                    {cameraMode === 'first' ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Góc nhìn thứ 1 [V]</span>
                      </>
                    ) : (
                      <>
                        <User className="w-3.5 h-3.5 text-amber-400" />
                        <span>Góc nhìn thứ 3 [V]</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Character Emotes / Animations */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div>
                  <h4 className="font-semibold text-neutral-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    Động Tác & Biểu Cảm Nhân Vật (Emotes)
                  </h4>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Thực hiện các cử chỉ, tương tác hoặc điệu nhảy đặc biệt (Phím tắt: 1 - 5)
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'talk', key: '1', label: 'Giao tiếp', icon: MessageSquare },
                    { id: 'interact', key: '2', label: 'Chào hỏi', icon: Hand },
                    { id: 'dance', key: '3', label: 'Nhún nhảy', icon: Sparkles },
                    { id: 'crouch', key: '4', label: 'Khuỵu gối', icon: ChevronDown },
                    { id: 'walkFormal', key: '5', label: 'Đi quý phái', icon: Footprints },
                  ].map((em) => {
                    const IconComp = em.icon;
                    const isActive = activeEmote === em.id;
                    return (
                      <button
                        key={em.id}
                        onClick={() => {
                          if (onTriggerEmote) onTriggerEmote(em.id);
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition ${
                          isActive
                            ? 'bg-purple-600/25 border-purple-500/50 text-purple-200 shadow-sm'
                            : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <IconComp className="w-3.5 h-3.5 text-purple-400" />
                          <span>{em.label}</span>
                        </div>
                        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-neutral-400">
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
            <div className="space-y-4">
              {/* Stage YouTube Screen Master */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-neutral-200 flex items-center gap-2">
                      <Tv className="w-4 h-4 text-red-400" />
                      Màn Hình LED Sân Khấu (10.4m x 5.85m)
                    </h4>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Trình chiếu video YouTube trực tiếp lên sân khấu chính
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={onToggleScreen}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        isScreenOn
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-red-500/20 text-red-300 border-red-500/40'
                      }`}
                    >
                      {isScreenOn ? 'Màn hình BẬT' : 'Màn hình TẮT'}
                    </button>
                    <button
                      onClick={() => {
                        onClose();
                        if (onOpenStageScreenModal) onOpenStageScreenModal();
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 transition"
                    >
                      Đổi link video
                    </button>
                  </div>
                </div>
              </div>

              {/* Stage Audio Mute Toggle */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-neutral-200 flex items-center gap-2">
                      {isStageVideoMuted ? (
                        <VolumeX className="w-4 h-4 text-neutral-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      )}
                      Âm Thanh Video Sân Khấu
                    </h4>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Bật hoặc tắt tiếng loa hòa nhạc sân khấu (Phím tắt: M)
                    </p>
                  </div>
                  <button
                    onClick={onToggleStageMute}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center space-x-1.5 ${
                      isStageVideoMuted
                        ? 'bg-neutral-800 text-neutral-400 border-white/10'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {isStageVideoMuted ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Đang tắt tiếng [M]</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Đang phát loa [M]</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Ambient Lounge Audio */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-neutral-200 flex items-center gap-2">
                      <Music className="w-4 h-4 text-amber-400" />
                      Nhạc Nền Không Gian Lounge
                    </h4>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Âm thanh mộc mạc Lofi / Jazz đệm nền cho quán
                    </p>
                  </div>
                  <button
                    onClick={onToggleAudio}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isAudioPlaying
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-white/5 text-neutral-400 border-white/10'
                    }`}
                  >
                    {isAudioPlaying ? 'Bật nhạc nền' : 'Tắt nhạc nền'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: KHÔNG GIAN & TIỆN ÍCH */}
          {activeTab === 'graphics' && (
            <div className="space-y-4">
              {/* Day/Night Lighting */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-neutral-200 flex items-center gap-2">
                      {isNightMode ? (
                        <Moon className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Sun className="w-4 h-4 text-amber-400" />
                      )}
                      Ánh Sáng & Thời Điểm
                    </h4>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Chuyển đổi giữa Đêm Acoustic huyền ảo hoặc Hoàng hôn ấm cúng
                    </p>
                  </div>
                  <button
                    onClick={onToggleNightMode}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 transition"
                  >
                    {isNightMode ? 'Chế độ Đêm (Night)' : 'Hoàng hôn (Sunset)'}
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              {(onOpenMenu || onOpenReservation) && (
                <div className="grid grid-cols-2 gap-3">
                  {onOpenMenu && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenMenu();
                      }}
                      className="p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-left transition flex items-center space-x-3"
                    >
                      <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300">
                        <Utensils className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-xs text-neutral-200">Xem Thực Đơn</div>
                        <div className="text-[11px] text-neutral-400">Đồ uống & Món ăn</div>
                      </div>
                    </button>
                  )}

                  {onOpenReservation && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenReservation();
                      }}
                      className="p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-left transition flex items-center space-x-3"
                    >
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-xs text-neutral-200">Đặt Bàn Lounge</div>
                        <div className="text-[11px] text-neutral-400">Chọn vị trí ngồi VIP</div>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* Reset Layout */}
              {onResetLayout && (
                <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-red-200 text-xs flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-red-400" />
                      Khôi Phục Bố Cục Bàn Ghế Gốc
                    </h4>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Đặt lại toàn bộ vị trí bàn ghế và đồ trang trí về chuẩn ban đầu
                    </p>
                  </div>
                  <button
                    onClick={handleResetClick}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      resetConfirm
                        ? 'bg-red-600 text-white border-red-500 font-bold animate-pulse'
                        : 'bg-red-900/30 text-red-300 border-red-500/30 hover:bg-red-900/50'
                    }`}
                  >
                    {resetConfirm ? 'Xác nhận đặt lại?' : 'Khôi phục'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: HƯỚNG DẪN PHÍM TẮT */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { key: 'Tab', desc: 'Mở / Đóng bảng Cài Đặt & Chế Độ này' },
                  { key: 'W / A / S / D', desc: 'Di chuyển nhân vật (hoặc phím mũi tên)' },
                  { key: 'Shift', desc: 'Giữ để chạy nhanh (Sprint)' },
                  { key: 'Space', desc: 'Nhảy bật cao' },
                  { key: 'E', desc: 'Ngồi xuống ghế / Đứng dậy' },
                  { key: 'V', desc: 'Đổi góc nhìn thứ 1 (Mắt nhìn) / thứ 3 (Toàn thân)' },
                  { key: 'B', desc: 'Bật / Tắt chế độ Decor thiết kế bàn ghế' },
                  { key: 'M', desc: 'Bật / Tắt loa màn hình LED sân khấu' },
                  { key: '1 - 5', desc: 'Kích hoạt động tác cảm xúc (Chào, Nhún nhảy...)' },
                  { key: 'G / R', desc: 'Chuyển Di chuyển / Xoay đồ vật trong Decor' },
                  { key: 'Del / Backspace', desc: 'Xóa vật phẩm đang chọn trong Decor' },
                  { key: 'Esc', desc: 'Thoát lựa chọn / Đóng bảng điều khiển' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]"
                  >
                    <span className="text-neutral-400 text-[11px]">{item.desc}</span>
                    <span className="px-2 py-0.5 rounded bg-white/10 font-mono text-[11px] font-bold text-amber-300 border border-white/15">
                      {item.key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/10 bg-neutral-900/60">
          <span className="text-[11px] text-neutral-400">
            Mẹo: Bạn có thể nhấn <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-neutral-300">Tab</kbd> hoặc <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-neutral-300">Esc</kbd> bất kỳ lúc nào để đóng bảng này
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs tracking-wide shadow-lg transition active:scale-95"
          >
            Đóng [Tab]
          </button>
        </div>
      </div>
    </div>
  );
}

