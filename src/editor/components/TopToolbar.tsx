import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  Download,
  FilePlus,
  FolderOpen,
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
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { EditorEngine } from '../../engine/EditorEngine';
import { importCaVanNgheScene } from '../../engine/serialization/CaVanNgheImporter';
import { BundleExporter, ProjectRepository } from '../../storage';
import { useAssetStore } from '../../store/useAssetStore';
import { useConsoleStore } from '../../store/useConsoleStore';
import { useEditorStore } from '../../store/useEditorStore';
import type { TransformTool } from '../../types';

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

  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setCoordSpace = useEditorStore((s) => s.setCoordSpace);
  const setSnapSettings = useEditorStore((s) => s.setSnapSettings);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const importFiles = useAssetStore((s) => s.importFiles);
  const loadAssets = useAssetStore((s) => s.loadAssets);

  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<
    Array<{ id: string; name: string; updatedAt: string }>
  >([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
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

  const handleNewScene = () => {
    setFileMenuOpen(false);
    engine.newScene();
    useConsoleStore.getState().addLog({
      level: 'log',
      source: 'File',
      message: 'Created new scene.',
    });
  };

  const handleOpenCaVanNgheScene = async () => {
    if (caVanNgheLoading) return;
    setFileMenuOpen(false);
    setCaVanNgheLoading(true);
    useConsoleStore.getState().addLog({
      level: 'log',
      source: 'File',
      message: 'Loading "Ca Van Nghe" lounge scene...',
    });
    try {
      await importCaVanNgheScene(engine);
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'File',
        message: 'Loaded "Ca Van Nghe" lounge scene.',
      });
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Open "Ca Van Nghe" Scene failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setCaVanNgheLoading(false);
    }
  };

  const handleSaveProject = async () => {
    setFileMenuOpen(false);
    try {
      const schema = engine.exportSceneSchema();
      await ProjectRepository.saveProject(schema);
      await ProjectRepository.saveAutoDraft(schema);
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'File',
        message: `Saved project "${schema.metadata.name}" to IndexedDB.`,
      });
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Save Project failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleOpenLoadModal = async () => {
    setFileMenuOpen(false);
    setLoadModalOpen(true);
    setProjectsLoading(true);
    try {
      const list = await ProjectRepository.listProjects();
      setSavedProjects(list);
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Failed to list projects: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleLoadProject = async (id: string) => {
    try {
      const schema = await ProjectRepository.loadProject(id);
      if (!schema) {
        useConsoleStore.getState().addLog({
          level: 'warn',
          source: 'File',
          message: `Project "${id}" not found.`,
        });
        return;
      }
      engine.loadSceneSchema(schema);
      await ProjectRepository.saveAutoDraft(schema);
      setLoadModalOpen(false);
      useConsoleStore.getState().addLog({
        level: 'log',
        source: 'File',
        message: `Loaded project "${schema.metadata.name}".`,
      });
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Load Project failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await ProjectRepository.deleteProject(id);
      setSavedProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      useConsoleStore.getState().addLog({
        level: 'error',
        source: 'File',
        message: `Delete Project failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
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
                onClick={handleNewScene}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center gap-2"
              >
                <FilePlus className="w-3.5 h-3.5 text-gray-400" />
                <span>New Scene</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSaveProject()}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5 text-sky-400" />
                <span>Save Project</span>
              </button>
              <button
                type="button"
                onClick={() => void handleOpenLoadModal()}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Load Project...</span>
              </button>
              <button
                type="button"
                disabled={caVanNgheLoading}
                onClick={() => void handleOpenCaVanNgheScene()}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {caVanNgheLoading ? (
                  <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                ) : (
                  <Music className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>
                  {caVanNgheLoading ? 'Loading "Ca Van Nghe"...' : 'Open "Ca Van Nghe" Scene'}
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

      {/* Right: Legacy Reference / Standalone Play / Web Game Badge / Viewport Resolution */}
      <div className="flex items-center gap-2 shrink-0">
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

      {/* Load Project Modal */}
      {loadModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setLoadModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-[#1b1f27] border border-[#323948] shadow-2xl overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-[#2b313d] flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-gray-100">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span>Load Project from IndexedDB</span>
              </div>
              <button
                type="button"
                onClick={() => setLoadModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-3 space-y-1.5">
              {projectsLoading ? (
                <div className="py-8 text-center text-gray-500">Loading saved projects...</div>
              ) : savedProjects.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  No saved projects found. Use File &gt; Save Project first.
                </div>
              ) : (
                savedProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="p-2.5 rounded bg-[#12151b] border border-[#2b313d] hover:border-blue-500/60 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-200 truncate">{proj.name}</div>
                      <div className="text-[10px] text-gray-500">
                        Updated: {new Date(proj.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleLoadProject(proj.id)}
                        className="h-6 px-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        title="Delete Project"
                        onClick={() => void handleDeleteProject(proj.id)}
                        className="h-6 w-6 rounded bg-[#1b1f27] border border-[#2b313d] hover:border-red-500/60 text-gray-400 hover:text-red-400 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-2 border-t border-[#2b313d] flex justify-end">
              <button
                type="button"
                onClick={() => setLoadModalOpen(false)}
                className="h-7 px-3 rounded bg-[#12151b] border border-[#2b313d] hover:bg-[#252b36] text-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
