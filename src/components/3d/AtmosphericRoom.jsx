import React, { useEffect, useMemo, Suspense } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Sparkles, Html, useTexture } from '@react-three/drei';
import LiveStageSet from './LiveStageSet';
import MainStageDressing from './MainStageDressing';

// 1280×720 at distanceFactor 3.14 → 10.048×5.652m, inset inside the bezel.
const SCREEN_DISTANCE_FACTOR = 3.14;
const SCREEN_W = (1280 * SCREEN_DISTANCE_FACTOR) / 400;
const SCREEN_H = (720 * SCREEN_DISTANCE_FACTOR) / 400;

// Sân khấu phải tâm z=3. Hai bảng cách tâm 7m, nên tâm bảng là z=-4 và z=10.
const LED_BOARD_Z = [-4, 10];
const BOARD_CLIP = '/media/bello-ballo.mp4';
// Clip is 360×450, so the window keeps that ratio and the border is even on every side.
const BOARD_SCREEN_W = 2.72;
const BOARD_SCREEN_H = 3.4;
const BOARD_RAIL = 0.1;
const BOARD_GASKET = 0.05;
const BOARD_OUTER_W = BOARD_SCREEN_W + (BOARD_RAIL + BOARD_GASKET) * 2;
const BOARD_OUTER_H = BOARD_SCREEN_H + (BOARD_RAIL + BOARD_GASKET) * 2;

function createBoardScreen() {
  const video = document.createElement('video');
  video.src = BOARD_CLIP;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = 'auto';
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  const material = new THREE.MeshBasicMaterial({ map: tex });
  material.userData.video = video;
  return material;
}

function createLedMask() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec2 cell = fract(vUv * vec2(72.0, 90.0));
        float gap = clamp(step(0.78, cell.x) + step(0.78, cell.y), 0.0, 1.0);
        float edge = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x)
                   * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
        gl_FragColor = vec4(0.01, 0.02, 0.04, gap * 0.62 * edge);
      }
    `
  });
}

function ElectronicBoard({ position, screenMaterial, maskMaterial }) {
  const sideH = BOARD_OUTER_H - BOARD_RAIL * 2;
  const railY = BOARD_OUTER_H / 2 - BOARD_RAIL / 2;
  const railX = BOARD_OUTER_W / 2 - BOARD_RAIL / 2;

  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[BOARD_OUTER_W, BOARD_OUTER_H, 0.08]} />
        <meshStandardMaterial color="#14181d" metalness={0.72} roughness={0.36} />
      </mesh>

      <mesh position={[0, railY, 0.05]}>
        <boxGeometry args={[BOARD_OUTER_W, BOARD_RAIL, 0.035]} />
        <meshStandardMaterial color="#23282f" metalness={0.8} roughness={0.28} />
      </mesh>
      <mesh position={[0, -railY, 0.05]}>
        <boxGeometry args={[BOARD_OUTER_W, BOARD_RAIL, 0.035]} />
        <meshStandardMaterial color="#23282f" metalness={0.8} roughness={0.28} />
      </mesh>
      {[-railX, railX].map((x) => (
        <mesh key={`rail_${x}`} position={[x, 0, 0.05]}>
          <boxGeometry args={[BOARD_RAIL, sideH, 0.035]} />
          <meshStandardMaterial color="#23282f" metalness={0.8} roughness={0.28} />
        </mesh>
      ))}

      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[BOARD_SCREEN_W + BOARD_GASKET * 2, BOARD_SCREEN_H + BOARD_GASKET * 2]} />
        <meshBasicMaterial color="#07090c" />
      </mesh>
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[BOARD_SCREEN_W + 0.045, BOARD_SCREEN_H + 0.045]} />
        <meshBasicMaterial color="#49b7ff" toneMapped={false} />
      </mesh>

      <mesh position={[0, 0, 0.06]} material={screenMaterial}>
        <planeGeometry args={[BOARD_SCREEN_W, BOARD_SCREEN_H]} />
      </mesh>
      <mesh position={[0, 0, 0.066]} material={maskMaterial}>
        <planeGeometry args={[BOARD_SCREEN_W, BOARD_SCREEN_H]} />
      </mesh>

      {[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => (
        <mesh
          key={`bolt_${sx}_${sy}`}
          position={[sx * (railX - 0.01), sy * (railY - 0.01), 0.072]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.018, 0.018, 0.012, 8]} />
          <meshStandardMaterial color="#8b929a" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

export default function AtmosphericRoom({
  stageVideoId = 'lTRiuFIWV54',
  isStageVideoMuted = true,
  isScreenOn = true,
  isAnyModalOpen = false,
  onOpenStageScreenModal
}) {
  const ledScreenMaterial = useMemo(() => createBoardScreen(), []);
  const ledMaskMaterial = useMemo(() => createLedMask(), []);

  useEffect(() => {
    const video = ledScreenMaterial.userData.video;
    const play = () => {
      if (video.paused) video.play().catch(() => {});
    };
    play();
    video.addEventListener('canplay', play);
    window.addEventListener('pointerdown', play);
    return () => {
      video.removeEventListener('canplay', play);
      window.removeEventListener('pointerdown', play);
      video.pause();
    };
  }, [ledScreenMaterial]);

  // Iframe sits at z-index 0, just behind the canvas. A negative z-index falls
  // behind the page background, which is why the screen went black.
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.pointerEvents = 'auto';
    canvas.style.position = 'relative';
    canvas.style.zIndex = '1';
  }, [gl]);

  const screenHoleMaterial = useMemo(() => new THREE.ShaderMaterial({
    toneMapped: false,
    depthTest: true,
    depthWrite: true,
    // Replace the framebuffer pixel with transparent black so the iframe
    // behind the canvas shows through. The player is closer, wins the depth
    // test, and stays drawn on top of the video.
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.ZeroFactor,
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      void main() {
        gl_FragColor = vec4(0.0);
      }
    `
  }), []);

  // ─────────────────────────────────────────────────────────────
  // 1. AUTHENTIC EXPOSED BRICK WALL TEXTURES (From Live Gig Set)
  // ─────────────────────────────────────────────────────────────
  const [rawWallAlbedo, rawWallRoughness, rawWallNormal] = useTexture([
    '/textures/gig_wall_albedo.png',
    '/textures/gig_wall_roughness.png',
    '/textures/gig_wall_normal.png'
  ]);

  const { brickTex38, brickTex34, brickTex17, brickTexArch } = useMemo(() => {
    const makeSet = (rx, ry) => {
      const alb = rawWallAlbedo.clone();
      const rgh = rawWallRoughness.clone();
      const nrm = rawWallNormal.clone();
      [alb, rgh, nrm].forEach((t) => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
        t.needsUpdate = true;
      });
      alb.colorSpace = THREE.SRGBColorSpace;
      return { albedo: alb, roughness: rgh, normal: nrm };
    };

    return {
      brickTex38: makeSet(12, 2.5),
      brickTex34: makeSet(11, 2.5),
      brickTex17: makeSet(5.5, 2.5),
      brickTexArch: makeSet(1.5, 0.7)
    };
  }, [rawWallAlbedo, rawWallRoughness, rawWallNormal]);

  // ─────────────────────────────────────────────────────────────
  // 2. PROCEDURAL LUXURY HARDWOOD PARQUET FLOOR TEXTURE
  // ─────────────────────────────────────────────────────────────
  const woodTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Deep warm walnut base
    ctx.fillStyle = '#171310';
    ctx.fillRect(0, 0, 512, 512);

    // Staggered planks
    const plankHeight = 32;
    const plankWidth = 128;
    const numRows = 512 / plankHeight;
    const plankColors = [
      '#1e1814',
      '#1a1411',
      '#241c17',
      '#1c1613',
      '#211a15',
      '#181310'
    ];

    for (let r = 0; r < numRows; r++) {
      const y = r * plankHeight;
      const offset = (r % 2) * (plankWidth / 2);
      for (let x = -plankWidth; x < 512 + plankWidth; x += plankWidth) {
        const hash = Math.sin(r * 12.9898 + x * 78.233) * 43758.5453;
        const colIdx = Math.floor(Math.abs(hash - Math.floor(hash)) * plankColors.length);
        ctx.fillStyle = plankColors[colIdx];
        ctx.fillRect(x + offset, y, plankWidth, plankHeight);

        // Plank bevel / seam border
        ctx.strokeStyle = '#0a0807';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + offset, y, plankWidth, plankHeight);

        // Subtle fine wood grain lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        for (let g = 1; g <= 3; g++) {
          const gy = y + g * 8;
          ctx.beginPath();
          ctx.moveTo(x + offset, gy);
          ctx.lineTo(x + offset + plankWidth, gy);
          ctx.stroke();
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 9);
    return tex;
  }, []);

  return (
    <group position={[0, 0, 0]}>
      {/* ───────────────────────────────────────────────────────────── */}
      {/* SÀN NHÀ (Floor: 38m x 34m)                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {/* Main Luxury Polished Hardwood Parquet Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[38, 34]} />
        <meshStandardMaterial
          map={woodTexture || undefined}
          color="#221b16"
          roughness={0.65}
          metalness={0.02}
        />
      </mesh>

      {/* Decorative Brass Floor Inlay Borders framing seating areas */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[9.0, 0.004, 3.0]}>
        <planeGeometry args={[10.4, 4.8]} />
        <meshStandardMaterial color="#c59b4e" roughness={0.45} metalness={0.6} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[9.0, 0.008, 3.0]} receiveShadow>
        <planeGeometry args={[10.2, 4.6]} />
        <meshStandardMaterial color="#191513" roughness={0.92} metalness={0.0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>

      {/* Bar Floor Rug with Brass Trim (Centered around X=-10.75, Z=0) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10.75, 0.004, 0]}>
        <planeGeometry args={[6.8, 10.4]} />
        <meshStandardMaterial color="#c59b4e" roughness={0.45} metalness={0.6} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10.75, 0.008, 0]} receiveShadow>
        <planeGeometry args={[6.6, 10.2]} />
        <meshStandardMaterial color="#141820" roughness={0.92} metalness={0.0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* THẢM ĐỎ HOÀNG GIA DẪN LÊN SÂN KHẤU (Grand Red Velvet Runner)  */}
      {/* ───────────────────────────────────────────────────────────── */}
      <group position={[0, 0.006, 1.815]}>
        {/* Deep Royal Burgundy Velvet Body — stops short of the first step so the seam does not flicker */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[2.6, 18.55]} />
          <meshStandardMaterial color="#58101e" roughness={0.96} metalness={0.0} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
        {/* Left Gold Border */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.24, 0.001, 0]}>
          <planeGeometry args={[0.08, 18.55]} />
          <meshStandardMaterial color="#d4af37" roughness={0.4} metalness={0.7} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
        {/* Right Gold Border */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.24, 0.001, 0]}>
          <planeGeometry args={[0.08, 18.55]} />
          <meshStandardMaterial color="#d4af37" roughness={0.4} metalness={0.7} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      </group>

      {/* Thảm đỏ phủ bậc thang 1 (Tier 1 Step) */}
      <mesh position={[0, 0.128, -7.805]} receiveShadow>
        <boxGeometry args={[2.6, 0.004, 0.42]} />
        <meshStandardMaterial color="#58101e" roughness={0.96} metalness={0.0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {/* Thảm đỏ phủ bậc thang 2 (Tier 2 Step) */}
      <mesh position={[0, 0.248, -8.255]} receiveShadow>
        <boxGeometry args={[2.6, 0.004, 0.42]} />
        <meshStandardMaterial color="#58101e" roughness={0.96} metalness={0.0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {/* Thảm đỏ trải lên mặt sàn sân khấu chính */}
      <mesh position={[0, 0.368, -12.0]} receiveShadow>
        <boxGeometry args={[2.6, 0.004, 6.9]} />
        <meshStandardMaterial color="#58101e" roughness={0.96} metalness={0.0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SÂN KHẤU CHÍNH PHÍA BẮC (Màn Hình TV LED 16:9 - Grand Keynote) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {/* Khối bục chính: mép trước giữ nguyên, mặt sau cắm vào tường Bắc (z = -16.8) */}
      <mesh position={[0, 0.18, -12.68]} receiveShadow castShadow>
        <boxGeometry args={[15, 0.36, 8.41]} />
        <meshStandardMaterial color="#1a1411" roughness={0.68} metalness={0.02} />
      </mesh>

      {/* BẬC THANG LÊN SÂN KHẤU TẦNG 2 (Tier 2: cao 0.24m) */}
      <mesh position={[0, 0.12, -8.255]} receiveShadow castShadow>
        <boxGeometry args={[14.8, 0.24, 0.45]} />
        <meshStandardMaterial color="#211915" roughness={0.68} metalness={0.02} />
      </mesh>
      {/* Dải LED viền vàng hắt sáng bậc thang tầng 2 */}
      <mesh position={[0, 0.256, -8.02]}>
        <boxGeometry args={[14.8, 0.02, 0.02]} />
        <meshStandardMaterial color="#ffaa33" emissive="#ff9922" emissiveIntensity={2.5} />
      </mesh>

      {/* BẬC THANG LÊN SÂN KHẤU TẦNG 1 (Tier 1: cao 0.12m) */}
      <mesh position={[0, 0.06, -7.805]} receiveShadow castShadow>
        <boxGeometry args={[14.6, 0.12, 0.45]} />
        <meshStandardMaterial color="#241b17" roughness={0.68} metalness={0.02} />
      </mesh>
      {/* Dải LED viền vàng hắt sáng bậc thang tầng 1 */}
      <mesh position={[0, 0.136, -7.57]}>
        <boxGeometry args={[14.6, 0.02, 0.02]} />
        <meshStandardMaterial color="#ffaa33" emissive="#ff9922" emissiveIntensity={2.5} />
      </mesh>

      {/* Dải LED vàng hắt sáng mép sân khấu chính */}
      <mesh position={[0, 0.382, -8.47]}>
        <boxGeometry args={[15, 0.02, 0.02]} />
        <meshStandardMaterial color="#ffaa33" emissive="#ff9922" emissiveIntensity={2.5} />
      </mesh>

      {/* Bụi vàng & ánh sáng lơ lửng trên sân khấu chính */}
      <Sparkles
        count={28}
        scale={[14, 4.2, 7.4]}
        position={[0, 2.8, -12.6]}
        color="#f5a623"
        size={3.0}
        speed={0.35}
        opacity={0.65}
      />

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SÂN KHẤU BAN NHẠC LIVE BAND BÊN PHẢI (Right Live Stage)        */}
      {/* Bục sân khấu gỗ riêng biệt + bậc thang + dàn nhạc cụ sống động */}
      {/* ───────────────────────────────────────────────────────────── */}
      <group position={[0, 0, 0]}>
        {/* Bệ gỗ giữa tường phải, cắm sát tường. Mặt sàn và rèm của mô hình nằm trên bệ này. */}
        <mesh position={[16.915, 0.18, 3]} receiveShadow castShadow>
          <boxGeometry args={[3.93, 0.36, 9.4]} />
          <meshStandardMaterial
            color="#1a1411"
            roughness={0.68}
            metalness={0.02}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>

        <mesh position={[14.675, 0.09, 3]} receiveShadow castShadow>
          <boxGeometry args={[0.55, 0.18, 8.8]} />
          <meshStandardMaterial color="#211915" roughness={0.68} metalness={0.02} />
        </mesh>

        <mesh position={[14.4, 0.196, 3]}>
          <boxGeometry args={[0.02, 0.02, 8.8]} />
          <meshStandardMaterial color="#ffaa33" emissive="#ff9922" emissiveIntensity={2.5} />
        </mesh>

        <mesh position={[14.95, 0.382, 3]}>
          <boxGeometry args={[0.02, 0.02, 9.4]} />
          <meshStandardMaterial color="#ffaa33" emissive="#ff9922" emissiveIntensity={2.5} />
        </mesh>

        <Sparkles
          count={20}
          scale={[3.4, 3.2, 8.4]}
          position={[16.9, 2.4, 3]}
          color="#f5a623"
          size={2.5}
          speed={0.3}
          opacity={0.6}
        />

        {/* Nguyên bộ sàn diễn + rèm, quay mặt vào sảnh, căn giữa tường phải và sát lưng vào tường */}
        <Suspense fallback={null}>
          <LiveStageSet
            position={[16.414, -0.245, 2.335]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[0.14, 0.14, 0.14]}
          />
        </Suspense>
      </group>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TRẦN NHÀ KIẾN TRÚC CAO CẤP (Coffered Acoustic Ceiling: Y=7.0m) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {/* Main Ceiling Dark Acoustic Slab (38m x 34m) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 7.0, 0]} receiveShadow>
        <planeGeometry args={[38, 34]} />
        <meshStandardMaterial color="#120f0e" roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Longitudinal Ceiling Beams (Chùm xà gồ dọc) */}
      {[-12, -6, 0, 6, 12].map((x, idx) => (
        <mesh key={`long_beam_${idx}`} position={[x, 6.82, 0]} castShadow>
          <boxGeometry args={[0.35, 0.36, 34]} />
          <meshStandardMaterial color="#221813" roughness={0.78} metalness={0.02} />
        </mesh>
      ))}

      {/* Transverse Ceiling Beams (Chùm xà gồ ngang) */}
      {[-12, -6, 0, 6, 12].map((z, idx) => (
        <mesh key={`trans_beam_${idx}`} position={[0, 6.82, z]} castShadow>
          <boxGeometry args={[38, 0.36, 0.35]} />
          <meshStandardMaterial color="#221813" roughness={0.78} metalness={0.02} />
        </mesh>
      ))}

      {/* Recessed Warm Ceiling Downlights Grid (Đèn âm trần vàng ấm) */}
      {[-12, -6, 0, 6, 12].map((x) =>
        [-9, -3, 3, 9].map((z) => (
          <group key={`light_${x}_${z}`} position={[x, 6.95, z]}>
            {/* Downlight Trim Ring */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.12, 0.22, 16]} />
              <meshStandardMaterial color="#c59b4e" roughness={0.25} metalness={0.8} />
            </mesh>
            {/* Glowing Bulb */}
            <mesh position={[0, -0.02, 0]}>
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshStandardMaterial
                color="#fff0cc"
                emissive="#ffcc77"
                emissiveIntensity={2.0}
              />
            </mesh>
          </group>
        ))
      )}

      {/* Stage Lighting Rig / Truss over the Stage Front (Y = 6.3m, Z = -8.2m) */}
      <group position={[0, 6.3, -8.2]}>
        {/* Metal Truss Tube */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 15, 12]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>

      <Suspense fallback={null}>
        <MainStageDressing />
      </Suspense>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TƯỜNG SAU SÂN KHẤU (Back Wall: Z = -16.9m, 38m x 7m)          */}
      {/* ───────────────────────────────────────────────────────────── */}
      {/* Back Wall Main Slab */}
      <mesh position={[0, 3.5, -16.9]} receiveShadow>
        <boxGeometry args={[38, 7.0, 0.2]} />
        <meshStandardMaterial
          map={brickTex38.albedo}
          roughnessMap={brickTex38.roughness}
          normalMap={brickTex38.normal}
          normalScale={[0.7, 0.7]}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MÀN HÌNH LED SÂN KHẤU (10.4m x 5.85m - TỈ LỆ VÀNG 16:9)       */}
      {/* Kích thước vừa vặn, khung đúc âm tường, loa concert 2 bên     */}
      {/* ───────────────────────────────────────────────────────────── */}
      <group position={[0, 3.90, -16.82]}>
        {/* 6 Giá Đỡ Thép Cố Định Màn Hình Vào Khung Bê Tông Tường Sau */}
        {[-4.2, 0, 4.2].map((bx) =>
          [-1.9, 1.9].map((by) => (
            <mesh key={`mount_${bx}_${by}`} position={[bx, by, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.24, 12]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.8} />
            </mesh>
          ))
        )}

        {/* Khung Vỏ Thùng Màn Hình LED Bằng Titan Đen (10.75m x 6.15m x 0.14m) */}
        <mesh position={[0, 0, -0.04]} receiveShadow castShadow>
          <boxGeometry args={[10.75, 6.15, 0.14]} />
          <meshStandardMaterial color="#161413" roughness={0.65} metalness={0.25} />
        </mesh>

        {/* Dải Đèn LED Halo Concert Hắt Sau Lưng Màn Hình */}
        <mesh position={[0, 0, -0.10]}>
          <boxGeometry args={[11.0, 6.4, 0.04]} />
          <meshStandardMaterial
            color="#ff9922"
            emissive="#ff9922"
            emissiveIntensity={isScreenOn ? 3.4 : 0.5}
          />
        </mesh>

        {/* Khung Viền Chỉ Đồng Champagne Ôm Sát Mép Màn Hình */}
        <mesh position={[0, 0, 0.02]}>
          <boxGeometry args={[10.58, 6.0, 0.03]} />
          <meshStandardMaterial color="#c59b4e" roughness={0.35} metalness={0.75} />
        </mesh>

        {/* Viền Mép Đen Anodized Khử Phản Xạ */}
        <mesh position={[0, 0, 0.03]}>
          <boxGeometry args={[10.46, 5.9, 0.02]} />
          <meshStandardMaterial color="#0d0d0d" roughness={0.8} metalness={0.05} />
        </mesh>

        {/* Mặt Kính Nền Màn Hình (Click để mở hộp thoại đổi link YouTube) */}
        <mesh
          position={[0, 0, 0.038]}
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenStageScreenModal) onOpenStageScreenModal();
          }}
          onPointerOver={() => {
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
          }}
        >
          <planeGeometry args={[10.4, 5.85]} />
          {isScreenOn && stageVideoId ? (
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          ) : (
            <meshStandardMaterial
              color="#08080a"
              roughness={0.92}
              metalness={0.0}
              emissive="#121018"
              emissiveIntensity={0.2}
            />
          )}
        </mesh>

        {/* Lỗ trong suốt đúng silhouette: iframe nằm sau canvas, mặt phẳng này
            xóa pixel của khung hình để video lộ ra, nhân vật gần hơn thì đè lên. */}
        {!isAnyModalOpen && (
          <mesh position={[0, 0, 0.06]} material={screenHoleMaterial} raycast={() => null}>
            <planeGeometry args={[SCREEN_W, SCREEN_H]} />
          </mesh>
        )}

        {/* z-index 0: dưới canvas (z-index 1) nhưng vẫn trên nền trang */}
        <Html
          transform
          center
          occlude={false}
          distanceFactor={SCREEN_DISTANCE_FACTOR}
          zIndexRange={[0, 0]}
          position={[0, 0, 0.06]}
          style={{
            pointerEvents: isAnyModalOpen ? 'none' : 'auto',
            userSelect: 'none',
            visibility: isAnyModalOpen ? 'hidden' : 'visible',
            opacity: isAnyModalOpen ? 0 : 1
          }}
        >
          <div
            style={{
              width: '1280px',
              height: '720px',
              background: '#090a0f',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            {isScreenOn && stageVideoId ? (
              <iframe
                key={stageVideoId}
                src={`https://www.youtube-nocookie.com/embed/${stageVideoId}?autoplay=1&mute=${isStageVideoMuted ? 1 : 0}&loop=1&playlist=${stageVideoId}&controls=1&rel=0&modestbranding=1`}
                title="Ca Van Nghe Stage Screen"
                width="1280"
                height="720"
                style={{
                  border: 'none',
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  pointerEvents: isAnyModalOpen ? 'none' : 'auto'
                }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'radial-gradient(circle at center, #1b1622 0%, #08070b 100%)',
                  color: '#ffffff',
                  fontFamily: 'sans-serif'
                }}
              >
                <div
                  style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    letterSpacing: '10px',
                    color: '#e5c07b',
                    marginBottom: '16px',
                    textShadow: '0 0 35px rgba(229,192,123,0.5)'
                  }}
                >
                  CA VĂN NGHỆ
                </div>
                <div
                  style={{
                    fontSize: '20px',
                    letterSpacing: '5px',
                    color: '#8b949e',
                    textTransform: 'uppercase'
                  }}
                >
                  LIVE ACOUSTIC STAGE
                </div>
              </div>
            )}
          </div>
        </Html>

        {/* Ambient Stage Screen Glow onto the Stage Floor */}
        <pointLight position={[0, -0.6, 2.2]} color="#ffb74d" intensity={18} distance={14} decay={2} />
      </group>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TƯỜNG BÊN TRÁI: QUẦY BAR (Left Wall: X = -18.9m, 34m x 7m)    */}
      {/* ───────────────────────────────────────────────────────────── */}
      <mesh position={[-18.9, 3.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[34, 7.0, 0.2]} />
        <meshStandardMaterial
          map={brickTex34.albedo}
          roughnessMap={brickTex34.roughness}
          normalMap={brickTex34.normal}
          normalScale={[0.7, 0.7]}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>

      {/* Fluted Timber Wainscoting & Bar Backing Structure */}
      <group position={[-18.75, 2.0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {/* Lower Timber Paneling */}
        <mesh receiveShadow>
          <boxGeometry args={[26, 4.0, 0.1]} />
          <meshStandardMaterial color="#261c16" roughness={0.72} metalness={0.02} />
        </mesh>
        {/* Vertical Warm Brass Dividers */}
        {[-10, -5, 0, 5, 10].map((bx, i) => (
          <mesh key={`bar_div_${i}`} position={[bx, 0, 0.08]}>
            <boxGeometry args={[0.08, 4.0, 0.06]} />
            <meshStandardMaterial color="#c59b4e" roughness={0.25} metalness={0.8} />
          </mesh>
        ))}
        {/* Backlit Liquor Shelf Ambient Glow Bar */}
        <mesh position={[0, 0.8, 0.12]}>
          <boxGeometry args={[22, 0.04, 0.04]} />
          <meshStandardMaterial
            color="#ffa726"
            emissive="#ff9800"
            emissiveIntensity={2.2}
          />
        </mesh>
      </group>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TƯỜNG BÊN PHẢI: BẢNG ĐIỆN TỬ HAI BÊN SÂN KHẤU (X = 18.9m)      */}
      {/* ───────────────────────────────────────────────────────────── */}
      <mesh position={[18.9, 3.5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[34, 7.0, 0.2]} />
        <meshStandardMaterial
          map={brickTex34.albedo}
          roughnessMap={brickTex34.roughness}
          normalMap={brickTex34.normal}
          normalScale={[0.7, 0.7]}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>

      {/* Hai bảng điện tử hai bên sân khấu, cách đều tâm sân khấu z=3 */}
      {LED_BOARD_Z.map((z) => (
        <ElectronicBoard
          key={`led_board_${z}`}
          position={[18.74, 3.15, z]}
          screenMaterial={ledScreenMaterial}
          maskMaterial={ledMaskMaterial}
        />
      ))}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TƯỜNG TRƯỚC / CỔNG ĐÓN KHÁCH (Front Wall: Z = +16.9m, 38m x 7m) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <mesh position={[-10.5, 3.5, 16.9]} receiveShadow>
        <boxGeometry args={[17, 7.0, 0.2]} />
        <meshStandardMaterial
          map={brickTex17.albedo}
          roughnessMap={brickTex17.roughness}
          normalMap={brickTex17.normal}
          normalScale={[0.7, 0.7]}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>
      <mesh position={[10.5, 3.5, 16.9]} receiveShadow>
        <boxGeometry args={[17, 7.0, 0.2]} />
        <meshStandardMaterial
          map={brickTex17.albedo}
          roughnessMap={brickTex17.roughness}
          normalMap={brickTex17.normal}
          normalScale={[0.7, 0.7]}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>
      {/* Grand Entrance Arch Header */}
      <mesh position={[0, 6.0, 16.9]} receiveShadow>
        <boxGeometry args={[4.2, 2.0, 0.2]} />
        <meshStandardMaterial
          map={brickTexArch.albedo}
          roughnessMap={brickTexArch.roughness}
          normalMap={brickTexArch.normal}
          normalScale={[0.7, 0.7]}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>
      {/* Entrance Pilasters & Brass Frame */}
      <mesh position={[-2.1, 2.5, 16.8]}>
        <boxGeometry args={[0.2, 5.0, 0.3]} />
        <meshStandardMaterial color="#2b2019" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[2.1, 2.5, 16.8]}>
        <boxGeometry args={[0.2, 5.0, 0.3]} />
        <meshStandardMaterial color="#2b2019" roughness={0.72} metalness={0.02} />
      </mesh>
      {/* Brass Entrance Floor Threshold Strip */}
      <mesh position={[0, 0.01, 16.8]}>
        <boxGeometry args={[4.2, 0.02, 0.3]} />
        <meshStandardMaterial color="#c59b4e" roughness={0.4} metalness={0.7} />
      </mesh>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* PHÀO CHÂN TƯỜNG (Baseboards) & PHÀO TRẦN (Crown Moldings)      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {/* Baseboards (Chân tường Y=0.11m) */}
      <mesh position={[0, 0.11, -16.8]} receiveShadow>
        <boxGeometry args={[37.8, 0.22, 0.05]} />
        <meshStandardMaterial color="#261c16" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[-18.8, 0.11, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[33.8, 0.22, 0.05]} />
        <meshStandardMaterial color="#261c16" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[18.8, 0.11, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[33.8, 0.22, 0.05]} />
        <meshStandardMaterial color="#261c16" roughness={0.72} metalness={0.02} />
      </mesh>

      {/* Crown Moldings (Phào trần Y=6.88m) */}
      <mesh position={[0, 6.88, -16.8]}>
        <boxGeometry args={[37.8, 0.24, 0.08]} />
        <meshStandardMaterial color="#261c16" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[-18.8, 6.88, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[33.8, 0.24, 0.08]} />
        <meshStandardMaterial color="#261c16" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[18.8, 6.88, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[33.8, 0.24, 0.08]} />
        <meshStandardMaterial color="#261c16" roughness={0.72} metalness={0.02} />
      </mesh>
    </group>
  );
}