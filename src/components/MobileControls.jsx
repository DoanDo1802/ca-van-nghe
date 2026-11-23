import React, { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';

function detectTouchLayout() {
  if (typeof window === 'undefined') return false;
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return (hasCoarsePointer || hasTouch) && window.innerWidth <= 1024;
}

/**
 * @param {{
 *   onMove: (vec: { x: number; y: number } | null) => void;
 *   onAction: () => void;
 *   onToggleCamera?: () => void;
 *   nearbyPrompt?: { id?: string; type?: string; title?: string; targetSceneId?: string } | null;
 *   isSitting?: boolean;
 *   hidden?: boolean;
 * }} props
 */
export default function MobileControls({
  onMove,
  onAction,
  onToggleCamera,
  nearbyPrompt = null,
  isSitting = false,
  hidden = false,
}) {
  const [isTouchLayout, setIsTouchLayout] = useState(detectTouchLayout);
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const containerRef = useRef(null);
  const touchIdRef = useRef(null);

  useEffect(() => {
    const update = () => setIsTouchLayout(detectTouchLayout());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (!isTouchLayout || hidden) {
    return null;
  }

  const updateJoystickFromTouch = (touch) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
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

  const handleTouchStart = (e) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    e.preventDefault();
    touchIdRef.current = touch.identifier;
    setActive(true);
    updateJoystickFromTouch(touch);
  };

  const handleTouchMove = (e) => {
    if (touchIdRef.current === null) return;
    let matched = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === touchIdRef.current) {
        matched = e.touches[i];
        break;
      }
    }
    if (!matched) return;
    e.preventDefault();
    updateJoystickFromTouch(matched);
  };

  const handleTouchEnd = (e) => {
    if (touchIdRef.current === null) return;
    let ended = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        ended = true;
        break;
      }
    }
    if (!ended) return;
    touchIdRef.current = null;
    setActive(false);
    setTouchPos({ x: 0, y: 0 });
    onMove(null);
  };

  const hasContextAction = Boolean(isSitting || nearbyPrompt);
  const actionLabel = isSitting
    ? 'Đứng'
    : nearbyPrompt?.id === 'karaoke_stage'
      ? 'Hát'
      : nearbyPrompt?.type === 'chair'
        ? 'Ngồi'
        : nearbyPrompt?.type === 'door'
          ? 'Vào'
          : nearbyPrompt
            ? 'Xem'
            : 'E';

  return (
    <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 pointer-events-none flex justify-between items-end pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      {/* Virtual Joystick (Bottom Left) */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`w-28 h-28 rounded-full bg-neutral-950/60 backdrop-blur-md border border-white/15 pointer-events-auto flex items-center justify-center relative touch-none transition-opacity ${
          active ? 'opacity-100' : 'opacity-80'
        }`}
      >
        {/* Joystick Thumb */}
        <div
          className="w-12 h-12 rounded-full bg-white/30 border border-white/40 shadow-md pointer-events-none transition-transform duration-75"
          style={{ transform: `translate(${touchPos.x}px, ${touchPos.y}px)` }}
        />
      </div>

      {/* Right Action Cluster */}
      <div className="flex items-end gap-2.5 pointer-events-auto">
        {onToggleCamera && (
          <button
            type="button"
            onClick={onToggleCamera}
            aria-label="Đổi góc nhìn Camera"
            className="w-11 h-11 rounded-full bg-neutral-900/85 backdrop-blur-md border border-white/15 text-neutral-200 shadow-lg flex items-center justify-center active:scale-95 transition"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onAction}
          className={`w-14 h-14 rounded-full backdrop-blur-md border font-semibold shadow-xl flex items-center justify-center active:scale-95 transition ${
            hasContextAction
              ? 'bg-white text-neutral-950 border-white text-xs'
              : 'bg-neutral-900/85 border-white/20 text-neutral-100 font-mono text-base opacity-85'
          }`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
