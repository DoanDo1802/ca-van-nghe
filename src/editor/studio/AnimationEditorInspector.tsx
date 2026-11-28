import React, { useEffect, useState } from 'react';
import * as pc from 'playcanvas';
import {
  Anchor,
  ArrowLeftRight,
  Check,
  Move,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { AnyHumanoidBoneKey } from '../../types/characterStudio';
import {
  getEditorBoneLabel,
  type GizmoToolMode,
  type IKLimbId,
} from './AnimEditorTypes';

export interface AnimationEditorInspectorProps {
  clipDisplayLabel: string;
  dirty: boolean;
  hasAnyEdits: boolean;
  gizmoMode: GizmoToolMode;
  coordSpace: 'local' | 'world';
  selectedBone: AnyHumanoidBoneKey | null;
  isSelectedBoneOverridden: boolean;
  selectedIKLimb: IKLimbId;
  footLock: boolean;
  boneEulerDeg: [number, number, number];
  hipsOffset: [number, number, number];
  hasSavedLayer: boolean;
  localApiReady: boolean | null;
  onChangeGizmoMode: (mode: GizmoToolMode) => void;
  onChangeCoordSpace: (space: 'local' | 'world') => void;
  onSelectIKLimb: (limb: IKLimbId) => void;
  onToggleFootLock: () => void;
  onChangeBoneEuler: (euler: [number, number, number]) => void;
  onToggleBoneOverride: () => void;
  onResetBoneAtTime: () => void;
  onResetBoneTrack: () => void;
  onResetAllEdits: () => void;
  onMirrorLeftToRight: () => void;
  onMirrorRightToLeft: () => void;
  onChangeHipsOffset: (pos: [number, number, number]) => void;
  onResetHipsAtTime: () => void;
  onSaveToGame: () => void;
  onDeleteEditLayer: () => void;
  onExitEditor: () => void;
}

export const AnimationEditorInspector: React.FC<AnimationEditorInspectorProps> = ({
  clipDisplayLabel,
  dirty,
  hasAnyEdits,
  gizmoMode,
  coordSpace,
  selectedBone,
  isSelectedBoneOverridden,
  selectedIKLimb,
  footLock,
  boneEulerDeg,
  hipsOffset,
  hasSavedLayer,
  localApiReady,
  onChangeGizmoMode,
  onChangeCoordSpace,
  onSelectIKLimb,
  onToggleFootLock,
  onChangeBoneEuler,
  onToggleBoneOverride,
  onResetBoneAtTime,
  onResetBoneTrack,
  onResetAllEdits,
  onMirrorLeftToRight,
  onMirrorRightToLeft,
  onChangeHipsOffset,
  onResetHipsAtTime,
  onSaveToGame,
  onDeleteEditLayer,
  onExitEditor,
}) => {
  // Keep local Euler state so dragging Y past ±90° doesn't snap/flip due to Quat->Euler decomposition
  const [localEuler, setLocalEuler] = useState<[number, number, number]>(boneEulerDeg);

  useEffect(() => {
    const qProp = new pc.Quat().setFromEulerAngles(
      boneEulerDeg[0],
      boneEulerDeg[1],
      boneEulerDeg[2]
    );
    const qLocal = new pc.Quat().setFromEulerAngles(
      localEuler[0],
      localEuler[1],
      localEuler[2]
    );
    const dot = Math.abs(
      qProp.x * qLocal.x + qProp.y * qLocal.y + qProp.z * qLocal.z + qProp.w * qLocal.w
    );
    if (dot < 0.9999) {
      setLocalEuler(boneEulerDeg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boneEulerDeg[0], boneEulerDeg[1], boneEulerDeg[2], selectedBone]);

  const sideHint = selectedBone
    ? selectedBone.startsWith('right')
      ? 'Phải của nhân vật (bên trái màn hình khi nhìn thẳng)'
      : selectedBone.startsWith('left')
        ? 'Trái của nhân vật (bên phải màn hình khi nhìn thẳng)'
        : null
    : null;
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header Banner */}
      <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-400/40 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
            <span>Đang sửa: {clipDisplayLabel}</span>
            {dirty && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 text-[9px]">
                Chưa lưu
              </span>
            )}
          </div>
          <div className="text-[11px] text-indigo-200/80">
            Click khớp xương trên model để xoay (FK) hoặc kéo tay/chân (IK)
          </div>
        </div>
        <button
          type="button"
          onClick={onExitEditor}
          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white flex items-center gap-1 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
          <span>Thoát</span>
        </button>
      </div>

      {/* Tool Mode Switcher: FK Rotate vs IK Move */}
      <div className="p-3 rounded-xl bg-[#191e2a] border border-[#272e3f] space-y-2.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-300">
          Chế độ Gizmo trên Model 3D
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeGizmoMode('fk-rotate')}
            className={`py-2 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
              gizmoMode === 'fk-rotate'
                ? 'bg-sky-600 text-white border-sky-400 shadow'
                : 'bg-[#10141d] text-gray-300 border-[#2f384d] hover:text-white'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Xoay Khớp (FK)</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeGizmoMode('ik-move')}
            className={`py-2 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
              gizmoMode === 'ik-move'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                : 'bg-[#10141d] text-gray-300 border-[#2f384d] hover:text-white'
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>Kéo Tay/Chân (IK)</span>
          </button>
        </div>

        {gizmoMode === 'fk-rotate' ? (
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-gray-400">Hệ tọa độ xoay:</span>
            <div className="flex items-center gap-1 bg-[#10141d] p-0.5 rounded-lg border border-[#2f384d]">
              {(['local', 'world'] as const).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => onChangeCoordSpace(sp)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium ${
                    coordSpace === sp
                      ? 'bg-sky-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {sp === 'local' ? 'Local' : 'World'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="text-[11px] text-gray-400">Chọn điểm kéo IK:</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['leftArm', '✋ Tay Trái'],
                  ['rightArm', '🤚 Tay Phải'],
                  ['leftLeg', '🦶 Chân Trái'],
                  ['rightLeg', '🦶 Chân Phải'],
                ] as Array<[IKLimbId, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectIKLimb(id)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border ${
                    selectedIKLimb === id
                      ? 'bg-emerald-600 text-white border-emerald-400'
                      : 'bg-[#10141d] text-gray-300 border-[#2f384d]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleFootLock}
              className={`w-full py-1.5 px-2.5 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1.5 ${
                footLock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-[#10141d] border-[#2f384d] text-gray-300'
              }`}
            >
              <Anchor className="w-3.5 h-3.5" />
              <span>{footLock ? 'Đang ghim 2 chân xuống sàn' : 'Ghim chân xuống sàn (IK Lock)'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Selected Bone Rotation Inspector */}
      <div className="p-3.5 rounded-xl bg-[#191e2a] border border-[#272e3f] space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">
              {selectedBone ? `Khớp: ${getEditorBoneLabel(selectedBone)}` : 'Chưa chọn khớp xương'}
            </div>
            {sideHint && (
              <div className="text-[10px] text-amber-300/80 mt-0.5">{sideHint}</div>
            )}
          </div>
          {selectedBone && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onResetBoneAtTime}
                title="Đưa khớp này về 0° tại thời điểm hiện tại"
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-gray-200 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Khớp</span>
              </button>
              <button
                type="button"
                onClick={onResetBoneTrack}
                title="Xóa toàn bộ keyframe của khớp này trên cả timeline"
                className="px-1.5 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/30 text-[10px] text-rose-200"
              >
                Xóa track
              </button>
            </div>
          )}
        </div>

        {selectedBone ? (
          <div className="space-y-2">
            {(['X', 'Y', 'Z'] as const).map((axis, idx) => {
              const color =
                idx === 0 ? 'text-rose-400' : idx === 1 ? 'text-emerald-400' : 'text-sky-400';
              return (
                <div key={axis} className="flex items-center gap-2">
                  <span className={`w-4 text-xs font-bold ${color}`}>{axis}</span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={Math.max(-180, Math.min(180, Math.round(localEuler[idx])))}
                    onChange={(e) => {
                      const next: [number, number, number] = [...localEuler];
                      next[idx] = Number(e.target.value);
                      setLocalEuler(next);
                      onChangeBoneEuler(next);
                    }}
                    className="flex-1 accent-sky-500"
                  />
                  <input
                    type="number"
                    step="1"
                    value={Math.round(localEuler[idx] * 10) / 10}
                    onChange={(e) => {
                      const next: [number, number, number] = [...localEuler];
                      next[idx] = Number(e.target.value) || 0;
                      setLocalEuler(next);
                      onChangeBoneEuler(next);
                    }}
                    className="w-16 bg-[#10141d] border border-[#2f384d] rounded px-1.5 py-0.5 text-xs text-white font-mono text-right"
                  />
                </div>
              );
            })}

            <button
              type="button"
              onClick={onToggleBoneOverride}
              title="Bật để khớp chỉ chạy theo keyframe bạn đặt, không bị chuyển động gốc của animation làm lệch ở giữa"
              className={`w-full py-1.5 px-2.5 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition ${
                isSelectedBoneOverridden
                  ? 'bg-violet-600/25 border-violet-400 text-violet-200'
                  : 'bg-[#10141d] border-[#2f384d] text-gray-300 hover:text-white'
              }`}
            >
              <span>
                {isSelectedBoneOverridden
                  ? '✓ Đang ghi đè pose gốc (Chỉ theo Keyframe)'
                  : 'Ghi đè pose gốc (Bỏ chuyển động gốc)'}
              </span>
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">
            Click vào bất kỳ khớp tròn xanh nào trên nhân vật hoặc chọn trong Cây Xương bên dưới.
          </p>
        )}

        {/* Mirror Left <-> Right */}
        <div className="pt-2 border-t border-[#272e3f] grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onMirrorLeftToRight}
            className="py-1.5 px-2 rounded-lg bg-[#10141d] hover:bg-[#1e2636] border border-[#2f384d] text-[11px] text-gray-200 flex items-center justify-center gap-1"
          >
            <ArrowLeftRight className="w-3 h-3 text-sky-400" />
            <span>Chép Trái → Phải</span>
          </button>
          <button
            type="button"
            onClick={onMirrorRightToLeft}
            className="py-1.5 px-2 rounded-lg bg-[#10141d] hover:bg-[#1e2636] border border-[#2f384d] text-[11px] text-gray-200 flex items-center justify-center gap-1"
          >
            <ArrowLeftRight className="w-3 h-3 text-indigo-400" />
            <span>Chép Phải → Trái</span>
          </button>
        </div>
      </div>

      {/* Hips Root Position Offset */}
      <div className="p-3.5 rounded-xl bg-[#191e2a] border border-[#272e3f] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white">Dịch chuyển Hông (Hips Offset)</span>
          <button
            type="button"
            onClick={onResetHipsAtTime}
            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-gray-200"
          >
            Reset 0
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
            <div key={axis} className="space-y-0.5">
              <label className="text-[10px] text-gray-400">{axis} (m)</label>
              <input
                type="number"
                step="0.01"
                value={Number(hipsOffset[idx].toFixed(2))}
                onChange={(e) => {
                  const next: [number, number, number] = [...hipsOffset];
                  next[idx] = Number(e.target.value) || 0;
                  onChangeHipsOffset(next);
                }}
                className="w-full bg-[#10141d] border border-[#2f384d] rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save / Revert Actions */}
      <div className="p-3.5 rounded-xl bg-[#191e2a] border border-emerald-500/30 space-y-2.5">
        <button
          type="button"
          disabled={!localApiReady}
          onClick={onSaveToGame}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg"
        >
          {dirty ? <Save className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          <span>Lưu chỉnh sửa vào Game (Mọi nhân vật)</span>
        </button>

        {hasAnyEdits && (
          <button
            type="button"
            onClick={onResetAllEdits}
            className="w-full py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Animation (Về pose gốc)</span>
          </button>
        )}

        {hasSavedLayer && (
          <button
            type="button"
            disabled={!localApiReady}
            onClick={onDeleteEditLayer}
            className="w-full py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa bản đã lưu trên Game</span>
          </button>
        )}
      </div>
    </div>
  );
};
