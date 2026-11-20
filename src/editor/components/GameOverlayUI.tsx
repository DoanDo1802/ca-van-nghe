import React, { useEffect, useState } from 'react';
import NavigationHUD from '../../components/NavigationHUD';
import MobileControls from '../../components/MobileControls';
import DetailModal from '../../components/DetailModal';
import MenuDrawer from '../../components/MenuDrawer';
import ReservationModal from '../../components/ReservationModal';
import StageScreenModal from '../../components/StageScreenModal';
import SettingsModal from '../../components/SettingsModal';
import { INTERACTIVE_OBJECTS } from '../../data/sceneData';
import { loungeAudio } from '../../utils/audio';
import { EditorEngine } from '../../engine/EditorEngine';
import type { NearbyPromptData } from '../../engine/runtime/PlayerControllerRuntime';

export const GameOverlayUI: React.FC = () => {
  const [nearbyPrompt, setNearbyPrompt] = useState<NearbyPromptData | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isSitting, setIsSitting] = useState(false);
  const [cameraMode, setCameraMode] = useState<'third' | 'first'>('third');
  const [isNightMode, setIsNightMode] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReservationOpen, setIsReservationOpen] = useState(false);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stageVideoId, setStageVideoId] = useState('lTRiuFIWV54');
  const [isStageVideoMuted, setIsStageVideoMuted] = useState(false);
  const [isScreenOn, setIsScreenOn] = useState(true);
  const [activeEmote, setActiveEmote] = useState<string | null>(null);

  useEffect(() => {
    const onProximity = (e: Event) => {
      setNearbyPrompt((e as CustomEvent<NearbyPromptData | null>).detail);
    };
    const onInteract = (e: Event) => {
      const objId = (e as CustomEvent<string>).detail;
      if (objId === 'stage_screen') {
        setIsStageModalOpen(true);
      } else {
        setSelectedObjectId(objId);
      }
    };
    const onSit = (e: Event) => {
      const detail = (e as CustomEvent<{ sitting: boolean }>).detail;
      setIsSitting(Boolean(detail?.sitting));
    };
    const onCamMode = (e: Event) => {
      setCameraMode((e as CustomEvent<'third' | 'first'>).detail);
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

    window.addEventListener('cavannghe:proximity', onProximity);
    window.addEventListener('cavannghe:interact', onInteract);
    window.addEventListener('cavannghe:sit', onSit);
    window.addEventListener('cavannghe:camera-mode', onCamMode);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('cavannghe:proximity', onProximity);
      window.removeEventListener('cavannghe:interact', onInteract);
      window.removeEventListener('cavannghe:sit', onSit);
      window.removeEventListener('cavannghe:camera-mode', onCamMode);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

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
    if (nearbyPrompt?.type === 'object') {
      if (nearbyPrompt.id === 'stage_screen') {
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
      <div className="pointer-events-auto">
        <NavigationHUD
          onOpenSettings={() => setIsSettingsOpen(true)}
          nearbyPrompt={nearbyPrompt}
          isSitting={isSitting}
          onTriggerInteract={handleTriggerInteract}
          cameraMode={cameraMode}
          isDecoMode={false}
        />

        <MobileControls
          onMove={(vec: { x: number; y: number } | null) =>
            window.dispatchEvent(new CustomEvent('cavannghe:mobile-move', { detail: vec }))
          }
          onAction={handleTriggerInteract}
        />

        {interactiveItem && (
          <DetailModal
            item={interactiveItem}
            onClose={() => setSelectedObjectId(null)}
            onActionClick={(item: { actionText?: string }) => {
              if (item.actionText === 'Đặt Bàn Ngay' || item.actionText === 'Đặt Chỗ Nghe Nhạc') {
                setSelectedObjectId(null);
                setIsReservationOpen(true);
              } else if (item.actionText === 'Xem Menu Vang' || item.actionText === 'Gọi Món Này') {
                setSelectedObjectId(null);
                setIsMenuOpen(true);
              } else if (item.actionText === 'Đổi Video Sân Khấu') {
                setSelectedObjectId(null);
                setIsStageModalOpen(true);
              }
            }}
          />
        )}

        <MenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        <ReservationModal isOpen={isReservationOpen} onClose={() => setIsReservationOpen(false)} />

        <StageScreenModal
          isOpen={isStageModalOpen}
          onClose={() => setIsStageModalOpen(false)}
          currentVideoId={stageVideoId}
          onChangeVideo={(id: string) => setStageVideoId(id)}
          isMuted={isStageVideoMuted}
          onToggleMute={() => setIsStageVideoMuted((prev) => !prev)}
          isScreenOn={isScreenOn}
          onToggleScreen={() => setIsScreenOn((prev) => !prev)}
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
          onToggleDecoMode={() => {}}
          isScreenOn={isScreenOn}
          onToggleScreen={() => setIsScreenOn((prev) => !prev)}
          isStageVideoMuted={isStageVideoMuted}
          onToggleStageMute={() => setIsStageVideoMuted((prev) => !prev)}
          onOpenStageScreenModal={() => setIsStageModalOpen(true)}
          isNightMode={isNightMode}
          onToggleNightMode={handleToggleNight}
          isAudioPlaying={isAudioPlaying}
          onToggleAudio={handleToggleAudio}
          onOpenMenu={() => setIsMenuOpen(true)}
          onOpenReservation={() => setIsReservationOpen(true)}
          onResetLayout={() => {}}
          activeEmote={activeEmote}
          onTriggerEmote={handleTriggerEmote}
        />
      </div>
    </div>
  );
};
