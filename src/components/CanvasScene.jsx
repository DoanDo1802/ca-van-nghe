import React, { Suspense, useState, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { useProgress, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import CaVanNgheLounge from './3d/CaVanNgheLounge';
import SceneLighting from './3d/SceneLighting';
import PlayerController from './3d/PlayerController';
import DecoWorld from './3d/DecoWorld';
import { CHAIRS_LIST, INTERACTABLES_LIST } from '../data/sceneData';
import { Music } from 'lucide-react';

function DecoCameraController({ isDecoMode, selectedItem, controlsRef, preset = 'god', isTransforming = false }) {
  const { camera } = useThree();
  const prevDecoRef = useRef(false);
  const prevPresetRef = useRef(preset);
  const prevSelectedIdRef = useRef(null);
  const targetDest = useRef(new THREE.Vector3(0, 0.5, 0));
  const isGliding = useRef(false);

  // Keyboard navigation keys state
  const keys = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    fast: false
  });

  // 1. Initial entry or explicit Preset button clicked
  useEffect(() => {
    if (!isDecoMode) {
      prevDecoRef.current = false;
      isGliding.current = false;
      return;
    }

    if (!prevDecoRef.current || prevPresetRef.current !== preset) {
      const center = controlsRef.current ? controlsRef.current.target.clone() : new THREE.Vector3(0, 0.5, 0);
      if (!prevDecoRef.current) {
        // First time entering Deco mode: start from high god view over lounge center
        center.set(0, 0.5, 0);
      }

      if (preset === 'god') {
        camera.position.set(center.x, center.y + 16.0, center.z + 10.0);
      } else if (preset === 'iso') {
        camera.position.set(center.x + 10.0, center.y + 11.0, center.z + 11.0);
      } else if (preset === 'eye') {
        camera.position.set(center.x, center.y + 2.4, center.z + 7.5);
      }
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
      }
      isGliding.current = false;
    }
    prevDecoRef.current = isDecoMode;
    prevPresetRef.current = preset;
  }, [isDecoMode, preset, camera, controlsRef]);

  // 2. Keyboard listener for WASD / Arrow keys camera movement
  useEffect(() => {
    if (!isDecoMode) return;

    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp')    keys.current.forward = true;
      if (code === 'KeyS' || code === 'ArrowDown')  keys.current.backward = true;
      if (code === 'KeyA' || code === 'ArrowLeft')  keys.current.left = true;
      if (code === 'KeyD' || code === 'ArrowRight') keys.current.right = true;
      if (code === 'KeyE')                          keys.current.up = true;
      if (code === 'KeyQ')                          keys.current.down = true;
      if (code === 'ShiftLeft' || code === 'ShiftRight') keys.current.fast = true;

      if (keys.current.forward || keys.current.backward || keys.current.left || keys.current.right || keys.current.up || keys.current.down) {
        isGliding.current = false;
      }
    };

    const onKeyUp = (e) => {
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp')    keys.current.forward = false;
      if (code === 'KeyS' || code === 'ArrowDown')  keys.current.backward = false;
      if (code === 'KeyA' || code === 'ArrowLeft')  keys.current.left = false;
      if (code === 'KeyD' || code === 'ArrowRight') keys.current.right = false;
      if (code === 'KeyE')                          keys.current.up = false;
      if (code === 'KeyQ')                          keys.current.down = false;
      if (code === 'ShiftLeft' || code === 'ShiftRight') keys.current.fast = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      keys.current = { forward: false, backward: false, left: false, right: false, up: false, down: false, fast: false };
    };
  }, [isDecoMode]);

  // 3. When an item is explicitly selected, glide to it ONCE.
  // When deselected, keep camera right where user left it!
  useEffect(() => {
    if (!isDecoMode) return;
    if (selectedItem && selectedItem.id !== prevSelectedIdRef.current) {
      targetDest.current.set(selectedItem.position[0], selectedItem.position[1] + 0.5, selectedItem.position[2]);
      isGliding.current = true;
    } else if (!selectedItem) {
      isGliding.current = false;
    }
    prevSelectedIdRef.current = selectedItem?.id || null;
  }, [isDecoMode, selectedItem]);

  // 4. Frame update: Handle WASD camera fly & smooth glide
  useFrame((_, delta) => {
    if (!isDecoMode || !controlsRef.current) return;
    const controls = controlsRef.current;

    // A. Keyboard WASD Camera Panning
    let moveForward = 0;
    let moveRight = 0;
    let moveUp = 0;

    if (keys.current.forward)  moveForward += 1;
    if (keys.current.backward) moveForward -= 1;
    if (keys.current.left)     moveRight -= 1;
    if (keys.current.right)    moveRight += 1;
    if (keys.current.up)       moveUp += 1;
    if (keys.current.down)     moveUp -= 1;

    if (moveForward !== 0 || moveRight !== 0 || moveUp !== 0) {
      isGliding.current = false;

      // Get camera horizontal forward & right vectors
      const forwardVec = new THREE.Vector3();
      camera.getWorldDirection(forwardVec);
      forwardVec.y = 0;
      forwardVec.normalize();

      const rightVec = new THREE.Vector3();
      rightVec.crossVectors(forwardVec, new THREE.Vector3(0, 1, 0)).normalize();

      const speed = (keys.current.fast ? 20.0 : 10.0) * delta;
      const moveVec = new THREE.Vector3()
        .addScaledVector(forwardVec, moveForward * speed)
        .addScaledVector(rightVec, moveRight * speed);
      moveVec.y += moveUp * speed;

      controls.target.add(moveVec);
      camera.position.add(moveVec);
    }

    // B. Smooth one-time glide to selected item (when not moving manually)
    if (!isTransforming && isGliding.current) {
      const diff = targetDest.current.clone().sub(controls.target);
      const distSq = diff.lengthSq();

      if (distSq > 0.002) {
        const factor = Math.min(1.0, delta * 5.0);
        const step = diff.multiplyScalar(factor);

        controls.target.add(step);
        camera.position.add(step);
      } else {
        isGliding.current = false;
      }
    }
  });

  return null;
}

function OpaqueClear({ color }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.setClearColor(color, 1);
  }, [gl, color]);
  return null;
}

function SceneLoader() {
  const { progress } = useProgress();
  return (
    <Html center zIndexRange={[1000, 0]}>
      <div className="flex flex-col items-center justify-center p-6 rounded-3xl glass-panel-warm border border-amber-500/30 text-center shadow-2xl min-w-[280px]">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-300 flex items-center justify-center mb-4 shadow-lg shadow-amber-900/40 animate-pulse">
          <Music className="w-7 h-7 text-stone-900" />
        </div>
        <h3 className="font-serif font-bold text-lg text-amber-100 mb-1">
          Ca Văn Nghệ 3D
        </h3>
        <p className="text-xs text-amber-200/60 mb-3">
          Đang tải không gian đại sảnh & nhân vật...
        </p>
        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden mb-2">
          <div
            className="bg-gradient-to-r from-amber-600 via-brand-500 to-yellow-400 h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.round(progress)}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-amber-300 font-semibold">
          {Math.round(progress)}%
        </span>
      </div>
    </Html>
  );
}

export default function CanvasScene({
  isNightMode,
  onSelectObject,
  isSitting,
  currentSeat,
  onSitDown,
  onStandUp,
  onProximityChange,
  cameraMode,
  onToggleCameraMode,
  isDecoMode = false,
  decoCameraPreset = 'god',
  decoItems = [],
  chairs = CHAIRS_LIST,
  selectedDecoId = null,
  onSelectDeco = () => {},
  onUpdateDeco = () => {},
  gizmoMode = 'translate',
  isSnapEnabled = true,
  mobileInput,
  activeEmote,
  onClearEmote,
  onTriggerEmote,
  jumpSignal,
  stageVideoId,
  isStageVideoMuted,
  isScreenOn,
  isAnyModalOpen,
  onOpenStageScreenModal
}) {
  const [isTransforming, setIsTransforming] = useState(false);
  const orbitRef = useRef();
  const moveTargetRef = useRef(null);
  const bgColor = isNightMode ? '#090c12' : '#141210';
  const selectedDecoItem = decoItems.find((it) => it.id === selectedDecoId) || null;

  // Release pointer lock immediately whenever entering deco mode
  useEffect(() => {
    if (isDecoMode && document.pointerLockElement) {
      try {
        document.exitPointerLock?.();
      } catch (err) {}
    }
  }, [isDecoMode]);

  return (
    <div
      className={`w-full h-full relative ${isDecoMode ? 'cursor-default' : 'cursor-crosshair'}`}
      style={{ backgroundColor: bgColor }}
    >
      <Canvas
        shadows
        dpr={[1, 1.25]}
        camera={{ position: [0, 4.5, 12.0], fov: 50, near: 0.2, far: 90 }}
        gl={{
          antialias: true,
          alpha: true,
          premultipliedAlpha: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
          failIfMajorPerformanceCaveat: false,
          stencil: false
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('WebGL context lost. Restoring...');
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.info('WebGL context restored.');
          });
        }}
      >
        <OpaqueClear color={bgColor} />
        <fog attach="fog" args={[bgColor, 18, 45]} />

        {/* Top-Down God Camera setup for Deco Mode */}
        <DecoCameraController
          isDecoMode={isDecoMode}
          selectedItem={selectedDecoItem}
          controlsRef={orbitRef}
          preset={decoCameraPreset}
          isTransforming={isTransforming}
        />

        {/* Free Orbit Camera Controls in Deco Mode */}
        {isDecoMode && (
          <OrbitControls
            ref={orbitRef}
            makeDefault
            enabled={!isTransforming}
            maxPolarAngle={Math.PI / 2 - 0.02}
            minDistance={2.0}
            maxDistance={40.0}
            target={[0, 0.5, 0]}
            enableDamping
            dampingFactor={0.08}
          />
        )}

        <Suspense fallback={<SceneLoader />}>
          <SceneLighting isNightMode={isNightMode} />

          {/* Third-Person & First-Person Player Controller */}
          <PlayerController
            chairs={chairs}
            interactables={INTERACTABLES_LIST}
            decoItems={decoItems}
            onProximityChange={onProximityChange}
            onInteractObject={onSelectObject}
            isSitting={isSitting}
            currentSeat={currentSeat}
            onSitDown={onSitDown}
            onStandUp={onStandUp}
            cameraMode={cameraMode}
            onToggleCameraMode={onToggleCameraMode}
            isDecoMode={isDecoMode}
            mobileInput={mobileInput}
            activeEmote={activeEmote}
            onClearEmote={onClearEmote}
            onTriggerEmote={onTriggerEmote}
            jumpSignal={jumpSignal}
          />

          {/* 3D Lounge Static Shell */}
          <CaVanNgheLounge
            onSelectObject={onSelectObject}
            stageVideoId={stageVideoId}
            isStageVideoMuted={isStageVideoMuted}
            isScreenOn={isScreenOn}
            isAnyModalOpen={isAnyModalOpen}
            onOpenStageScreenModal={onOpenStageScreenModal}
          />

          {/* All Placed Furniture & Deco Items (Selectable, Movable with Gizmo) */}
          <DecoWorld
            decoItems={decoItems}
            selectedDecoId={selectedDecoId}
            onSelectDeco={onSelectDeco}
            onUpdateDeco={onUpdateDeco}
            gizmoMode={gizmoMode}
            snapEnabled={isSnapEnabled}
            isDecoMode={isDecoMode}
            onInteractiveClick={onSelectObject}
            onTransformStart={() => setIsTransforming(true)}
            onTransformEnd={() => setIsTransforming(false)}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
