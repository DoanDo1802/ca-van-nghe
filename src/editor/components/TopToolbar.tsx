import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Check,
  ChevronDown,
  Download,
  Globe,
  Layers,
  Loader2,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  Music,
  Pause,
  Play,
  Redo2,
  RotateCw,
  Save,
  SkipForward,
  Square,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-react';
import { EditorEngine } from '../../engine/EditorEngine';
import {
  getAllSceneDefinitions,
  getSceneDefinition,
} from '../../engine/serialization/SceneRegistry';
import { BundleExporter, ProjectRepository } from '../../storage';
import { useAssetStore } from '../../store/useAssetStore';
import { useConsoleStore } from '../../store/useConsoleStore';
import { useEditorStore } from '../../store/useEditorStore';
import type { TransformTool } from '../../types';
import { saveCurrentProject } from '../utils/saveProject';
import { BuildSettingsModal } from './BuildSettingsModal';

export interface TopToolbarProps {
  viewportSize?: { width: number; height: number };
}

const TOOL_ITEMS: Array<{
  id: TransformTool;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'select', label: 'Select', shortcut: 'Q', icon: MousePointer2 },
  { id: 'move', label: 'Move', shortcut: 'W', icon: Move },
  { id: 'rotate', label: 'Rotate', shortcut: 'E', icon: RotateCw },
  { id: 'scale', label: 'Scale', shortcut: 'R', icon: Maximize2 },
];

export const TopToolbar: React.FC<TopToolbarProps> = ({ viewportSize }) => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const coordSpace = useEditorStore((s) => s.coordSpace);
  const snapSettings = useEditorStore((s) => s.snapSettings);
  const playState = useEditorStore((s) => s.playState);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undoLabel = useEditorStore((s) => s.undoLabel);
  const sceneId = useEditorStore((s) => s.sceneId);
  const sceneName = useEditorStore((s) => s.sceneName);
  const isDirty = useEditorStore((s) => s.isDirty);

  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setCoordSpace = useEditorStore((s) => s.setCoordSpace);
  const setSnapSettings = useEditorStore((s) => s.setSnapSettings);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const importFiles = useAssetStore((s) => s.importFiles);
  const loadAssets = useAssetStore((s) => s.loadAssets);

  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [buildSettingsOpen, setBuildSettingsOpen] = useState(false);
  const [caVanNgheLoading, setCaVanNgheLoading] = useState(false);

  const fileMenuRef = useRef<HTMLDivElement>(null);
  const sceneMenuRef = useRef<HTMLDivElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const engine = EditorEngine.getInstance();
  const sceneDefs = getAllSceneDefinitions();

  useEffect(() => {
    if (!fileMenuOpen && !sceneMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
      if (sceneMenuRef.current && !sceneMenuRef.current.contains(e.target as Node)) {
        setSceneMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFileMenuOpen(false);
        setSceneMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [fileMenuOpen, sceneMenuOpen]);

  const handleSwitchEditorScene = async (targetSceneId: string) => {
    if (caVanNgheLoading || targetSceneId === engine.getSceneId()) {
      setSceneMenuOpen(false);
      return;
    }
    setSceneMenuOpen(false);
    setCaVanNgheLoading(true);
    try {
      await engine.loadSceneById(targetSceneId);
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'Scene',
        message: `Chuyển scene thất bại: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setCaVanNgheLoading(false);
    }
  };

  const handleResetCaVanNgheScene = async () => {
    if (caVanNgheLoading) return;
    setFileMenuOpen(false);
    const activeId = engine.getSceneId();
    const activeDef = getSceneDefinition(activeId);
    if (
      !window.confirm(
        `Reset scene "${activeDef.name}" về mặc định? Mọi thay đổi trong scene này chưa export sẽ bị ghi đè.`
      )
    ) {
      return;
    }
    setCaVanNgheLoading(true);
    useConsoleStore.getState().addLog({
      level: 'log',
      source: 'File',
      message: `Resetting scene "${activeDef.name}"...`,
    });
    try {
      await engine.resetSceneById(activeId);
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'File',
        message: `Reset scene "${activeDef.name}" complete.`,
      });
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Reset scene failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setCaVanNgheLoading(false);
    }
  };

  useEffect(() => {
    document.title = `${sceneName}${isDirty ? '*' : ''} — Ca Van Nghe Editor`;
  }, [sceneName, isDirty]);

  const handleSaveProject = async () => {
    setFileMenuOpen(false);
    await saveCurrentProject();
  };

  const handleExportBundle = async () => {
    setFileMenuOpen(false);
    try {
      const schema = engine.exportSceneSchema();
      const blob = await BundleExporter.exportStandaloneBundle(schema);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (schema.metadata.name || 'scene')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-');
      a.href = url;
      a.download = `${safeName}.bundle.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'File',
        message: `Exported Web Bundle "${a.download}".`,
      });
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Export Bundle failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleImportBundleFile = async (file: File) => {
    try {
      const schema = await BundleExporter.importStandaloneBundle(file);
      engine.loadSceneSchema(schema);
      await ProjectRepository.saveAutoDraft(schema);
      await loadAssets();
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'File',
        message: `Imported Web Bundle "${file.name}".`,
      });
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Import Bundle failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleSelectTool = (tool: TransformTool) => {
    setActiveTool(tool);
    engine.setTool(tool);
  };

  const handleToggleCoordSpace = () => {
    const next = coordSpace === 'world' ? 'local' : 'world';
    setCoordSpace(next);
    engine.setCoordSpace(next);
  };

  const syncSnapToEngine = (next: {
    enabled: boolean;
    translateStep: number;
    rotateStep: number;
    scaleStep: number;
  }) => {
    engine.setSnapSettings({
      enabled: next.enabled,
      move: next.translateStep,
      rotate: next.rotateStep,
      scale: next.scaleStep,
    });
  };

  const handleToggleSnap = () => {
    const next = { ...snapSettings, enabled: !snapSettings.enabled };
    toggleSnap();
    syncSnapToEngine(next);
  };

  const handleStepChange = (
    field: 'translateStep' | 'rotateStep' | 'scaleStep',
    rawValue: string
  ) => {
    const parsed = parseFloat(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const next = { ...snapSettings, [field]: parsed };
    setSnapSettings({ [field]: parsed });
    syncSnapToEngine(next);
  };

  const handleUndo = () => {
    engine.undo();
  };

  const handleRedo = () => {
    engine.redo();
  };

  const resolutionLabel =
    viewportSize && viewportSize.width > 0 && viewportSize.height > 0
      ? `${viewportSize.width}×${viewportSize.height}`
      : 'WebGL2';

  return (
    <header className="h-10 shrink-0 bg-[#1b1f27] border-b border-[#2b313d] px-2.5 flex items-center justify-between gap-2 text-xs">
      {/* Left: File Menu, Transform Tools, Coord Space, Snap, Undo/Redo */}
      <div className="flex items-center gap-2 min-w-0">
        {/* File Dropdown */}
        <div ref={fileMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setFileMenuOpen((v) => !v)}
            className={`h-7 px-2.5 rounded border flex items-center gap-1 font-medium transition-colors ${
              fileMenuOpen
                ? 'bg-[#252b36] border-blue-500/60 text-white'
                : 'bg-[#12151b] border-[#2b313d] text-gray-200 hover:bg-[#252b36]'
            }`}
          >
            <span>File</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {fileMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 py-1 rounded-md bg-[#1e232d] border border-[#323948] shadow-xl text-xs text-gray-200">
              <button
                type="button"
                onClick={() => void handleSaveProject()}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <Save className="w-3.5 h-3.5 text-sky-400" />
                  <span>Save Project</span>
                </span>
                <span className="text-[10px] text-gray-400 font-mono">Ctrl+S</span>
              </button>
              <button
                type="button"
                disabled={caVanNgheLoading}
                onClick={() => void handleResetCaVanNgheScene()}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {caVanNgheLoading ? (
                  <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                ) : (
                  <Music className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>
                  {caVanNgheLoading ? 'Resetting Scene...' : 'Reset Current Scene'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFileMenuOpen(false);
                  setBuildSettingsOpen(true);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center gap-2"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Build Settings...</span>
              </button>

              <div className="my-1 border-t border-[#2d3340]" />

              <button
                type="button"
                onClick={() => {
                  setFileMenuOpen(false);
                  assetInputRef.current?.click();
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Import Asset...</span>
              </button>

              <div className="my-1 border-t border-[#2d3340]" />

              <button
                type="button"
                onClick={() => void handleExportBundle()}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span>Export Web Bundle (.json)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFileMenuOpen(false);
                  bundleInputRef.current?.click();
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5 text-purple-400" />
                <span>Import Bundle (.json)...</span>
              </button>
            </div>
          )}

          <input
            ref={assetInputRef}
            type="file"
            multiple
            accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void importFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <input
            ref={bundleInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleImportBundleFile(file);
                e.target.value = '';
              }
            }}
          />
        </div>

        {/* Multi-Scene Switcher Dropdown */}
        <div ref={sceneMenuRef} className="relative hidden sm:block">
          <button
            type="button"
            onClick={() => setSceneMenuOpen((v) => !v)}
            title={
              isDirty
                ? 'Unsaved changes — Click to switch Scene'
                : `Scene đang mở: ${sceneName} (Click để chuyển Scene)`
            }
            className={`flex items-center gap-1.5 px-2.5 h-7 rounded border text-[11px] max-w-[190px] transition-colors ${
              sceneMenuOpen
                ? 'bg-[#252b36] border-amber-500/60 text-white'
                : 'bg-[#12151b] border-[#2b313d] text-gray-200 hover:bg-[#252b36]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{sceneName}</span>
            {isDirty && (
              <span className="text-amber-400 font-bold text-sm leading-none">*</span>
            )}
            <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
          </button>

          {sceneMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 w-64 py-1 rounded-md bg-[#1e232d] border border-[#323948] shadow-xl text-xs text-gray-200">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-[#2d3340]">
                Scenes (Chuyển nhanh)
              </div>
              {sceneDefs.map((def, idx) => {
                const isCurrent = sceneId === def.id;
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => void handleSwitchEditorScene(def.id)}
                    className={`w-full px-3 py-1.5 text-left hover:bg-blue-600/35 flex items-center justify-between gap-2 ${
                      isCurrent ? 'bg-amber-500/10 text-amber-200' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        <span className="font-mono text-[10px] text-gray-400 mr-1.5">
                          [{idx}]
                        </span>
                        {def.name}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">{def.path}</div>
                    </div>
                    {isCurrent && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </button>
                );
              })}
              <div className="my-1 border-t border-[#2d3340]" />
              <button
                type="button"
                onClick={() => {
                  setSceneMenuOpen(false);
                  setBuildSettingsOpen(true);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-purple-600/30 text-purple-300 flex items-center gap-2 text-[11px]"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Mở Unity Build Settings...</span>
              </button>
            </div>
          )}
        </div>

        {/* Transform Tools */}
        <div className="flex items-center bg-[#12151b] border border-[#2b313d] rounded p-0.5 gap-0.5">
          {TOOL_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={`${item.label} (${item.shortcut})`}
                onClick={() => handleSelectTool(item.id)}
                className={`h-6 px-2 rounded flex items-center gap-1 transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-[#252b36]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden xl:inline font-medium">{item.shortcut}</span>
              </button>
            );
          })}
        </div>

        {/* Local / World Toggle */}
        <button
          type="button"
          onClick={handleToggleCoordSpace}
          title={`Coordinate Space: ${coordSpace === 'world' ? 'World' : 'Local'} (click to toggle)`}
          className="h-7 px-2 rounded bg-[#12151b] border border-[#2b313d] hover:bg-[#252b36] text-gray-200 flex items-center gap-1.5 transition-colors"
        >
          {coordSpace === 'world' ? (
            <Globe className="w-3.5 h-3.5 text-sky-400" />
          ) : (
            <Box className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span className="font-medium capitalize">{coordSpace}</span>
        </button>

        {/* Snap Toggle & Step Inputs */}
        <div className="flex items-center bg-[#12151b] border border-[#2b313d] rounded px-1 py-0.5 gap-1.5">
          <button
            type="button"
            onClick={handleToggleSnap}
            title="Toggle Grid & Transform Snap"
            className={`h-6 px-1.5 rounded flex items-center gap-1 transition-colors ${
              snapSettings.enabled
                ? 'bg-amber-600/90 text-white'
                : 'text-gray-400 hover:text-gray-100 hover:bg-[#252b36]'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Snap</span>
          </button>

          <label className="flex items-center gap-1 text-[11px] text-gray-400" title="Move snap (meters)">
            <span>M</span>
            <input
              type="number"
              step="0.1"
              min="0.01"
              value={snapSettings.translateStep}
              onChange={(e) => handleStepChange('translateStep', e.target.value)}
              className="w-11 h-5 bg-[#1b1f27] border border-[#2f3644] rounded px-1 text-gray-200 text-right focus:outline-none focus:border-blue-500"
            />
          </label>

          <label className="hidden md:flex items-center gap-1 text-[11px] text-gray-400" title="Rotate snap (degrees)">
            <span>R</span>
            <input
              type="number"
              step="5"
              min="1"
              value={snapSettings.rotateStep}
              onChange={(e) => handleStepChange('rotateStep', e.target.value)}
              className="w-10 h-5 bg-[#1b1f27] border border-[#2f3644] rounded px-1 text-gray-200 text-right focus:outline-none focus:border-blue-500"
            />
          </label>

          <label className="hidden lg:flex items-center gap-1 text-[11px] text-gray-400" title="Scale snap">
            <span>S</span>
            <input
              type="number"
              step="0.05"
              min="0.01"
              value={snapSettings.scaleStep}
              onChange={(e) => handleStepChange('scaleStep', e.target.value)}
              className="w-10 h-5 bg-[#1b1f27] border border-[#2f3644] rounded px-1 text-gray-200 text-right focus:outline-none focus:border-blue-500"
            />
          </label>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center bg-[#12151b] border border-[#2b313d] rounded p-0.5 gap-0.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={handleUndo}
            title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
            className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${
              canUndo
                ? 'text-gray-200 hover:bg-[#252b36]'
                : 'text-gray-600 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={handleRedo}
            title="Redo (Ctrl+Y)"
            className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${
              canRedo
                ? 'text-gray-200 hover:bg-[#252b36]'
                : 'text-gray-600 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Play / Pause / Step / Stop */}
      <div className="flex items-center bg-[#12151b] border border-[#2b313d] rounded p-0.5 gap-0.5">
        <button
          type="button"
          disabled={playState === 'playing'}
          onClick={() => void engine.play()}
          title={playState === 'paused' ? 'Resume Play Mode' : 'Play Scene'}
          data-play-state={playState}
          className={`h-6 px-2.5 rounded flex items-center gap-1 transition-colors ${
            playState === 'playing'
              ? 'bg-emerald-600/25 text-emerald-300 cursor-default'
              : 'text-gray-200 hover:bg-emerald-600/20 hover:text-emerald-300'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
        </button>
        <button
          type="button"
          disabled={playState !== 'playing'}
          onClick={() => engine.pause()}
          title="Pause Play Mode"
          className={`h-6 px-2 rounded flex items-center justify-center transition-colors ${
            playState === 'playing'
              ? 'text-gray-200 hover:bg-amber-600/20 hover:text-amber-300'
              : playState === 'paused'
                ? 'bg-amber-600/25 text-amber-300 cursor-default'
                : 'text-gray-600 cursor-not-allowed'
          }`}
        >
          <Pause className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={playState === 'edit'}
          onClick={() => engine.step()}
          title="Step Single Frame (1/60s)"
          className={`h-6 px-2 rounded flex items-center justify-center transition-colors ${
            playState !== 'edit'
              ? 'text-gray-200 hover:bg-[#252b36]'
              : 'text-gray-600 cursor-not-allowed'
          }`}
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={playState === 'edit'}
          onClick={() => engine.stop()}
          title="Stop Play Mode & Restore Scene"
          className={`h-6 px-2 rounded flex items-center justify-center transition-colors ${
            playState !== 'edit'
              ? 'text-rose-300 hover:bg-rose-600/25'
              : 'text-gray-600 cursor-not-allowed'
          }`}
        >
          <Square className="w-3 h-3 fill-current" />
        </button>
      </div>

      {/* Right: Character Studio / Build Player / Standalone Play / Viewport Resolution */}
      <div className="flex items-center gap-2 shrink-0">
        <a
          href="/studio"
          title="Mở Character & Animation Studio (Kéo thả đổi Model Player & thêm Animation/Emote)"
          className="px-2.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/35 text-[11px] font-semibold transition-colors flex items-center gap-1"
        >
          <Wand2 className="w-3 h-3" />
          <span>Character Studio</span>
        </a>
        <button
          type="button"
          onClick={() => setBuildSettingsOpen(true)}
          title="Mở Build Settings để chọn các Scene cần Build (giống Unity Build Settings)"
          className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 text-[11px] font-medium transition-colors flex items-center gap-1"
        >
          <Layers className="w-3 h-3" />
          <span>Build Player</span>
        </button>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          title="Mở bản Game Web độc lập (không có Editor UI)"
          className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 text-[11px] font-medium transition-colors"
        >
          Play Web
        </a>
        <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
          Web Game
        </span>
        <span
          className="px-2 py-0.5 rounded bg-[#12151b] border border-[#2b313d] text-gray-400 font-mono text-[11px]"
          title="Viewport Canvas Resolution"
        >
          {resolutionLabel}
        </span>
      </div>

      <BuildSettingsModal
        isOpen={buildSettingsOpen}
        onClose={() => setBuildSettingsOpen(false)}
      />
    </header>
  );
};
