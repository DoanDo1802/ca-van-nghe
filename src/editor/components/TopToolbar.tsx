import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  Download,
  Globe,
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
} from 'lucide-react';
import { EditorEngine } from '../../engine/EditorEngine';
import { importCaVanNgheScene } from '../../engine/serialization/CaVanNgheImporter';
import { BundleExporter, ProjectRepository } from '../../storage';
import { useAssetStore } from '../../store/useAssetStore';
import { useConsoleStore } from '../../store/useConsoleStore';
import { useEditorStore } from '../../store/useEditorStore';
import type { TransformTool } from '../../types';
import { saveCurrentProject } from '../utils/saveProject';

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
  const sceneName = useEditorStore((s) => s.sceneName);
  const isDirty = useEditorStore((s) => s.isDirty);

  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setCoordSpace = useEditorStore((s) => s.setCoordSpace);
  const setSnapSettings = useEditorStore((s) => s.setSnapSettings);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const importFiles = useAssetStore((s) => s.importFiles);
  const loadAssets = useAssetStore((s) => s.loadAssets);

  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [caVanNgheLoading, setCaVanNgheLoading] = useState(false);

  const fileMenuRef = useRef<HTMLDivElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const engine = EditorEngine.getInstance();

  useEffect(() => {
    if (!fileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFileMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [fileMenuOpen]);

  const handleResetCaVanNgheScene = async () => {
    if (caVanNgheLoading) return;
    setFileMenuOpen(false);
    if (!window.confirm('Reset scene về mặc định "Ca Van Nghe"? Mọi thay đổi chưa export sẽ bị ghi đè.')) {
      return;
    }
    setCaVanNgheLoading(true);
    useConsoleStore.getState().addLog({
      level: 'log',
      source: 'File',
      message: 'Resetting "Ca Van Nghe" lounge scene...',
    });
    try {
      await importCaVanNgheScene(engine);
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'File',
        message: 'Reset "Ca Van Nghe" lounge scene.',
      });
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Reset "Ca Van Nghe" Scene failed: ${err instanceof Error ? err.message : String(err)}`,
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
                  {caVanNgheLoading ? 'Resetting "Ca Van Nghe"...' : 'Reset "Ca Van Nghe" Scene'}
                </span>
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

        {/* Scene Name + Unsaved Indicator (*) */}
        <div
          title={
            isDirty
              ? 'Unsaved changes — Press Ctrl+S to save'
              : `Saved scene: ${sceneName}`
          }
          className="hidden sm:flex items-center gap-1 px-2 h-7 rounded bg-[#12151b] border border-[#2b313d] text-[11px] text-gray-300 max-w-[160px]"
        >
          <span className="truncate">{sceneName}</span>
          {isDirty && (
            <span className="text-amber-400 font-bold text-sm leading-none">*</span>
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

      {/* Right: Build Player / Standalone Play / Legacy Reference / Viewport Resolution */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            void handleExportBundle();
            useConsoleStore.getState().addLog({
              level: 'log',
              source: 'Build',
              message: 'Đã xuất Web Bundle (.json). Chạy "npm run build:player" để build bản Player tách riêng ra thư mục dist-player/.',
            });
          }}
          title="Xuất Scene Bundle cho bản Player độc lập (kết hợp npm run build:player)"
          className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 text-[11px] font-medium transition-colors"
        >
          Build Player
        </button>
        <a
          href="?play=1"
          target="_blank"
          rel="noopener noreferrer"
          title="Mở bản Game Web PlayCanvas độc lập (không có Editor UI)"
          className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 text-[11px] font-medium transition-colors"
        >
          Play Web
        </a>
        <a
          href="?legacy=1"
          target="_blank"
          rel="noopener noreferrer"
          title="Mở game web gốc (Three.js) để đối chiếu"
          className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-[11px] font-medium transition-colors"
        >
          Legacy Game
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
    </header>
  );
};
