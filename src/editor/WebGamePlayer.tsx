import React, { useEffect, useState, useRef } from 'react';
import { EditorEngine } from '../engine/EditorEngine';
import { GameOverlayUI } from './components/GameOverlayUI';
import { YouTubeStagePlayer } from '../components/YouTubeStagePlayer';
import { SceneLoadingOverlay } from '../components/SceneLoadingOverlay';
import { ServerAnnouncementBanner } from '../components/ServerAnnouncementBanner';
import { MultiplayerManager, PUBLIC_LOBBY_ROOM_ID } from '../network/MultiplayerManager';
import { AdminService } from '../network/AdminService';
import { isSupabaseConfigured } from '../network/supabaseClient';
import {
  CINEMA_SCENE_ID,
  getSceneDefinition,
  getStartupSceneId,
  LOBBY_SCENE_ID,
  TEAROOM_SCENE_ID,
  type SceneLoadingProgress,
} from '../engine/serialization/SceneRegistry';

/**
 * Standalone Web Game Runtime Player:
 * - Boots straight into the Shared Public Lobby Hall (`Lobby_Scene` + `public-lobby` channel)
 *   so all visitors can walk around freely and customize avatar colors.
 * - Supports `?room=<id>&admin=1` quick-join from AdminDashboard.
 */
export const WebGamePlayer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [kickedNotice, setKickedNotice] = useState<string | null>(null);
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
    const docEl = document.documentElement;
    const body = document.body;
    docEl.classList.add('game-viewport-lock');
    body.classList.add('game-viewport-lock');

    const resetScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
      docEl.scrollTop = 0;
      body.scrollTop = 0;
    };
    resetScroll();

    const onOrientationChange = () => {
      resetScroll();
      window.setTimeout(resetScroll, 120);
      window.setTimeout(resetScroll, 320);
    };

    window.addEventListener('resize', resetScroll);
    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('scroll', resetScroll, { passive: true });
    window.visualViewport?.addEventListener('resize', resetScroll);
    window.visualViewport?.addEventListener('scroll', resetScroll);

    return () => {
      docEl.classList.remove('game-viewport-lock');
      body.classList.remove('game-viewport-lock');
      window.removeEventListener('resize', resetScroll);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('scroll', resetScroll);
      window.visualViewport?.removeEventListener('resize', resetScroll);
      window.visualViewport?.removeEventListener('scroll', resetScroll);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = EditorEngine.getInstance();
    let active = true;
    const startupId = getStartupSceneId();

    engine.mount(canvas, { restoreAutoDraft: false, autoLoadScene: false });

    const connectInitialSession = async () => {
      if (!isSupabaseConfigured()) return;
      const mp = MultiplayerManager.getInstance();
      const params = new URLSearchParams(window.location.search);
      const targetRoom = params.get('room')?.trim();
      const wantsAdminJoin = params.get('admin') === '1';

      const adminAcc = await AdminService.getCurrentAdminAccount();
      if (!active) return;

      if (adminAcc) {
        AdminService.savePlayerAccount(adminAcc);
        mp.setLocalIsAdmin(true);
        const adminName = adminAcc.display_name || adminAcc.username || 'Admin';

        if (wantsAdminJoin && targetRoom) {
          const activeRooms = await AdminService.fetchActiveRooms();
          const matched = activeRooms.find((r) => r.room_id === targetRoom);
          const inferredScene =
            matched?.scene_id ||
            (targetRoom.startsWith('karaoke')
              ? TEAROOM_SCENE_ID
              : targetRoom.startsWith('cinema')
                ? CINEMA_SCENE_ID
                : LOBBY_SCENE_ID);

          if (inferredScene && inferredScene !== engine.getSceneId()) {
            await engine.loadSceneById(inferredScene, { keepPlayMode: true });
          }
          if (!active) return;
          await mp.joinRoom(targetRoom, adminName, inferredScene || LOBBY_SCENE_ID, {
            bypassLimits: true,
          });
          return;
        }

        await mp.joinRoom(PUBLIC_LOBBY_ROOM_ID, adminName, LOBBY_SCENE_ID, {
          bypassLimits: true,
        });
        return;
      }

      const savedPlayer = AdminService.getSavedPlayerAccount();
      const displayName =
        savedPlayer?.display_name ||
        savedPlayer?.username ||
        localStorage.getItem('cavannghe:player-name') ||
        'Khách Lounge';
      if (savedPlayer?.avatar_color) {
        mp.setLocalAvatarColor(savedPlayer.avatar_color);
        window.dispatchEvent(
          new CustomEvent('cavannghe:avatar-color', { detail: savedPlayer.avatar_color })
        );
      }
      await mp.joinRoom(PUBLIC_LOBBY_ROOM_ID, displayName, LOBBY_SCENE_ID, {
        bypassLimits: true,
      });
    };

    void engine
      .loadSceneById(startupId, { keepPlayMode: true })
      .then(async () => {
        if (!active) return;
        setReady(true);
        await connectInitialSession();
      })
      .catch((err) => {
        console.error('Failed to load startup scene:', err);
      });

    const onKicked = () => {
      if (!active) return;
      const mp = MultiplayerManager.getInstance();
      setKickedNotice(mp.getLastJoinError() || 'Bạn đã bị mời rời khỏi phòng.');
      void engine.loadSceneById(LOBBY_SCENE_ID, { keepPlayMode: true }).then(() => {
        if (!active) return;
        const saved = AdminService.getSavedPlayerAccount();
        const name =
          saved?.display_name ||
          saved?.username ||
          localStorage.getItem('cavannghe:player-name') ||
          'Khách Lounge';
        void mp.joinRoom(PUBLIC_LOBBY_ROOM_ID, name, LOBBY_SCENE_ID, { bypassLimits: true });
      });
    };
    window.addEventListener('cavannghe:kicked', onKicked);

    return () => {
      active = false;
      window.removeEventListener('cavannghe:kicked', onKicked);
      void MultiplayerManager.getInstance().leaveRoom();
      engine.unmount();
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden overscroll-none bg-[#0c0e14]">
      <YouTubeStagePlayer />
      <canvas ref={canvasRef} className="relative z-[1] w-full h-full block outline-none touch-none" />
      <SceneLoadingOverlay initialProgress={!ready ? initialProgress : null} />
      <ServerAnnouncementBanner />
      {ready && <GameOverlayUI />}

      {kickedNotice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] max-w-sm px-4 py-3 rounded-xl bg-rose-950/95 border border-rose-500/40 text-rose-100 text-xs shadow-2xl backdrop-blur-md flex items-center gap-3">
          <span className="flex-1">{kickedNotice}</span>
          <button
            type="button"
            onClick={() => setKickedNotice(null)}
            className="text-rose-300 hover:text-white font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
