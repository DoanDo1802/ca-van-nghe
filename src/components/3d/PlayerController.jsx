import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { loungeAudio } from '../../utils/audio';

// Map emote IDs to official mocap animation clip names
const EMOTE_ACTION_MAP = {
  talk: 'Idle_Talking_Loop',
  interact: 'Interact',
  dance: 'Dance_Loop',
  crouch: 'Crouch_Idle_Loop',
  walkFormal: 'Walk_Formal_Loop',
  // Backward compatibility aliases if any
  wave: 'Interact',
  clap: 'Idle_Talking_Loop',
  bounce: 'Dance_Loop',
  agree: 'Idle_Talking_Loop',
  headShake: 'Crouch_Idle_Loop'
};

// Frame-rate independent blend that never overshoots (unclamped lerp was bouncing the camera on hitches).
const expAlpha = (rate, dt) => 1 - Math.exp(-rate * dt);

const MAX_STEP = 0.2;
const STAGE_RADIUS = 0.22;

// Walkable stage treads. Neighbours overlap a few centimetres and the higher surface wins,
// so the lip between steps never drops to floor height for a frame.
const STAGE_SURFACES = [
  { minX: -7.32, maxX: 7.32, minZ: -8.06, maxZ: -7.56, y: 0.12 },
  { minX: -7.42, maxX: 7.42, minZ: -8.51, maxZ: -8.0, y: 0.24 },
  { minX: -7.5, maxX: 7.5, minZ: -16.9, maxZ: -8.45, y: 0.36 },
  { minX: 14.38, maxX: 14.98, minZ: -1.45, maxZ: 7.45, y: 0.18 },
  { minX: 14.92, maxX: 18.92, minZ: -1.75, maxZ: 7.75, y: 0.36 }
];

// Right-stage gear only, measured from the gig model. The aisle between the
// two drum kits stays open so the player can stand in the middle of the deck.
const STAGE_SOLIDS = [
  // Drum kit on the minus-Z side, including its stool
  { minX: 16.35, maxX: 18.30, minZ: -0.72, maxZ: 1.12 },
  // Drum kit on the plus-Z side, including its stool
  { minX: 16.40, maxX: 18.28, minZ: 3.68, maxZ: 6.05 },
  // Marshall stacks against the curtain
  { minX: 18.02, maxX: 18.55, minZ: 1.55, maxZ: 3.82 },
  // Mic stands, shrunk with the model so the body matches the smaller mic
  { minX: 15.66, maxX: 15.82, minZ: 2.64, maxZ: 2.78 },
  { minX: 16.75, maxX: 16.93, minZ: 1.67, maxZ: 1.85 },
  { minX: 17.84, maxX: 18.00, minZ: 3.61, maxZ: 3.75 },
  // Floor wedges and the side monitor stacks
  { minX: 15.14, maxX: 15.70, minZ: 1.60, maxZ: 2.18 },
  { minX: 15.12, maxX: 15.60, minZ: 2.46, maxZ: 2.96 },
  { minX: 15.14, maxX: 15.72, minZ: 3.20, maxZ: 3.80 },
  { minX: 16.22, maxX: 16.70, minZ: 0.75, maxZ: 1.25 },
  { minX: 16.20, maxX: 16.76, minZ: 4.12, maxZ: 4.70 },
  { minX: 15.55, maxX: 16.12, minZ: 5.50, maxZ: 6.08 },
  { minX: 15.55, maxX: 16.12, minZ: -0.88, maxZ: -0.30 },
  // Main-stage PA stacks. Back pair beside the screen, front pair at the corners.
  { minX: -7.5, maxX: -5.38, minZ: -16.58, maxZ: -14.7 },
  { minX: 5.38, maxX: 7.5, minZ: -16.58, maxZ: -14.7 },
  { minX: -7.5, maxX: -5.38, minZ: -10.85, maxZ: -8.95 },
  { minX: 5.38, maxX: 7.5, minZ: -10.85, maxZ: -8.95 },
  // Truss legs. The overhead rig is above head height and stays walkable.
  { minX: 14.20, maxX: 14.60, minZ: -0.86, maxZ: -0.52 },
  { minX: 14.20, maxX: 14.60, minZ: 5.72, maxZ: 6.08 },
  { minX: 15.84, maxX: 16.24, minZ: -0.86, maxZ: -0.52 },
  { minX: 15.84, maxX: 16.24, minZ: 5.72, maxZ: 6.08 },
  { minX: 18.28, maxX: 18.68, minZ: -0.86, maxZ: -0.52 },
  { minX: 18.28, maxX: 18.68, minZ: 5.72, maxZ: 6.08 }
];

function groundAt(x, z) {
  let y = 0;
  for (let i = 0; i < STAGE_SURFACES.length; i++) {
    const s = STAGE_SURFACES[i];
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ && s.y > y) y = s.y;
  }
  return y;
}

function sampleGround(x, z, velX, velZ, committed) {
  let y = groundAt(x, z);
  const speed = Math.hypot(velX, velZ);
  if (speed > 0.25) {
    const reach = 0.12 / speed;
    const ahead = groundAt(x + velX * reach, z + velZ * reach);
    if (ahead > y && ahead - committed <= MAX_STEP + 0.02) y = ahead;
  }
  // Stay on the current tread until the body is clearly past the lip.
  if (y + 0.001 < committed) {
    const m = 0.05;
    if (
      groundAt(x + m, z) >= committed - 0.001 ||
      groundAt(x - m, z) >= committed - 0.001 ||
      groundAt(x, z + m) >= committed - 0.001 ||
      groundAt(x, z - m) >= committed - 0.001
    ) {
      y = committed;
    }
  }
  return y;
}

function resolveStageWalls(pos, vel, feetY) {
  for (let i = 0; i < STAGE_SURFACES.length; i++) {
    const box = STAGE_SURFACES[i];
    if (feetY >= box.y - 0.03) continue;
    if (box.y - feetY <= MAX_STEP) continue;

    const cx = THREE.MathUtils.clamp(pos.x, box.minX, box.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, box.minZ, box.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= STAGE_RADIUS * STAGE_RADIUS) continue;

    let nx;
    let nz;
    let push;
    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      push = STAGE_RADIUS - dist;
      nx = dx / dist;
      nz = dz / dist;
    } else {
      const penL = pos.x - box.minX;
      const penR = box.maxX - pos.x;
      const penB = pos.z - box.minZ;
      const penF = box.maxZ - pos.z;
      const m = Math.min(penL, penR, penB, penF);
      if (m === penL) { nx = -1; nz = 0; push = penL + STAGE_RADIUS; }
      else if (m === penR) { nx = 1; nz = 0; push = penR + STAGE_RADIUS; }
      else if (m === penB) { nx = 0; nz = -1; push = penB + STAGE_RADIUS; }
      else { nx = 0; nz = 1; push = penF + STAGE_RADIUS; }
    }

    pos.x += nx * push;
    pos.z += nz * push;
    const vDot = vel.x * nx + vel.z * nz;
    if (vDot < 0) {
      vel.x -= vDot * nx;
      vel.z -= vDot * nz;
    }
  }
}

function resolveStageSolids(pos, vel) {
  for (let i = 0; i < STAGE_SOLIDS.length; i++) {
    const box = STAGE_SOLIDS[i];
    const cx = THREE.MathUtils.clamp(pos.x, box.minX, box.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, box.minZ, box.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= STAGE_RADIUS * STAGE_RADIUS) continue;

    let nx;
    let nz;
    let push;
    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      push = STAGE_RADIUS - dist;
      nx = dx / dist;
      nz = dz / dist;
    } else {
      const penL = pos.x - box.minX;
      const penR = box.maxX - pos.x;
      const penB = pos.z - box.minZ;
      const penF = box.maxZ - pos.z;
      const m = Math.min(penL, penR, penB, penF);
      if (m === penL) { nx = -1; nz = 0; push = penL + STAGE_RADIUS; }
      else if (m === penR) { nx = 1; nz = 0; push = penR + STAGE_RADIUS; }
      else if (m === penB) { nx = 0; nz = -1; push = penB + STAGE_RADIUS; }
      else { nx = 0; nz = 1; push = penF + STAGE_RADIUS; }
    }

    pos.x += nx * push;
    pos.z += nz * push;
    const vDot = vel.x * nx + vel.z * nz;
    if (vDot < 0) {
      vel.x -= vDot * nx;
      vel.z -= vDot * nz;
    }
  }
}

export default function PlayerController({
  chairs = [],
  interactables = [],
  onProximityChange,
  onInteractObject,
  isSitting,
  currentSeat,
  onSitDown,
  onStandUp,
  cameraMode = 'third',
  onToggleCameraMode,
  isDecoMode = false,
  mobileInput = null,
  activeEmote = null,
  onClearEmote = null,
  onTriggerEmote = null,
  jumpSignal = 0,
  decoItems = []
}) {
  const group = useRef();
  
  // Standard character with 46 mocap animations
  const { scene, animations } = useGLTF('/models/Character.glb');
  const { camera, gl } = useThree();

  const mixerRef = useRef(null);
  const actionsRef = useRef({});
  const currentActionName = useRef('');

  const playerPos = useRef(new THREE.Vector3(0, 0, 8));
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const jumpVelocityY = useRef(0);
  const isGrounded = useRef(true);
  const playerRot = useRef(0);

  // Smooth inertial camera controls
  const targetYaw = useRef(0);
  const targetPitch = useRef(0.2);
  const currentYaw = useRef(0);
  const currentPitch = useRef(0.2);
  const targetDist = useRef(3.5);
  const currentDist = useRef(3.5);
  const camWallT = useRef(1.0);

  const isDragging = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const camTarget = useRef(new THREE.Vector3(0, 1.4, 8));
  const lookDir = useRef(new THREE.Vector3());
  const committedGroundY = useRef(0);
  const lastProximityKey = useRef('');
  const walkBobTimer = useRef(0);

  const keys = useRef({ forward: false, backward: false, left: false, right: false, run: false });

  // 1. Initialize AnimationMixer with all pre-rigged mocap clips
  useEffect(() => {
    if (!scene || !animations || animations.length === 0) return;

    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current = mixer;

    actionsRef.current = {};
    animations.forEach((clip) => {
      actionsRef.current[clip.name] = mixer.clipAction(clip);
    });

    // Start with Idle_Loop
    const defaultIdle = actionsRef.current['Idle_Loop'] || actionsRef.current[animations[0].name];
    if (defaultIdle) {
      defaultIdle.play();
      currentActionName.current = 'Idle_Loop';
    }

    return () => {
      mixer.stopAllAction();
    };
  }, [scene, animations]);

  // 2. Direct, zero-react-render animation crossfade helper
  const playAnimation = (targetName, duration = 0.22) => {
    if (!actionsRef.current || !targetName) return;
    if (currentActionName.current === targetName) return;

    const prevAction = actionsRef.current[currentActionName.current];
    const nextAction = actionsRef.current[targetName];

    if (nextAction) {
      nextAction.reset();
      nextAction.setEffectiveTimeScale(1);
      nextAction.setEffectiveWeight(1);
      nextAction.fadeIn(duration).play();

      if (prevAction) {
        prevAction.fadeOut(duration);
      }
      currentActionName.current = targetName;
    }
  };

  // 3. Enable shadows
  useEffect(() => {
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [scene]);

  // 4. Jump physics
  const executeJump = () => {
    if (isSitting) {
      triggerInteract();
      return;
    }
    if (isGrounded.current) {
      jumpVelocityY.current = 5.2;
      isGrounded.current = false;
      loungeAudio.playJumpSound();
      if (onClearEmote) onClearEmote();
    }
  };
  useEffect(() => {
    if (jumpSignal > 0) executeJump();
  }, [jumpSignal]);

  // 5. Mouse Orbit / Dragging
  useEffect(() => {
    // In Deco Mode, completely disable player mouse drag & pointer lock so user has a free cursor
    if (isDecoMode) {
      if (document.pointerLockElement) {
        try { document.exitPointerLock?.(); } catch (err) {}
      }
      return;
    }

    const canvas = gl.domElement;
    const handleClick = (e) => {
      if (isDecoMode) return;
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    };
    const onPointerDown = (e) => {
      if (isDecoMode) return;
      isDragging.current = true;
      prevMousePos.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e) => {
      if (isDecoMode) return;
      let dx = 0, dy = 0;
      if (document.pointerLockElement === canvas) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
      } else if (isDragging.current) {
        dx = e.clientX - prevMousePos.current.x;
        dy = e.clientY - prevMousePos.current.y;
        prevMousePos.current = { x: e.clientX, y: e.clientY };
      } else return;

      // Filter out aberrant delta spikes (Mac trackpad / browser pointerlock glitches)
      const maxDelta = 60;
      dx = THREE.MathUtils.clamp(dx, -maxDelta, maxDelta);
      dy = THREE.MathUtils.clamp(dy, -maxDelta, maxDelta);

      // Silky-smooth mouse sensitivity: tuned from 0.0032 to 0.0018
      const sens = 0.0018;
      targetYaw.current -= dx * sens;
      targetPitch.current += dy * sens;

      if (cameraMode === 'first') {
        targetPitch.current = THREE.MathUtils.clamp(targetPitch.current, -1.2, 1.2);
      } else {
        targetPitch.current = THREE.MathUtils.clamp(targetPitch.current, -0.15, 1.15);
      }
    };
    const onPointerUp = () => { isDragging.current = false; };
    const onWheel = (e) => {
      if (isDecoMode) return;
      if (cameraMode === 'third') {
        targetDist.current = THREE.MathUtils.clamp(targetDist.current + e.deltaY * 0.002, 1.8, 6.5);
      }
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [gl, cameraMode, isDecoMode]);

  // 6. Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isDecoMode) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      const code = e.code;
      let moved = false;

      if (code === 'KeyW' || code === 'ArrowUp')    { keys.current.forward  = true; moved = true; }
      if (code === 'KeyS' || code === 'ArrowDown')  { keys.current.backward = true; moved = true; }
      if (code === 'KeyA' || code === 'ArrowLeft')  { keys.current.left     = true; moved = true; }
      if (code === 'KeyD' || code === 'ArrowRight') { keys.current.right    = true; moved = true; }
      if (code === 'ShiftLeft' || code === 'ShiftRight') keys.current.run = true;

      if (moved && onClearEmote) onClearEmote();
      if (code === 'Space') { e.preventDefault(); executeJump(); }
      if (code === 'KeyE')  { e.preventDefault(); triggerInteract(); }
      if (code === 'KeyV')  { e.preventDefault(); if (onToggleCameraMode) onToggleCameraMode(); }

      if (onTriggerEmote && !isSitting) {
        if (code === 'Digit1' || code === 'Numpad1') onTriggerEmote('talk');
        if (code === 'Digit2' || code === 'Numpad2') onTriggerEmote('interact');
        if (code === 'Digit3' || code === 'Numpad3') onTriggerEmote('dance');
        if (code === 'Digit4' || code === 'Numpad4') onTriggerEmote('crouch');
        if (code === 'Digit5' || code === 'Numpad5') onTriggerEmote('walkFormal');
      }
    };

    const handleKeyUp = (e) => {
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp')    keys.current.forward  = false;
      if (code === 'KeyS' || code === 'ArrowDown')  keys.current.backward = false;
      if (code === 'KeyA' || code === 'ArrowLeft')  keys.current.left     = false;
      if (code === 'KeyD' || code === 'ArrowRight') keys.current.right    = false;
      if (code === 'ShiftLeft' || code === 'ShiftRight') keys.current.run = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSitting, currentSeat, onToggleCameraMode, onTriggerEmote, onClearEmote, isDecoMode]);

  // 7. Interaction (Chair sitting / item exploration)
  const triggerInteract = () => {
    if (isSitting) {
      loungeAudio.playSitSound();
      onStandUp();
      return;
    }

    const p = playerPos.current;
    let closestChair = null;
    let minDistChair = 2.0;

    for (const chair of chairs) {
      const dist = p.distanceTo(new THREE.Vector3(...chair.position));
      if (dist < minDistChair) {
        minDistChair = dist;
        closestChair = chair;
      }
    }

    if (closestChair) {
      loungeAudio.playSitSound();
      if (onClearEmote) onClearEmote();
      onSitDown(closestChair);
      return;
    }

    let closestObj = null;
    let minDistObj = 2.8;

    for (const obj of interactables) {
      const dist = p.distanceTo(new THREE.Vector3(...obj.position));
      if (dist < minDistObj) {
        minDistObj = dist;
        closestObj = obj;
      }
    }

    if (closestObj) {
      onInteractObject(closestObj.id);
    }
  };

  // 8. Frame Update
  useFrame((_, rawDelta) => {
    if (!group.current) return;
    // Cap hitch frames so a single stall cannot fling the body or overshoot a stair.
    const delta = Math.min(0.05, Math.max(0.001, rawDelta));

    // Responsive, silky-smooth camera rotation lerp (filters out 100% of discrete mouse stepping & jitter)
    const rotDamp = expAlpha(46, delta);
    currentYaw.current = THREE.MathUtils.lerp(currentYaw.current, targetYaw.current, rotDamp);
    currentPitch.current = THREE.MathUtils.lerp(currentPitch.current, targetPitch.current, rotDamp);
    const dampFactor = expAlpha(16, delta);
    currentDist.current = THREE.MathUtils.lerp(currentDist.current, targetDist.current, dampFactor);

    // Advance AnimationMixer
    if (mixerRef.current) mixerRef.current.update(delta);

    if (isDecoMode) {
      if (group.current) group.current.visible = false;
      return;
    } else {
      if (group.current) group.current.visible = true;
    }

    scene.visible = cameraMode !== 'first';

    // ─────────────────────────────────────────────────────────────
    // SITTING STATE
    // ─────────────────────────────────────────────────────────────
    if (isSitting && currentSeat) {
      playAnimation('Sitting_Idle_Loop');
      const seatSurfaceY = currentSeat.seatPosition ? currentSeat.seatPosition[1] : 0.39;
      const chairFacing = currentSeat.seatRotation || 0;
      const isBarStool = currentSeat.isBarStool || currentSeat.title?.toLowerCase().includes('bar');

      // Forward offset from chair center so player sits squarely on the cushion
      // with back leaning naturally against the backrest
      const forwardDist = isBarStool ? 0.05 : 0.10;
      const forwardX = Math.sin(chairFacing) * forwardDist;
      const forwardZ = Math.cos(chairFacing) * forwardDist;

      // In Sitting_Idle_Loop mocap, hips are ~0.336m and thighs are ~0.345m above root.
      // For dining chair (0.39m): sitRootY = 0.025m places the buttocks and thighs squarely ON TOP
      // of the red seat cushion without sinking inside, while feet remain grounded.
      // For bar stools (0.83m): sitRootY = 0.44m rests on the stool cushion.
      const sitRootY = isBarStool ? Math.max(0, seatSurfaceY - 0.39) : 0.025;

      group.current.position.set(
        currentSeat.position[0] + forwardX,
        sitRootY,
        currentSeat.position[2] + forwardZ
      );
      group.current.rotation.y = chairFacing;

      // Stand up when moving
      const isMoving = keys.current.forward || keys.current.backward || keys.current.left || keys.current.right ||
        (mobileInput && (Math.abs(mobileInput.x) > 0.2 || Math.abs(mobileInput.y) > 0.2));

      if (isMoving) {
        loungeAudio.playSitSound();
        const standPos = new THREE.Vector3(0, 0, 0.65);
        standPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), chairFacing);
        playerPos.current.set(
          currentSeat.position[0] + standPos.x,
          0,
          currentSeat.position[2] + standPos.z
        );
        const standY = groundAt(playerPos.current.x, playerPos.current.z);
        playerPos.current.y = standY;
        committedGroundY.current = standY;
        onStandUp();
      }

      // Camera when sitting
      if (cameraMode === 'first') {
        const eyeY = seatSurfaceY + 0.62;
        camera.position.set(group.current.position.x, eyeY, group.current.position.z);
        const ldX = -Math.sin(currentYaw.current) * Math.cos(currentPitch.current);
        const ldY = Math.sin(currentPitch.current);
        const ldZ = -Math.cos(currentYaw.current) * Math.cos(currentPitch.current);
        camera.lookAt(camera.position.x + ldX, camera.position.y + ldY, camera.position.z + ldZ);
      } else {
        const dist = 2.6;
        const tcX = group.current.position.x + dist * Math.sin(currentYaw.current) * Math.cos(currentPitch.current);
        const tcY = sitRootY + 0.95 + dist * Math.sin(currentPitch.current);
        const tcZ = group.current.position.z + dist * Math.cos(currentYaw.current) * Math.cos(currentPitch.current);

        camTarget.current.set(group.current.position.x, sitRootY + 0.75, group.current.position.z);
        camera.position.set(tcX, tcY, tcZ);
        camera.lookAt(camTarget.current);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // LOCOMOTION
    // ─────────────────────────────────────────────────────────────
    let inputForward = 0, inputSide = 0;
    if (keys.current.forward)  inputForward += 1;
    if (keys.current.backward) inputForward -= 1;
    if (keys.current.left)     inputSide -= 1;
    if (keys.current.right)    inputSide += 1;
    if (mobileInput) { inputSide += mobileInput.x; inputForward += -mobileInput.y; }

    const inputLen = Math.hypot(inputForward, inputSide);
    const hasMovement = inputLen > 0.05;

    const forwardX = -Math.sin(currentYaw.current);
    const forwardZ = -Math.cos(currentYaw.current);
    const rightX = Math.cos(currentYaw.current);
    const rightZ = -Math.sin(currentYaw.current);

    if (hasMovement) {
      if (activeEmote && onClearEmote) onClearEmote();

      const normF = inputForward / inputLen;
      const normS = inputSide / inputLen;

      const moveX = forwardX * normF + rightX * normS;
      const moveZ = forwardZ * normF + rightZ * normS;

      const isRunning = keys.current.run;
      const targetSpeed = isRunning ? 4.5 : 2.5;

      const accel = expAlpha(10, delta);
      velocity.current.x = THREE.MathUtils.lerp(velocity.current.x, moveX * targetSpeed, accel);
      velocity.current.z = THREE.MathUtils.lerp(velocity.current.z, moveZ * targetSpeed, accel);

      if (isGrounded.current) {
        walkBobTimer.current += delta * (isRunning ? 11.0 : 7.5);
      }

      if (cameraMode === 'third') {
        const targetRot = Math.atan2(velocity.current.x, velocity.current.z);
        let diff = targetRot - playerRot.current;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        playerRot.current += diff * expAlpha(10, delta); // Smooth, graceful turning
      } else {
        playerRot.current = currentYaw.current + Math.PI;
      }
    } else {
      const decel = expAlpha(16, delta);
      velocity.current.x = THREE.MathUtils.lerp(velocity.current.x, 0, decel);
      velocity.current.z = THREE.MathUtils.lerp(velocity.current.z, 0, decel);

      if (cameraMode === 'first') {
        playerRot.current = currentYaw.current + Math.PI;
      }
    }

    // Direct, zero-react-render animation crossfading
    if (activeEmote) {
      const mapped = EMOTE_ACTION_MAP[activeEmote];
      if (mapped) playAnimation(mapped);
    } else if (hasMovement) {
      playAnimation(keys.current.run ? 'Sprint_Loop' : 'Walk_Loop');
    } else {
      playAnimation('Idle_Loop');
    }

    playerPos.current.x += velocity.current.x * delta;
    playerPos.current.z += velocity.current.z * delta;
    // ─────────────────────────────────────────────────────────────
    // SOLID FURNITURE OBSTACLE COLLISION (Smooth Sliding Physics)
    // ─────────────────────────────────────────────────────────────
    const playerRadius = 0.22;

    for (const item of decoItems) {
      // Skip ceiling fixtures, chandeliers, and small table-top food props
      if (item.position[1] > 1.8) continue;
      if (item.category === 'props') continue;
      // Skip current seat if player is actively sitting on it
      if (isSitting && currentSeat?.id === item.id) continue;

      // Fast broadphase distance filter: skip items far away (> 2.8m)
      const dxApprox = playerPos.current.x - item.position[0];
      const dzApprox = playerPos.current.z - item.position[2];
      if (Math.abs(dxApprox) > 2.8 || Math.abs(dzApprox) > 2.8) continue;

      const url = item.url?.toLowerCase() || '';
      const rotY = item.rotation ? item.rotation[1] : 0;

      // 1. RECTANGULAR & ELONGATED BOX OBSTACLES (Tables, Counters, Dividers, Shelves)
      let halfX = 0;
      let halfZ = 0;

      if (url.includes('table_rectangular')) {
        // Grand rectangular dining table (2.2m x 1.1m)
        halfX = 1.18;
        halfZ = 0.62;
      } else if (url.includes('restaurant_bar')) {
        // Bar counter module
        halfX = 0.55;
        halfZ = 0.55;
      } else if (url.includes('reception')) {
        // Reception counter desk (2.1m x 1.1m)
        halfX = 1.10;
        halfZ = 0.60;
      } else if (url.includes('divider')) {
        // Acoustic wood divider screen (1.8m x 0.35m)
        halfX = 0.95;
        halfZ = 0.22;
      } else if (url.includes('bar_shelf') || url.includes('winestand')) {
        // Back shelf / Wine display stand (1.7m x 0.7m)
        halfX = 0.85;
        halfZ = 0.45;
      }

      if (halfX > 0 && halfZ > 0) {
        // Transform player world offset into object's local rotated space
        const dx = playerPos.current.x - item.position[0];
        const dz = playerPos.current.z - item.position[2];
        const cos = Math.cos(-rotY);
        const sin = Math.sin(-rotY);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;

        // Find closest point on bounding box to player
        const clampedX = THREE.MathUtils.clamp(localX, -halfX, halfX);
        const clampedZ = THREE.MathUtils.clamp(localZ, -halfZ, halfZ);
        const distLocalX = localX - clampedX;
        const distLocalZ = localZ - clampedZ;
        const distLocal = Math.hypot(distLocalX, distLocalZ);

        if (distLocal < playerRadius) {
          let pushX = 0;
          let pushZ = 0;
          if (distLocal > 0.001) {
            const push = playerRadius - distLocal;
            pushX = (distLocalX / distLocal) * push;
            pushZ = (distLocalZ / distLocal) * push;
          } else {
            // Player center penetrated inside box: push outward to nearest edge
            const dMinX = Math.abs(localX - (-halfX));
            const dMaxX = Math.abs(halfX - localX);
            const dMinZ = Math.abs(localZ - (-halfZ));
            const dMaxZ = Math.abs(halfZ - localZ);
            const minEdge = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
            if (minEdge === dMinX) pushX = -(halfX + playerRadius) - localX;
            else if (minEdge === dMaxX) pushX = (halfX + playerRadius) - localX;
            else if (minEdge === dMinZ) pushZ = -(halfZ + playerRadius) - localZ;
            else pushZ = (halfZ + playerRadius) - localZ;
          }
          // Transform local push back into world space
          const cosWorld = Math.cos(rotY);
          const sinWorld = Math.sin(rotY);
          const worldPushX = pushX * cosWorld - pushZ * sinWorld;
          const worldPushZ = pushX * sinWorld + pushZ * cosWorld;
          playerPos.current.x += worldPushX;
          playerPos.current.z += worldPushZ;

          // Cancel out velocity penetrating into the obstacle surface to completely eliminate 60Hz camera jitter
          const pLen = Math.hypot(worldPushX, worldPushZ);
          if (pLen > 0.0001) {
            const nx = worldPushX / pLen;
            const nz = worldPushZ / pLen;
            const vDotN = velocity.current.x * nx + velocity.current.z * nz;
            if (vDotN < 0) {
              velocity.current.x -= vDotN * nx;
              velocity.current.z -= vDotN * nz;
            }
          }
        }
        continue;
      }

      // 2. RADIAL / CIRCULAR OBSTACLES (Round cafe tables, chairs, statues, lamps)
      let obstacleRadius = 0.30;
      if (url.includes('table')) {
        obstacleRadius = 0.72; // Solid round cafe table top & pedestal
      } else if (url.includes('bar_chair') || url.includes('restaurant_chair') || item.isChair) {
        obstacleRadius = 0.0; // Chairs are passable so player can smoothly approach seat without ping-pong collision
      } else if (url.includes('statue') || url.includes('tree')) {
        obstacleRadius = 0.50;
      } else if (url.includes('lamp')) {
        obstacleRadius = 0.18;
      }

      if (obstacleRadius <= 0) continue;

      const dx = playerPos.current.x - item.position[0];
      const dz = playerPos.current.z - item.position[2];
      const dist = Math.hypot(dx, dz);
      const minDist = obstacleRadius + playerRadius;

      if (dist < minDist && dist > 0.0001) {
        const pushDist = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        playerPos.current.x += nx * pushDist;
        playerPos.current.z += nz * pushDist;

        // Cancel out velocity component penetrating towards radial obstacle
        const vDotN = velocity.current.x * nx + velocity.current.z * nz;
        if (vDotN < 0) {
          velocity.current.x -= vDotN * nx;
          velocity.current.z -= vDotN * nz;
        }
      }
    }

    // Risers taller than one step stay solid. Short treads stay walkable so the body climbs instead of tunnelling.
    resolveStageWalls(playerPos.current, velocity.current, playerPos.current.y);
    resolveStageSolids(playerPos.current, velocity.current);

    // On the right-hand stage the deck runs to the window wall, so the usual room inset is too tight.
    const onRightStage = playerPos.current.z > -1.9 && playerPos.current.z < 7.9 && playerPos.current.x > 14.2;
    const maxX = onRightStage ? 18.4 : 17.5;

    if (playerPos.current.x <= -17.5 && velocity.current.x < 0) velocity.current.x = 0;
    if (playerPos.current.x >= maxX && velocity.current.x > 0) velocity.current.x = 0;
    if (playerPos.current.z <= -16.35 && velocity.current.z < 0) velocity.current.z = 0;
    if (playerPos.current.z >= 15.5 && velocity.current.z > 0) velocity.current.z = 0;

    playerPos.current.x = THREE.MathUtils.clamp(playerPos.current.x, -17.5, maxX);
    playerPos.current.z = THREE.MathUtils.clamp(playerPos.current.z, -16.35, 15.5);
    // Stay in front of the LED wall and the speaker columns.
    if (playerPos.current.z < -16.05 && Math.abs(playerPos.current.x) < 6.3) {
      playerPos.current.z = -16.05;
      if (velocity.current.z < 0) velocity.current.z = 0;
    }

    // ─────────────────────────────────────────────────────────────
    // STAGE STEPS — stable height, then a damped climb
    // ─────────────────────────────────────────────────────────────
    const targetGroundY = sampleGround(
      playerPos.current.x,
      playerPos.current.z,
      velocity.current.x,
      velocity.current.z,
      committedGroundY.current
    );
    committedGroundY.current = targetGroundY;

    if (!isGrounded.current || jumpVelocityY.current !== 0) {
      playerPos.current.y += jumpVelocityY.current * delta;
      jumpVelocityY.current -= 14.0 * delta;

      if (playerPos.current.y <= targetGroundY) {
        playerPos.current.y = targetGroundY;
        jumpVelocityY.current = 0;
        isGrounded.current = true;
      }
    } else {
      const climb = expAlpha(12, delta);
      playerPos.current.y += (targetGroundY - playerPos.current.y) * climb;
      if (Math.abs(playerPos.current.y - targetGroundY) < 0.003) {
        playerPos.current.y = targetGroundY;
      }
    }

    group.current.position.set(playerPos.current.x, playerPos.current.y, playerPos.current.z);
    group.current.rotation.y = playerRot.current;

    // ─────────────────────────────────────────────────────────────
    // CAMERA UPDATE (Rock-Solid Smooth, Zero Jitter, Zero Bobbing)
    // ─────────────────────────────────────────────────────────────
    if (cameraMode === 'first') {
      // Pure stable eye-level camera (head bobbing removed to eliminate camera shake)
      camera.position.set(playerPos.current.x, playerPos.current.y + 1.65, playerPos.current.z);
      const ldX = -Math.sin(currentYaw.current) * Math.cos(currentPitch.current);
      const ldY = Math.sin(currentPitch.current);
      const ldZ = -Math.cos(currentYaw.current) * Math.cos(currentPitch.current);
      lookDir.current.set(camera.position.x + ldX, camera.position.y + ldY, camera.position.z + ldZ);
      camera.lookAt(lookDir.current);
    } else {
      const dist = currentDist.current;
      const targetPos = camTarget.current;
      targetPos.set(playerPos.current.x, playerPos.current.y + 1.25, playerPos.current.z);

      const offsetX = dist * Math.sin(currentYaw.current) * Math.cos(currentPitch.current);
      const offsetY = 0.35 + dist * Math.sin(currentPitch.current);
      const offsetZ = dist * Math.cos(currentYaw.current) * Math.cos(currentPitch.current);

      const desiredX = targetPos.x + offsetX;
      const desiredY = targetPos.y + offsetY;
      const desiredZ = targetPos.z + offsetZ;

      // Safe room boundary limits (interior walls: X: +/-18.9m, Z: +/-16.9m, Y: 7.0m)
      const WALL_MIN_X = -18.2;
      const WALL_MAX_X = 18.2;
      const WALL_MIN_Z = -16.2;
      const WALL_MAX_Z = 16.2;
      const WALL_MIN_Y = 0.35;
      const WALL_MAX_Y = 6.6;

      let t = 1.0;
      if (desiredX < WALL_MIN_X && offsetX < 0) {
        t = Math.min(t, (WALL_MIN_X - targetPos.x) / offsetX);
      } else if (desiredX > WALL_MAX_X && offsetX > 0) {
        t = Math.min(t, (WALL_MAX_X - targetPos.x) / offsetX);
      }

      if (desiredZ < WALL_MIN_Z && offsetZ < 0) {
        t = Math.min(t, (WALL_MIN_Z - targetPos.z) / offsetZ);
      } else if (desiredZ > WALL_MAX_Z && offsetZ > 0) {
        t = Math.min(t, (WALL_MAX_Z - targetPos.z) / offsetZ);
      }

      if (desiredY < WALL_MIN_Y && offsetY < 0) {
        t = Math.min(t, (WALL_MIN_Y - targetPos.y) / offsetY);
      } else if (desiredY > WALL_MAX_Y && offsetY > 0) {
        t = Math.min(t, (WALL_MAX_Y - targetPos.y) / offsetY);
      }

      // Pull in immediately when a wall is in the way, ease back out so the orbit does not pop.
      t = Math.max(0.20, Math.min(1.0, t));
      if (t < camWallT.current) camWallT.current = t;
      else camWallT.current += (t - camWallT.current) * expAlpha(8, delta);

      const tcX = targetPos.x + offsetX * camWallT.current;
      const tcY = targetPos.y + offsetY * camWallT.current;
      const tcZ = targetPos.z + offsetZ * camWallT.current;

      camera.position.set(tcX, tcY, tcZ);
      camera.lookAt(targetPos);
    }

    // ─────────────────────────────────────────────────────────────
    // PROXIMITY DETECTION
    // ─────────────────────────────────────────────────────────────
    const p = playerPos.current;
    let nearbyKey = '';
    let nearbyChair = null;
    let nearbyObj = null;

    for (const chair of chairs) {
      const dx = p.x - chair.position[0];
      const dy = p.y - chair.position[1];
      const dz = p.z - chair.position[2];
      if (dx * dx + dy * dy + dz * dz < 3.24) {
        nearbyKey = 'c:' + chair.id;
        nearbyChair = chair;
        break;
      }
    }

    if (!nearbyKey) {
      for (const obj of interactables) {
        const dx = p.x - obj.position[0];
        const dy = p.y - obj.position[1];
        const dz = p.z - obj.position[2];
        if (dx * dx + dy * dy + dz * dz < 6.76) {
          nearbyKey = 'o:' + obj.id;
          nearbyObj = obj;
          break;
        }
      }
    }

    // Only notify React when the prompt actually changes. A fresh object every frame
    // was re-rendering the whole app while standing near the stage and other hotspots.
    if (nearbyKey !== lastProximityKey.current) {
      lastProximityKey.current = nearbyKey;
      if (nearbyChair) onProximityChange({ type: 'chair', title: nearbyChair.title || 'Ghế ngồi', chair: nearbyChair });
      else if (nearbyObj) onProximityChange({ type: 'object', title: nearbyObj.title, id: nearbyObj.id });
      else onProximityChange(null);
    }
  });

  return (
    <group ref={group} scale={[0.62, 0.62, 0.62]}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload('/models/Character.glb');
