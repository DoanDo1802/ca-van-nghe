import React, { useMemo, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Helper to enhance materials on untextured / default white GLTF meshes
function enhanceMeshMaterial(mat, url = '', meshName = '') {
  if (!mat) return;
  const matName = (mat.name || '').toLowerCase();
  const mName = (meshName || '').toLowerCase();
  const u = (url || '').toLowerCase();

  // 1. Botanical Foliage & Leaves (Tree.glb)
  if (matName.includes('leaves') || mName.includes('leaves')) {
    mat.color = new THREE.Color('#2d5a27'); // Lush natural deep botanical green
    mat.roughness = 0.65;
    mat.metalness = 0.0;
    mat.side = THREE.DoubleSide;
    mat.needsUpdate = true;
    return;
  }

  // 2. Tree Bark & Organic Wood Trunks (Tree.glb)
  if (matName.includes('bark') || mName.includes('bark')) {
    mat.color = new THREE.Color('#3d2a1d'); // Rich dark natural tree bark
    mat.roughness = 0.85;
    mat.metalness = 0.05;
    mat.needsUpdate = true;
    return;
  }

  // 3. Chandelier (Restaurant_chandelier.glb)
  if (u.includes('chandelier') || matName.includes('chandelier') || mName.includes('chandelier')) {
    mat.color = new THREE.Color('#cca45c'); // Luxury brushed champagne brass / warm gold
    mat.metalness = 0.82;
    mat.roughness = 0.22;
    mat.emissive = new THREE.Color('#ffd885');
    mat.emissiveIntensity = 0.25;
    mat.needsUpdate = true;
    return;
  }

  // 4. Floor Lamp (Floor_Lamp.glb)
  if (u.includes('floor_lamp') || matName.includes('lamp') || mName.includes('lamp')) {
    mat.color = new THREE.Color('#26221f'); // Matte dark bronze stand
    mat.metalness = 0.7;
    mat.roughness = 0.35;
    mat.emissive = new THREE.Color('#ffa726');
    mat.emissiveIntensity = 0.4;
    mat.needsUpdate = true;
    return;
  }

  // 5. Rectangular Dining Table (Restaurant_Table_Rectangular.glb)
  if (u.includes('table_rectangular') || matName.includes('table_rectangular')) {
    mat.color = new THREE.Color('#2b1e16'); // Polished luxury dark walnut dining surface
    mat.roughness = 0.65;
    mat.metalness = 0.02;
    mat.needsUpdate = true;
    return;
  }

  // 6. Reception Desk (Restaurant_Reception_Desk.glb)
  if (u.includes('reception_desk') || matName.includes('reception_desk')) {
    mat.color = new THREE.Color('#221915'); // Architectural dark fluted oak with brass trim
    mat.roughness = 0.68;
    mat.metalness = 0.02;
    mat.needsUpdate = true;
    return;
  }

  // 7. Generic Fallback for untextured flat-white GLTFs (color > 0.75 without texture map)
  if (!mat.map && mat.color && mat.color.r > 0.72 && mat.color.g > 0.72 && mat.color.b > 0.72) {
    // If it's a generic untextured white mesh, give it warm sophisticated dark charcoal/bronze
    mat.color = new THREE.Color('#2e2824');
    mat.roughness = 0.70;
    mat.metalness = 0.02;
    mat.needsUpdate = true;
    return;
  }

  // 8. Universal Matte Finish: soften plastic shininess on standard non-metallic meshes
  if (mat.roughness !== undefined && (!mat.metalness || mat.metalness < 0.65)) {
    if (mat.roughness < 0.62) {
      mat.roughness = 0.65;
      mat.needsUpdate = true;
    }
    if (mat.metalness > 0.05) {
      mat.metalness = 0.02;
      mat.needsUpdate = true;
    }
  }
}

const enhancedMaterialCache = new Map();

function getEnhancedMaterial(mat, url, meshName) {
  if (!mat) return mat;
  const key = `${url}::${mat.uuid}`;
  let cached = enhancedMaterialCache.get(key);
  if (!cached) {
    cached = mat.clone();
    enhanceMeshMaterial(cached, url, meshName);
    enhancedMaterialCache.set(key, cached);
  }
  return cached;
}

function shouldCastShadow(url = '', castShadowProp = true) {
  if (!castShadowProp) return false;
  const u = url.toLowerCase();
  // Skip shadow casting on ultra-high-poly / small prop GLTFs to keep 60 FPS
  if (
    u.includes('bar_props') ||
    u.includes('floor_lamp') ||
    u.includes('winestand') ||
    u.includes('barshelf') ||
    u.includes('statue')
  ) {
    return false;
  }
  return true;
}

export default function Model({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  objectId,
  onClick,
  castShadow = true,
  receiveShadow = true,
  hoverable = true,
  ...props
}) {
  const { scene } = useGLTF(url);
  const [hovered, setHovered] = useState(false);

  // Deep clone scene hierarchy and reuse cached enhanced materials across instances
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const effectiveCastShadow = shouldCastShadow(url, castShadow);
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = effectiveCastShadow;
        child.receiveShadow = receiveShadow;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((m) => getEnhancedMaterial(m, url, child.name));
          } else {
            child.material = getEnhancedMaterial(child.material, url, child.name);
          }
        }
      }
    });
    return clone;
  }, [scene, url, castShadow, receiveShadow]);

  const handleClick = (e) => {
    if (onClick && objectId) {
      e.stopPropagation();
      onClick(objectId);
    }
  };

  const handlePointerOver = (e) => {
    if (hoverable && objectId) {
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    if (hoverable && objectId) {
      setHovered(false);
      document.body.style.cursor = 'auto';
    }
  };

  // Compute scale with subtle hover bounce if interactive
  const finalScale = useMemo(() => {
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    if (hovered && objectId) {
      return [s[0] * 1.03, s[1] * 1.03, s[2] * 1.03];
    }
    return s;
  }, [scale, hovered, objectId]);

  return (
    <group
      position={position}
      rotation={rotation}
      scale={finalScale}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      {...props}
    >
      <primitive object={clonedScene} />
    </group>
  );
}

