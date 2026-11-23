import * as pc from 'playcanvas';
import type { ScriptAttributeValue } from '../../types';
import type { EditorEngine } from '../EditorEngine';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';
import { createVideoScreenMaterial } from '../runtime/VideoTextureManager';
import { getEntityMeta } from './EntityComponentHelper';
import { isMobileSceneDevice } from './CaVanNgheImporter';
import { CINEMA_SCENE_ID, LOBBY_SCENE_ID, TEAROOM_SCENE_ID } from './SceneRegistry';

export interface SharedLoungeMaterials {
  floorWood: pc.StandardMaterial;
  brass: pc.StandardMaterial;
  goldBorder: pc.StandardMaterial;
  rugDark: pc.StandardMaterial;
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

export interface PortalDoorConfig {
  name: string;
  position: [number, number, number];
  rotationY: number;
  title: string;
  subtitle: string;
  accentColor: string;
  targetSceneId: string;
  interactTitle: string;
}

function getDoorSignMeta(targetSceneId: string): {
  title: string;
  subtitle: string;
  accentColor: string;
  signEntityName: string;
} {
  if (targetSceneId === CINEMA_SCENE_ID) {
    return {
      title: 'RẠP CHIẾU PHIM',
      subtitle: 'MAIN STAGE • MÀN HÌNH LED LỚN',
      accentColor: '#38bdf8',
      signEntityName: 'Portal Signboard Cinema',
    };
  }
  if (targetSceneId === TEAROOM_SCENE_ID) {
    return {
      title: 'PHÒNG TRÀ',
      subtitle: 'ACOUSTIC STAGE • HÁT KARAOKE',
      accentColor: '#f59e0b',
      signEntityName: 'Portal Signboard TeaRoom',
    };
  }
  return {
    title: 'SẢNH CHỜ',
    subtitle: 'QUAY LẠI SẢNH CHỜ',
    accentColor: '#e5c07b',
    signEntityName: 'Portal Signboard Lobby',
  };
}

function attachDoorInteractable(
  entity: pc.Entity,
  scriptName: string,
  attributes: ScriptAttributeValue[]
): void {
  const meta = getEntityMeta(entity);
  const compId = meta.componentIds.script ?? crypto.randomUUID();
  meta.componentIds.script = compId;
  meta.script = {
    id: compId,
    type: 'script',
    enabled: true,
    scriptName,
    code: '',
    attributes,
  };
}

function createParquetTexture(
  app: pc.Application,
  trackTexture: (tex: pc.Texture) => void
): pc.Texture {
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
  trackTexture(tex);
  return tex;
}

function createMainScreenPosterTexture(
  app: pc.Application,
  trackTexture: (tex: pc.Texture) => void
): pc.Texture {
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
    ctx.fillText('RẠP CHIẾU PHIM', 512, 255);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8b949e';
    ctx.font = '22px sans-serif';
    ctx.fillText('MAIN STAGE • YOUTUBE & VIDEO IMAX', 512, 325);
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
  trackTexture(tex);
  return tex;
}

function createDoorSignTexture(
  app: pc.Application,
  trackTexture: (tex: pc.Texture) => void,
  title: string,
  subtitle: string,
  accentColor: string
): pc.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 768, 256);
    grad.addColorStop(0, '#12151f');
    grad.addColorStop(0.5, '#1b1f2e');
    grad.addColorStop(1, '#10131c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 768, 256);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 744, 232);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, 724, 212);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(title, 384, 102);

    ctx.shadowBlur = 0;
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 21px sans-serif';
    ctx.fillText(subtitle, 384, 166);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = '16px monospace';
    ctx.fillText('[E] BƯỚC VÀO PHÒNG', 384, 208);
  }

  const tex = new pc.Texture(app.graphicsDevice, {
    width: 768,
    height: 256,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  tex.setSource(canvas);
  trackTexture(tex);
  return tex;
}

function loadRepeatTexture(
  app: pc.Application,
  trackTexture: (tex: pc.Texture) => void,
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
  trackTexture(tex);
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

export function inferLoungeMaterialIdByEntityName(entityName: string): string | undefined {
  switch (entityName) {
    case 'Lounge Floor':
    case 'Lobby Floor':
    case 'TeaRoom Floor':
      return 'lounge:floorWood';
    case 'Wall North (Back)':
      return 'lounge:brickWall:12:2.5';
    case 'Wall West (Bar)':
    case 'Wall West':
    case 'Wall East (Stage)':
    case 'Wall East':
      return 'lounge:brickWall:11:2.5';
    case 'Wall South Left':
    case 'Wall South Right':
    case 'Wall South':
      return 'lounge:brickWall:5.5:2.5';
    case 'Entrance Arch Header':
      return 'lounge:brickWall:1.5:0.7';
    case 'LED Screen Panel':
      return 'lounge:mainScreenPoster';
    case 'LED Video Screen':
      return 'lounge:videoScreen';
    case 'Portal Signboard Cinema':
      return `lounge:doorSign:${CINEMA_SCENE_ID}`;
    case 'Portal Signboard TeaRoom':
      return `lounge:doorSign:${TEAROOM_SCENE_ID}`;
    case 'Portal Signboard Lobby':
      return `lounge:doorSign:${LOBBY_SCENE_ID}`;
    default:
      return undefined;
  }
}

export function applyLoungeMaterialPreset(
  app: pc.Application,
  entity: pc.Entity,
  presetId: string,
  trackTexture: (tex: pc.Texture) => void,
  trackMaterial?: (mat: pc.StandardMaterial) => void,
  trackCleanup?: (fn: () => void) => void
): void {
  if (!entity.render) return;

  if (presetId === 'lounge:videoScreen') {
    const videoHandle = createVideoScreenMaterial(app, '/media/bello-ballo.mp4');
    videoHandle.material.name = 'lounge:videoScreen';
    trackCleanup?.(videoHandle.destroy);
    entity.render.material = videoHandle.material;
    return;
  }

  const mat = entity.render.material;
  if (!(mat instanceof pc.StandardMaterial)) return;
  mat.name = presetId;

  if (presetId === 'lounge:floorWood') {
    mat.diffuseMap = createParquetTexture(app, trackTexture);
    mat.diffuseMapTiling = new pc.Vec2(10, 9);
    mat.update();
    return;
  }

  if (presetId === 'lounge:mainScreenPoster') {
    mat.useLighting = false;
    mat.emissiveMap = createMainScreenPosterTexture(app, trackTexture);
    mat.update();
    return;
  }

  if (presetId.startsWith('lounge:doorSign:')) {
    const targetSceneId = presetId.slice('lounge:doorSign:'.length);
    const meta = getDoorSignMeta(targetSceneId);
    mat.useLighting = false;
    mat.emissive = new pc.Color(1, 1, 1);
    mat.emissiveIntensity = 1.15;
    mat.emissiveMap = createDoorSignTexture(
      app,
      trackTexture,
      meta.title,
      meta.subtitle,
      meta.accentColor
    );
    mat.update();
    trackMaterial?.(mat);
    return;
  }

  if (presetId.startsWith('lounge:brickWall:')) {
    const parts = presetId.split(':');
    const rx = Number(parts[2]) || 12;
    const ry = Number(parts[3]) || 2.5;
    mat.diffuseMapTiling = new pc.Vec2(rx, ry);
    mat.normalMapTiling = new pc.Vec2(rx, ry);
    loadRepeatTexture(app, trackTexture, '/textures/gig_wall_albedo.png', (tex) => {
      mat.diffuse = new pc.Color(0.95, 0.95, 0.95);
      mat.diffuseMap = tex;
      mat.update();
    });
    loadRepeatTexture(app, trackTexture, '/textures/gig_wall_normal.png', (tex) => {
      mat.normalMap = tex;
      mat.bumpiness = 0.7;
      mat.update();
    });
  }
}

export function createSharedLoungeMaterials(engine: EditorEngine): SharedLoungeMaterials {
  const app = engine.getApp();
  const trackTex = (tex: pc.Texture) => engine.registerExternalResources(() => tex.destroy());

  const floorWood = makeMat(engine, { diffuse: [0.85, 0.8, 0.75], metalness: 0.02, gloss: 0.35 });
  floorWood.name = 'lounge:floorWood';
  if (app) {
    floorWood.diffuseMap = createParquetTexture(app, trackTex);
    floorWood.diffuseMapTiling = new pc.Vec2(10, 9);
    floorWood.update();
  }

  const makeBrickWall = (rx: number, ry: number) => {
    const m = makeMat(engine, { diffuse: [0.22, 0.19, 0.18], metalness: 0.06, gloss: 0.12 });
    m.name = `lounge:brickWall:${rx}:${ry}`;
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
    loadRepeatTexture(app, trackTex, '/textures/gig_wall_albedo.png', (tex) => {
      for (const m of brickMats) {
        m.diffuse = new pc.Color(0.95, 0.95, 0.95);
        m.diffuseMap = tex;
        m.update();
      }
    });
    loadRepeatTexture(app, trackTex, '/textures/gig_wall_normal.png', (tex) => {
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
  mainScreenPoster.name = 'lounge:mainScreenPoster';
  if (app) {
    const posterTex = createMainScreenPosterTexture(app, trackTex);
    mainScreenPoster.emissiveMap = posterTex;
    mainScreenPoster.update();
  }

  return {
    floorWood,
    brass: makeMat(engine, { diffuse: [0.773, 0.608, 0.306], metalness: 0.7, gloss: 0.6 }),
    goldBorder: makeMat(engine, { diffuse: [0.831, 0.686, 0.216], metalness: 0.7, gloss: 0.6 }),
    rugDark: makeMat(engine, { diffuse: [0.098, 0.082, 0.075], metalness: 0, gloss: 0.08 }),
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

export function buildScenePortalDoor(
  engine: EditorEngine,
  parent: pc.Entity,
  mats: SharedLoungeMaterials,
  config: PortalDoorConfig
): pc.Entity {
  const app = engine.getApp();
  const trackTex = (tex: pc.Texture) => engine.registerExternalResources(() => tex.destroy());

  const doorEntity = new pc.Entity(config.name);
  doorEntity.setLocalPosition(config.position[0], config.position[1], config.position[2]);
  doorEntity.setLocalEulerAngles(0, config.rotationY, 0);
  doorEntity.tags.add('portal_door', `load_scene:${config.targetSceneId}`);

  attachDoorInteractable(doorEntity, 'Interactable', [
    { name: 'interactId', type: 'string', value: `load_scene:${config.targetSceneId}` },
    { name: 'interactTitle', type: 'string', value: config.interactTitle },
    { name: 'interactDistance', type: 'number', value: 3.4 },
    { name: 'targetSceneId', type: 'string', value: config.targetSceneId },
  ]);

  const accentRgb = new pc.Color().fromString(config.accentColor);
  const accentMat = makeMat(engine, {
    diffuse: [accentRgb.r, accentRgb.g, accentRgb.b],
    emissive: [accentRgb.r, accentRgb.g, accentRgb.b],
    emissiveIntensity: 1.8,
    useLighting: false,
  });

  // Architectural doorway frame
  doorEntity.addChild(createBox('Door Pilaster Left', [-1.55, 1.9, 0], [0.26, 3.8, 0.34], mats.pilasterDark));
  doorEntity.addChild(createBox('Door Pilaster Right', [1.55, 1.9, 0], [0.26, 3.8, 0.34], mats.pilasterDark));
  doorEntity.addChild(createBox('Door Header', [0, 3.65, 0], [3.38, 0.36, 0.36], mats.timberDark));
  doorEntity.addChild(createBox('Door Threshold', [0, 0.015, 0.1], [2.95, 0.03, 0.55], mats.brass));

  // Glowing portal inner trim
  doorEntity.addChild(createBox('Portal Trim Left', [-1.38, 1.75, 0.14], [0.05, 3.45, 0.05], accentMat));
  doorEntity.addChild(createBox('Portal Trim Right', [1.38, 1.75, 0.14], [0.05, 3.45, 0.05], accentMat));
  doorEntity.addChild(createBox('Portal Trim Top', [0, 3.45, 0.14], [2.8, 0.05, 0.05], accentMat));

  // Double door leaves with static collider
  doorEntity.addChild(
    createBox('Door Leaf Left', [-0.67, 1.72, 0], [1.3, 3.4, 0.12], mats.woodBeam, { collider: true })
  );
  doorEntity.addChild(
    createBox('Door Leaf Right', [0.67, 1.72, 0], [1.3, 3.4, 0.12], mats.woodBeam, { collider: true })
  );
  doorEntity.addChild(createBox('Door Handle Left', [-0.15, 1.45, 0.09], [0.05, 0.42, 0.05], mats.brass));
  doorEntity.addChild(createBox('Door Handle Right', [0.15, 1.45, 0.09], [0.05, 0.42, 0.05], mats.brass));

  // Illuminated signboard above the door
  const signMeta = getDoorSignMeta(config.targetSceneId);
  const signPresetId = `lounge:doorSign:${config.targetSceneId}`;
  const signMat = makeMat(engine, {
    diffuse: [0.08, 0.09, 0.12],
    emissive: [1, 1, 1],
    emissiveIntensity: 1.15,
    useLighting: false,
  });
  signMat.name = signPresetId;
  if (app) {
    signMat.emissiveMap = createDoorSignTexture(
      app,
      trackTex,
      config.title,
      config.subtitle,
      config.accentColor
    );
    signMat.update();
  }

  doorEntity.addChild(createBox('Signboard Backing', [0, 4.45, 0.1], [3.35, 1.1, 0.12], mats.cabinetDark));
  doorEntity.addChild(createBox('Signboard Brass Trim', [0, 4.45, 0.15], [3.22, 1.0, 0.05], mats.brass));
  doorEntity.addChild(createBox(signMeta.signEntityName, [0, 4.45, 0.19], [3.08, 0.88, 0.02], signMat));

  // Dedicated portal spotlight
  const spot = new pc.Entity('Portal Spotlight');
  spot.addComponent('light', {
    type: 'spot',
    color: accentRgb,
    intensity: 3.2,
    range: 10,
    innerConeAngle: 24,
    outerConeAngle: 48,
    castShadows: false,
  });
  spot.setLocalPosition(0, 5.4, 2.0);
  spot.lookAt(0, 2.0, 0.2);
  spot.rotateLocal(90, 0, 0);
  doorEntity.addChild(spot);

  parent.addChild(doorEntity);
  return doorEntity;
}

export function buildLobbyEnvironmentShell(
  engine: EditorEngine,
  sceneRoot: pc.Entity,
  mats: SharedLoungeMaterials
): pc.Entity {
  const shell = new pc.Entity('Environment_Shell');
  sceneRoot.addChild(shell);

  // Lobby Floor (26m x 22m)
  const floor = new pc.Entity('Lobby Floor');
  floor.addComponent('render', {
    type: 'plane',
    material: mats.floorWood,
    castShadows: false,
    receiveShadows: true,
  });
  floor.setLocalPosition(0, -0.001, 0);
  floor.setLocalScale(26, 1, 22);
  floor.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(13, 0.05, 11),
  });
  floor.addComponent('rigidbody', {
    type: 'static',
    mass: 0,
    friction: 0.8,
    restitution: 0.1,
  });
  shell.addChild(floor);

  // T-shaped Red Velvet Carpet leading from Spawn to the 2 Portal Doors
  const runnerGroup = new pc.Entity('Red_Velvet_Runner');
  shell.addChild(runnerGroup);
  runnerGroup.addChild(createBox('Center Velvet Stem', [0, 0.006, 2.0], [2.4, 0.004, 12.0], mats.velvetRed));
  runnerGroup.addChild(createBox('Center Brass Left', [-1.24, 0.007, 2.0], [0.08, 0.004, 12.0], mats.goldBorder));
  runnerGroup.addChild(createBox('Center Brass Right', [1.24, 0.007, 2.0], [0.08, 0.004, 12.0], mats.goldBorder));

  runnerGroup.addChild(createBox('Cross Velvet Branch', [0, 0.006, -4.4], [11.4, 0.004, 2.0], mats.velvetRed));
  runnerGroup.addChild(createBox('Left Door Velvet', [-4.5, 0.006, -7.2], [2.2, 0.004, 6.2], mats.velvetRed));
  runnerGroup.addChild(createBox('Right Door Velvet', [4.5, 0.006, -7.2], [2.2, 0.004, 6.2], mats.velvetRed));

  // Walls
  const walls = new pc.Entity('Walls');
  shell.addChild(walls);
  walls.addChild(createBox('Wall North (Back)', [0, 3.5, -10.9], [26, 7.0, 0.2], mats.brickWall38, { collider: true }));
  walls.addChild(createBox('Wall South', [0, 3.5, 10.9], [26, 7.0, 0.2], mats.brickWall38, { collider: true }));
  walls.addChild(createBox('Wall West', [-12.9, 3.5, 0], [0.2, 7.0, 22], mats.brickWall34, { collider: true }));
  walls.addChild(createBox('Wall East', [12.9, 3.5, 0], [0.2, 7.0, 22], mats.brickWall34, { collider: true }));

  // Baseboards & Crown Moldings
  walls.addChild(createBox('Baseboard North', [0, 0.11, -10.78], [25.6, 0.22, 0.05], mats.timberDark));
  walls.addChild(createBox('Baseboard South', [0, 0.11, 10.78], [25.6, 0.22, 0.05], mats.timberDark));
  walls.addChild(createBox('Baseboard West', [-12.78, 0.11, 0], [0.05, 0.22, 21.6], mats.timberDark));
  walls.addChild(createBox('Baseboard East', [12.78, 0.11, 0], [0.05, 0.22, 21.6], mats.timberDark));

  // Coffered Ceiling (Y = 7.0m) + Beams + Downlights
  const ceiling = new pc.Entity('Ceiling_Coffered');
  shell.addChild(ceiling);
  ceiling.addChild(createBox('Ceiling Slab', [0, 7.05, 0], [26, 0.1, 22], mats.ceilingDark));

  for (const x of [-8, 0, 8]) {
    ceiling.addChild(createBox(`Beam Long ${x}`, [x, 6.82, 0], [0.35, 0.36, 22], mats.woodBeam, { castShadows: true }));
  }
  for (const z of [-6, 0, 6]) {
    ceiling.addChild(createBox(`Beam Trans ${z}`, [0, 6.82, z], [26, 0.36, 0.35], mats.woodBeam, { castShadows: true }));
  }

  for (const x of [-8, 0, 8]) {
    for (const z of [-6, 0, 6]) {
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

  // 2 Portal Doors on North Wall
  const portals = new pc.Entity('Portal_Doors');
  sceneRoot.addChild(portals);

  buildScenePortalDoor(engine, portals, mats, {
    name: 'Portal_Door_Cinema',
    position: [-4.5, 0, -10.65],
    rotationY: 0,
    title: 'RẠP CHIẾU PHIM',
    subtitle: 'MAIN STAGE • MÀN HÌNH LED LỚN',
    accentColor: '#38bdf8',
    targetSceneId: CINEMA_SCENE_ID,
    interactTitle: 'Rạp Chiếu Phim',
  });

  buildScenePortalDoor(engine, portals, mats, {
    name: 'Portal_Door_TeaRoom',
    position: [4.5, 0, -10.65],
    rotationY: 0,
    title: 'PHÒNG TRÀ',
    subtitle: 'ACOUSTIC STAGE • HÁT KARAOKE',
    accentColor: '#f59e0b',
    targetSceneId: TEAROOM_SCENE_ID,
    interactTitle: 'Phòng Trà Acoustic',
  });

  // Central Lobby Hub Kiosk in front of the 2 doors (Rooms, Account & Avatar Color)
  const kiosk = new pc.Entity('Lobby_Hub_Kiosk');
  kiosk.setLocalPosition(0, 0, -6.2);
  sceneRoot.addChild(kiosk);

  kiosk.addChild(createBox('Kiosk Base', [0, 0.52, 0], [1.9, 1.04, 0.78], mats.stageDark, { castShadows: true, collider: true }));
  kiosk.addChild(createBox('Kiosk Velvet Front', [0, 0.5, 0.4], [1.7, 0.82, 0.03], mats.velvetRed));
  kiosk.addChild(createBox('Kiosk Counter', [0, 1.06, 0], [2.04, 0.08, 0.92], mats.timberDark, { castShadows: true }));
  kiosk.addChild(createBox('Kiosk Brass Trim', [0, 1.04, 0.46], [2.06, 0.04, 0.04], mats.goldBorder));
  kiosk.addChild(createBox('Kiosk LED Accent', [0, 0.03, 0.41], [1.88, 0.03, 0.03], mats.ledGold));

  const kioskScreenMat = makeMat(engine, {
    diffuse: [0.06, 0.07, 0.1],
    emissive: [1, 1, 1],
    emissiveIntensity: 1.25,
    useLighting: false,
  });
  kioskScreenMat.name = 'lounge:kioskSign';
  const app = engine.getApp();
  if (app) {
    const tex = createDoorSignTexture(
      app,
      (t) => engine.registerExternalResources(() => t.destroy()),
      'QUẦY LOBBY & NHÂN VẬT',
      'ĐỔI PHÒNG • TÀI KHOẢN • ĐỔI MÀU',
      '#e5c07b'
    );
    kioskScreenMat.emissiveMap = tex;
    kioskScreenMat.update();
  }
  kiosk.addChild(createBox('Kiosk Stand Left', [-0.72, 1.38, -0.15], [0.08, 0.62, 0.08], mats.brass));
  kiosk.addChild(createBox('Kiosk Stand Right', [0.72, 1.38, -0.15], [0.08, 0.62, 0.08], mats.brass));
  kiosk.addChild(createBox('Kiosk Board Frame', [0, 1.68, -0.12], [1.72, 0.66, 0.06], mats.brass));
  kiosk.addChild(createBox('Kiosk Board Screen', [0, 1.68, -0.08], [1.62, 0.56, 0.02], kioskScreenMat));

  attachDoorInteractable(kiosk, 'Interactable', [
    { name: 'interactId', type: 'string', value: 'lobby_hub_kiosk' },
    { name: 'interactTitle', type: 'string', value: 'Quầy Lobby & Nhân Vật' },
    { name: 'interactDistance', type: 'number', value: 3.4 },
  ]);

  return shell;
}

export function buildCinemaEnvironmentShell(
  engine: EditorEngine,
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

  // Grand Red Velvet Runner + Gold Borders leading to Main Stage
  const runnerGroup = new pc.Entity('Red_Velvet_Runner');
  runnerGroup.setLocalPosition(0, 0.006, 4.0);
  runnerGroup.addChild(createBox('Velvet Body', [0, 0, 0], [2.6, 0.004, 24.0], mats.velvetRed));
  runnerGroup.addChild(createBox('Gold Border Left', [-1.24, 0.002, 0], [0.08, 0.004, 24.0], mats.goldBorder));
  runnerGroup.addChild(createBox('Gold Border Right', [1.24, 0.002, 0], [0.08, 0.004, 24.0], mats.goldBorder));
  shell.addChild(runnerGroup);

  // Walls (Back, West, East, South)
  const walls = new pc.Entity('Walls');
  shell.addChild(walls);
  walls.addChild(createBox('Wall North (Back)', [0, 3.5, -16.9], [38, 7.0, 0.2], mats.brickWall38, { collider: true }));
  walls.addChild(createBox('Wall West', [-18.9, 3.5, 0], [0.2, 7.0, 34], mats.brickWall34, { collider: true }));
  walls.addChild(createBox('Wall East', [18.9, 3.5, 0], [0.2, 7.0, 34], mats.brickWall34, { collider: true }));
  walls.addChild(createBox('Wall South Left', [-10.5, 3.5, 16.9], [17, 7.0, 0.2], mats.brickWall17, { collider: true }));
  walls.addChild(createBox('Wall South Right', [10.5, 3.5, 16.9], [17, 7.0, 0.2], mats.brickWall17, { collider: true }));
  walls.addChild(createBox('Entrance Arch Header', [0, 6.0, 16.9], [4.2, 2.0, 0.2], mats.brickWallArch));
  walls.addChild(createBox('Entrance Pilaster Left', [-2.1, 2.5, 16.8], [0.2, 5.0, 0.3], mats.pilasterDark));
  walls.addChild(createBox('Entrance Pilaster Right', [2.1, 2.5, 16.8], [0.2, 5.0, 0.3], mats.pilasterDark));
  walls.addChild(createBox('Entrance Threshold', [0, 0.01, 16.8], [4.2, 0.02, 0.3], mats.brass));

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

  // Portal Door back to Lobby at South entrance
  const portals = new pc.Entity('Portal_Doors');
  sceneRoot.addChild(portals);
  buildScenePortalDoor(engine, portals, mats, {
    name: 'Portal_Door_Lobby',
    position: [0, 0, 16.65],
    rotationY: 180,
    title: 'SẢNH CHỜ',
    subtitle: 'QUAY LẠI SẢNH CHỜ',
    accentColor: '#e5c07b',
    targetSceneId: LOBBY_SCENE_ID,
    interactTitle: 'Về Sảnh Chờ',
  });

  return shell;
}

export function buildTeaRoomEnvironmentShell(
  engine: EditorEngine,
  sceneRoot: pc.Entity,
  mats: SharedLoungeMaterials
): pc.Entity {
  const shell = new pc.Entity('Environment_Shell');
  sceneRoot.addChild(shell);

  // Tea Room Floor (24m x 24m centered at X=6.9, Z=3.0 so Acoustic_Stage sits flush on East wall X=18.9)
  const floor = new pc.Entity('TeaRoom Floor');
  floor.addComponent('render', {
    type: 'plane',
    material: mats.floorWood,
    castShadows: false,
    receiveShadows: true,
  });
  floor.setLocalPosition(6.9, -0.001, 3.0);
  floor.setLocalScale(24, 1, 24);
  floor.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(12, 0.05, 12),
  });
  floor.addComponent('rigidbody', {
    type: 'static',
    mass: 0,
    friction: 0.8,
    restitution: 0.1,
  });
  shell.addChild(floor);

  // Red Velvet Runner leading from West entrance door toward Acoustic Stage
  const runnerGroup = new pc.Entity('Red_Velvet_Runner');
  runnerGroup.setLocalPosition(4.8, 0.006, 3.0);
  runnerGroup.addChild(createBox('Velvet Body', [0, 0, 0], [18.4, 0.004, 2.4], mats.velvetRed));
  runnerGroup.addChild(createBox('Gold Border North', [0, 0.002, -1.24], [18.4, 0.004, 0.08], mats.goldBorder));
  runnerGroup.addChild(createBox('Gold Border South', [0, 0.002, 1.24], [18.4, 0.004, 0.08], mats.goldBorder));
  shell.addChild(runnerGroup);

  // Walls (X: -5.1 .. 18.9, Z: -9.0 .. 15.0)
  const walls = new pc.Entity('Walls');
  shell.addChild(walls);
  walls.addChild(createBox('Wall East (Stage)', [18.9, 3.5, 3.0], [0.2, 7.0, 24], mats.brickWall34, { collider: true }));
  walls.addChild(createBox('Wall West', [-5.1, 3.5, 3.0], [0.2, 7.0, 24], mats.brickWall34, { collider: true }));
  walls.addChild(createBox('Wall North (Back)', [6.9, 3.5, -9.0], [24, 7.0, 0.2], mats.brickWall38, { collider: true }));
  walls.addChild(createBox('Wall South', [6.9, 3.5, 15.0], [24, 7.0, 0.2], mats.brickWall38, { collider: true }));

  walls.addChild(createBox('Baseboard East', [18.78, 0.11, 3.0], [0.05, 0.22, 23.6], mats.timberDark));
  walls.addChild(createBox('Baseboard West', [-4.98, 0.11, 3.0], [0.05, 0.22, 23.6], mats.timberDark));
  walls.addChild(createBox('Baseboard North', [6.9, 0.11, -8.88], [23.6, 0.22, 0.05], mats.timberDark));
  walls.addChild(createBox('Baseboard South', [6.9, 0.11, 14.88], [23.6, 0.22, 0.05], mats.timberDark));

  // Coffered Ceiling (Y = 7.0m)
  const ceiling = new pc.Entity('Ceiling_Coffered');
  shell.addChild(ceiling);
  ceiling.addChild(createBox('Ceiling Slab', [6.9, 7.05, 3.0], [24, 0.1, 24], mats.ceilingDark));

  for (const x of [0.9, 6.9, 12.9]) {
    ceiling.addChild(createBox(`Beam Long ${x}`, [x, 6.82, 3.0], [0.35, 0.36, 24], mats.woodBeam, { castShadows: true }));
  }
  for (const z of [-3, 3, 9]) {
    ceiling.addChild(createBox(`Beam Trans ${z}`, [6.9, 6.82, z], [24, 0.36, 0.35], mats.woodBeam, { castShadows: true }));
  }

  for (const x of [0.9, 6.9, 12.9]) {
    for (const z of [-3, 3, 9]) {
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

  // Portal Door back to Lobby on West wall facing East (+X) toward Acoustic Stage
  const portals = new pc.Entity('Portal_Doors');
  sceneRoot.addChild(portals);
  buildScenePortalDoor(engine, portals, mats, {
    name: 'Portal_Door_Lobby',
    position: [-4.85, 0, 3.0],
    rotationY: 90,
    title: 'SẢNH CHỜ',
    subtitle: 'QUAY LẠI SẢNH CHỜ',
    accentColor: '#e5c07b',
    targetSceneId: LOBBY_SCENE_ID,
    interactTitle: 'Về Sảnh Chờ',
  });

  return shell;
}

export function buildLightingRig(
  sceneRoot: pc.Entity,
  variant: 'lobby' | 'cinema' | 'tearoom'
): pc.Entity {
  const rig = new pc.Entity('Lighting_Rig');
  sceneRoot.addChild(rig);

  const isMobile = isMobileSceneDevice();
  const dirLight = new pc.Entity('Directional Light');
  dirLight.addComponent('light', {
    type: 'directional',
    color: new pc.Color(0.85, 0.72, 0.58),
    intensity: 0.18,
    castShadows: true,
    shadowBias: 0.2,
    normalOffsetBias: 0.05,
    shadowDistance: 45,
    shadowResolution: isMobile ? 512 : 1024,
  });
  dirLight.setLocalPosition(15, 18, 12);
  dirLight.lookAt(variant === 'tearoom' ? 6.9 : 0, 0, variant === 'tearoom' ? 3.0 : 0);
  rig.addChild(dirLight);

  const addSpot = (
    name: string,
    pos: [number, number, number],
    target: [number, number, number],
    hexColor: string,
    intensity: number,
    range = 18,
    sweepBeam = false
  ) => {
    const spot = new pc.Entity(name);
    const pcColor = new pc.Color().fromString(hexColor);
    spot.addComponent('light', {
      type: 'spot',
      color: pcColor,
      intensity,
      range,
      innerConeAngle: sweepBeam ? 14 : 20,
      outerConeAngle: sweepBeam ? 28 : 38,
      castShadows: false,
    });
    spot.setLocalPosition(pos[0], pos[1], pos[2]);
    // PlayCanvas spot lights shine along local -Y; lookAt aims -Z, so rotateLocal(+90, 0, 0) aims -Y at target
    spot.lookAt(target[0], target[1], target[2]);
    spot.rotateLocal(90, 0, 0);
    if (sweepBeam) {
      spot.tags.add('stage_sweep');
    }
    rig.addChild(spot);
  };

  if (variant === 'lobby') {
    const lobbyCenter = new pc.Entity('Lobby Center PointLight');
    lobbyCenter.addComponent('light', {
      type: 'point',
      color: new pc.Color().fromString('#ffe0b2'),
      intensity: 1.8,
      range: 20,
      castShadows: false,
    });
    lobbyCenter.setLocalPosition(0, 5.4, 0);
    rig.addChild(lobbyCenter);

    addSpot('Portal Cinema Spot', [-4.5, 5.5, -6.5], [-4.5, 1.5, -10.5], '#ffb74d', 3.2, 14);
    addSpot('Portal TeaRoom Spot', [4.5, 5.5, -6.5], [4.5, 1.5, -10.5], '#ffb74d', 3.2, 14);
  } else if (variant === 'cinema') {
    const stageScreenGlow = new pc.Entity('Stage Screen PointLight');
    stageScreenGlow.addComponent('light', {
      type: 'point',
      color: new pc.Color().fromString('#ffb74d'),
      intensity: 1.6,
      range: 14,
      castShadows: false,
    });
    stageScreenGlow.setLocalPosition(0, 3.3, -14.62);
    rig.addChild(stageScreenGlow);

    const hallPoint = new pc.Entity('Cinema Hall PointLight');
    hallPoint.addComponent('light', {
      type: 'point',
      color: new pc.Color().fromString('#ffd180'),
      intensity: 1.25,
      range: 22,
      castShadows: false,
    });
    hallPoint.setLocalPosition(0, 5.2, 2.0);
    rig.addChild(hallPoint);

    // Clean overhead Fresnel stage spotlights (aimed properly along -Y)
    addSpot('Stage Fresnel Left', [-5.0, 5.9, -8.5], [-3.5, 0.6, -12.8], '#ffb15a', 2.2, 18, true);
    addSpot('Stage Fresnel Center', [0, 5.9, -8.2], [0, 0.8, -12.8], '#ffd8a8', 2.5, 18, true);
    addSpot('Stage Fresnel Right', [5.0, 5.9, -8.5], [3.5, 0.6, -12.8], '#ff9e5e', 2.2, 18, true);
  } else {
    const acousticGlow = new pc.Entity('Acoustic Stage PointLight');
    acousticGlow.addComponent('light', {
      type: 'point',
      color: new pc.Color().fromString('#ffb74d'),
      intensity: 0.35,
      range: 12,
      castShadows: false,
    });
    acousticGlow.setLocalPosition(15.4, 4.2, 3.0);
    rig.addChild(acousticGlow);

    const teaCenterGlow = new pc.Entity('TeaRoom Center PointLight');
    teaCenterGlow.addComponent('light', {
      type: 'point',
      color: new pc.Color().fromString('#ffd8a8'),
      intensity: 1.15,
      range: 20,
      castShadows: false,
    });
    teaCenterGlow.setLocalPosition(5.5, 4.8, 3.0);
    rig.addChild(teaCenterGlow);

    // Moody Acoustic Stage lighting: soft warm center key + 2 subtle sweeping front-truss spots
    addSpot('Acoustic Center Key', [13.5, 4.8, 3.0], [16.6, 1.1, 3.0], '#ffd4a3', 1.4, 15, false);
    addSpot('Acoustic Fresnel North', [14.2, 4.5, 0.8], [17.2, 1.2, 1.5], '#ffd8a8', 2.0, 15, true);
    addSpot('Acoustic Fresnel South', [14.2, 4.5, 5.2], [17.2, 1.2, 4.5], '#ffb15a', 2.0, 15, true);
  }

  return rig;
}

export type GlbMaterialCache = Map<string, Map<pc.Material, pc.StandardMaterial>>;

function setMaterialRoughness(mat: pc.StandardMaterial, roughness: number): void {
  mat.gloss = mat.glossInvert ? roughness : 1 - roughness;
}

function getMaterialRoughness(mat: pc.StandardMaterial): number {
  return mat.glossInvert ? mat.gloss : 1 - mat.gloss;
}

function enhanceStandardMaterial(
  mat: pc.StandardMaterial,
  url = '',
  meshName = ''
): void {
  const matName = (mat.name || '').toLowerCase();
  const mName = (meshName || '').toLowerCase();
  const u = (url || '').toLowerCase();

  if (matName.includes('leaves') || mName.includes('leaves')) {
    mat.diffuse = new pc.Color().fromString('#2d5a27');
    setMaterialRoughness(mat, 0.65);
    mat.useMetalness = true;
    mat.metalness = 0.0;
    mat.cull = pc.CULLFACE_NONE;
    mat.update();
    return;
  }

  if (matName.includes('bark') || mName.includes('bark')) {
    mat.diffuse = new pc.Color().fromString('#3d2a1d');
    setMaterialRoughness(mat, 0.85);
    mat.useMetalness = true;
    mat.metalness = 0.05;
    mat.update();
    return;
  }

  if (!mat.diffuseMap && mat.diffuse && mat.diffuse.r > 0.72 && mat.diffuse.g > 0.72 && mat.diffuse.b > 0.72) {
    mat.diffuse = new pc.Color().fromString('#2e2824');
    setMaterialRoughness(mat, 0.70);
    mat.useMetalness = true;
    mat.metalness = 0.02;
    mat.update();
    return;
  }

  if (!u.includes('character') && (!mat.metalness || mat.metalness < 0.65)) {
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
      mi.cull = false;
    }
  }
}

export function hideGigRoomShell(gigRoot: pc.Entity): void {
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
        matName.includes('mic') ||
        matName.includes('cable') ||
        lowerName.includes('wall') ||
        lowerName.includes('ceiling') ||
        lowerName.includes('bound') ||
        lowerName.includes('table') ||
        lowerName.includes('mannequin') ||
        lowerName.includes('crate') ||
        lowerName.includes('mic') ||
        lowerName.includes('cable') ||
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

/**
 * Builds ONLY Main_Stage for Cinema_Scene (does NOT fetch or create Acoustic_Stage).
 */
export async function buildMainStageOnly(
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

  mainStage.addChild(createBox('Stage Carpet Step 1', [0, 0.125, -7.805], [2.6, 0.008, 0.42], mats.velvetRed));
  mainStage.addChild(createBox('Stage Carpet Step 2', [0, 0.245, -8.255], [2.6, 0.008, 0.42], mats.velvetRed));
  mainStage.addChild(createBox('Stage Carpet Deck', [0, 0.365, -12.0], [2.6, 0.008, 6.9], mats.velvetRed));

  mainStage.addChild(createBox('LED Strip Step 1', [0, 0.136, -7.57], [14.6, 0.02, 0.02], mats.ledGold));
  mainStage.addChild(createBox('LED Strip Step 2', [0, 0.256, -8.02], [14.8, 0.02, 0.02], mats.ledGold));
  mainStage.addChild(createBox('LED Strip Stage', [0, 0.382, -8.47], [15.0, 0.02, 0.02], mats.ledGold));

  const truss = new pc.Entity('Stage Lighting Truss');
  truss.addComponent('render', { type: 'cylinder', material: mats.trussMetal, castShadows: false, receiveShadows: false });
  truss.setLocalPosition(0, 6.3, -8.2);
  truss.setLocalEulerAngles(0, 0, 90);
  truss.setLocalScale(0.16, 15, 0.16);
  mainStage.addChild(truss);

  const tvFrame = new pc.Entity('Main Stage LED Screen');
  tvFrame.setLocalPosition(0, 3.9, -16.82);
  mainStage.addChild(tvFrame);

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
  tvFrame.addChild(createBox('Screen Titanium Cabinet', [0, 0, -0.04], [10.75, 6.15, 0.14], mats.stageDark, { castShadows: true }));
  tvFrame.addChild(createBox('Screen Halo Backlight', [0, 0, -0.1], [11.0, 6.4, 0.04], mats.ledGold));
  tvFrame.addChild(createBox('Screen Gold Trim', [0, 0, 0.02], [10.58, 6.0, 0.03], mats.brass));
  tvFrame.addChild(createBox('Screen Anodized Bezel', [0, 0, 0.03], [10.46, 5.9, 0.02], mats.screenBlack));

  const screenPanel = createBox('LED Screen Panel', [0, 0, 0.042], [10.4, 5.85, 0.01], mats.mainScreenPoster);
  attachDoorInteractable(screenPanel, 'Interactable', [
    { name: 'interactId', type: 'string', value: 'stage_screen' },
    { name: 'interactTitle', type: 'string', value: 'Màn Hình LED Rạp Phim (YouTube)' },
    { name: 'interactDistance', type: 'number', value: 12.0 },
  ]);
  tvFrame.addChild(screenPanel);

  // 4x PF_PA_Speaker
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

  // 5x PF_Fresnel_LED
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
}

/**
 * Builds ONLY Acoustic_Stage for TeaRoom_Scene (does NOT fetch or create Main_Stage).
 */
export async function buildAcousticStageOnly(
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

  const isMobile = isMobileSceneDevice();
  const gigUrl = isMobile
    ? '/models/every_other_gig_ever_mobile.glb'
    : '/models/every_other_gig_ever.glb';
  const gigFileName = isMobile ? 'every_other_gig_ever_mobile.glb' : 'every_other_gig_ever.glb';
  const gigBuf = await fetchBuffer(gigUrl);
  const gigAssetId = assetIdByUrl.get(gigUrl);
  const gigLoaded = await loadGlbFromArrayBuffer(app, gigBuf, gigFileName, gigAssetId ?? gigUrl);
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
  videoHandle.material.name = 'lounge:videoScreen';
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

/**
 * Builds focused stage-only decoration for TeaRoom_Scene using real PBR GLB stage equipment
 * that complements the sculpted red velvet curtain & band gear in `every_other_gig_ever.glb`:
 * - 1x Front-center MicStand aligned with the singer spot
 * - Slim matte-black overhead lighting pipe with 5x real Fresnel LED spotlights aimed at the stage
 * - 2x warm curtain uplights grazing the stage red velvet backdrop
 */
export async function buildTeaRoomGalaTheatreDeco(
  engine: EditorEngine,
  sceneRoot: pc.Entity,
  mats: SharedLoungeMaterials,
  fetchBuffer: (url: string) => Promise<ArrayBuffer>,
  assetIdByUrl: Map<string, string>,
  matCache?: GlbMaterialCache
): Promise<pc.Entity> {
  const app = engine.getApp();
  const root = new pc.Entity('Gala_Stage_Deco');
  sceneRoot.addChild(root);
  if (!app) return root;

  const cache = matCache ?? new Map<string, Map<pc.Material, pc.StandardMaterial>>();

  const [fresnelBuf, micStandBuf] = await Promise.all([
    fetchBuffer('/models/fresnel-led.glb'),
    fetchBuffer('/models/MicStand.glb'),
  ]);

  const spawnGlb = async (
    url: string,
    buf: ArrayBuffer,
    name: string,
    pos: [number, number, number],
    rot: [number, number, number],
    scale: [number, number, number],
    customizeMat?: (mat: pc.StandardMaterial) => void
  ): Promise<pc.Entity> => {
    const filename = url.split('/').pop() || 'model.glb';
    const assetId = assetIdByUrl.get(url);
    const loaded = await loadGlbFromArrayBuffer(app, buf, filename, assetId ?? url);
    engine.registerExternalResources(loaded.destroyResources);
    const entity = loaded.entity;
    enhanceGlbMaterials(engine, entity, url, cache, customizeMat);
    entity.name = name;
    entity.setLocalPosition(pos[0], pos[1], pos[2]);
    entity.setLocalEulerAngles(rot[0], rot[1], rot[2]);
    entity.setLocalScale(scale[0], scale[1], scale[2]);
    if (assetId) {
      getEntityMeta(entity).render = { meshAssetId: assetId };
    }
    return entity;
  };

  // 1. Front-center MicStand right in front of singer position (15.65, 0.36, 3.0)
  const micStand = await spawnGlb(
    '/models/MicStand.glb',
    micStandBuf,
    'Acoustic_Front_MicStand',
    [15.18, 0.36, 3.0],
    [0, -90, 0],
    [1, 1, 1]
  );
  root.addChild(micStand);

  // 2. Slim matte-black overhead front lighting pipe & 5x real Fresnel LED spotlights
  root.addChild(createBox('Acoustic Front Pipe', [12.6, 6.22, 3.0], [0.1, 0.1, 10.2], mats.trussMetal));
  for (const rz of [-1.8, 7.8]) {
    root.addChild(createBox(`Acoustic Pipe Hanger ${rz}`, [12.6, 6.61, rz], [0.05, 0.78, 0.05], mats.trussMetal));
  }
  for (const fz of [-0.6, 1.2, 3.0, 4.8, 6.6]) {
    const fr = await spawnGlb(
      '/models/fresnel-led.glb',
      fresnelBuf,
      `Acoustic_Fresnel_${fz}`,
      [12.6, 5.45, fz],
      [0, 0, 0],
      [1.35, 1.35, 1.35],
      (mat) => {
        if ((mat.name || '').toLowerCase().includes('bulb')) {
          mat.emissive = new pc.Color().fromString('#ffd089');
          mat.emissiveIntensity = 2.2;
          mat.update();
        }
      }
    );
    fr.lookAt(16.2, 0.8, fz * 0.65 + 1.05);
    root.addChild(fr);
  }

  // 4. Warm curtain uplights grazing the stage velvet backdrop for depth
  for (const [label, uz] of [
    ['North', -0.2],
    ['South', 6.2],
  ] as const) {
    const uplight = new pc.Entity(`Stage_Curtain_Uplight_${label}`);
    uplight.addComponent('light', {
      type: 'spot',
      color: new pc.Color().fromString('#ffae52'),
      intensity: 2.4,
      range: 10,
      innerConeAngle: 24,
      outerConeAngle: 52,
      castShadows: false,
    });
    uplight.setLocalPosition(17.5, 0.55, uz);
    uplight.lookAt(18.5, 4.2, uz);
    root.addChild(uplight);
  }

  return root;
}
