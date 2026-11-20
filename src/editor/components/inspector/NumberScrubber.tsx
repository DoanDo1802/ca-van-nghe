import React, { useEffect, useRef, useState } from 'react';

export interface NumberScrubberProps {
  label?: string;
  labelColorClass?: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  disabled?: boolean;
  onChange: (value: number, commitCommand: boolean) => void;
}

function clampAndRound(
  val: number,
  min: number | undefined,
  max: number | undefined,
  precision: number
): number {
  let next = val;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  const factor = Math.pow(10, precision);
  return Math.round(next * factor) / factor;
}

function formatNumber(val: number, precision: number): string {
  if (!Number.isFinite(val)) return '0';
  const factor = Math.pow(10, precision);
  const rounded = Math.round(val * factor) / factor;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export const NumberScrubber: React.FC<NumberScrubberProps> = ({
  label,
  labelColorClass = 'text-gray-400',
  value,
  step = 0.1,
  min,
  max,
  precision = 3,
  disabled = false,
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatNumber(value, precision));

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startValue: number;
    latestValue: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startValue: value,
    latestValue: value,
    moved: false,
  });

  useEffect(() => {
    if (!isEditing && !dragRef.current.active) {
      setDraft(formatNumber(value, precision));
    }
  }, [value, precision, isEditing]);

  const handleLabelPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startValue: value,
      latestValue: value,
      moved: false,
    };
  };

  const handleLabelPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - drag.startX;
    if (Math.abs(deltaX) >= 1) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    const sensitivity = e.shiftKey ? 0.1 : e.ctrlKey || e.metaKey ? 5 : 1;
    const next = clampAndRound(
      drag.startValue + (deltaX / 4) * step * sensitivity,
      min,
      max,
      precision
    );

    if (next !== drag.latestValue) {
      drag.latestValue = next;
      setDraft(formatNumber(next, precision));
      onChange(next, false);
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const hadMoved = drag.moved;
    const finalValue = drag.latestValue;
    drag.active = false;
    drag.pointerId = -1;

    if (hadMoved) {
      onChange(finalValue, true);
    }
  };

  const commitDraft = () => {
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) {
      const next = clampAndRound(parsed, min, max, precision);
      setDraft(formatNumber(next, precision));
      onChange(next, true);
    } else {
      setDraft(formatNumber(value, precision));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitDraft();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(formatNumber(value, precision));
      setIsEditing(false);
      e.currentTarget.blur();
    }
  };

  return (
    <div
      className={`flex items-center bg-[#12151b] border border-[#2f3644] rounded overflow-hidden focus-within:border-blue-500 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {label !== undefined && (
        <span
          onPointerDown={handleLabelPointerDown}
          onPointerMove={handleLabelPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          title="Drag left/right to scrub (Shift: fine, Ctrl: fast)"
          className={`px-1.5 py-1 text-[10px] font-semibold select-none cursor-ew-resize bg-[#181c24] border-r border-[#2b313d] ${labelColorClass}`}
        >
          {label}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={isEditing ? draft : formatNumber(value, precision)}
        onFocus={(e) => {
          setIsEditing(true);
          setDraft(formatNumber(value, precision));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        className="w-full min-w-0 bg-transparent px-1.5 py-1 text-[11px] font-mono text-gray-200 text-right focus:outline-none"
      />
    </div>
  );
};
