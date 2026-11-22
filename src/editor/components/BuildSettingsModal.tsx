import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Download,
  ExternalLink,
  FolderOpen,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import { EditorEngine } from '../../engine/EditorEngine';
import {
  getBuildSettingsScenes,
  getSceneDefinition,
  saveBuildSettingsScenes,
  type BuildSceneEntry,
} from '../../engine/serialization/SceneRegistry';
import { BundleExporter } from '../../storage';
import { useConsoleStore } from '../../store/useConsoleStore';
import { useEditorStore } from '../../store/useEditorStore';

export interface BuildSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BuildSettingsModal: React.FC<BuildSettingsModalProps> = ({ isOpen, onClose }) => {
  const currentSceneId = useEditorStore((s) => s.sceneId);
  const [entries, setEntries] = useState<BuildSceneEntry[]>(() => getBuildSettingsScenes());
  const [building, setBuilding] = useState(false);
  const [busySceneId, setBusySceneId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEntries(getBuildSettingsScenes());
      setErrorMsg(null);
    }
  }, [isOpen]);

  const enabledEntries = useMemo(() => entries.filter((e) => e.enabled), [entries]);

  const buildIndexBySceneId = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const e of entries) {
      if (e.enabled) {
        map.set(e.sceneId, idx++);
      }
    }
    return map;
  }, [entries]);

  const selectedModelSummary = useMemo(() => {
    const urls = new Set<string>();
    for (const e of enabledEntries) {
      for (const u of getSceneDefinition(e.sceneId).modelUrls) {
        urls.add(u.split('/').pop() || u);
      }
    }
    return Array.from(urls);
  }, [enabledEntries]);

  if (!isOpen) return null;

  const updateAndSave = (next: BuildSceneEntry[]) => {
    const saved = saveBuildSettingsScenes(next);
    setEntries(saved);
  };

  const handleToggleScene = (sceneId: string) => {
    setErrorMsg(null);
    updateAndSave(
      entries.map((e) => (e.sceneId === sceneId ? { ...e, enabled: !e.enabled } : e))
    );
  };

  const handleMove = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    updateAndSave(next);
  };

  const handleAddOpenScene = () => {
    if (!currentSceneId) return;
    const exists = entries.some((e) => e.sceneId === currentSceneId);
    if (!exists) return;
    updateAndSave(
      entries.map((e) => (e.sceneId === currentSceneId ? { ...e, enabled: true } : e))
    );
    useConsoleStore.getState().addLog({
      level: 'log',
      source: 'Build Settings',
      message: `Đã thêm scene "${getSceneDefinition(currentSceneId).name}" vào Scenes In Build.`,
    });
  };

  const handleOpenSceneInEditor = async (sceneId: string) => {
    if (busySceneId || building) return;
    setBusySceneId(sceneId);
    setErrorMsg(null);
    try {
      await EditorEngine.getInstance().loadSceneById(sceneId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySceneId(null);
    }
  };

  const handleResetScene = async (sceneId: string) => {
    if (busySceneId || building) return;
    const def = getSceneDefinition(sceneId);
    if (!window.confirm(`Reset "${def.name}" về bố cục mặc định? Mọi chỉnh sửa trong scene này sẽ bị đặt lại.`)) {
      return;
    }
    setBusySceneId(sceneId);
    setErrorMsg(null);
    try {
      await EditorEngine.getInstance().resetSceneById(sceneId);
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'Build Settings',
        message: `Đã reset scene "${def.name}" về mặc định.`,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySceneId(null);
    }
  };

  const handleBuildAndExport = async () => {
    if (building || enabledEntries.length === 0) return;
    setBuilding(true);
    setErrorMsg(null);
    const engine = EditorEngine.getInstance();
    try {
      const targetIds = enabledEntries.map((e) => e.sceneId);
      const schemas = await engine.collectSchemasForBuild(targetIds);
      const blob = await BundleExporter.exportMultiSceneBundle(schemas);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ca-van-nghe-build.bundle.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'Build',
        message: `Đã Build Multi-Scene Bundle (${schemas.length} scenes: ${enabledEntries.map((e) => e.name).join(' → ')}). Chạy "npm run build:player" để build dist-player/.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'Build',
        message: `Build Multi-Scene thất bại: ${msg}`,
      });
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl rounded-xl bg-[#1b1f27] border border-[#2f3644] shadow-2xl overflow-hidden text-xs text-gray-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-[#151820] border-b border-[#2b313d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Build Settings (Unity Multi-Scene)</h2>
              <p className="text-[11px] text-gray-400">
                Chọn các scene muốn đưa vào bản Build và sắp xếp thứ tự Index (0 = Start Scene)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#252b36] text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">
              Scenes In Build
            </span>
            <button
              type="button"
              onClick={handleAddOpenScene}
              className="px-2.5 py-1 rounded bg-[#252b36] hover:bg-[#2f3745] border border-[#363e4e] text-gray-200 flex items-center gap-1.5 text-[11px] font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" />
              <span>Add Open Scene</span>
            </button>
          </div>

          <div className="rounded-lg border border-[#2b313d] bg-[#12151b] divide-y divide-[#222733] overflow-hidden">
            {entries.map((entry, idx) => {
              const def = getSceneDefinition(entry.sceneId);
              const buildIdx = buildIndexBySceneId.get(entry.sceneId);
              const isCurrent = entry.sceneId === currentSceneId;
              const isBusy = busySceneId === entry.sceneId;

              return (
                <div
                  key={entry.sceneId}
                  className={`px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                    entry.enabled ? 'bg-[#12151b]' : 'bg-[#0e1116] opacity-65'
                  } ${isCurrent ? 'ring-1 ring-inset ring-sky-500/35' : ''}`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleToggleScene(entry.sceneId)}
                      className="mt-0.5 text-sky-400 hover:text-sky-300 shrink-0"
                      title={entry.enabled ? 'Bỏ chọn scene khỏi bản Build' : 'Thêm scene vào bản Build'}
                    >
                      {entry.enabled ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-500" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-gray-200 truncate">
                          {entry.path}
                        </span>
                        <span className="text-[11px] text-amber-300 font-medium">
                          ({entry.name})
                        </span>
                        {buildIdx === 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-semibold">
                            Start Scene
                          </span>
                        )}
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 text-[10px] font-semibold">
                            Đang mở
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        Assets: {def.modelUrls.map((u) => u.split('/').pop()).join(', ')}
                      </div>
                    </div>
                  </div>

                  {/* Build Index + Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="w-6 h-6 rounded bg-[#1b1f27] border border-[#2b313d] flex items-center justify-center font-mono text-[11px] text-gray-300"
                      title="Build Index"
                    >
                      {buildIdx !== undefined ? buildIdx : '—'}
                    </span>

                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, -1)}
                        className="p-0.5 rounded bg-[#1b1f27] hover:bg-[#252b36] disabled:opacity-30 text-gray-300"
                        title="Đưa lên trên"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === entries.length - 1}
                        onClick={() => handleMove(idx, 1)}
                        className="p-0.5 rounded bg-[#1b1f27] hover:bg-[#252b36] disabled:opacity-30 text-gray-300"
                        title="Đưa xuống dưới"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={Boolean(busySceneId) || building}
                      onClick={() => void handleOpenSceneInEditor(entry.sceneId)}
                      className="h-7 px-2 rounded bg-[#202632] hover:bg-[#2a3242] border border-[#323948] text-gray-200 flex items-center gap-1 text-[11px] disabled:opacity-50"
                      title="Mở scene này trong Editor để chỉnh sửa"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <FolderOpen className="w-3 h-3 text-sky-400" />
                      )}
                      <span>Open</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(busySceneId) || building}
                      onClick={() => void handleResetScene(entry.sceneId)}
                      className="h-7 px-2 rounded bg-[#202632] hover:bg-rose-950/50 border border-[#323948] hover:border-rose-500/40 text-gray-300 hover:text-rose-200 flex items-center gap-1 text-[11px] disabled:opacity-50"
                      title="Reset scene về mặc định"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-lg bg-[#12151b] border border-[#2b313d] flex items-center justify-between gap-3 text-[11px]">
            <div className="text-gray-300">
              Đã chọn <strong className="text-white">{enabledEntries.length}</strong>/{entries.length} scene
              {enabledEntries.length > 0 && (
                <span className="text-gray-400">
                  {' '}
                  • Assets đóng gói: {selectedModelSummary.join(', ')}
                </span>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-200 text-[11px]">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#151820] border-t border-[#2b313d] flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">
            Scene ở Index 0 sẽ tự động chạy khi mở bản Game Player.
          </span>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded bg-[#252b36] hover:bg-[#2f3746] border border-[#343c4c] text-gray-200 font-medium"
            >
              Đóng
            </button>

            <a
              href="?play=1"
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 rounded bg-sky-600/25 hover:bg-sky-600/35 border border-sky-500/40 text-sky-200 font-medium flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Run Build (?play=1)</span>
            </a>

            <button
              type="button"
              disabled={enabledEntries.length === 0 || building}
              onClick={() => void handleBuildAndExport()}
              className="h-8 px-3.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold flex items-center gap-1.5 shadow"
            >
              {building ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{building ? 'Đang Build...' : 'Build & Export Bundle'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
