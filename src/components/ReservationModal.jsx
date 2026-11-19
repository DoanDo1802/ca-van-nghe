import React, { useState } from 'react';
import { X, Calendar, Clock, Users, MapPin, CheckCircle, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function ReservationModal({ isOpen, onClose }) {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    guests: '2',
    date: 'Hôm nay',
    time: '19:30',
    area: 'Quầy Bar Pha Chế'
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#ffffff', '#e5e5e5', '#d4a373']
    });
  };

  const resetForm = () => {
    setSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn select-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg bg-neutral-950/95 backdrop-blur-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 p-6 sm:p-7 animate-scaleUp">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>

        {!submitted ? (
          <div>
            <div className="mb-5">
              <span className="text-[10px] font-mono font-medium text-neutral-400 uppercase tracking-widest flex items-center space-x-1.5">
                <Sparkles className="w-3 h-3 text-neutral-400" />
                <span>Trải Nghiệm Trực Tiếp</span>
              </span>
              <h3 className="text-xl font-serif font-bold text-neutral-100 mt-1">
                Đặt Bàn Ca Văn Nghệ
              </h3>
              <p className="text-xs text-neutral-400 mt-1 font-sans">
                Chọn vị trí lý tưởng để thưởng thức cafe, cocktail và âm nhạc acoustic sống động.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nguyễn Văn A"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-white/30 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0912 345 678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-white/30 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1 flex items-center space-x-1">
                    <Users className="w-3 h-3 text-neutral-400" />
                    <span>Số khách</span>
                  </label>
                  <select
                    value={formData.guests}
                    onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-white/30"
                  >
                    {[1, 2, 3, 4, 5, 6, '8+'].map((num) => (
                      <option key={num} value={num} className="bg-neutral-900 text-white">
                        {num} người
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1 flex items-center space-x-1">
                    <Calendar className="w-3 h-3 text-neutral-400" />
                    <span>Ngày</span>
                  </label>
                  <select
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-white/30"
                  >
                    <option value="Hôm nay" className="bg-neutral-900 text-white">Hôm nay</option>
                    <option value="Ngày mai" className="bg-neutral-900 text-white">Ngày mai</option>
                    <option value="Cuối tuần" className="bg-neutral-900 text-white">Cuối tuần</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1 flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-neutral-400" />
                    <span>Giờ đến</span>
                  </label>
                  <select
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-white/30"
                  >
                    <option value="19:30" className="bg-neutral-900 text-white">19:30 (Đề xuất)</option>
                    <option value="20:15" className="bg-neutral-900 text-white">20:15 (Live)</option>
                    <option value="21:00" className="bg-neutral-900 text-white">21:00 (Đêm)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1 flex items-center space-x-1">
                  <MapPin className="w-3 h-3 text-neutral-400" />
                  <span>Khu vực ưu tiên</span>
                </label>
                <select
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-white/30"
                >
                  <option value="Gần Sân Khấu Acoustic" className="bg-neutral-900 text-white">Gần Sân Khấu Live Acoustic</option>
                  <option value="Quầy Bar Pha Chế" className="bg-neutral-900 text-white">Quầy Bar Pha Chế (Trò chuyện Bartender)</option>
                  <option value="Bàn Thư Giãn Ấm Cúng" className="bg-neutral-900 text-white">Bàn Thư Giãn Ấm Cúng (Yên tĩnh)</option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-neutral-100 hover:bg-white text-neutral-950 font-medium text-xs tracking-wide shadow-md transition-all active:scale-[0.99]"
                >
                  Xác Nhận Đặt Bàn
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-serif font-bold text-neutral-100">
                Đặt Bàn Thành Công
              </h3>
              <p className="text-xs text-neutral-300 mt-1 max-w-xs mx-auto">
                Cảm ơn bạn <span className="font-semibold text-white">{formData.name}</span>. Ca Văn Nghệ đã giữ bàn ({formData.guests} khách) vào lúc <span className="text-amber-300 font-medium">{formData.time} ({formData.date})</span> tại khu vực <span className="text-amber-300">{formData.area}</span>.
              </p>
            </div>
            <div className="pt-1">
              <button
                onClick={resetForm}
                className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs font-medium transition"
              >
                Trở lại không gian 3D
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}