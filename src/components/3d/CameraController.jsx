import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CAMERA_PRESETS } from '../../data/sceneData';

export default function CameraController({ activePreset }) {
  const { camera } = useThree();
  const controlsRef = useRef();

  // Desired target vectors
  const targetPos = useRef(new THREE.Vector3(0, 6.5, 9.5));
  const targetLook = useRef(new THREE.Vector3(0, 1.2, 0));
  const isTransitioning = useRef(false);

  useEffect(() => {
    const preset = CAMERA_PRESETS.find((p) => p.id === activePreset);
    if (preset) {
      targetPos.current.set(...preset.position);
      targetLook.current.set(...preset.target);
      isTransitioning.current = true;
    }
  }, [activePreset]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;

    if (isTransitioning.current) {
      // Lerp camera position
      camera.position.lerp(targetPos.current, delta * 3.2);

      // Lerp OrbitControls target
      controlsRef.current.target.lerp(targetLook.current, delta * 3.2);
      controlsRef.current.update();

      // Check if close enough to stop transition
      const posDist = camera.position.distanceTo(targetPos.current);
      const lookDist = controlsRef.current.target.distanceTo(targetLook.current);
      if (posDist < 0.05 && lookDist < 0.05) {
        isTransitioning.current = false;
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      minDistance={1.2}
      maxDistance={22}
      maxPolarAngle={Math.PI / 2 - 0.04} // Prevent camera going below floor
      minPolarAngle={0.15}
      onStart={() => {
        // User manually interacted, interrupt automatic transition
        isTransitioning.current = false;
      }}
    />
  );
}

