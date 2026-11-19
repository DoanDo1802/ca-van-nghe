import React, { useState } from 'react';
import { X, Coffee, Wine, UtensilsCrossed, CheckCircle2 } from 'lucide-react';
import { FULL_MENU } from '../data/sceneData';
import confetti from 'canvas-confetti';

export default function MenuDrawer({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('cocktails');
  const [orderedItem, setOrderedItem] = useState(null);

  if (!isOpen) return null;

  const handleOrder = (item) => {
    setOrderedItem(item.name);
    confetti({
      particleCount: 50,
      spread: 50,
      origin: { y: 0.6 },
      colors: ['#d4a373', '#b88953', '#f5efe4']
    });
    setTimeout(() => {
      setOrderedItem(null);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden animate-fadeIn select-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-neutral-950/95 backdrop-blur-2xl shadow-2xl flex flex-col border-l border-white/10">
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono tracking-widest uppercase text-neutral-400">
                Menu Trực Tuyến
              </span>
              <h3 className="font-serif text-xl font-bold text-neutral-100">
                Thực Đơn Ca Văn Nghệ
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-white/[0.02] p-1.5 gap-1">
            <button
              onClick={() => setActiveTab('cocktails')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition ${
                activeTab === 'cocktails'
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
              }`}
            >
              <Wine className="w-3.5 h-3.5" />
              <span>Cocktail & Rượu</span>
            </button>

            <button
              onClick={() => setActiveTab('coffee')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition ${
                activeTab === 'coffee'
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Cà Phê & Trà</span>
            </button>

            <button
              onClick={() => setActiveTab('food')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition ${
                activeTab === 'food'
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>Ẩm Thực</span>
            </button>
          </div>

          {/* Menu Items List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {FULL_MENU[activeTab]?.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/20 transition flex justify-between items-center group"
              >
                <div className="space-y-0.5 pr-3">
                  <h4 className="font-medium text-sm text-neutral-100 group-hover:text-white transition">
                    {item.name}
                  </h4>
                  <p className="text-xs text-neutral-400 font-sans">
                    {item.note}
                  </p>
                  <span className="inline-block text-xs font-mono font-medium text-amber-300 pt-0.5">
                    {item.price}
                  </span>
                </div>
                <button
                  onClick={() => handleOrder(item)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1 shrink-0 ${
                    orderedItem === item.name
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-white/5 hover:bg-white/15 text-neutral-200 border border-white/10'
                  }`}
                >
                  {orderedItem === item.name ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Đã chọn</span>
                    </>
                  ) : (
                    <span>Chọn</span>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-white/10 bg-white/[0.02]">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-center">
              <p className="text-xs text-neutral-300 font-medium">
                Phục vụ nhạc Live Acoustic từ 20:30 mỗi tối
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Vui lòng đặt bàn trước để chọn được vị trí ngồi lý tưởng nhất
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

