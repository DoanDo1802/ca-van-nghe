import React, { useCallback, useEffect, useState } from 'react';
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
import { MultiplayerManager, type RoomStatusSnapshot } from '../../network/MultiplayerManager';
import { INTERACTIVE_OBJECTS } from '../../data/sceneData';
import { loungeAudio } from '../../utils/audio';
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
  const [currentSceneId, setCurrentSceneId] = useState(() => engine.getSceneId());
  const [currentSceneName, setCurrentSceneName] = useState(() => engine.getSceneName());
  const [nearbyPrompt, setNearbyPrompt] = useState<NearbyPromptData | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isSitting, setIsSitting] = useState(false);
  const [cameraMode, setCameraMode] = useState<'third' | 'first'>('third');
  const [isNightMode, setIsNightMode] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stageSourceType, setStageSourceType] = useState<'media' | 'youtube'>('media');
  const [stageYoutubeId, setStageYoutubeId] = useState<string | null>(null);
  const [youtubeQuality, setYoutubeQuality] = useState('hd720');
  const [renderScale, setRenderScale] = useState(1);
  const [stageMediaUrl, setStageMediaUrl] = useState('/media/bello-ballo.mp4');
  const [stageMediaTitle, setStageMediaTitle] = useState('Live Acoustic Session — Bello Ballo');
  const [isStagePlaying, setIsStagePlaying] = useState(true);
  const [stageVolume, setStageVolume] = useState(0.8);
  const [isStageVideoMuted, setIsStageVideoMuted] = useState(false);
  const [isScreenOn, setIsScreenOn] = useState(true);
  const [activeEmote, setActiveEmote] = useState<string | null>(null);
  const [isKaraokeOpen, setIsKaraokeOpen] = useState(false);
  const [isRoomHost, setIsRoomHost] = useState(() => MultiplayerManager.getInstance().isHost());
  const [stageErrorToast, setStageErrorToast] = useState<string | null>(null);

  const requestSceneTransition = useCallback((targetSceneId: string) => {
    const cleanId = targetSceneId.trim();
    if (!cleanId) return;
    if (!isSceneEnabledInBuild(cleanId)) {
      const def = getSceneDefinition(cleanId);
      setStageErrorToast(
        `Scene "${def.name}" chưa được tích chọn trong Build Settings (Scenes In Build).`
      );
      return;
    }

    setNearbyPrompt(null);
    setSelectedObjectId(null);
    setIsSitting(false);
    setIsKaraokeOpen(false);
    setIsStageModalOpen(false);
    void EditorEngine.getInstance().loadSceneById(cleanId, { keepPlayMode: true });
  }, []);

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
        setIsSettingsOpen((prev) => !prev);
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
      setIsScreenOn(detail.isScreenOn);
    };

    const onStageError = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      if (msg) setStageErrorToast(msg);
    };

    const onRoomStatus = (e: Event) => {
      const detail = (e as CustomEvent<RoomStatusSnapshot>).detail;
      if (detail) setIsRoomHost(detail.isHost);
    };

    window.addEventListener('cavannghe:proximity', onProximity);
    window.addEventListener('cavannghe:interact', onInteract);
    window.addEventListener('cavannghe:load-scene', onLoadSceneEvent);
    window.addEventListener('cavannghe:sit', onSit);
    window.addEventListener('cavannghe:camera-mode', onCamMode);
    window.addEventListener('cavannghe:karaoke', onKaraoke);
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

  const handleToggleAudio = () => {
    const playing = loungeAudio.toggle();
    setIsAudioPlaying(playing);
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
      loungeAudio.playClapSound();
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
          onOpenSettings={() => setIsSettingsOpen(true)}
          nearbyPrompt={nearbyPrompt}
          isSitting={isSitting}
          onTriggerInteract={handleTriggerInteract}
          cameraMode={cameraMode}
          isDecoMode={false}
          hideHeader={isKaraokeOpen}
          currentSceneId={currentSceneId}
          currentSceneName={currentSceneName}
          onGoToLobby={() => requestSceneTransition(LOBBY_SCENE_ID)}
        />

        <MobileControls
          onMove={(vec: { x: number; y: number } | null) =>
            window.dispatchEvent(new CustomEvent('cavannghe:mobile-move', { detail: vec }))
          }
          onAction={handleTriggerInteract}
        />

        <KaraokeOverlay
          isOpen={isKaraokeOpen}
          onExit={() => window.dispatchEvent(new CustomEvent('cavannghe:karaoke-exit'))}
        />

        <KaraokeAudienceSync isSingingLocal={isKaraokeOpen} />

        <ChatBox />

        {ENABLE_VOICE_CHAT && <VoiceChatBar isKaraokeOpen={isKaraokeOpen} />}

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
          isHost={isRoomHost}
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
          onToggleMute={() => {
            const next = !isStageVideoMuted;
            setIsStageVideoMuted(next);
            EditorEngine.getInstance().setStageMuted(next);
          }}
          isScreenOn={isScreenOn}
          onToggleScreen={() => {
            const next = !isScreenOn;
            setIsScreenOn(next);
            EditorEngine.getInstance().setStageScreenOn(next);
          }}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
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
          isStageVideoMuted={isStageVideoMuted}
          onToggleStageMute={() => {
            const next = !isStageVideoMuted;
            setIsStageVideoMuted(next);
            EditorEngine.getInstance().setStageMuted(next);
          }}
          onOpenStageScreenModal={() => setIsStageModalOpen(true)}
          isNightMode={isNightMode}
          onToggleNightMode={handleToggleNight}
          isAudioPlaying={isAudioPlaying}
          onToggleAudio={handleToggleAudio}
          onOpenMenu={undefined}
          onOpenReservation={undefined}
          onResetLayout={undefined}
          activeEmote={activeEmote}
          onTriggerEmote={handleTriggerEmote}
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
