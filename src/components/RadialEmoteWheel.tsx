import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Heart, Mic, Music, Smile, Sparkles, X } from 'lucide-react';
import { AnimationRegistry } from '../engine/animation/AnimationRegistry';
import type { EmoteIconKind, EmoteSliceEntry } from '../types/characterStudio';

export type RadialEmoteId = string;

interface ComputedRadialSlice extends EmoteSliceEntry {
  angleDeg: number;
  halfSpanDeg: number;
}

interface RadialEmoteWheelProps {
  activeEmote: string | null;
  disabled?: boolean;
  onSelectEmote: (emoteId: RadialEmoteId | null) => void;
}

function renderSliceIcon(icon?: EmoteIconKind) {
  switch (icon) {
    case 'mic':
      return <Mic className="w-3.5 h-3.5" />;
    case 'sparkles':
      return <Sparkles className="w-3.5 h-3.5" />;
    case 'flame':
      return <Flame className="w-3.5 h-3.5" />;
    case 'heart':
      return <Heart className="w-3.5 h-3.5" />;
    case 'smile':
      return <Smile className="w-3.5 h-3.5" />;
    default:
      return <Music className="w-3.5 h-3.5" />;
  }
}

function getSliceFromOffset(
  dx: number,
  dy: number,
  slices: ComputedRadialSlice[]
): RadialEmoteId | null {
  const dist = Math.hypot(dx, dy);
  if (dist < 40 || slices.length === 0) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const maxTolerance = Math.max(12, 180 / slices.length);
  let bestId: RadialEmoteId | null = null;
  let bestDiff = maxTolerance;
  for (const slice of slices) {
    const rawDiff = Math.abs(deg - slice.angleDeg);
    const wrappedDiff = Math.min(rawDiff, 360 - rawDiff);
    if (wrappedDiff <= bestDiff) {
      bestDiff = wrappedDiff;
      bestId = slice.id;
    }
  }
  return bestId;
}

function describeAnnularSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number
): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + rOuter * Math.cos(rad(startDeg));
  const y1 = cy + rOuter * Math.sin(rad(startDeg));
  const x2 = cx + rOuter * Math.cos(rad(endDeg));
  const y2 = cy + rOuter * Math.sin(rad(endDeg));
  const x3 = cx + rInner * Math.cos(rad(endDeg));
  const y3 = cy + rInner * Math.sin(rad(endDeg));
  const x4 = cx + rInner * Math.cos(rad(startDeg));
  const y4 = cy + rInner * Math.sin(rad(startDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export const RadialEmoteWheel: React.FC<RadialEmoteWheelProps> = ({
  activeEmote,
  disabled = false,
  onSelectEmote,
}) => {
  const [emotes, setEmotes] = useState<EmoteSliceEntry[]>(() =>
    AnimationRegistry.getEmotesSync()
  );
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<RadialEmoteId | null>(null);
  const isOpenRef = useRef(false);
  const hoveredRef = useRef<RadialEmoteId | null>(null);
  const onSelectRef = useRef(onSelectEmote);
  onSelectRef.current = onSelectEmote;

  useEffect(() => {
    let mounted = true;
    void AnimationRegistry.ensureLoaded().then((m) => {
      if (mounted) setEmotes([...m.emotes]);
    });
    const unsub = AnimationRegistry.subscribe((m) => {
      if (mounted) setEmotes([...m.emotes]);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const slices = useMemo<ComputedRadialSlice[]>(() => {
    const n = Math.max(1, emotes.length);
    const stepDeg = 360 / n;
    const gapDeg = Math.min(2.5, stepDeg * 0.08);
    const halfSpanDeg = Math.max(8, stepDeg / 2 - gapDeg);
    return emotes.map((item, idx) => {
      // Start at -90° (top) and proceed clockwise, wrapping to [-180, 180]
      let angleDeg = -90 + idx * stepDeg;
      while (angleDeg > 180) angleDeg -= 360;
      while (angleDeg <= -180) angleDeg += 360;
      return {
        ...item,
        angleDeg,
        halfSpanDeg,
      };
    });
  }, [emotes]);

  useEffect(() => {
    if (disabled) {
      isOpenRef.current = false;
      setIsOpen(false);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyR' || e.repeat) return;
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      isOpenRef.current = true;
      hoveredRef.current = null;
      setHoveredId(null);
      setIsOpen(true);
    };

    const closeAndConfirm = () => {
      if (!isOpenRef.current) return;
      isOpenRef.current = false;
      const chosen = hoveredRef.current;
      setIsOpen(false);
      onSelectRef.current(chosen);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyR') {
        closeAndConfirm();
      }
    };

    const onBlur = () => {
      if (isOpenRef.current) {
        isOpenRef.current = false;
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [disabled]);

  if (!isOpen || disabled) return null;

  const size = slices.length > 8 ? 356 : 312;
  const c = size / 2;
  const rOuter = slices.length > 8 ? 168 : 146;
  const rLabel = slices.length > 8 ? 112 : 98;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const dx = e.clientX - window.innerWidth / 2;
    const dy = e.clientY - window.innerHeight / 2;
    const next = getSliceFromOffset(dx, dy, slices);
    if (next !== hoveredRef.current) {
      hoveredRef.current = next;
      setHoveredId(next);
    }
  };

  return (
    <div
      onPointerMove={handlePointerMove}
      onClick={(e) => {
        e.stopPropagation();
        isOpenRef.current = false;
        setIsOpen(false);
        onSelectEmote(hoveredRef.current);
      }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 pointer-events-auto select-none"
    >
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((slice) => {
            const startDeg = slice.angleDeg - slice.halfSpanDeg;
            const endDeg = slice.angleDeg + slice.halfSpanDeg;
            const isHovered = hoveredId === slice.id;
            const isCurrent = activeEmote === slice.id;
            const d = describeAnnularSector(c, c, 46, rOuter, startDeg, endDeg);
            return (
              <path
                key={slice.id}
                d={d}
                fill={
                  isHovered
                    ? 'rgba(255,255,255,0.22)'
                    : isCurrent
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(18,18,18,0.88)'
                }
                stroke={isHovered ? slice.accent : 'rgba(255,255,255,0.16)'}
                strokeWidth={isHovered ? 2.5 : 1.25}
                className="transition-colors duration-100 cursor-pointer"
                onPointerEnter={() => {
                  hoveredRef.current = slice.id;
                  setHoveredId(slice.id);
                }}
              />
            );
          })}
        </svg>

        {slices.map((slice) => {
          const rad = (slice.angleDeg * Math.PI) / 180;
          const lx = c + rLabel * Math.cos(rad);
          const ly = c + rLabel * Math.sin(rad);
          const isHovered = hoveredId === slice.id;
          const isCurrent = activeEmote === slice.id;
          return (
            <div
              key={slice.id}
              style={{ left: lx, top: ly }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center text-center w-24"
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center mb-1"
                style={{
                  backgroundColor: isHovered || isCurrent ? slice.accent : 'rgba(255,255,255,0.1)',
                  color: isHovered || isCurrent ? '#000' : '#fff',
                }}
              >
                {renderSliceIcon(slice.icon)}
              </span>
              <span className="text-[11px] font-semibold text-white leading-tight line-clamp-2">
                {slice.label}
              </span>
            </div>
          );
        })}

        <div
          onPointerEnter={() => {
            hoveredRef.current = null;
            setHoveredId(null);
          }}
          className={`absolute w-20 h-20 rounded-full border flex flex-col items-center justify-center text-center transition cursor-pointer ${
            hoveredId === null
              ? 'bg-white text-black border-white shadow-xl'
              : 'bg-[#141414]/95 text-neutral-300 border-white/20'
          }`}
        >
          <X className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] font-semibold leading-tight">
            {activeEmote ? 'Dừng lại' : 'Đứng yên'}
          </span>
        </div>
      </div>
    </div>
  );
};
