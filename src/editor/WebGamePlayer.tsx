import React, { useEffect, useState, useRef } from 'react';
import { EditorEngine } from '../engine/EditorEngine';
import { GameOverlayUI } from './components/GameOverlayUI';
import { YouTubeStagePlayer } from '../components/YouTubeStagePlayer';
import { LobbyModal } from '../components/LobbyModal';
import { SceneLoadingOverlay } from '../components/SceneLoadingOverlay';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { isSupabaseConfigured } from '../network/supabaseClient';
import {
  getSceneDefinition,
  getStartupSceneId,
  type SceneLoadingProgress,
} from '../engine/serialization/SceneRegistry';

/**
 * Standalone Web Game Runtime Player (`/play` or `?play=1`):
 * Mounts PlayCanvas without Editor UI panels, loads the startup scene
 * (index 0 from Build Settings, defaulting to Sảnh Chờ / Lobby_Scene)
 * with full 0% -> 100% progress bar before entering Play Mode.
 */
export const WebGamePlayer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [joinedLobby, setJoinedLobby] = useState(() => !isSupabaseConfigured());
  const [initialProgress] = useState<SceneLoadingProgress>(() => {
    const startupId = getStartupSceneId();
    const def = getSceneDefinition(startupId);
    return {
      loading: true,
      sceneId: def.id,
      sceneName: def.name,
      percent: 4,
      label: `Đang khởi tạo ${def.shortName}...`,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = EditorEngine.getInstance();
    let active = true;
    const startupId = getStartupSceneId();

    engine.mount(canvas, { restoreAutoDraft: false, autoLoadScene: false });

    void engine
      .loadSceneById(startupId, { keepPlayMode: true })
      .then(() => {
        if (active) {
          setReady(true);
        }
      })
      .catch((err) => {
        console.error('Failed to load startup scene:', err);
      });

    return () => {
      active = false;
      void MultiplayerManager.getInstance().leaveRoom();
      engine.unmount();
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0e14]">
      <YouTubeStagePlayer />
      <canvas ref={canvasRef} className="relative z-[1] w-full h-full block outline-none" />
      <SceneLoadingOverlay initialProgress={!ready ? initialProgress : null} />
      {ready && !joinedLobby && <LobbyModal onJoined={() => setJoinedLobby(true)} />}
      {ready && joinedLobby && <GameOverlayUI />}
    </div>
  );
};
