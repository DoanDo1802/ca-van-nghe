import React, { useRef, useState } from 'react';

export default function MobileControls({ onMove, onAction }) {
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const containerRef = useRef(null);

  const handleTouchStart = (e) => {
    setActive(true);
    handleTouchMove(e);
  };

  const handleTouchMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const maxRadius = rect.width / 2;

    const distance = Math.min(Math.hypot(dx, dy), maxRadius);
    const angle = Math.atan2(dy, dx);

    const normX = (Math.cos(angle) * distance) / maxRadius;
    const normY = -(Math.sin(angle) * distance) / maxRadius;

    setTouchPos({ x: normX * 30, y: -normY * 30 });
    onMove({ x: normX, y: normY });
  };

  const handleTouchEnd = () => {
    setActive(false);
    setTouchPos({ x: 0, y: 0 });
    onMove(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-6 z-30 pointer-events-none flex justify-between items-end px-6 sm:hidden">
      {/* Virtual Joystick (Bottom Left) */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-28 h-28 rounded-full bg-neutral-950/60 backdrop-blur-md border border-white/10 pointer-events-auto flex items-center justify-center relative touch-none opacity-80 active:opacity-100"
      >
        {/* Joystick Thumb */}
        <div
          className="w-12 h-12 rounded-full bg-white/25 border border-white/30 shadow-md pointer-events-none transition-transform duration-75"
          style={{ transform: `translate(${touchPos.x}px, ${touchPos.y}px)` }}
        />
      </div>

      {/* Action Button [E] (Bottom Right) */}
      <button
        onClick={onAction}
        className="w-14 h-14 rounded-full bg-neutral-900/90 backdrop-blur-md border border-white/20 text-neutral-100 font-mono font-bold text-base shadow-xl pointer-events-auto flex items-center justify-center active:scale-95 transition opacity-80 active:opacity-100"
      >
        E
      </button>
    </div>
  );
}

