import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  ClipboardPaste,
  KeyRound,
  Pause,
  Play,
  Redo2,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AnimEditInterp,
  AnimEditLayer,
  AnyHumanoidBoneKey,
} from '../../types/characterStudio';
import {
  EDITOR_BONE_GROUPS,
  getEditorBoneLabel,
  type SelectedKeyRef,
} from './AnimEditorTypes';

export interface AnimationEditorTimelineProps {
  duration: number;
  fps: number;
  currentTime: number;
  isPlaying: boolean;
  autoKey: boolean;
  loopRegion: [number, number] | null;
  layer: AnimEditLayer;
  availableBones: Set<AnyHumanoidBoneKey>;
  selectedBone: AnyHumanoidBoneKey | null;
  selectedKey: SelectedKeyRef | null;
  canUndo: boolean;
  canRedo: boolean;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onToggleAutoKey: () => void;
  onSelectBone: (bone: AnyHumanoidBoneKey) => void;
  onSelectKey: (ref: SelectedKeyRef | null) => void;
  onAddKeyAtPlayhead: (bone: AnyHumanoidBoneKey) => void;
  onDeleteKey: (bone: AnyHumanoidBoneKey, t: number) => void;
  onMoveKey: (bone: AnyHumanoidBoneKey, oldT: number, newT: number) => void;
  onChangeKeyInterp: (bone: AnyHumanoidBoneKey, t: number, interp: AnimEditInterp) => void;
  onCopyKey: () => void;
  onPasteKey: () => void;
  hasCopiedKey: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSetLoopRegion: (region: [number, number] | null) => void;
}

const ROW_HEIGHT = 24;
const LEFT_COL_WIDTH = 216;

export const AnimationEditorTimeline: React.FC<AnimationEditorTimelineProps> = ({
  duration,
  fps,
  currentTime,
  isPlaying,
  autoKey,
  loopRegion,
  layer,
  availableBones,
  selectedBone,
  selectedKey,
  canUndo,
  canRedo,
  onSeek,
  onTogglePlay,
  onToggleAutoKey,
  onSelectBone,
  onSelectKey,
  onAddKeyAtPlayhead,
  onDeleteKey,
  onMoveKey,
  onChangeKeyInterp,
  onCopyKey,
  onPasteKey,
  hasCopiedKey,
  onUndo,
  onRedo,
  onSetLoopRegion,
}) => {
  const [pxPerSec, setPxPerSec] = useState(260);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of EDITOR_BONE_GROUPS) {
      init[g.id] = g.defaultExpanded;
    }
    return init;
  });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    bone: AnyHumanoidBoneKey;
    t: number;
    interp: AnimEditInterp;
  } | null>(null);

  const trackAreaRef = useRef<HTMLDivElement>(null);
  const dragKeyRef = useRef<{
    bone: AnyHumanoidBoneKey;
    origT: number;
    curT: number;
  } | null>(null);

  const safeDuration = Math.max(0.1, duration);
  const timelineWidth = Math.max(520, Math.ceil(safeDuration * pxPerSec) + 40);
  const totalFrames = Math.max(1, Math.round(safeDuration * fps));
  const currentFrame = Math.round(currentTime * fps);

  const visibleRows = useMemo(() => {
    const rows: Array<
      | { kind: 'group'; id: string; label: string; count: number; hasKeys: boolean }
      | { kind: 'bone'; bone: AnyHumanoidBoneKey; label: string; keyCount: number }
    > = [];
    for (const grp of EDITOR_BONE_GROUPS) {
      const bones = grp.bones.filter((b) => availableBones.has(b));
      if (bones.length === 0) continue;
      const hasKeys = bones.some((b) => (layer.tracks[b]?.length ?? 0) > 0);
      rows.push({
        kind: 'group',
        id: grp.id,
        label: grp.label,
        count: bones.length,
        hasKeys,
      });
      if (expandedGroups[grp.id]) {
        for (const b of bones) {
          rows.push({
            kind: 'bone',
            bone: b,
            label: getEditorBoneLabel(b),
            keyCount: layer.tracks[b]?.length ?? 0,
          });
        }
      }
    }
    return rows;
  }, [availableBones, expandedGroups, layer]);

  const timeFromClientX = (clientX: number): number => {
    const el = trackAreaRef.current;
    if (!el) return currentTime;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.min(safeDuration, x / pxPerSec));
  };

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setContextMenu(null);
    onSeek(timeFromClientX(e.clientX));
    const onMove = (ev: MouseEvent) => onSeek(timeFromClientX(ev.clientX));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleKeyMouseDown = (
    e: React.MouseEvent,
    bone: AnyHumanoidBoneKey,
    keyT: number
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setContextMenu(null);
    onSelectBone(bone);
    onSelectKey({ bone, t: keyT });
    dragKeyRef.current = { bone, origT: keyT, curT: keyT };

    const onMove = (ev: MouseEvent) => {
      const d = dragKeyRef.current;
      if (!d) return;
      const nt = Math.round(timeFromClientX(ev.clientX) * fps) / fps;
      if (Math.abs(nt - d.curT) > 0.002) {
        onMoveKey(d.bone, d.curT, nt);
        d.curT = nt;
        onSelectKey({ bone: d.bone, t: nt });
      }
    };
    const onUp = () => {
      dragKeyRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const tickStepSec = pxPerSec >= 320 ? 0.1 : pxPerSec >= 160 ? 0.2 : 0.5;
  const ticks: number[] = [];
  for (let t = 0; t <= safeDuration + 1e-4; t += tickStepSec) {
    ticks.push(Math.round(t * 1000) / 1000);
  }

  return (
    <div
      className="h-64 bg-[#11151e] border-t border-[#262d3d] flex flex-col select-none relative overflow-hidden"
      onClick={() => setContextMenu(null)}
    >
      {/* Top Transport & Keyframe Toolbar */}
      <div className="min-h-9 py-1 px-2.5 bg-[#161b26] border-b border-[#262d3d] flex flex-wrap items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleAutoKey}
            title="Auto-Key (Bật đỏ: xoay xương là tự động ghi keyframe tại thời điểm hiện tại)"
            className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 border transition ${
              autoKey
                ? 'bg-rose-600 text-white border-rose-400 shadow shadow-rose-500/30'
                : 'bg-[#1e2534] text-gray-300 border-[#2f384d] hover:text-white'
            }`}
          >
            <CircleDot className={`w-3.5 h-3.5 ${autoKey ? 'animate-pulse' : ''}`} />
            <span>Auto-Key</span>
          </button>

          <div className="h-4 w-px bg-[#2b3345] mx-1" />

          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Về đầu (0s)"
            className="p-1 rounded hover:bg-[#232b3d] text-gray-300"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - 1 / fps))}
            title="Lùi 1 frame (,)"
            className="p-1 rounded hover:bg-[#232b3d] text-gray-300"
          >
            <StepBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title="Phát / Tạm dừng (Space)"
            className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 ${
              isPlaying ? 'bg-amber-500 text-black' : 'bg-sky-600 text-white hover:bg-sky-500'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.min(safeDuration, currentTime + 1 / fps))}
            title="Tiến 1 frame (.)"
            className="p-1 rounded hover:bg-[#232b3d] text-gray-300"
          >
            <StepForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(safeDuration)}
            title="Tới cuối"
            className="p-1 rounded hover:bg-[#232b3d] text-gray-300"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <span className="ml-2 px-2 py-0.5 rounded bg-[#0c0f16] border border-[#262d3d] font-mono text-[11px] text-sky-300">
            {currentTime.toFixed(2)}s / {safeDuration.toFixed(2)}s • F{currentFrame}/{totalFrames}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!selectedBone}
            onClick={() => selectedBone && onAddKeyAtPlayhead(selectedBone)}
            title="Thêm Keyframe cho xương đang chọn tại playhead (K)"
            className="px-2 py-1 rounded bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-40 text-[11px] font-semibold text-white flex items-center gap-1"
          >
            <KeyRound className="w-3 h-3" />
            <span>+ Key (K)</span>
          </button>
          <button
            type="button"
            disabled={!selectedKey}
            onClick={onCopyKey}
            title="Copy Key (Ctrl+C)"
            className="p-1 rounded bg-[#1e2534] hover:bg-[#293246] disabled:opacity-35 text-gray-300"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!hasCopiedKey || !selectedBone}
            onClick={onPasteKey}
            title="Paste Key tại Playhead (Ctrl+V)"
            className="p-1 rounded bg-[#1e2534] hover:bg-[#293246] disabled:opacity-35 text-gray-300"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!selectedKey}
            onClick={() => selectedKey && onDeleteKey(selectedKey.bone, selectedKey.t)}
            title="Xóa Key đang chọn (Delete)"
            className="p-1 rounded bg-[#1e2534] hover:bg-rose-500/30 disabled:opacity-35 text-gray-300 hover:text-rose-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-[#2b3345] mx-1" />

          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Hoàn tác (Ctrl+Z)"
            className="p-1 rounded bg-[#1e2534] hover:bg-[#293246] disabled:opacity-35 text-gray-300"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Làm lại (Ctrl+Y)"
            className="p-1 rounded bg-[#1e2534] hover:bg-[#293246] disabled:opacity-35 text-gray-300"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-[#2b3345] mx-1" />

          <button
            type="button"
            onClick={() =>
              loopRegion
                ? onSetLoopRegion(null)
                : onSetLoopRegion([
                    Math.max(0, currentTime - 0.3),
                    Math.min(safeDuration, currentTime + 0.3),
                  ])
            }
            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
              loopRegion
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                : 'bg-[#1e2534] border-[#2f384d] text-gray-400 hover:text-white'
            }`}
            title="Bật/Tắt vùng lặp cục bộ quanh playhead"
          >
            {loopRegion
              ? `Lặp ${loopRegion[0].toFixed(1)}–${loopRegion[1].toFixed(1)}s`
              : 'Lặp vùng'}
          </button>

          <button
            type="button"
            onClick={() => setPxPerSec((z) => Math.max(90, Math.round(z / 1.25)))}
            className="p-1 rounded hover:bg-[#232b3d] text-gray-400"
            title="Thu nhỏ timeline"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPxPerSec((z) => Math.min(720, Math.round(z * 1.25)))}
            className="p-1 rounded hover:bg-[#232b3d] text-gray-400"
            title="Phóng to timeline"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dopesheet Body: Left Bone Tree + Right Keyframe Tracks */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Bone Column */}
        <div
          style={{ width: LEFT_COL_WIDTH }}
          className="shrink-0 bg-[#141923] border-r border-[#262d3d] flex flex-col overflow-y-auto"
        >
          <div className="h-6 px-2.5 flex items-center text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-[#222938] shrink-0">
            Cây Xương Humanoid
          </div>
          <div>
            {visibleRows.map((row) =>
              row.kind === 'group' ? (
                <button
                  key={`g:${row.id}`}
                  type="button"
                  onClick={() =>
                    setExpandedGroups((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                  }
                  style={{ height: ROW_HEIGHT }}
                  className="w-full px-2 flex items-center justify-between text-[11px] font-semibold text-gray-200 bg-[#19202e] hover:bg-[#20293b] border-b border-[#222938]"
                >
                  <span className="flex items-center gap-1 truncate">
                    {expandedGroups[row.id] ? (
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                    )}
                    <span>{row.label}</span>
                  </span>
                  {row.hasKeys && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  )}
                </button>
              ) : (
                <div
                  key={`b:${row.bone}`}
                  onClick={() => onSelectBone(row.bone)}
                  style={{ height: ROW_HEIGHT }}
                  className={`px-3 pl-5 flex items-center justify-between text-[11px] cursor-pointer border-b border-[#1d2330] ${
                    selectedBone === row.bone
                      ? 'bg-sky-600/30 text-white font-semibold'
                      : 'text-gray-300 hover:bg-[#1b2230]'
                  }`}
                >
                  <span className="truncate">{row.label}</span>
                  {row.keyCount > 0 && (
                    <span className="text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-300">
                      {row.keyCount}
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right Scrollable Dopesheet */}
        <div
          ref={trackAreaRef}
          onWheel={(e) => {
            if (e.ctrlKey) {
              e.preventDefault();
              setPxPerSec((z) =>
                Math.max(90, Math.min(720, Math.round(z * (e.deltaY < 0 ? 1.15 : 0.87))))
              );
            }
          }}
          className="flex-1 overflow-auto relative bg-[#0e121a]"
        >
          <div style={{ width: timelineWidth }} className="relative min-h-full">
            {/* Ruler */}
            <div
              onMouseDown={handleRulerMouseDown}
              className="h-6 bg-[#171c28] border-b border-[#262d3d] sticky top-0 z-20 cursor-ew-resize"
            >
              {loopRegion && (
                <div
                  style={{
                    left: loopRegion[0] * pxPerSec,
                    width: Math.max(4, (loopRegion[1] - loopRegion[0]) * pxPerSec),
                  }}
                  className="absolute top-0 bottom-0 bg-emerald-500/20 border-x border-emerald-400/60 pointer-events-none"
                />
              )}
              {ticks.map((t) => (
                <div
                  key={t}
                  style={{ left: t * pxPerSec }}
                  className="absolute top-0 bottom-0 border-l border-[#333c50] pointer-events-none"
                >
                  <span className="text-[9px] font-mono text-gray-400 pl-1">
                    {t.toFixed(1)}s
                  </span>
                </div>
              ))}
            </div>

            {/* Keyframe Rows */}
            <div className="relative">
              {visibleRows.map((row) =>
                row.kind === 'group' ? (
                  <div
                    key={`rg:${row.id}`}
                    style={{ height: ROW_HEIGHT }}
                    className="bg-[#151b27]/70 border-b border-[#222938]"
                  />
                ) : (
                  <div
                    key={`rb:${row.bone}`}
                    onClick={() => onSelectBone(row.bone)}
                    onDoubleClick={(e) => {
                      onSelectBone(row.bone);
                      const t = Math.round(timeFromClientX(e.clientX) * fps) / fps;
                      onSeek(t);
                      onAddKeyAtPlayhead(row.bone);
                    }}
                    style={{ height: ROW_HEIGHT }}
                    className={`relative border-b border-[#1b202d] ${
                      selectedBone === row.bone ? 'bg-sky-500/10' : ''
                    }`}
                  >
                    {(layer.tracks[row.bone] ?? []).map((k) => {
                      const isSel =
                        selectedKey?.bone === row.bone && Math.abs(selectedKey.t - k.t) < 0.005;
                      return (
                        <button
                          key={`${row.bone}:${k.t}`}
                          type="button"
                          onMouseDown={(e) => handleKeyMouseDown(e, row.bone, k.t)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectKey({ bone: row.bone, t: k.t });
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              bone: row.bone,
                              t: k.t,
                              interp: k.interp,
                            });
                          }}
                          style={{ left: k.t * pxPerSec - 5, top: 7 }}
                          title={`${getEditorBoneLabel(row.bone)} @ ${k.t.toFixed(2)}s (${k.interp})`}
                          className={`absolute w-2.5 h-2.5 rotate-45 border transition ${
                            isSel
                              ? 'bg-sky-400 border-white scale-125 z-10'
                              : k.interp === 'step'
                                ? 'bg-rose-400 border-rose-200'
                                : k.interp === 'ease'
                                  ? 'bg-emerald-400 border-emerald-200'
                                  : 'bg-amber-400 border-amber-100 hover:scale-125'
                          }`}
                        />
                      );
                    })}
                  </div>
                )
              )}
            </div>

            {/* Playhead Red Line */}
            <div
              style={{ left: currentTime * pxPerSec }}
              className="absolute top-0 bottom-0 w-px bg-rose-500 z-30 pointer-events-none"
            >
              <div className="w-2.5 h-3 -ml-[4.5px] bg-rose-500 rounded-b-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Right-click Keyframe Interpolation Context Menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: Math.max(8, contextMenu.y - 110) }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-44 rounded-xl bg-[#1a202d] border border-[#323c52] shadow-2xl p-1.5 text-xs text-gray-200 space-y-0.5"
        >
          <div className="px-2 py-1 text-[10px] font-bold text-gray-400 border-b border-[#283144]">
            Nội suy Key @ {contextMenu.t.toFixed(2)}s
          </div>
          {(['linear', 'ease', 'step'] as AnimEditInterp[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                onChangeKeyInterp(contextMenu.bone, contextMenu.t, mode);
                setContextMenu(null);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between ${
                contextMenu.interp === mode
                  ? 'bg-sky-600 text-white'
                  : 'hover:bg-[#252e40]'
              }`}
            >
              <span>
                {mode === 'linear' ? 'Linear (Thẳng)' : mode === 'ease' ? 'Ease (Mượt)' : 'Step (Nhảy cóc)'}
              </span>
              {contextMenu.interp === mode && <span>✓</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onDeleteKey(contextMenu.bone, contextMenu.t);
              setContextMenu(null);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-rose-300 hover:bg-rose-500/20 border-t border-[#283144] mt-1"
          >
            Xóa Keyframe này
          </button>
        </div>
      )}
    </div>
  );
};
