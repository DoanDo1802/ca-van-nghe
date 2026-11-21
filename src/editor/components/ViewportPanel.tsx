import React, { useEffect, useRef, useState } from 'react';
import { EditorEngine } from '../../engine/EditorEngine';
import { useEditorStore } from '../../store/useEditorStore';
import { GameOverlayUI } from './GameOverlayUI';
import { YouTubeStagePlayer } from '../../components/YouTubeStagePlayer';

export type CameraSnapView = 'top' | 'front' | 'right' | 'iso';

export interface ViewportPanelProps {
  onViewportResize?: (size: { width: number; height: number }) => void;
}

const AXIS_VIEW_BUTTONS: Array<{
  view: CameraSnapView;
  label: string;
  title: string;
  colorClass: string;
}> = [
  { view: 'right', label: 'X', title: 'Snap to Right (+X) View', colorClass: 'text-rose-400 hover:bg-rose-500/20 border-rose-500/40' },
  { view: 'top', label: 'Y', title: 'Snap to Top (+Y) View', colorClass: 'text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/40' },
  { view: 'front', label: 'Z', title: 'Snap to Front (+Z) View', colorClass: 'text-sky-400 hover:bg-sky-500/20 border-sky-500/40' },
  { view: 'iso', label: 'ISO', title: 'Snap to Isometric View', colorClass: 'text-gray-200 hover:bg-white/15 border-white/20' },
];

export const ViewportPanel: React.FC<ViewportPanelProps> = ({ onViewportResize }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineReady = useEditorStore((s) => s.engineReady);
  const playState = useEditorStore((s) => s.playState);
  const [genericPrompt, setGenericPrompt] = useState<{
    entityName: string;
    promptText: string;
    keyCode: string;
  } | null>(null);

  useEffect(() => {
    const engine = EditorEngine.getInstance();
    return engine.eventBus.on('gameplay:prompt-changed', (payload) => {
      setGenericPrompt(payload);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const engine = EditorEngine.getInstance();
    engine.mount(canvas);
    useEditorStore.getState().setEngineReady(true);

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      onViewportResize?.({ width, height });
    };

    updateSize();
    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      engine.unmount();
    };
  }, [onViewportResize]);

  const handleSnapView = (view: CameraSnapView) => {
    EditorEngine.getInstance().snapCameraView(view);
  };

  const getCanvasCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/x-pc-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (coords) {
      EditorEngine.getInstance().updateDropGhost(coords.x, coords.y);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    EditorEngine.getInstance().updateDropGhost(null, null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const engine = EditorEngine.getInstance();
    engine.updateDropGhost(null, null);

    const raw = e.dataTransfer.getData('application/x-pc-asset');
    if (!raw) return;

    e.preventDefault();
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;

    let assetId: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { assetId?: string };
      assetId = parsed.assetId ?? null;
    } catch {
      assetId = raw;
    }

    if (assetId) {
      void engine.spawnAssetAt(assetId, coords.x, coords.y);
    }
  };

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-full h-full bg-[#0d1016] overflow-hidden"
    >
      {/* YouTube 3D TV layer behind transparent WebGL canvas */}
      {playState !== 'edit' && <YouTubeStagePlayer />}

      <canvas
        ref={canvasRef}
        tabIndex={0}
        onContextMenu={(e) => e.preventDefault()}
        className="relative z-[1] w-full h-full block outline-none"
      />

      {/* Top-left Scene label */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-2">
        <span className="px-2 py-0.5 rounded bg-[#141821]/85 border border-[#2b313d] text-[11px] font-medium text-gray-300 backdrop-blur-sm">
          Scene Viewport
        </span>
        {!engineReady && (
          <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300">
            Initializing WebGL2...
          </span>
        )}
      </div>

      {/* Top-right XYZ Orientation Axis Widget */}
      <div className="absolute top-2.5 right-2.5 flex flex-col items-center gap-1.5 p-2 rounded-lg bg-[#141821]/85 border border-[#2b313d] backdrop-blur-sm shadow-lg">
        <svg
          width="54"
          height="54"
          viewBox="0 0 60 60"
          className="overflow-visible select-none"
          aria-label="Orientation Axis"
        >
          {/* Origin */}
          <circle cx="30" cy="30" r="3" fill="#9ca3af" />

          {/* +X Axis (Right) */}
          <line x1="30" y1="30" x2="52" y2="30" stroke="#fb7185" strokeWidth="2" />
          <g
            className="cursor-pointer"
            onClick={() => handleSnapView('right')}
          >
            <circle cx="52" cy="30" r="7" fill="#e11d48" fillOpacity="0.85" />
            <text
              x="52"
              y="33.5"
              textAnchor="middle"
              fontSize="9"
              fontWeight="bold"
              fill="#ffffff"
            >
              X
            </text>
          </g>

          {/* +Y Axis (Top) */}
          <line x1="30" y1="30" x2="30" y2="8" stroke="#34d399" strokeWidth="2" />
          <g
            className="cursor-pointer"
            onClick={() => handleSnapView('top')}
          >
            <circle cx="30" cy="8" r="7" fill="#059669" fillOpacity="0.85" />
            <text
              x="30"
              y="11.5"
              textAnchor="middle"
              fontSize="9"
              fontWeight="bold"
              fill="#ffffff"
            >
              Y
            </text>
          </g>

          {/* +Z Axis (Front-left diagonal) */}
          <line x1="30" y1="30" x2="14" y2="46" stroke="#38bdf8" strokeWidth="2" />
          <g
            className="cursor-pointer"
            onClick={() => handleSnapView('front')}
          >
            <circle cx="14" cy="46" r="7" fill="#0284c7" fillOpacity="0.85" />
            <text
              x="14"
              y="49.5"
              textAnchor="middle"
              fontSize="9"
              fontWeight="bold"
              fill="#ffffff"
            >
              Z
            </text>
          </g>
        </svg>

        <div className="flex items-center gap-1">
          {AXIS_VIEW_BUTTONS.map((btn) => (
            <button
              key={btn.view}
              type="button"
              title={btn.title}
              onClick={() => handleSnapView(btn.view)}
              className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold transition-colors ${btn.colorClass}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom-left navigation hint */}
      {playState === 'edit' && (
        <div className="pointer-events-none absolute bottom-2 left-2.5 px-2 py-0.5 rounded bg-[#141821]/75 border border-[#2b313d]/70 text-[10px] text-gray-400">
          RMB+WASD Fly · Alt+LMB Orbit · MMB Pan · Scroll Zoom · F Focus
        </div>
      )}

      {/* Generic Interactable Prompt */}
      {playState !== 'edit' && genericPrompt && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-[#141821]/90 border border-emerald-500/40 text-xs text-gray-100 shadow-lg backdrop-blur-sm flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 font-mono font-semibold text-[11px]">
            {genericPrompt.keyCode.replace('Key', '')}
          </span>
          <span>{genericPrompt.promptText}</span>
        </div>
      )}

      {/* Play Mode Game UI Overlay */}
      {playState !== 'edit' && <GameOverlayUI />}
    </div>
  );
};
