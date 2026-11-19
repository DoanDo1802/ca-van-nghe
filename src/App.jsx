import React, { useState, useEffect, useMemo } from 'react';
import CanvasScene from './components/CanvasScene';
import NavigationHUD from './components/NavigationHUD';
import DecoToolbar from './components/DecoToolbar';
import MobileControls from './components/MobileControls';
import DetailModal from './components/DetailModal';
import MenuDrawer from './components/MenuDrawer';
import ReservationModal from './components/ReservationModal';
import StageScreenModal from './components/StageScreenModal';
import SettingsModal from './components/SettingsModal';
import { INTERACTIVE_OBJECTS } from './data/sceneData';
import { DEFAULT_LOUNGE_DECO_ITEMS } from './data/defaultLoungeLayout';
import { loungeAudio } from './utils/audio';

export default function App() {
  const [isNightMode, setIsNightMode] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReservationOpen, setIsReservationOpen] = useState(false);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Stage YouTube Screen States (Default to unmuted sound ON)
  const [stageVideoId, setStageVideoId] = useState('lTRiuFIWV54'); // Default: 1 A.M Study Session - Lofi Hip Hop
  const [isStageVideoMuted, setIsStageVideoMuted] = useState(false);
  const [isScreenOn, setIsScreenOn] = useState(true);

  // Camera View Mode: 'third' (Góc nhìn thứ 3) | 'first' (Góc nhìn thứ 1)
  const [cameraMode, setCameraMode] = useState('third');

  // ─────────────────────────────────────────────────────────────
  // DECO / BUILD MODE SYSTEM
  // ─────────────────────────────────────────────────────────────
  const [isDecoMode, setIsDecoMode] = useState(false);
  const [decoItems, setDecoItems] = useState(() => {
    try {
      const saved = localStorage.getItem('cavannghe_deco_items_v7');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(
            (it) =>
              !it.url?.toLowerCase().includes('tree.glb') &&
              !it.id?.toLowerCase().includes('tree') &&
              !it.url?.toLowerCase().includes('boards.glb') &&
              !it.id?.toLowerCase().includes('board') &&
              !it.url?.toLowerCase().includes('restaurant_chandelier.glb') &&
              !it.id?.toLowerCase().includes('chandelier')
          );
        }
      }
      return DEFAULT_LOUNGE_DECO_ITEMS;
    } catch {
      return DEFAULT_LOUNGE_DECO_ITEMS;
    }
  });
  const [selectedDecoId, setSelectedDecoId] = useState(null);
  const [gizmoMode, setGizmoMode] = useState('translate'); // 'translate' | 'rotate'
  const [decoCameraPreset, setDecoCameraPreset] = useState('god'); // 'god' | 'iso' | 'eye'
  const [isSnapEnabled, setIsSnapEnabled] = useState(true); // Snap 0.25m / 15 deg grid

  // Dynamically compute chairs from deco items so sitting always works on relocated chairs
  const dynamicChairsList = useMemo(() => {
    return decoItems
      .filter((it) => it.isChair || it.url?.toLowerCase().includes('chair'))
      .map((it) => {
        const isBarStool = it.url?.toLowerCase().includes('bar');
        const defaultSeatH = isBarStool ? 0.83 : 0.39;
        const seatH = it.seatHeight || defaultSeatH;
        return {
          id: it.id,
          title: it.name || 'Ghế ngồi',
          position: it.position,
          seatPosition: [it.position[0], seatH, it.position[2]],
          seatRotation: it.rotation ? it.rotation[1] : 0,
          isBarStool
        };
      });
  }, [decoItems]);

  // Character Sitting State
  const [isSitting, setIsSitting] = useState(false);
  const [currentSeat, setCurrentSeat] = useState(null);

  // Active Emote & Jump Signal
  const [activeEmote, setActiveEmote] = useState(null);
  const [jumpSignal, setJumpSignal] = useState(0);

  // Proximity to chairs/objects
  const [nearbyPrompt, setNearbyPrompt] = useState(null);

  // Mobile virtual joystick input
  const [mobileInput, setMobileInput] = useState(null);

  // Audio toggle
  const handleToggleAudio = () => {
    const playing = loungeAudio.toggle();
    setIsAudioPlaying(playing);
  };

  // Toggle Camera Mode
  const handleToggleCameraMode = () => {
    if (isDecoMode) return;
    setCameraMode((prev) => (prev === 'third' ? 'first' : 'third'));
  };

  // Toggle Deco / Build Mode
  const handleToggleDecoMode = () => {
    setIsDecoMode((prev) => {
      const next = !prev;
      if (next) {
        if (isSitting) handleStandUp();
        setActiveEmote(null);
      } else {
        setSelectedDecoId(null);
      }
      return next;
    });
  };

  // Deco manipulation handlers
  const handleAddItem = (catalogItem) => {
    const newItem = {
      id: `deco_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      catalogId: catalogItem.id,
      name: catalogItem.name,
      url: catalogItem.url,
      position: [0, catalogItem.defaultY || 0, 2],
      rotation: [0, 0, 0],
      scale: catalogItem.defaultScale || [1, 1, 1]
    };
    setDecoItems((prev) => [...prev, newItem]);
    setSelectedDecoId(newItem.id);
  };

  const handleUpdateDeco = (id, updates) => {
    setDecoItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleRotateItem = (id, angleRad = Math.PI / 4) => {
    setDecoItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentRotY = item.rotation[1] || 0;
        return {
          ...item,
          rotation: [
            item.rotation[0],
            Number((currentRotY + angleRad).toFixed(2)),
            item.rotation[2]
          ]
        };
      })
    );
  };

  const handleNudgeItem = (id, dx, dz) => {
    setDecoItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const newX = Math.round((item.position[0] + dx) / 0.25) * 0.25;
        const newZ = Math.round((item.position[2] + dz) / 0.25) * 0.25;
        return {
          ...item,
          position: [Number(newX.toFixed(2)), item.position[1], Number(newZ.toFixed(2))]
        };
      })
    );
  };

  const handleSnapItem = (id) => {
    setDecoItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const snappedX = Math.round(item.position[0] / 0.25) * 0.25;
        const snappedZ = Math.round(item.position[2] / 0.25) * 0.25;
        const currentRotY = item.rotation ? item.rotation[1] : 0;
        const snappedRotY = Math.round(currentRotY / (Math.PI / 2)) * (Math.PI / 2);
        return {
          ...item,
          position: [Number(snappedX.toFixed(2)), item.position[1], Number(snappedZ.toFixed(2))],
          rotation: [0, Number(snappedRotY.toFixed(2)), 0]
        };
      })
    );
  };

  const handleDuplicateItem = (id) => {
    const source = decoItems.find((item) => item.id === id);
    if (!source) return;
    const duplicated = {
      ...source,
      id: `deco_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      position: [
        Number((source.position[0] + 0.8).toFixed(2)),
        source.position[1],
        Number((source.position[2] + 0.8).toFixed(2))
      ]
    };
    setDecoItems((prev) => [...prev, duplicated]);
    setSelectedDecoId(duplicated.id);
  };

  const handleDeleteItem = (id) => {
    setDecoItems((prev) => prev.filter((item) => item.id !== id));
    if (selectedDecoId === id) setSelectedDecoId(null);
  };

  const handleSaveScene = () => {
    try {
      localStorage.setItem('cavannghe_deco_items_v7', JSON.stringify(decoItems));
      alert('Đã lưu bài trí cảnh thành công vào bộ nhớ trình duyệt!');
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportScene = () => {
    const jsonStr = JSON.stringify(decoItems, null, 2);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(jsonStr);
    }
    console.log('--- DECO SCENE EXPORT ---', jsonStr);
  };

  const handleClearAll = () => {
    if (window.confirm('Bạn có chắc muốn xoá toàn bộ vật phẩm để tự do deco từ đầu không?')) {
      setDecoItems([]);
      setSelectedDecoId(null);
      try {
        localStorage.setItem('cavannghe_deco_items_v7', JSON.stringify([]));
      } catch (e) {}
    }
  };

  // Reset layout to default
  const handleResetDefaultLayout = () => {
    setDecoItems(DEFAULT_LOUNGE_DECO_ITEMS);
    setSelectedDecoId(null);
    try {
      localStorage.setItem('cavannghe_deco_items_v7', JSON.stringify(DEFAULT_LOUNGE_DECO_ITEMS));
    } catch (e) {}
  };

  // Keyboard shortcut listener for Deco Mode & tools
  useEffect(() => {
    const handleGlobalKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      if (e.code === 'Tab') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }

      if (e.code === 'KeyB') {
        e.preventDefault();
        handleToggleDecoMode();
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        setIsStageVideoMuted((prev) => !prev);
      }

      if (e.code === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        if (selectedDecoId) {
          setSelectedDecoId(null);
        }
      }

      if (isDecoMode) {
        if (e.code === 'KeyG') {
          e.preventDefault();
          setGizmoMode('translate');
        }
        if (e.code === 'KeyR') {
          e.preventDefault();
          setGizmoMode('rotate');
        }
        if (e.code === 'Delete' || e.code === 'Backspace') {
          if (selectedDecoId) {
            e.preventDefault();
            handleDeleteItem(selectedDecoId);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [isDecoMode, selectedDecoId, isSitting, isSettingsOpen]);

  // Emote and Jump actions
  const handleTriggerEmote = (emoteName) => {
    if (isSitting) handleStandUp();
    if (emoteName === 'clap') {
      loungeAudio.playClapSound();
    }
    setActiveEmote((prev) => (prev === emoteName ? null : emoteName));
  };

  const handleClearEmote = () => {
    setActiveEmote(null);
  };

  const handleTriggerJump = () => {
    setJumpSignal((prev) => prev + 1);
  };

  // Sitting actions
  const handleSitDown = (chair) => {
    setActiveEmote(null);
    setIsSitting(true);
    setCurrentSeat(chair);
  };

  const handleStandUp = () => {
    setIsSitting(false);
    setCurrentSeat(null);
  };

  // Trigger interact from button or [E]
  const handleTriggerInteract = () => {
    if (isSitting) {
      handleStandUp();
      return;
    }
    if (nearbyPrompt?.type === 'chair') {
      handleSitDown(nearbyPrompt.chair);
    } else if (nearbyPrompt?.type === 'object') {
      setSelectedObjectId(nearbyPrompt.id);
    }
  };

  const selectedDecoItem = decoItems.find((item) => item.id === selectedDecoId) || null;
  const isAnyModalOpen = isSettingsOpen || isStageModalOpen || isMenuOpen || isReservationOpen || !!selectedObjectId;

  return (
    <main className="w-screen h-screen relative overflow-hidden bg-[#0c0e14]">
      {/* 3D Scene with Playable Character & Free Deco Orbit Controls */}
      <CanvasScene
        isNightMode={isNightMode}
        onSelectObject={(objId) => setSelectedObjectId(objId)}
        isSitting={isSitting}
        currentSeat={currentSeat}
        onSitDown={handleSitDown}
        onStandUp={handleStandUp}
        onProximityChange={setNearbyPrompt}
        cameraMode={cameraMode}
        onToggleCameraMode={handleToggleCameraMode}
        isDecoMode={isDecoMode}
        decoCameraPreset={decoCameraPreset}
        decoItems={decoItems}
        chairs={dynamicChairsList}
        selectedDecoId={selectedDecoId}
        onSelectDeco={setSelectedDecoId}
        onUpdateDeco={handleUpdateDeco}
        gizmoMode={gizmoMode}
        isSnapEnabled={isSnapEnabled}
        mobileInput={mobileInput}
        activeEmote={activeEmote}
        onClearEmote={handleClearEmote}
        onTriggerEmote={handleTriggerEmote}
        jumpSignal={jumpSignal}
        stageVideoId={stageVideoId}
        isStageVideoMuted={isStageVideoMuted}
        isScreenOn={isScreenOn}
        isAnyModalOpen={isAnyModalOpen}
        onOpenStageScreenModal={() => setIsStageModalOpen(true)}
      />

      {/* Clean HUD with Minimal Brand Header, Settings [Tab] Trigger & Proximity Prompt */}
      <NavigationHUD
        onOpenSettings={() => setIsSettingsOpen(true)}
        nearbyPrompt={nearbyPrompt}
        isSitting={isSitting}
        onTriggerInteract={handleTriggerInteract}
        cameraMode={cameraMode}
        isDecoMode={isDecoMode}
      />

      {/* Deco / Build Mode Toolbar, Catalog & Transform Controls */}
      <DecoToolbar
        isOpen={isDecoMode}
        onClose={handleToggleDecoMode}
        selectedItem={selectedDecoItem}
        gizmoMode={gizmoMode}
        onSetGizmoMode={setGizmoMode}
        isSnapEnabled={isSnapEnabled}
        onToggleSnap={() => setIsSnapEnabled((prev) => !prev)}
        cameraPreset={decoCameraPreset}
        onSetCameraPreset={setDecoCameraPreset}
        onRotateItem={handleRotateItem}
        onNudgeItem={handleNudgeItem}
        onSnapItem={handleSnapItem}
        onDuplicateItem={handleDuplicateItem}
        onDeleteItem={handleDeleteItem}
        onDeselectItem={() => setSelectedDecoId(null)}
        onAddItem={handleAddItem}
        onSaveScene={handleSaveScene}
        onExportScene={handleExportScene}
        onClearAll={handleClearAll}
        onResetLayout={handleResetDefaultLayout}
        itemCount={decoItems.length}
      />

      {/* Touch Joystick & Action Button for Mobile (Hidden in Deco mode) */}
      {!isDecoMode && (
        <MobileControls
          onMove={setMobileInput}
          onAction={handleTriggerInteract}
        />
      )}

      {/* Interactive Object Detail Modal */}
      {selectedObjectId && (
        <DetailModal
          item={INTERACTIVE_OBJECTS[selectedObjectId]}
          onClose={() => setSelectedObjectId(null)}
          onActionClick={(item) => {
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

      {/* Online Menu Drawer */}
      <MenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      {/* Reservation Modal with Confetti */}
      <ReservationModal
        isOpen={isReservationOpen}
        onClose={() => setIsReservationOpen(false)}
      />

      {/* Stage LED Screen YouTube Controller Modal */}
      <StageScreenModal
        isOpen={isStageModalOpen}
        onClose={() => setIsStageModalOpen(false)}
        currentVideoId={stageVideoId}
        onChangeVideo={(id) => setStageVideoId(id)}
        isMuted={isStageVideoMuted}
        onToggleMute={() => setIsStageVideoMuted((prev) => !prev)}
        isScreenOn={isScreenOn}
        onToggleScreen={() => setIsScreenOn((prev) => !prev)}
      />

      {/* Settings & Experience Mode Switcher [Tab] */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        cameraMode={cameraMode}
        onToggleCameraMode={handleToggleCameraMode}
        isDecoMode={isDecoMode}
        onToggleDecoMode={handleToggleDecoMode}
        isScreenOn={isScreenOn}
        onToggleScreen={() => setIsScreenOn((prev) => !prev)}
        isStageVideoMuted={isStageVideoMuted}
        onToggleStageMute={() => setIsStageVideoMuted((prev) => !prev)}
        onOpenStageScreenModal={() => setIsStageModalOpen(true)}
        isNightMode={isNightMode}
        onToggleNightMode={() => setIsNightMode((prev) => !prev)}
        isAudioPlaying={isAudioPlaying}
        onToggleAudio={handleToggleAudio}
        onOpenMenu={() => setIsMenuOpen(true)}
        onOpenReservation={() => setIsReservationOpen(true)}
        onResetLayout={handleResetDefaultLayout}
        activeEmote={activeEmote}
        onTriggerEmote={handleTriggerEmote}
      />
    </main>
  );
}
