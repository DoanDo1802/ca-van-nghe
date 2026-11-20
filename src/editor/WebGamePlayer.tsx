import React, { useEffect, useRef, useState } from 'react';
import { EditorEngine } from '../engine/EditorEngine';
import { GameOverlayUI } from './components/GameOverlayUI';

/**
 * Standalone Web Game Runtime Player (`/play` or `?play=1`):
 * Mounts PlayCanvas without any Editor UI panels, auto-loads CaVanNghe_Main,
 * and enters Play Mode immediately with the GameOverlayUI.
 */
export const WebGamePlayer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = EditorEngine.getInstance();
    let active = true;

    const unsub = engine.eventBus.on('scene:loaded', ({ sceneId }) => {
      if (!active) return;
      if (sceneId === 'ca-van-nghe-lounge') {
        setReady(true);
        void engine.play();
      }
    });

    engine.mount(canvas, { restoreAutoDraft: false });

    return () => {
      active = false;
      unsub();
      engine.unmount();
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0e14]">
      <canvas ref={canvasRef} className="w-full h-full block outline-none" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0c0e14]/90 text-amber-200 text-sm z-30">
          Đang tải Ca Văn Nghệ (PlayCanvas Web Game)...
        </div>
      )}
      {ready && <GameOverlayUI />}
    </div>
  );
};
