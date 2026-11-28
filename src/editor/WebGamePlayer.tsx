import React, { useEffect, useState, useRef } from 'react';
import { EditorEngine } from '../engine/EditorEngine';
import { GameOverlayUI } from './components/GameOverlayUI';
import { YouTubeStagePlayer } from '../components/YouTubeStagePlayer';
import { SceneLoadingOverlay } from '../components/SceneLoadingOverlay';
import { ServerAnnouncementBanner } from '../components/ServerAnnouncementBanner';
import { EntryLobbyFlowModal } from '../components/EntryLobbyFlowModal';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { AdminService } from '../network/AdminService';
import { isSupabaseConfigured } from '../network/supabaseClient';
import { Tracker, ANALYTICS_EVENT } from '../analytics/Tracker';
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
 * - Requires Player Login or Guest selection + Lobby Room join/create before entering Sảnh.
 * - Sảnh itself is a hosted Lobby room; Cinema & TeaRoom are scenes within that same Lobby room.
 * - Supports `?room=<id>&admin=1` quick-join from AdminDashboard.
 */
export const WebGamePlayer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [hasEnteredLobby, setHasEnteredLobby] = useState(false);
  const [entryInitialStep, setEntryInitialStep] = useState<'identity' | 'room' | undefined>(
    undefined
  );
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

    Tracker.init();
    Tracker.onSceneLoadStart();
    engine.mount(canvas, { restoreAutoDraft: false, autoLoadScene: false });

    const tryAdminQuickJoin = async () => {
      if (!isSupabaseConfigured()) return;
      const params = new URLSearchParams(window.location.search);
      const targetRoom = params.get('room')?.trim();
      const wantsAdminJoin = params.get('admin') === '1';
      if (!wantsAdminJoin || !targetRoom) return;

      const adminAcc = await AdminService.getCurrentAdminAccount();
      if (!active || !adminAcc) return;

      const mp = MultiplayerManager.getInstance();
      AdminService.savePlayerAccount(adminAcc);
      mp.setLocalIsAdmin(true);
      const adminName = adminAcc.display_name || adminAcc.username || 'Admin';

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
      const ok = await mp.joinRoom(targetRoom, adminName, inferredScene || LOBBY_SCENE_ID, {
        bypassLimits: true,
      });
      if (ok && active) {
        setHasEnteredLobby(true);
      }
    };

    void engine
      .loadSceneById(startupId, { keepPlayMode: true })
      .then(async () => {
        if (!active) return;
        Tracker.onSceneLoadComplete(startupId);
        setReady(true);
        await tryAdminQuickJoin();
      })
      .catch((err) => {
        console.error('Failed to load startup scene:', err);
      });

    const onKicked = () => {
      if (!active) return;
      const mp = MultiplayerManager.getInstance();
      const reason = mp.getLastJoinError() || 'Bạn đã bị mời rời khỏi phòng.';
      Tracker.track(ANALYTICS_EVENT.KICKED, { reason: reason.slice(0, 80) });
      setKickedNotice(reason);
      setEntryInitialStep('room');
      setHasEnteredLobby(false);
      if (engine.getSceneId() !== LOBBY_SCENE_ID) {
        void engine.loadSceneById(LOBBY_SCENE_ID, { keepPlayMode: true });
      }
    };

    const onOpenEntryGate = (e: Event) => {
      if (!active) return;
      const detail = (e as CustomEvent<{ step?: 'identity' | 'room' } | undefined>).detail;
      setEntryInitialStep(detail?.step ?? 'identity');
      void MultiplayerManager.getInstance().leaveRoom();
      setHasEnteredLobby(false);
      if (engine.getSceneId() !== LOBBY_SCENE_ID) {
        void engine.loadSceneById(LOBBY_SCENE_ID, { keepPlayMode: true });
      }
    };

    window.addEventListener('cavannghe:kicked', onKicked);
    window.addEventListener('cavannghe:open-entry-gate', onOpenEntryGate);

    return () => {
      active = false;
      window.removeEventListener('cavannghe:kicked', onKicked);
      window.removeEventListener('cavannghe:open-entry-gate', onOpenEntryGate);
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
      {ready && hasEnteredLobby && <GameOverlayUI />}

      {ready && !hasEnteredLobby && (
        <EntryLobbyFlowModal
          isOpen
          initialStep={entryInitialStep}
          notice={kickedNotice}
          onDismissNotice={() => setKickedNotice(null)}
          onEnteredLobby={() => {
            setKickedNotice(null);
            setEntryInitialStep(undefined);
            setHasEnteredLobby(true);
          }}
        />
      )}
    </div>
  );
};
