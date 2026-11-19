import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const MODEL_PATH = '/models/every_other_gig_ever.glb';

// Preload the model
useGLTF.preload(MODEL_PATH);

const _pos = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _yaw = new THREE.Quaternion();
const _pitch = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);

// The gig ships as one model, so decor mode cannot grab a single mic.
// Performer on this deck is about 1.13m, head top near y=1.49. Park the
// capsule at chest height and scale the whole stand around its base.
const MIC_HEAD_Y = 1.05;

function scaleAroundPivot(obj, pivotWorld, scale) {
  const parent = obj.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  const pivotLocal = parent.worldToLocal(pivotWorld.clone());
  obj.position.sub(pivotLocal).multiplyScalar(scale).add(pivotLocal);
  obj.scale.multiplyScalar(scale);
  obj.matrixAutoUpdate = true;
  obj.updateMatrix();
}

function lowerStageMics(root) {
  if (!root || root.userData.micsLowered) return true;
  root.updateWorldMatrix(true, true);
  const stands = [];
  const heads = [];
  root.traverse((obj) => {
    if (obj.isMesh) return;
    const name = obj.name || '';
    if (/^Mic Stand/i.test(name)) stands.push(obj);
    else if (/^Microphone/i.test(name)) heads.push(obj);
  });
  if (!stands.length) return false;

  const used = new Set();
  const headPos = new THREE.Vector3();
  let lowered = 0;
  stands.forEach((stand) => {
    const box = new THREE.Box3().setFromObject(stand);
    if (box.isEmpty()) return;
    // Still in model space (metres would already be under ~2). Wait until mounted.
    if (box.max.y > 3) return;
    const pivot = new THREE.Vector3(
      (box.min.x + box.max.x) / 2,
      box.min.y,
      (box.min.z + box.max.z) / 2
    );
    let topY = box.max.y;
    let head = null;
    heads.forEach((candidate) => {
      if (used.has(candidate)) return;
      candidate.getWorldPosition(headPos);
      const dx = headPos.x - pivot.x;
      const dz = headPos.z - pivot.z;
      if (dx * dx + dz * dz < 0.6) head = candidate;
    });
    if (head) {
      head.getWorldPosition(headPos);
      topY = Math.max(topY, headPos.y);
    }
    const span = topY - pivot.y;
    if (span < 0.05) return;
    const scale = THREE.MathUtils.clamp((MIC_HEAD_Y - pivot.y) / span, 0.25, 1);
    scaleAroundPivot(stand, pivot, scale);
    if (head) {
      scaleAroundPivot(head, pivot, scale);
      used.add(head);
    }
    lowered += 1;
  });
  if (lowered !== stands.length) return false;
  root.userData.micsLowered = true;
  return true;
}

function wireMovingHeads(model, host) {
  model.updateWorldMatrix(true, true);
  const housings = [];
  const lenses = [];
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.parent) return;
    const matName = (obj.material?.name || '').toLowerCase();
    if (matName === 'parcan' && obj.parent) housings.push(obj.parent);
    else if (/^light00[1-4]$/.test(matName)) lenses.push(obj);
  });

  const origin = new THREE.Vector3();
  const lensPos = new THREE.Vector3();
  const fixtures = [];
  let spotCount = 0;

  housings.forEach((housing, i) => {
    housing.getWorldPosition(origin);
    let lensMesh = null;
    let best = 0.45;
    for (const lens of lenses) {
      if (lens.userData.__paired) continue;
      const dist = origin.distanceTo(lens.getWorldPosition(lensPos));
      if (dist < best) {
        best = dist;
        lensMesh = lens;
      }
    }

    let glow = null;
    if (lensMesh) {
      lensMesh.userData.__paired = true;
      if (!lensMesh.material.userData.stageGlow) {
        lensMesh.material = lensMesh.material.clone();
        lensMesh.material.userData.stageGlow = true;
        lensMesh.material.emissiveIntensity = 3.1;
      }
      glow = lensMesh.material;
      const lensNode = lensMesh.parent;
      if (lensNode && lensNode !== housing && lensNode.parent !== housing) housing.attach(lensNode);
    }

    const color = glow && glow.emissive && glow.emissive.getHex() !== 0
      ? glow.emissive.clone()
      : new THREE.Color('#ffd2a8');
    // Cap real-time SpotLights at 3 for high FPS while keeping all parcan housings & emissive lenses animated
    let spot = null;
    let target = null;
    if (i % 4 === 0 && spotCount < 3) {
      spotCount += 1;
      spot = new THREE.SpotLight(color, 28, 11, 0.58, 0.82, 2);
      target = new THREE.Object3D();
      host.add(spot);
      host.add(target);
      spot.target = target;
    }

    const world = housing.getWorldPosition(new THREE.Vector3());
    fixtures.push({
      node: housing,
      base: housing.quaternion.clone(),
      spot,
      target,
      glow,
      phase: i * 0.92,
      speed: 0.46 + (i % 4) * 0.07,
      baseZ: world.z,
      front: world.x < 17
    });
  });

  return fixtures;
}

/**
 * LiveStageSet - Authentic Live Gig Acoustic Stage Setup
 * Features full drum kit, Marshall amps, microphones, monitors, truss & cables.
 * Original 3D Asset: "Every other gig, ever..." by PippyJ (CC Attribution)
 */
export default function LiveStageSet({
  position = [-0.36, -0.29, -11.1],
  rotation = [0, 0, 0],
  scale = [0.15, 0.15, 0.15],
  hideRoomShell = true,
  ...props
}) {
  const { scene } = useGLTF(MODEL_PATH);
  const host = useRef(null);
  const rig = useRef([]);
  const builtFor = useRef(null);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((child) => {
      if (child.isMesh) {
        const lname = (child.name || '').toLowerCase();
        // Only cast shadows from large stage structures (Marshall cabs, truss frame, curtains, kick drum)
        // to avoid rendering 195+ fine cables/hardware meshes into the shadow map every frame
        const isLargeCaster =
          lname.includes('marshall') ||
          lname.includes('curtain') ||
          lname.includes('kick') ||
          lname.includes('stage frame');
        child.castShadow = isLargeCaster;
        child.receiveShadow = !lname.includes('cable') && !lname.includes('light');

        if (child.material) {
          child.material.roughness = Math.min(1.0, (child.material.roughness || 0.8) * 1.05);
          child.material.envMapIntensity = 1.2;
        }
      }

      if (hideRoomShell) {
        const lowerName = (child.name || '').toLowerCase();
        const matName = (child.material?.name || '').toLowerCase();

        // Completely hide diorama pub tables, mannequins, crates, ceiling hangers, freestanding walls, and outer floor
        const isDioramaShell =
          matName === 'wall' ||
          matName === 'floor' ||
          matName.includes('bound') ||
          matName.includes('table') ||
          matName.includes('mannequin') ||
          matName.includes('crate') ||
          matName.includes('ceiling_hangers') ||
          lowerName.includes('wall') ||
          lowerName.includes('ceiling') ||
          lowerName.includes('bound') ||
          lowerName.includes('table') ||
          lowerName.includes('mannequin') ||
          lowerName.includes('crate') ||
          (lowerName.includes('floor') && !lowerName.includes('stage floor'));

        if (isDioramaShell) {
          child.visible = false;
        }
      }
    });

    return clone;
  }, [scene, hideRoomShell, MIC_HEAD_Y]);

  useLayoutEffect(() => {
    let frame = 0;
    let tries = 0;
    const run = () => {
      if (lowerStageMics(clonedScene) || tries > 8) return;
      tries += 1;
      frame = requestAnimationFrame(run);
    };
    run();
    return () => cancelAnimationFrame(frame);
  }, [clonedScene]);

  useFrame(({ clock }) => {
    if (!host.current) return;
    host.current.updateWorldMatrix(true, false);
    if (builtFor.current !== clonedScene) {
      rig.current.forEach((fixture) => {
        if (fixture.spot) fixture.spot.removeFromParent();
        if (fixture.target) fixture.target.removeFromParent();
      });
      rig.current = wireMovingHeads(clonedScene, host.current);
      builtFor.current = clonedScene;
    }

    const t = clock.elapsedTime;
    for (const fixture of rig.current) {
      const sweep = Math.sin(t * fixture.speed + fixture.phase);
      const nod = Math.sin(t * fixture.speed * 0.64 + fixture.phase * 1.4);
      _yaw.setFromAxisAngle(_up, sweep * 0.58);
      _pitch.setFromAxisAngle(_axisX, nod * 0.18);
      fixture.node.quaternion.copy(_yaw).multiply(fixture.base).multiply(_pitch);
      if (fixture.spot && fixture.target) {
        fixture.node.updateWorldMatrix(true, false);
        fixture.node.getWorldPosition(_pos);
        _aim.set(
          fixture.front ? 16.4 + nod * 0.4 : 15.75 - nod * 0.35,
          0.7,
          THREE.MathUtils.clamp(fixture.baseZ + sweep * 1.65, -0.5, 6.5)
        );
        host.current.worldToLocal(_pos);
        fixture.spot.position.copy(_pos);
        host.current.worldToLocal(_aim);
        fixture.target.position.copy(_aim);
      }
      if (fixture.glow) fixture.glow.emissiveIntensity = 2.8 + (sweep * 0.5 + 0.5) * 0.7;
    }
  });

  return (
    <group ref={host} {...props}>
      <group position={position} rotation={rotation} scale={scale}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
}

