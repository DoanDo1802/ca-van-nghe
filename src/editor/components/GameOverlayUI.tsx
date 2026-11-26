import React, { useCallback, useEffect, useRef, useState } from 'react';
import NavigationHUD from '../../components/NavigationHUD';
import MobileControls from '../../components/MobileControls';
import DetailModal from '../../components/DetailModal';
import StageScreenModal from '../../components/StageScreenModal';
import SettingsModal from '../../components/SettingsModal';
import { KaraokeOverlay } from './KaraokeOverlay';
import { KaraokeAudienceSync } from './KaraokeAudienceSync';
import { RemoteNameplates } from '../../components/RemoteNameplates';
import { ChatBox } from '../../components/ChatBox';
import { VoiceChatBar } from '../../components/VoiceChatBar';
import { LobbyHubModal, type LobbyHubTab } from '../../components/LobbyHubModal';
import { RadialEmoteWheel } from '../../components/RadialEmoteWheel';
import {
  MultiplayerManager,
  type RoomStatusSnapshot,
} from '../../network/MultiplayerManager';
import { INTERACTIVE_OBJECTS } from '../../data/sceneData';
import { soundEffects } from '../../utils/audio';
import { EditorEngine } from '../../engine/EditorEngine';
import {
  getSceneDefinition,
  isSceneEnabledInBuild,
  LOBBY_SCENE_ID,
} from '../../engine/serialization/SceneRegistry';
import type { StageMediaState } from '../../engine/runtime';
import type { NearbyPromptData } from '../../engine/runtime/PlayerControllerRuntime';

// Temporarily hide Voice Chat from the UI
const ENABLE_VOICE_CHAT = false;

export const GameOverlayUI: React.FC = () => {
  const engine = EditorEngine.getInstance();
  const initialStage = engine.getStageAudioState();
  const [currentSceneId, setCurrentSceneId] = useState(() => engine.getSceneId());
  const [currentSceneName, setCurrentSceneName] = useState(() => engine.getSceneName());
  const [nearbyPrompt, setNearbyPrompt] = useState<NearbyPromptData | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isSitting, setIsSitting] = useState(false);
  const [cameraMode, setCameraMode] = useState<'third' | 'first'>('third');
  const [isNightMode, setIsNightMode] = useState(false);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stageSourceType, setStageSourceType] = useState<'media' | 'youtube'>(
    () => (initialStage?.sourceType === 'youtube' ? 'youtube' : 'media')
  );
  const [stageYoutubeId, setStageYoutubeId] = useState<string | null>(
    () => initialStage?.youtubeVideoId ?? null
  );
  const [youtubeQuality, setYoutubeQuality] = useState(
    () => initialStage?.youtubeQuality ?? 'hd720'
  );
  const [renderScale, setRenderScale] = useState(1);
  const [stageMediaUrl, setStageMediaUrl] = useState(
    () => initialStage?.mediaUrl ?? '/media/bello-ballo.mp4'
  );
  const [stageMediaTitle, setStageMediaTitle] = useState(
    () => initialStage?.title ?? 'Live Acoustic Session — Bello Ballo'
  );
  const [isStagePlaying, setIsStagePlaying] = useState(
    () => initialStage?.isPlaying ?? true
  );
  const [stageVolume, setStageVolume] = useState(
    () => initialStage?.volume ?? 0.8
  );
  const [isStageVideoMuted, setIsStageVideoMuted] = useState(
    () => initialStage?.isMuted ?? false
  );
  const [isStageMuteSelected, setIsStageMuteSelected] = useState(
    () => initialStage?.isMuteSelected ?? false
  );
  const [isScreenOn, setIsScreenOn] = useState(
    () => initialStage?.isScreenOn ?? true
  );
  const [activeEmote, setActiveEmote] = useState<string | null>(null);
  const [isKaraokeOpen, setIsKaraokeOpen] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatusSnapshot>(() =>
    MultiplayerManager.getInstance().getRoomStatus()
  );
  const canPerform = !roomStatus.joiningOrInRoom || roomStatus.karaokeTurn?.singerId === roomStatus.localPlayerId;
  const isPerforming = isKaraokeOpen && canPerform;
  const hadKaraokeTurnRef = useRef(false);
  const canOpenSettings = !roomStatus.connected || roomStatus.isHost || roomStatus.localIsAdmin;
  const canOpenSettingsRef = useRef(canOpenSettings);
  canOpenSettingsRef.current = canOpenSettings;
  const [stageErrorToast, setStageErrorToast] = useState<string | null>(null);
  const [isHubModalOpen, setIsHubModalOpen] = useState(false);
  const [hubInitialTab, setHubInitialTab] = useState<LobbyHubTab>('lobby');
  const currentSceneIdRef = useRef(currentSceneId);
  currentSceneIdRef.current = currentSceneId;

  useEffect(() => {
    if (!canOpenSettings) {
      setIsSettingsOpen(false);
    }
  }, [canOpenSettings]);

  useEffect(() => {
    const ownsTurn = roomStatus.karaokeTurn?.singerId === roomStatus.localPlayerId;
    if (isKaraokeOpen && roomStatus.joiningOrInRoom && !ownsTurn &&
        (hadKaraokeTurnRef.current || roomStatus.karaokeTurn)) {
      setStageErrorToast(hadKaraokeTurnRef.current ? 'Bạn đã rời lượt karaoke' : 'Sân khấu đang có người hát');
      window.dispatchEvent(new CustomEvent('cavannghe:karaoke-exit'));
    }
    hadKaraokeTurnRef.current = isKaraokeOpen && ownsTurn;
  }, [isKaraokeOpen, roomStatus.joiningOrInRoom, roomStatus.karaokeTurn, roomStatus.localPlayerId]);

  const enterSceneDirect = useCallback((cleanId: string) => {
    setNearbyPrompt(null);
    setSelectedObjectId(null);
    setIsSitting(false);
    setIsKaraokeOpen(false);
    setIsStageModalOpen(false);
    setIsHubModalOpen(false);
    void EditorEngine.getInstance().loadSceneById(cleanId, { keepPlayMode: true });
  }, []);

  const requestSceneTransition = useCallback(
    (targetSceneId: string) => {
      const cleanId = targetSceneId.trim();
      if (!cleanId) return;
      if (!isSceneEnabledInBuild(cleanId)) {
        const def = getSceneDefinition(cleanId);
        setStageErrorToast(
          `Scene "${def.name}" chưa được tích chọn trong Build Settings (Scenes In Build).`
        );
        return;
      }

      // Cinema, TeaRoom, and Lobby are all areas inside the same hosted Lobby room.
      // EditorEngine.loadSceneById calls MultiplayerManager.switchSceneRoom(cleanId) automatically.
      enterSceneDirect(cleanId);
    },
    [enterSceneDirect]
  );

  useEffect(() => {
    const unsubScene = EditorEngine.getInstance().eventBus.on('scene:loaded', ({ sceneId }) => {
      const inst = EditorEngine.getInstance();
      setCurrentSceneId(sceneId);
      setCurrentSceneName(inst.getSceneName());
    });

    const onProximity = (e: Event) => {
      setNearbyPrompt((e as CustomEvent<NearbyPromptData | null>).detail);
    };
    const onInteract = (e: Event) => {
      const objId = (e as CustomEvent<string>).detail;
      if (objId?.startsWith('load_scene:')) {
        requestSceneTransition(objId.slice('load_scene:'.length));
      } else if (objId === 'lobby_hub_kiosk') {
        setHubInitialTab('lobby');
        setIsHubModalOpen(true);
      } else if (objId === 'stage_screen') {
        setIsStageModalOpen(true);
      } else {
        setSelectedObjectId(objId);
      }
    };
    const onLoadSceneEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ sceneId?: string }>).detail;
      if (detail?.sceneId) {
        requestSceneTransition(detail.sceneId);
      }
    };
    const onSit = (e: Event) => {
      const detail = (e as CustomEvent<{ sitting: boolean }>).detail;
      setIsSitting(Boolean(detail?.sitting));
    };
    const onCamMode = (e: Event) => {
      setCameraMode((e as CustomEvent<'third' | 'first'>).detail);
    };
    const onKaraoke = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setIsKaraokeOpen(Boolean(detail?.active));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (canOpenSettingsRef.current) {
          setIsSettingsOpen((prev) => !prev);
        }
      } else if (e.code === 'Escape') {
        setIsSettingsOpen(false);
        setSelectedObjectId(null);
      }
    };

    const onStageAudioChanged = (e: Event) => {
      const detail = (e as CustomEvent<StageMediaState>).detail;
      if (!detail) return;
      setStageSourceType(detail.sourceType);
      setStageYoutubeId(detail.youtubeVideoId);
      setYoutubeQuality(detail.youtubeQuality || 'hd720');
      setStageMediaUrl(detail.mediaUrl);
      setStageMediaTitle(detail.title);
      setIsStagePlaying(detail.isPlaying);
      setStageVolume(detail.volume);
      setIsStageVideoMuted(detail.isMuted);
      setIsStageMuteSelected(detail.isMuteSelected ?? detail.isMuted);
      setIsScreenOn(detail.isScreenOn);
    };

    const onKaraokeUnavailable = () => setStageErrorToast('Sân khấu chưa sẵn sàng hoặc đang có người hát');

    const onStageError = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      if (msg) setStageErrorToast(msg);
    };

    const onRoomStatus = (e: Event) => {
      const detail = (e as CustomEvent<RoomStatusSnapshot>).detail;
      if (detail) setRoomStatus(detail);
    };

    const onEmoteCleared = () => {
      setActiveEmote(null);
    };

    window.addEventListener('cavannghe:proximity', onProximity);
    window.addEventListener('cavannghe:interact', onInteract);
    window.addEventListener('cavannghe:load-scene', onLoadSceneEvent);
    window.addEventListener('cavannghe:sit', onSit);
    window.addEventListener('cavannghe:camera-mode', onCamMode);
    window.addEventListener('cavannghe:karaoke', onKaraoke);
    window.addEventListener('cavannghe:karaoke-unavailable', onKaraokeUnavailable);
    window.addEventListener('cavannghe:emote-cleared', onEmoteCleared);
    window.addEventListener('cavannghe:stage-audio-changed', onStageAudioChanged);
    window.addEventListener('cavannghe:stage-media-error', onStageError);
    window.addEventListener('cavannghe:room-status', onRoomStatus);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      unsubScene();
      window.removeEventListener('cavannghe:proximity', onProximity);
      window.removeEventListener('cavannghe:interact', onInteract);
      window.removeEventListener('cavannghe:load-scene', onLoadSceneEvent);
      window.removeEventListener('cavannghe:sit', onSit);
      window.removeEventListener('cavannghe:camera-mode', onCamMode);
      window.removeEventListener('cavannghe:karaoke', onKaraoke);
      window.removeEventListener('cavannghe:karaoke-unavailable', onKaraokeUnavailable);
      window.removeEventListener('cavannghe:emote-cleared', onEmoteCleared);
      window.removeEventListener('cavannghe:stage-audio-changed', onStageAudioChanged);
      window.removeEventListener('cavannghe:stage-media-error', onStageError);
      window.removeEventListener('cavannghe:room-status', onRoomStatus);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [requestSceneTransition]);

  const handleToggleNight = () => {
    setIsNightMode((prev) => {
      const next = !prev;
      EditorEngine.getInstance().setNightMode(next);
      return next;
    });
  };

  const handleTriggerInteract = () => {
    if (isSitting) {
      window.dispatchEvent(new CustomEvent('cavannghe:stand-up'));
      return;
    }
    if (nearbyPrompt?.type === 'door' && nearbyPrompt.targetSceneId) {
      requestSceneTransition(nearbyPrompt.targetSceneId);
      return;
    }
    if (nearbyPrompt?.type === 'object') {
      if (nearbyPrompt.id === 'karaoke_stage') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      } else if (nearbyPrompt.id === 'lobby_hub_kiosk') {
        setHubInitialTab('lobby');
        setIsHubModalOpen(true);
      } else if (nearbyPrompt.id === 'stage_screen') {
        setIsStageModalOpen(true);
      } else {
        setSelectedObjectId(nearbyPrompt.id);
      }
    } else if (nearbyPrompt?.type === 'chair') {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    }
  };

  const handleTriggerEmote = (emoteName: string) => {
    if (emoteName === 'clap') {
      soundEffects.playClapSound(0, 0.85);
      MultiplayerManager.getInstance().broadcastApplause();
    }
    setActiveEmote((prev) => {
      const next = prev === emoteName ? null : emoteName;
      window.dispatchEvent(new CustomEvent('cavannghe:emote', { detail: next }));
      return next;
    });
  };

  const interactiveItem = selectedObjectId
    ? (INTERACTIVE_OBJECTS as Record<string, any>)[selectedObjectId]
    : null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <RemoteNameplates />
      <div className="relative z-10 pointer-events-auto">
        <NavigationHUD
          onOpenSettings={() => {
            if (canOpenSettings) setIsSettingsOpen(true);
          }}
          nearbyPrompt={nearbyPrompt}
          isSitting={isSitting}
          onTriggerInteract={handleTriggerInteract}
          cameraMode={cameraMode}
          isDecoMode={false}
          hideHeader={isKaraokeOpen}
          currentSceneId={currentSceneId}
          currentSceneName={currentSceneName}
          onGoToLobby={() => requestSceneTransition(LOBBY_SCENE_ID)}
          onOpenLobbyHub={() => {
            setHubInitialTab('lobby');
            setIsHubModalOpen(true);
          }}
          onLeaveLobby={() => {
            setIsHubModalOpen(false);
            window.dispatchEvent(
              new CustomEvent('cavannghe:open-entry-gate', { detail: { step: 'room' } })
            );
          }}
          roomStatus={roomStatus}
          canOpenSettings={canOpenSettings}
        />

        <MobileControls
          onMove={(vec: { x: number; y: number } | null) =>
            window.dispatchEvent(new CustomEvent('cavannghe:mobile-move', { detail: vec }))
          }
          onAction={handleTriggerInteract}
          onToggleCamera={() => {
            setCameraMode((prev) => (prev === 'third' ? 'first' : 'third'));
            window.dispatchEvent(new CustomEvent('cavannghe:toggle-camera'));
          }}
          nearbyPrompt={nearbyPrompt}
          isSitting={isSitting}
          hidden={isKaraokeOpen}
        />

        <KaraokeOverlay
          isOpen={isPerforming}
          onExit={() => window.dispatchEvent(new CustomEvent('cavannghe:karaoke-exit'))}
        />

        {isKaraokeOpen && !canPerform && (
          <div className="fixed bottom-16 left-1/2 z-[85] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-neutral-950 px-3 py-2 text-sm text-white">
            <span>Đang nhận lượt hát</span>
            <button type="button" className="underline" onClick={() => window.dispatchEvent(new CustomEvent('cavannghe:karaoke-exit'))}>
              Rời sân khấu
            </button>
          </div>
        )}

        <KaraokeAudienceSync isSingingLocal={isPerforming} />

        <ChatBox hideOnMobile={isKaraokeOpen} />

        <RadialEmoteWheel
          activeEmote={activeEmote}
          disabled={isHubModalOpen || isSettingsOpen || isStageModalOpen}
          onSelectEmote={(emoteId) => {
            setActiveEmote(emoteId);
            window.dispatchEvent(new CustomEvent('cavannghe:emote', { detail: emoteId }));
          }}
        />

        {ENABLE_VOICE_CHAT && <VoiceChatBar isKaraokeOpen={isPerforming} />}

        {interactiveItem && (
          <DetailModal
            item={interactiveItem}
            onClose={() => setSelectedObjectId(null)}
            onActionClick={(item: { actionText?: string }) => {
              if (item.actionText === 'Đổi Video Sân Khấu') {
                setSelectedObjectId(null);
                setIsStageModalOpen(true);
              }
            }}
          />
        )}

        <StageScreenModal
          isOpen={isStageModalOpen}
          onClose={() => setIsStageModalOpen(false)}
          spatialMode
          isHost={canOpenSettings}
          onResyncStage={() => MultiplayerManager.getInstance().requestStageResync()}
          onSyncLiveEdge={() => EditorEngine.getInstance().syncStageToLiveEdge()}
          sourceType={stageSourceType}
          currentVideoId={stageYoutubeId ?? ''}
          currentMediaUrl={stageMediaUrl}
          currentMediaTitle={stageMediaTitle}
          youtubeQuality={youtubeQuality}
          onChangeYouTubeQuality={(q: string) => {
            setYoutubeQuality(q);
            EditorEngine.getInstance().setStageYouTubeQuality(q);
          }}
          renderScale={renderScale}
          onChangeRenderScale={(scale: number) => {
            setRenderScale(scale);
            EditorEngine.getInstance().setRenderResolutionScale(scale);
          }}
          isPlaying={isStagePlaying}
          onTogglePlay={() => {
            const next = !isStagePlaying;
            setIsStagePlaying(next);
            EditorEngine.getInstance().setStagePlaying(next);
          }}
          volume={stageVolume}
          onVolumeChange={(v: number) => {
            setStageVolume(v);
            EditorEngine.getInstance().setStageVolume(v);
          }}
          onChangeMedia={(url: string, title?: string) => {
            setStageSourceType('media');
            setStageYoutubeId(null);
            setStageMediaUrl(url);
            if (title) setStageMediaTitle(title);
            setIsStagePlaying(true);
            setIsScreenOn(true);
            EditorEngine.getInstance().setStageMedia(url, title);
          }}
          onChangeYouTube={(videoId: string, title?: string) => {
            setStageSourceType('youtube');
            setStageYoutubeId(videoId);
            if (title) setStageMediaTitle(title);
            setIsStagePlaying(true);
            setIsScreenOn(true);
            EditorEngine.getInstance().setStageYouTube(videoId, title);
          }}
          isMuted={isStageVideoMuted}
          isMuteSelected={isStageMuteSelected}
          onToggleMute={() => EditorEngine.getInstance().setStageMuted(!isStageMuteSelected)}
          isScreenOn={isScreenOn}
          onToggleScreen={() => {
            const next = !isScreenOn;
            setIsScreenOn(next);
            EditorEngine.getInstance().setStageScreenOn(next);
          }}
        />

        <SettingsModal
          isOpen={isSettingsOpen && canOpenSettings}
          onClose={() => setIsSettingsOpen(false)}
          cameraMode={cameraMode}
          onToggleCameraMode={() => {
            setCameraMode((prev) => (prev === 'third' ? 'first' : 'third'));
            window.dispatchEvent(new CustomEvent('cavannghe:toggle-camera'));
          }}
          isDecoMode={false}
          onToggleDecoMode={undefined}
          renderScale={renderScale}
          onChangeRenderScale={(scale: number) => {
            setRenderScale(scale);
            EditorEngine.getInstance().setRenderResolutionScale(scale);
          }}
          isScreenOn={isScreenOn}
          onToggleScreen={() => {
            const next = !isScreenOn;
            setIsScreenOn(next);
            EditorEngine.getInstance().setStageScreenOn(next);
          }}
          isStageVideoMuted={isStageMuteSelected}
          onToggleStageMute={() => EditorEngine.getInstance().setStageMuted(!isStageMuteSelected)}
          onOpenStageScreenModal={() => setIsStageModalOpen(true)}
          karaokeTurnControl={roomStatus.connected && roomStatus.isHost ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-4 text-xs text-white">
              <span>
                {roomStatus.karaokeTurn
                  ? `Đang trên sân khấu: ${roomStatus.players.find((player) => player.id === roomStatus.karaokeTurn?.singerId)?.name ?? 'Người hát'}`
                  : 'Sân khấu karaoke đang trống'}
              </span>
              {roomStatus.karaokeTurn && (
                <button
                  type="button"
                  className="rounded-md border border-rose-400/40 px-3 py-2 text-rose-200 hover:bg-rose-500/20"
                  onClick={() => MultiplayerManager.getInstance().removeKaraokeSinger()}
                >
                  Mời rời sân khấu
                </button>
              )}
            </div>
          ) : null}
          isNightMode={isNightMode}
          onToggleNightMode={handleToggleNight}
          onOpenMenu={undefined}
          onOpenReservation={undefined}
          onResetLayout={undefined}
          activeEmote={activeEmote}
          onTriggerEmote={handleTriggerEmote}
        />

        <LobbyHubModal
          isOpen={isHubModalOpen}
          initialTab={hubInitialTab}
          onClose={() => setIsHubModalOpen(false)}
          onSwitchedRoom={() => enterSceneDirect(LOBBY_SCENE_ID)}
        />

        {stageErrorToast && (
          <div className="fixed bottom-6 right-6 z-[110] max-w-sm px-4 py-3 rounded-xl bg-rose-950/95 border border-rose-500/40 text-rose-100 text-xs shadow-2xl backdrop-blur-md flex items-start gap-3">
            <div className="flex-1 leading-relaxed">{stageErrorToast}</div>
            <button
              onClick={() => setStageErrorToast(null)}
              className="text-rose-300 hover:text-white font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
