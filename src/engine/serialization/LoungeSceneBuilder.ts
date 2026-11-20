import * as pc from 'playcanvas';
import type { EditorEngine } from '../EditorEngine';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';
import { createVideoScreenMaterial } from '../runtime/VideoTextureManager';
import { getEntityMeta } from './EntityComponentHelper';

export interface SharedLoungeMaterials {
  floorWood: pc.StandardMaterial;
  brass: pc.StandardMaterial;
  goldBorder: pc.StandardMaterial;
  rugDark: pc.StandardMaterial;
  rugBar: pc.StandardMaterial;
  velvetRed: pc.StandardMaterial;
  stageDark: pc.StandardMaterial;
  stageStep1: pc.StandardMaterial;
  stageStep2: pc.StandardMaterial;
  ledGold: pc.StandardMaterial;
  ceilingDark: pc.StandardMaterial;
  woodBeam: pc.StandardMaterial;
  timberDark: pc.StandardMaterial;
  pilasterDark: pc.StandardMaterial;
  brickWall38: pc.StandardMaterial;
  brickWall34: pc.StandardMaterial;
  brickWall17: pc.StandardMaterial;
  brickWallArch: pc.StandardMaterial;
  trussMetal: pc.StandardMaterial;
  cabinetDark: pc.StandardMaterial;
  railMetal: pc.StandardMaterial;
  boltMetal: pc.StandardMaterial;
  cyanBezel: pc.StandardMaterial;
  bulbGlow: pc.StandardMaterial;
  screenBlack: pc.StandardMaterial;
  mainScreenPoster: pc.StandardMaterial;
}

function createParquetTexture(engine: EditorEngine, app: pc.Application): pc.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#171310';
    ctx.fillRect(0, 0, 512, 512);

    const plankHeight = 32;
    const plankWidth = 128;
    const numRows = 512 / plankHeight;
    const plankColors = ['#1e1814', '#1a1411', '#241c17', '#1c1613', '#211a15', '#181310'];

    for (let r = 0; r < numRows; r++) {
      const y = r * plankHeight;
      const offset = (r % 2) * (plankWidth / 2);
      for (let x = -plankWidth; x < 512 + plankWidth; x += plankWidth) {
        const hash = Math.sin(r * 12.9898 + x * 78.233) * 43758.5453;
        const colIdx = Math.floor(Math.abs(hash - Math.floor(hash)) * plankColors.length);
        ctx.fillStyle = plankColors[colIdx];
        ctx.fillRect(x + offset, y, plankWidth, plankHeight);

        ctx.strokeStyle = '#0a0807';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + offset, y, plankWidth, plankHeight);

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
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
  }

  const tex = new pc.Texture(app.graphicsDevice, {
    width: 512,
    height: 512,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
  });
  tex.setSource(canvas);
  engine.registerExternalResources(() => tex.destroy());
  return tex;
}

function createMainScreenPosterTexture(engine: EditorEngine, app: pc.Application): pc.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(512, 288, 40, 512, 288, 560);
    grad.addColorStop(0, '#1b1622');
    grad.addColorStop(1, '#08070b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 576);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(229, 192, 123, 0.5)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#e5c07b';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText('CA VĂN NGHỆ', 512, 260);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8b949e';
    ctx.font = '22px sans-serif';
    ctx.fillText('LIVE ACOUSTIC STAGE', 512, 330);
  }

  const tex = new pc.Texture(app.graphicsDevice, {
    width: 1024,
    height: 576,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  tex.setSource(canvas);
  engine.registerExternalResources(() => tex.destroy());
  return tex;
}

function loadRepeatTexture(
  engine: EditorEngine,
  app: pc.Application,
  url: string,
  onReady: (tex: pc.Texture) => void
): pc.Texture {
  const tex = new pc.Texture(app.graphicsDevice, {
    width: 4,
    height: 4,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
  });
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    tex.setSource(img);
    onReady(tex);
  };
  img.src = url;
  engine.registerExternalResources(() => tex.destroy());
  return tex;
}

function makeMat(
  engine: EditorEngine,
  opts: {
    diffuse: [number, number, number];
    metalness?: number;
    gloss?: number;
    emissive?: [number, number, number];
    emissiveIntensity?: number;
    useLighting?: boolean;
  }
): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(opts.diffuse[0], opts.diffuse[1], opts.diffuse[2]);
  m.useMetalness = true;
  m.metalness = opts.metalness ?? 0.02;
  m.gloss = opts.gloss ?? 0.32;
  if (opts.emissive) {
    m.emissive = new pc.Color(opts.emissive[0], opts.emissive[1], opts.emissive[2]);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.useLighting === false) {
    m.useLighting = false;
  }
  m.update();
  engine.registerExternalMaterial(m);
  return m;
}

export function createSharedLoungeMaterials(engine: EditorEngine): SharedLoungeMaterials {
  const app = engine.getApp();

  const floorWood = makeMat(engine, { diffuse: [0.85, 0.8, 0.75], metalness: 0.02, gloss: 0.35 });
  if (app) {
    floorWood.diffuseMap = createParquetTexture(engine, app);
    floorWood.diffuseMapTiling = new pc.Vec2(10, 9);
    floorWood.update();
  }

  const makeBrickWall = (rx: number, ry: number) => {
    const m = makeMat(engine, { diffuse: [0.22, 0.19, 0.18], metalness: 0.06, gloss: 0.12 });
    m.diffuseMapTiling = new pc.Vec2(rx, ry);
    m.normalMapTiling = new pc.Vec2(rx, ry);
    return m;
  };

  const brickWall38 = makeBrickWall(12, 2.5);
  const brickWall34 = makeBrickWall(11, 2.5);
  const brickWall17 = makeBrickWall(5.5, 2.5);
  const brickWallArch = makeBrickWall(1.5, 0.7);
  const brickMats = [brickWall38, brickWall34, brickWall17, brickWallArch];

  if (app) {
    loadRepeatTexture(engine, app, '/textures/gig_wall_albedo.png', (tex) => {
      for (const m of brickMats) {
        m.diffuse = new pc.Color(0.95, 0.95, 0.95);
        m.diffuseMap = tex;
        m.update();
      }
    });
    loadRepeatTexture(engine, app, '/textures/gig_wall_normal.png', (tex) => {
      for (const m of brickMats) {
        m.normalMap = tex;
        m.bumpiness = 0.7;
        m.update();
      }
    });
  }

  const mainScreenPoster = makeMat(engine, {
    diffuse: [0.1, 0.1, 0.12],
    emissive: [1, 1, 1],
    emissiveIntensity: 1.0,
    useLighting: false,
  });
  if (app) {
    const posterTex = createMainScreenPosterTexture(engine, app);
    mainScreenPoster.emissiveMap = posterTex;
    mainScreenPoster.update();
  }

  return {
    floorWood,
    brass: makeMat(engine, { diffuse: [0.773, 0.608, 0.306], metalness: 0.7, gloss: 0.6 }),
    goldBorder: makeMat(engine, { diffuse: [0.831, 0.686, 0.216], metalness: 0.7, gloss: 0.6 }),
    rugDark: makeMat(engine, { diffuse: [0.098, 0.082, 0.075], metalness: 0, gloss: 0.08 }),
    rugBar: makeMat(engine, { diffuse: [0.078, 0.094, 0.125], metalness: 0, gloss: 0.08 }),
    velvetRed: makeMat(engine, { diffuse: [0.345, 0.063, 0.118], metalness: 0, gloss: 0.04 }),
    stageDark: makeMat(engine, { diffuse: [0.102, 0.078, 0.067], metalness: 0.02, gloss: 0.32 }),
    stageStep1: makeMat(engine, { diffuse: [0.141, 0.106, 0.09], metalness: 0.02, gloss: 0.32 }),
    stageStep2: makeMat(engine, { diffuse: [0.129, 0.098, 0.082], metalness: 0.02, gloss: 0.32 }),
    ledGold: makeMat(engine, {
      diffuse: [1, 0.667, 0.2],
      emissive: [1, 0.6, 0.133],
      emissiveIntensity: 2.5,
      useLighting: false,
    }),
    ceilingDark: makeMat(engine, { diffuse: [0.071, 0.059, 0.055], metalness: 0.05, gloss: 0.15 }),
    woodBeam: makeMat(engine, { diffuse: [0.133, 0.094, 0.075], metalness: 0.02, gloss: 0.22 }),
    timberDark: makeMat(engine, { diffuse: [0.149, 0.11, 0.086], metalness: 0.02, gloss: 0.28 }),
    pilasterDark: makeMat(engine, { diffuse: [0.169, 0.125, 0.098], metalness: 0.02, gloss: 0.28 }),
    brickWall38,
    brickWall34,
    brickWall17,
    brickWallArch,
    trussMetal: makeMat(engine, { diffuse: [0.102, 0.102, 0.102], metalness: 0.8, gloss: 0.7 }),
    cabinetDark: makeMat(engine, { diffuse: [0.078, 0.094, 0.114], metalness: 0.72, gloss: 0.64 }),
    railMetal: makeMat(engine, { diffuse: [0.137, 0.157, 0.184], metalness: 0.8, gloss: 0.72 }),
    boltMetal: makeMat(engine, { diffuse: [0.545, 0.573, 0.604], metalness: 0.9, gloss: 0.75 }),
    cyanBezel: makeMat(engine, {
      diffuse: [0.286, 0.718, 1],
      emissive: [0.286, 0.718, 1],
      emissiveIntensity: 1.4,
      useLighting: false,
    }),
    bulbGlow: makeMat(engine, {
      diffuse: [1, 0.94, 0.8],
      emissive: [1, 0.8, 0.47],
      emissiveIntensity: 2.0,
      useLighting: false,
    }),
    screenBlack: makeMat(engine, { diffuse: [0.04, 0.04, 0.05], metalness: 0.1, gloss: 0.5 }),
    mainScreenPoster,
  };
}

function createBox(
  name: string,
  pos: [number, number, number],
  scale: [number, number, number],
  material: pc.StandardMaterial,
  opts?: {
    rot?: [number, number, number];
    castShadows?: boolean;
    receiveShadows?: boolean;
    collider?: boolean;
  }
): pc.Entity {
  const e = new pc.Entity(name);
  e.addComponent('render', {
    type: 'box',
    material,
    castShadows: opts?.castShadows ?? false,
    receiveShadows: opts?.receiveShadows ?? true,
  });
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  if (opts?.rot) {
    e.setLocalEulerAngles(opts.rot[0], opts.rot[1], opts.rot[2]);
  }
  e.setLocalScale(scale[0], scale[1], scale[2]);

  if (opts?.collider) {
    e.addComponent('collision', {
      type: 'box',
      halfExtents: new pc.Vec3(scale[0] * 0.5, scale[1] * 0.5, scale[2] * 0.5),
    });
    e.addComponent('rigidbody', {
      type: 'static',
      mass: 0,
      friction: 0.8,
      restitution: 0.1,
    });
  }
  return e;
}

export function buildEnvironmentShell(
  sceneRoot: pc.Entity,
  mats: SharedLoungeMaterials
): pc.Entity {
  const shell = new pc.Entity('Environment_Shell');
  sceneRoot.addChild(shell);

  // Main Floor (38m x 34m) with static collider
  const floor = new pc.Entity('Lounge Floor');
  floor.addComponent('render', {
    type: 'plane',
    material: mats.floorWood,
    castShadows: false,
    receiveShadows: true,
  });
  floor.setLocalPosition(0, -0.001, 0);
  floor.setLocalScale(38, 1, 34);
  floor.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(19, 0.05, 17),
  });
  floor.addComponent('rigidbody', {
    type: 'static',
    mass: 0,
    friction: 0.8,
    restitution: 0.1,
  });
  shell.addChild(floor);

  // Seating & Bar Area Rugs with Brass Inlay
  shell.addChild(createBox('Seating Rug Brass Trim', [9.0, 0.002, 3.0], [10.4, 0.004, 4.8], mats.brass));
  shell.addChild(createBox('Seating Rug', [9.0, 0.005, 3.0], [10.2, 0.004, 4.6], mats.rugDark));
  shell.addChild(createBox('Bar Rug Brass Trim', [-10.75, 0.002, 0], [6.8, 0.004, 10.4], mats.brass));
  shell.addChild(createBox('Bar Rug', [-10.75, 0.005, 0], [6.6, 0.004, 10.2], mats.rugBar));

  // Grand Red Velvet Runner + Gold Borders
  const runnerGroup = new pc.Entity('Red_Velvet_Runner');
  runnerGroup.setLocalPosition(0, 0.006, 1.815);
  runnerGroup.addChild(createBox('Velvet Body', [0, 0, 0], [2.6, 0.004, 18.55], mats.velvetRed));
  runnerGroup.addChild(createBox('Gold Border Left', [-1.24, 0.002, 0], [0.08, 0.004, 18.55], mats.goldBorder));
  runnerGroup.addChild(createBox('Gold Border Right', [1.24, 0.002, 0], [0.08, 0.004, 18.55], mats.goldBorder));
  shell.addChild(runnerGroup);

  // Walls (Back, Left + Bar Backwall, Right, Front with Entrance Arch)
  const walls = new pc.Entity('Walls');
  shell.addChild(walls);
  walls.addChild(createBox('Wall North (Back)', [0, 3.5, -16.9], [38, 7.0, 0.2], mats.brickWall38, { collider: true }));
  walls.addChild(createBox('Wall West (Bar)', [-18.9, 3.5, 0], [0.2, 7.0, 34], mats.brickWall34, { collider: true }));
  walls.addChild(createBox('Wall East (Stage)', [18.9, 3.5, 0], [0.2, 7.0, 34], mats.brickWall34, { collider: true }));
  walls.addChild(createBox('Wall South Left', [-10.5, 3.5, 16.9], [17, 7.0, 0.2], mats.brickWall17, { collider: true }));
  walls.addChild(createBox('Wall South Right', [10.5, 3.5, 16.9], [17, 7.0, 0.2], mats.brickWall17, { collider: true }));
  walls.addChild(createBox('Entrance Arch Header', [0, 6.0, 16.9], [4.2, 2.0, 0.2], mats.brickWallArch));
  walls.addChild(createBox('Entrance Pilaster Left', [-2.1, 2.5, 16.8], [0.2, 5.0, 0.3], mats.pilasterDark));
  walls.addChild(createBox('Entrance Pilaster Right', [2.1, 2.5, 16.8], [0.2, 5.0, 0.3], mats.pilasterDark));
  walls.addChild(createBox('Entrance Threshold', [0, 0.01, 16.8], [4.2, 0.02, 0.3], mats.brass));

  // Bar Backwall Timber Paneling + Brass Dividers + Glow Bar
  const barBackwall = new pc.Entity('Bar_Backwall');
  barBackwall.setLocalPosition(-18.75, 2.0, 0);
  barBackwall.setLocalEulerAngles(0, 90, 0);
  barBackwall.addChild(createBox('Timber Paneling', [0, 0, 0], [26, 4.0, 0.1], mats.timberDark));
  for (const bx of [-10, -5, 0, 5, 10]) {
    barBackwall.addChild(createBox(`Brass Divider ${bx}`, [bx, 0, 0.08], [0.08, 4.0, 0.06], mats.brass));
  }
  barBackwall.addChild(createBox('Liquor Glow Bar', [0, 0.8, 0.12], [22, 0.04, 0.04], mats.ledGold));
  walls.addChild(barBackwall);

  // Baseboards & Crown Moldings
  walls.addChild(createBox('Baseboard North', [0, 0.11, -16.8], [37.8, 0.22, 0.05], mats.timberDark));
  walls.addChild(createBox('Baseboard West', [-18.8, 0.11, 0], [0.05, 0.22, 33.8], mats.timberDark));
  walls.addChild(createBox('Baseboard East', [18.8, 0.11, 0], [0.05, 0.22, 33.8], mats.timberDark));
  walls.addChild(createBox('Crown North', [0, 6.88, -16.8], [37.8, 0.24, 0.08], mats.timberDark));
  walls.addChild(createBox('Crown West', [-18.8, 6.88, 0], [0.08, 0.24, 33.8], mats.timberDark));
  walls.addChild(createBox('Crown East', [18.8, 6.88, 0], [0.08, 0.24, 33.8], mats.timberDark));

  // Coffered Acoustic Ceiling (Y = 7.0m) + Beams + Downlights
  const ceiling = new pc.Entity('Ceiling_Coffered');
  shell.addChild(ceiling);
  ceiling.addChild(createBox('Ceiling Slab', [0, 7.05, 0], [38, 0.1, 34], mats.ceilingDark));

  for (const x of [-12, -6, 0, 6, 12]) {
    ceiling.addChild(createBox(`Beam Long ${x}`, [x, 6.82, 0], [0.35, 0.36, 34], mats.woodBeam, { castShadows: true }));
  }
  for (const z of [-12, -6, 0, 6, 12]) {
    ceiling.addChild(createBox(`Beam Trans ${z}`, [0, 6.82, z], [38, 0.36, 0.35], mats.woodBeam, { castShadows: true }));
  }

  for (const x of [-12, -6, 0, 6, 12]) {
    for (const z of [-9, -3, 3, 9]) {
      const fixture = new pc.Entity(`PF_Ceiling_Light_${x}_${z}`);
      fixture.setLocalPosition(x, 6.95, z);
      const ring = createBox('Trim', [0, 0, 0], [0.36, 0.04, 0.36], mats.brass);
      const bulb = new pc.Entity('Bulb');
      bulb.addComponent('render', { type: 'sphere', material: mats.bulbGlow, castShadows: false, receiveShadows: false });
      bulb.setLocalPosition(0, -0.03, 0);
      bulb.setLocalScale(0.18, 0.12, 0.18);
      fixture.addChild(ring);
      fixture.addChild(bulb);
      ceiling.addChild(fixture);
    }
  }

  return shell;
}

export function buildLightingRig(sceneRoot: pc.Entity): pc.Entity {
  const rig = new pc.Entity('Lighting_Rig');
  sceneRoot.addChild(rig);

  const dirLight = new pc.Entity('Directional Light');
  dirLight.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1, 0.718, 0.302),
    intensity: 1.6,
    castShadows: true,
    shadowBias: 0.2,
    normalOffsetBias: 0.05,
    shadowDistance: 45,
    shadowResolution: 1024,
  });
  dirLight.setLocalPosition(15, 18, 12);
  dirLight.lookAt(0, 0, 0);
  rig.addChild(dirLight);

  const barSpot = new pc.Entity('Bar Spotlight');
  barSpot.addComponent('light', {
    type: 'spot',
    color: new pc.Color(1, 0.655, 0.149),
    intensity: 3.8,
    range: 14,
    innerConeAngle: 22,
    outerConeAngle: 46,
    castShadows: false,
  });
  barSpot.setLocalPosition(-10.2, 5.8, 0.8);
  barSpot.lookAt(-10.2, 1.2, 0.8);
  barSpot.rotateLocal(90, 0, 0);
  rig.addChild(barSpot);

  const receptionSpot = new pc.Entity('Reception Spotlight');
  receptionSpot.addComponent('light', {
    type: 'spot',
    color: new pc.Color(1, 0.878, 0.698),
    intensity: 2.8,
    range: 12,
    innerConeAngle: 18,
    outerConeAngle: 36,
    castShadows: false,
  });
  receptionSpot.setLocalPosition(0, 5.0, 9.5);
  receptionSpot.lookAt(0, 1.2, 11.5);
  receptionSpot.rotateLocal(90, 0, 0);
  rig.addChild(receptionSpot);

  const stageScreenGlow = new pc.Entity('Stage Screen PointLight');
  stageScreenGlow.addComponent('light', {
    type: 'point',
    color: new pc.Color(1, 0.718, 0.302),
    intensity: 2.4,
    range: 14,
    castShadows: false,
  });
  stageScreenGlow.setLocalPosition(0, 3.3, -14.62);
  rig.addChild(stageScreenGlow);

  const lampPoints: Array<[number, number, number]> = [
    [-7.2, 1.8, -4.5],
    [-7.2, 1.8, 5.5],
    [2.5, 1.8, 0.5],
  ];
  lampPoints.forEach((pos, idx) => {
    const pt = new pc.Entity(`Lamp PointLight ${idx + 1}`);
    pt.addComponent('light', {
      type: 'point',
      color: new pc.Color(1, 0.718, 0.302),
      intensity: 2.2,
      range: 8,
      castShadows: false,
    });
    pt.setLocalPosition(pos[0], pos[1], pos[2]);
    rig.addChild(pt);
  });

  return rig;
}

export type GlbMaterialCache = Map<string, Map<pc.Material, pc.StandardMaterial>>;

function setMaterialRoughness(mat: pc.StandardMaterial, roughness: number): void {
  mat.gloss = mat.glossInvert ? roughness : 1 - roughness;
}

function getMaterialRoughness(mat: pc.StandardMaterial): number {
  return mat.glossInvert ? mat.gloss : 1 - mat.gloss;
}

/**
 * PlayCanvas equivalent of `enhanceMeshMaterial` from `src/components/3d/Model.jsx:6-92`.
 */
function enhanceStandardMaterial(
  mat: pc.StandardMaterial,
  url = '',
  meshName = ''
): void {
  const matName = (mat.name || '').toLowerCase();
  const mName = (meshName || '').toLowerCase();
  const u = (url || '').toLowerCase();

  // 1. Botanical Foliage & Leaves (Tree.glb)
  if (matName.includes('leaves') || mName.includes('leaves')) {
    mat.diffuse = new pc.Color().fromString('#2d5a27');
    setMaterialRoughness(mat, 0.65);
    mat.useMetalness = true;
    mat.metalness = 0.0;
    mat.cull = pc.CULLFACE_NONE;
    mat.update();
    return;
  }

  // 2. Tree Bark & Organic Wood Trunks (Tree.glb)
  if (matName.includes('bark') || mName.includes('bark')) {
    mat.diffuse = new pc.Color().fromString('#3d2a1d');
    setMaterialRoughness(mat, 0.85);
    mat.useMetalness = true;
    mat.metalness = 0.05;
    mat.update();
    return;
  }

  // 3. Chandelier (Restaurant_chandelier.glb)
  if (u.includes('chandelier') || matName.includes('chandelier') || mName.includes('chandelier')) {
    mat.diffuse = new pc.Color().fromString('#cca45c');
    mat.useMetalness = true;
    mat.metalness = 0.82;
    setMaterialRoughness(mat, 0.22);
    mat.emissive = new pc.Color().fromString('#ffd885');
    mat.emissiveIntensity = 0.25;
    mat.update();
    return;
  }

  // 4. Floor Lamp (Floor_Lamp.glb)
  if (u.includes('floor_lamp') || matName.includes('lamp') || mName.includes('lamp')) {
    mat.diffuse = new pc.Color().fromString('#26221f');
    mat.useMetalness = true;
    mat.metalness = 0.7;
    setMaterialRoughness(mat, 0.35);
    mat.emissive = new pc.Color().fromString('#ffa726');
    mat.emissiveIntensity = 0.4;
    mat.update();
    return;
  }

  // 5. Rectangular Dining Table (Restaurant_Table_Rectangular.glb)
  if (u.includes('table_rectangular') || matName.includes('table_rectangular')) {
    mat.diffuse = new pc.Color().fromString('#2b1e16');
    setMaterialRoughness(mat, 0.65);
    mat.useMetalness = true;
    mat.metalness = 0.02;
    mat.update();
    return;
  }

  // 6. Reception Desk (Restaurant_Reception_Desk.glb)
  if (u.includes('reception_desk') || matName.includes('reception_desk')) {
    mat.diffuse = new pc.Color().fromString('#221915');
    setMaterialRoughness(mat, 0.68);
    mat.useMetalness = true;
    mat.metalness = 0.02;
    mat.update();
    return;
  }

  // 7. Generic Fallback for untextured flat-white GLTFs (color > 0.72 without texture map)
  if (!mat.diffuseMap && mat.diffuse && mat.diffuse.r > 0.72 && mat.diffuse.g > 0.72 && mat.diffuse.b > 0.72) {
    mat.diffuse = new pc.Color().fromString('#2e2824');
    setMaterialRoughness(mat, 0.70);
    mat.useMetalness = true;
    mat.metalness = 0.02;
    mat.update();
    return;
  }

  // 8. Universal Matte Finish: soften plastic shininess on standard non-metallic meshes
  if (!mat.metalness || mat.metalness < 0.65) {
    let changed = false;
    if (getMaterialRoughness(mat) < 0.62) {
      setMaterialRoughness(mat, 0.65);
      changed = true;
    }
    if (mat.metalness > 0.05) {
      mat.useMetalness = true;
      mat.metalness = 0.02;
      changed = true;
    }
    if (changed) {
      mat.update();
    }
  }
}

/**
 * Clones and enhances all StandardMaterials on a loaded GLB entity hierarchy,
 * caching cloned materials per `(url, originalMaterial)` and registering them with `engine`.
 */
export function enhanceGlbMaterials(
  engine: EditorEngine,
  root: pc.Entity,
  url: string,
  cache?: GlbMaterialCache,
  extraTune?: (mat: pc.StandardMaterial, meshName: string) => void
): void {
  let urlCache = cache?.get(url);
  if (cache && !urlCache) {
    urlCache = new Map<pc.Material, pc.StandardMaterial>();
    cache.set(url, urlCache);
  }

  const renders = root.findComponents('render') as pc.RenderComponent[];
  for (const render of renders) {
    if (!render.meshInstances) continue;
    for (const mi of render.meshInstances) {
      const orig = mi.material;
      if (!(orig instanceof pc.StandardMaterial)) continue;

      const meshName = mi.node?.name || render.entity.name || '';
      let enhanced = urlCache?.get(orig);
      if (!enhanced) {
        enhanced = orig.clone() as pc.StandardMaterial;
        enhanceStandardMaterial(enhanced, url, meshName);
        extraTune?.(enhanced, meshName);
        engine.registerExternalMaterial(enhanced);
        urlCache?.set(orig, enhanced);
      }
      mi.material = enhanced;
    }
  }
}

/**
 * PlayCanvas equivalent of `hideRoomShell` from `src/components/3d/LiveStageSet.jsx:201-225`.
 * Hides diorama pub tables, mannequins, crates, ceiling hangers, freestanding walls, and outer floor.
 */
function hideGigRoomShell(gigRoot: pc.Entity): void {
  const renders = gigRoot.findComponents('render') as pc.RenderComponent[];
  for (const render of renders) {
    if (!render.meshInstances || render.meshInstances.length === 0) continue;
    let allHidden = true;
    for (const mi of render.meshInstances) {
      const lowerName = (mi.node?.name || render.entity.name || '').toLowerCase();
      const matName = (mi.material?.name || '').toLowerCase();

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
        mi.visible = false;
      } else {
        allHidden = false;
      }
    }
    if (allHidden) {
      render.enabled = false;
    }
  }
}

export async function buildMainAndAcousticStages(
  engine: EditorEngine,
  sceneRoot: pc.Entity,
  mats: SharedLoungeMaterials,
  fetchBuffer: (url: string) => Promise<ArrayBuffer>,
  assetIdByUrl: Map<string, string>,
  matCache?: GlbMaterialCache
): Promise<void> {
  const app = engine.getApp();
  if (!app) return;
  const cache = matCache ?? new Map<string, Map<pc.Material, pc.StandardMaterial>>();

  // ── 1. Main Stage ──
  const mainStage = new pc.Entity('Main_Stage');
  sceneRoot.addChild(mainStage);

  mainStage.addChild(
    createBox('Stage Platform', [0, 0.18, -12.68], [15, 0.36, 8.41], mats.stageDark, {
      castShadows: true,
      collider: true,
    })
  );
  mainStage.addChild(
    createBox('Stage Step Tier 2', [0, 0.12, -8.255], [14.8, 0.24, 0.45], mats.stageStep2, {
      castShadows: true,
      collider: true,
    })
  );
  mainStage.addChild(
    createBox('Stage Step Tier 1', [0, 0.06, -7.805], [14.6, 0.12, 0.45], mats.stageStep1, {
      castShadows: true,
      collider: true,
    })
  );

  // Red Carpet on Stage & Steps
  mainStage.addChild(createBox('Stage Carpet Step 1', [0, 0.125, -7.805], [2.6, 0.008, 0.42], mats.velvetRed));
  mainStage.addChild(createBox('Stage Carpet Step 2', [0, 0.245, -8.255], [2.6, 0.008, 0.42], mats.velvetRed));
  mainStage.addChild(createBox('Stage Carpet Deck', [0, 0.365, -12.0], [2.6, 0.008, 6.9], mats.velvetRed));

  // Gold LED Edge Strips
  mainStage.addChild(createBox('LED Strip Step 1', [0, 0.136, -7.57], [14.6, 0.02, 0.02], mats.ledGold));
  mainStage.addChild(createBox('LED Strip Step 2', [0, 0.256, -8.02], [14.8, 0.02, 0.02], mats.ledGold));
  mainStage.addChild(createBox('LED Strip Stage', [0, 0.382, -8.47], [15.0, 0.02, 0.02], mats.ledGold));

  // Stage Truss & Main YouTube LED Screen Frame
  const truss = new pc.Entity('Stage Lighting Truss');
  truss.addComponent('render', { type: 'cylinder', material: mats.trussMetal, castShadows: false, receiveShadows: false });
  truss.setLocalPosition(0, 6.3, -8.2);
  truss.setLocalEulerAngles(0, 0, 90);
  truss.setLocalScale(0.16, 15, 0.16);
  mainStage.addChild(truss);

  const tvFrame = new pc.Entity('Main Stage LED Screen');
  tvFrame.setLocalPosition(0, 3.9, -16.82);
  mainStage.addChild(tvFrame);

  // 6 Steel Mounting Cylinders
  for (const bx of [-4.2, 0, 4.2]) {
    for (const by of [-1.9, 1.9]) {
      const mount = new pc.Entity(`Screen Mount ${bx}_${by}`);
      mount.addComponent('render', { type: 'cylinder', material: mats.trussMetal, castShadows: false, receiveShadows: false });
      mount.setLocalPosition(bx, by, -0.12);
      mount.setLocalEulerAngles(90, 0, 0);
      mount.setLocalScale(0.16, 0.24, 0.16);
      tvFrame.addChild(mount);
    }
  }
  // Black Titanium Cabinet + Amber Halo Backlight + Champagne Gold Frame + Anodized Bezel + Screen
  tvFrame.addChild(createBox('Screen Titanium Cabinet', [0, 0, -0.04], [10.75, 6.15, 0.14], mats.stageDark, { castShadows: true }));
  tvFrame.addChild(createBox('Screen Halo Backlight', [0, 0, -0.1], [11.0, 6.4, 0.04], mats.ledGold));
  tvFrame.addChild(createBox('Screen Gold Trim', [0, 0, 0.02], [10.58, 6.0, 0.03], mats.brass));
  tvFrame.addChild(createBox('Screen Anodized Bezel', [0, 0, 0.03], [10.46, 5.9, 0.02], mats.screenBlack));
  tvFrame.addChild(createBox('LED Screen Panel', [0, 0, 0.042], [10.4, 5.85, 0.01], mats.mainScreenPoster));

  // 4x PF_PA_Speaker (Shared GLB Container)
  const speakerUrl = '/models/pa-speaker.glb';
  const speakerBuf = await fetchBuffer(speakerUrl);
  const speakerAssetId = assetIdByUrl.get(speakerUrl);
  for (const sx of [-6.45, 6.45]) {
    for (const sz of [-15.47, -9.7]) {
      const loaded = await loadGlbFromArrayBuffer(app, speakerBuf, 'pa-speaker.glb', speakerAssetId ?? speakerUrl);
      engine.registerExternalResources(loaded.destroyResources);
      const spk = loaded.entity;
      enhanceGlbMaterials(engine, spk, speakerUrl, cache);
      spk.name = `PF_PA_Speaker (${sx < 0 ? 'L' : 'R'} ${sz < -12 ? 'Back' : 'Front'})`;
      spk.setLocalPosition(sx, 0.36, sz);
      spk.setLocalScale(1.08, 1.08, 1.08);
      if (speakerAssetId) {
        getEntityMeta(spk).render = { meshAssetId: speakerAssetId };
      }
      mainStage.addChild(spk);
    }
  }

  // 5x PF_Fresnel_LED (Shared GLB Container)
  const fresnelUrl = '/models/fresnel-led.glb';
  const fresnelBuf = await fetchBuffer(fresnelUrl);
  const fresnelAssetId = assetIdByUrl.get(fresnelUrl);
  const fresnelY = 6.22 - 0.502 * 1.55;
  for (const fx of [-6, -3, 0, 3, 6]) {
    const loaded = await loadGlbFromArrayBuffer(app, fresnelBuf, 'fresnel-led.glb', fresnelAssetId ?? fresnelUrl);
    engine.registerExternalResources(loaded.destroyResources);
    const fr = loaded.entity;
    enhanceGlbMaterials(engine, fr, fresnelUrl, cache, (mat) => {
      if ((mat.name || '').toLowerCase().includes('bulb')) {
        mat.emissive = new pc.Color().fromString('#ffd089');
        mat.emissiveIntensity = 2.2;
        mat.update();
      }
    });
    fr.name = `PF_Fresnel_LED_${fx}`;
    fr.setLocalPosition(fx, fresnelY, -8.15);
    fr.setLocalScale(1.55, 1.55, 1.55);
    fr.lookAt(fx * 0.25, 0.42, -11.6);
    if (fresnelAssetId) {
      getEntityMeta(fr).render = { meshAssetId: fresnelAssetId };
    }
    if (fx === 0) {
      const spot = new pc.Entity('Stage Center Spot');
      spot.addComponent('light', {
        type: 'spot',
        color: new pc.Color(1, 0.54, 0.29),
        intensity: 4.5,
        range: 18,
        innerConeAngle: 20,
        outerConeAngle: 40,
        castShadows: false,
      });
      spot.setLocalEulerAngles(-90, 0, 0);
      fr.addChild(spot);
    }
    mainStage.addChild(fr);
  }

  // ── 2. Acoustic Stage (Right Live Stage) ──
  const acousticStage = new pc.Entity('Acoustic_Stage');
  sceneRoot.addChild(acousticStage);

  acousticStage.addChild(
    createBox('Acoustic Stage Deck', [16.915, 0.18, 3], [3.93, 0.36, 9.4], mats.stageDark, {
      castShadows: true,
      collider: true,
    })
  );
  acousticStage.addChild(
    createBox('Acoustic Stage Step', [14.675, 0.09, 3], [0.55, 0.18, 8.8], mats.stageStep2, {
      castShadows: true,
      collider: true,
    })
  );
  acousticStage.addChild(createBox('Acoustic LED Strip Step', [14.4, 0.196, 3], [0.02, 0.02, 8.8], mats.ledGold));
  acousticStage.addChild(createBox('Acoustic LED Strip Deck', [14.95, 0.382, 3], [0.02, 0.02, 9.4], mats.ledGold));

  const gigUrl = '/models/every_other_gig_ever.glb';
  const gigBuf = await fetchBuffer(gigUrl);
  const gigAssetId = assetIdByUrl.get(gigUrl);
  const gigLoaded = await loadGlbFromArrayBuffer(app, gigBuf, 'every_other_gig_ever.glb', gigAssetId ?? gigUrl);
  engine.registerExternalResources(gigLoaded.destroyResources);
  const gig = gigLoaded.entity;
  enhanceGlbMaterials(engine, gig, gigUrl, cache);
  hideGigRoomShell(gig);
  gig.name = 'Acoustic Live Band Gear';
  gig.setLocalPosition(16.414, -0.245, 2.335);
  gig.setLocalEulerAngles(0, -90, 0);
  gig.setLocalScale(0.14, 0.14, 0.14);
  if (gigAssetId) {
    getEntityMeta(gig).render = { meshAssetId: gigAssetId };
  }
  acousticStage.addChild(gig);

  // 2x PF_LED_Board with live video texture (`/media/bello-ballo.mp4`)
  const videoHandle = createVideoScreenMaterial(app, '/media/bello-ballo.mp4');
  engine.registerExternalResources(videoHandle.destroy);

  const boardW = 2.72;
  const boardH = 3.4;
  const boardRail = 0.1;
  const boardGasket = 0.05;
  const outerW = boardW + (boardRail + boardGasket) * 2;
  const outerH = boardH + (boardRail + boardGasket) * 2;
  const sideH = outerH - boardRail * 2;
  const railY = outerH / 2 - boardRail / 2;
  const railX = outerW / 2 - boardRail / 2;

  for (const bz of [-4, 10]) {
    const board = new pc.Entity(`PF_LED_Board_${bz}`);
    board.setLocalPosition(18.74, 3.15, bz);
    board.setLocalEulerAngles(0, -90, 0);
    board.addChild(createBox('LED Cabinet', [0, 0, 0], [outerW, outerH, 0.08], mats.cabinetDark, { castShadows: true }));
    board.addChild(createBox('Rail Top', [0, railY, 0.05], [outerW, boardRail, 0.035], mats.railMetal));
    board.addChild(createBox('Rail Bottom', [0, -railY, 0.05], [outerW, boardRail, 0.035], mats.railMetal));
    board.addChild(createBox('Rail Left', [-railX, 0, 0.05], [boardRail, sideH, 0.035], mats.railMetal));
    board.addChild(createBox('Rail Right', [railX, 0, 0.05], [boardRail, sideH, 0.035], mats.railMetal));
    board.addChild(createBox('Gasket', [0, 0, 0.045], [boardW + boardGasket * 2, boardH + boardGasket * 2, 0.008], mats.screenBlack));
    board.addChild(createBox('Cyan Glow Bezel', [0, 0, 0.052], [boardW + 0.045, boardH + 0.045, 0.008], mats.cyanBezel));
    board.addChild(createBox('LED Video Screen', [0, 0, 0.06], [boardW, boardH, 0.01], videoHandle.material));
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const bolt = new pc.Entity(`Bolt_${sx}_${sy}`);
      bolt.addComponent('render', { type: 'cylinder', material: mats.boltMetal, castShadows: false, receiveShadows: false });
      bolt.setLocalPosition(sx * (railX - 0.01), sy * (railY - 0.01), 0.072);
      bolt.setLocalEulerAngles(90, 0, 0);
      bolt.setLocalScale(0.036, 0.012, 0.036);
      board.addChild(bolt);
    }
    acousticStage.addChild(board);
  }
}
