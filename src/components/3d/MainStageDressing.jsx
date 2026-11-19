import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// CC BY 4.0. Credits stay with the authors.
// PA Speakers Low-Poly — TheGiwi
// FRESNEL LED — Victor.Ferreira1
const SPEAKER_URL = '/models/pa-speaker.glb';
const FRESNEL_URL = '/models/fresnel-led.glb';

useGLTF.preload(SPEAKER_URL);
useGLTF.preload(FRESNEL_URL);

const SPEAKER_SCALE = 1.08;
const FRESNEL_SCALE = 1.55;

const SPEAKER_X = [-6.45, 6.45];
const SPEAKER_Z = [-15.47, -9.7];

function prepare(scene, tune) {
  const clone = scene.clone(true);
  clone.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat) tune?.(mat);
    });
  });
  return clone;
}

function Speaker(props) {
  const { scene } = useGLTF(SPEAKER_URL);
  const clone = useMemo(() => prepare(scene), [scene]);
  return <primitive object={clone} {...props} />;
}

function Fresnel(props) {
  const { scene } = useGLTF(FRESNEL_URL);
  const clone = useMemo(() => prepare(scene, (mat) => {
    if ((mat.name || '').toLowerCase().includes('bulb')) {
      mat.emissive = new THREE.Color('#ffd089');
      mat.emissiveIntensity = 2.2;
    }
  }), [scene]);
  return <primitive object={clone} {...props} />;
}

const _aim = new THREE.Vector3();

function aimHeadAt(head, spot, target, aim) {
  if (!head || !spot || !target) return;
  head.updateWorldMatrix(true, false);
  // lookAt already aims local +Z at the point, which is the lens direction.
  head.lookAt(aim);
  const dist = head.getWorldPosition(_aim).distanceTo(aim);
  target.position.set(0, 0, Math.max(2, dist));
  target.updateWorldMatrix(true, false);
  spot.target = target;
}

function SweepFresnel({ position, phase, color }) {
  const head = useRef(null);
  const spot = useRef(null);
  const target = useRef(null);
  const aim = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const sweep = Math.sin(t * 0.62 + phase);
    aim.set(position[0] * 0.25 + sweep * 2.2, 0.42, -11.6);
    aimHeadAt(head.current, spot.current, target.current, aim);
  });

  return (
    <group position={position}>
      <group ref={head}>
        <Fresnel scale={FRESNEL_SCALE} />
        <spotLight
          ref={spot}
          color={color}
          intensity={70}
          angle={0.55}
          penumbra={0.85}
          distance={14}
          decay={2}
        />
        <object3D ref={target} position={[0, 0, 6]} />
      </group>
    </group>
  );
}

export default function MainStageDressing() {
  const fresnelY = 6.22 - 0.502 * FRESNEL_SCALE;
  const fresnels = [-6, -3, 0, 3, 6];
  const colors = ['#ffb15a', '#ffd8a8', '#ff8a4a', '#ffd8a8', '#ffb15a'];

  return (
    <group>
      {SPEAKER_X.map((x) =>
        SPEAKER_Z.map((z) => (
          <Speaker
            key={`spk-${x}-${z}`}
            position={[x, 0.36, z]}
            scale={SPEAKER_SCALE}
          />
        ))
      )}

      {fresnels.map((x, i) => (
        <SweepFresnel
          key={`fr-${x}`}
          position={[x, fresnelY, -8.15]}
          phase={i * 0.9}
          color={colors[i]}
        />
      ))}
    </group>
  );
}
