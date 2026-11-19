import React from 'react';
import { X, Check, Flame, Sparkles, Tag, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function DetailModal({ item, onClose, onActionClick }) {
  if (!item) return null;

  const handleAction = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#d4a373', '#b88953', '#f5efe4', '#e29578']
    });
    if (onActionClick) {
      onActionClick(item);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Click outside backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg bg-neutral-950/95 backdrop-blur-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-scaleUp select-none">
        {/* Top banner image */}
        <div className="relative h-56 sm:h-64 w-full overflow-hidden bg-zinc-900">
          <img
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover brightness-95 hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#181310] via-black/30 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Badge */}
          <div className="absolute bottom-4 left-6 flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/90 text-black shadow-md flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{item.tag}</span>
            </span>
            {item.calories && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-black/60 text-amber-200 backdrop-blur-md flex items-center space-x-1 border border-white/10">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>{item.calories}</span>
              </span>
            )}
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 sm:p-7 space-y-4">
          <div className="flex items-start justify-between">
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-amber-100">
              {item.title}
            </h2>
            {item.price && (
              <span className="text-lg sm:text-xl font-bold text-amber-400">
                {item.price}
              </span>
            )}
          </div>

          <p className="text-sm text-amber-100/75 leading-relaxed font-sans">
            {item.description}
          </p>

          {/* Highlights or Ingredients */}
          {item.highlights && (
            <div className="pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-2.5 flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>Điểm Nổi Bật</span>
              </h4>
              <ul className="space-y-1.5">
                {item.highlights.map((h, i) => (
                  <li key={i} className="text-xs text-gray-300 flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.ingredients && (
            <div className="pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-2.5">
                Thành phần hảo hạng
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {item.ingredients.map((ing, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-200/90 border border-amber-500/20 text-xs"
                  >
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {item.specials && (
            <div className="pt-2 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400/90">
                Gợi ý thưởng thức
              </h4>
              {item.specials.map((s, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-semibold text-amber-100">{s.name}</span>
                    <p className="text-[11px] text-gray-400">{s.desc}</p>
                  </div>
                  <span className="text-amber-400 font-bold ml-2 whitespace-nowrap">{s.price}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA Action */}
          <div className="pt-3 flex items-center space-x-2.5">
            <button
              onClick={handleAction}
              className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-100 hover:bg-white text-neutral-950 font-medium text-xs tracking-wide shadow-md transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5"
            >
              <span>{item.actionText || 'Đặt Trải Nghiệm'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-medium border border-white/10 transition"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

