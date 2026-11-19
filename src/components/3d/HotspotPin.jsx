import React from 'react';
import { Html } from '@react-three/drei';
import { Sparkles, Wine, Utensils, Music, Lamp } from 'lucide-react';

const iconMap = {
  bar: Wine,
  table: Utensils,
  food: Utensils,
  burger: Utensils,
  pizza: Utensils,
  steak: Utensils,
  boards: Music,
  acoustic: Music,
  lamp: Lamp,
  statue: Sparkles
};

export default function HotspotPin({ position, label, objectId, onClick }) {
  const Icon = iconMap[objectId] || Sparkles;

  return (
    <group position={position}>
      <Html center distanceFactor={12} zIndexRange={[100, 0]}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onClick) onClick(objectId);
          }}
          className="group relative flex items-center space-x-2 -translate-y-2 focus:outline-none cursor-pointer"
        >
          {/* Animated Glowing Ring Pin */}
          <div className="relative flex items-center justify-center">
            <span className="absolute w-8 h-8 rounded-full bg-amber-400/30 animate-ping opacity-75" />
            <span className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-600 to-amber-300 border-2 border-white shadow-lg flex items-center justify-center text-black">
              <Icon className="w-3.5 h-3.5 text-stone-900" />
            </span>
          </div>

          {/* Floating Pill Label */}
          <div className="glass-panel-warm px-2.5 py-1 rounded-xl text-[11px] font-semibold text-amber-100 whitespace-nowrap shadow-xl border border-amber-500/30 group-hover:scale-105 group-hover:border-amber-400 transition-all duration-200">
            {label}
          </div>
        </button>
      </Html>
    </group>
  );
}

