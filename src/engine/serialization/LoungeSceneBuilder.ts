import * as pc from 'playcanvas';
import type { EditorEngine } from '../EditorEngine';
import { loadGlbFromArrayBuffer } from '../animation/GlbAnimExtractor';
import { createVideoScreenMaterial } from '../runtime/VideoTextureManager';
import { getEntityMeta } from './EntityComponentHelper';

export interface SharedLoungeMaterials {
  floorWood: pc.StandardMaterial;
  brass: pc.StandardMaterial;
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
  brickWall: pc.StandardMaterial;
  trussMetal: pc.StandardMaterial;
  bulbGlow: pc.StandardMaterial;
  screenBlack: pc.StandardMaterial;
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
  return {
    floorWood: makeMat(engine, { diffuse: [0.13, 0.1, 0.08], metalness: 0.02, gloss: 0.35 }),
    brass: makeMat(engine, { diffuse: [0.77, 0.61, 0.31], metalness: 0.65, gloss: 0.55 }),
    rugDark: makeMat(engine, { diffuse: [0.1, 0.08, 0.07], metalness: 0, gloss: 0.08 }),
    rugBar: makeMat(engine, { diffuse: [0.08, 0.09, 0.12], metalness: 0, gloss: 0.08 }),
    velvetRed: makeMat(engine, { diffuse: [0.35, 0.06, 0.12], metalness: 0, gloss: 0.05 }),
    stageDark: makeMat(engine, { diffuse: [0.1, 0.08, 0.07], metalness: 0.02, gloss: 0.32 }),
    stageStep1: makeMat(engine, { diffuse: [0.14, 0.11, 0.09], metalness: 0.02, gloss: 0.32 }),
    stageStep2: makeMat(engine, { diffuse: [0.13, 0.1, 0.08], metalness: 0.02, gloss: 0.32 }),
    ledGold: makeMat(engine, {
      diffuse: [1, 0.67, 0.2],
      emissive: [1, 0.6, 0.13],
      emissiveIntensity: 2.2,
      useLighting: false,
    }),
    ceilingDark: makeMat(engine, { diffuse: [0.07, 0.06, 0.05], metalness: 0.05, gloss: 0.15 }),
    woodBeam: makeMat(engine, { diffuse: [0.13, 0.09, 0.07], metalness: 0.02, gloss: 0.22 }),
    timberDark: makeMat(engine, { diffuse: [0.15, 0.11, 0.09], metalness: 0.02, gloss: 0.28 }),
    brickWall: makeMat(engine, { diffuse: [0.22, 0.16, 0.14], metalness: 0.06, gloss: 0.12 }),
    trussMetal: makeMat(engine, { diffuse: [0.1, 0.1, 0.1], metalness: 0.8, gloss: 0.7 }),
    bulbGlow: makeMat(engine, {
      diffuse: [1, 0.94, 0.8],
      emissive: [1, 0.8, 0.47],
      emissiveIntensity: 2.0,
      useLighting: false,
    }),
    screenBlack: makeMat(engine, { diffuse: [0.04, 0.04, 0.05], metalness: 0.1, gloss: 0.5 }),
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
  runnerGroup.addChild(createBox('Gold Border Left', [-1.24, 0.002, 0], [0.08, 0.004, 18.55], mats.brass));
  runnerGroup.addChild(createBox('Gold Border Right', [1.24, 0.002, 0], [0.08, 0.004, 18.55], mats.brass));
  shell.addChild(runnerGroup);

  // Walls (Back, Left + Bar Backwall, Right, Front with Entrance Arch)
  const walls = new pc.Entity('Walls');
  shell.addChild(walls);
  walls.addChild(createBox('Wall North (Back)', [0, 3.5, -16.9], [38, 7.0, 0.2], mats.brickWall, { collider: true }));
  walls.addChild(createBox('Wall West (Bar)', [-18.9, 3.5, 0], [0.2, 7.0, 34], mats.brickWall, { collider: true }));
  walls.addChild(createBox('Wall East (Stage)', [18.9, 3.5, 0], [0.2, 7.0, 34], mats.brickWall, { collider: true }));
  walls.addChild(createBox('Wall South Left', [-10.5, 3.5, 16.9], [17, 7.0, 0.2], mats.brickWall, { collider: true }));
  walls.addChild(createBox('Wall South Right', [10.5, 3.5, 16.9], [17, 7.0, 0.2], mats.brickWall, { collider: true }));
  walls.addChild(createBox('Entrance Arch Header', [0, 6.0, 16.9], [4.2, 2.0, 0.2], mats.brickWall));
  walls.addChild(createBox('Entrance Pilaster Left', [-2.1, 2.5, 16.8], [0.2, 5.0, 0.3], mats.timberDark));
  walls.addChild(createBox('Entrance Pilaster Right', [2.1, 2.5, 16.8], [0.2, 5.0, 0.3], mats.timberDark));
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
    color: new pc.Color(1, 0.72, 0.3),
    intensity: 1.8,
    castShadows: true,
    shadowBias: 0.2,
    normalOffsetBias: 0.05,
    shadowDistance: 45,
  });
  dirLight.setLocalPosition(15, 18, 12);
  dirLight.setLocalEulerAngles(50, 38, 0);
  rig.addChild(dirLight);

  const barSpot = new pc.Entity('Bar Spotlight');
  barSpot.addComponent('light', {
    type: 'spot',
    color: new pc.Color(1, 0.65, 0.15),
    intensity: 3.5,
    range: 14,
    innerConeAngle: 25,
    outerConeAngle: 46,
    castShadows: false,
  });
  barSpot.setLocalPosition(-10.2, 5.8, 0.8);
  barSpot.lookAt(-10.2, 1.2, 0.8);
  rig.addChild(barSpot);

  const receptionSpot = new pc.Entity('Reception Spotlight');
  receptionSpot.addComponent('light', {
    type: 'spot',
    color: new pc.Color(1, 0.88, 0.7),
    intensity: 2.5,
    range: 14,
    innerConeAngle: 20,
    outerConeAngle: 38,
    castShadows: false,
  });
  receptionSpot.setLocalPosition(0, 5.0, 9.5);
  receptionSpot.lookAt(0, 1.2, 11.5);
  rig.addChild(receptionSpot);

  const lampPoints: Array<[number, number, number]> = [
    [-7.2, 1.8, -4.5],
    [-7.2, 1.8, 5.5],
    [2.5, 1.8, 0.5],
  ];
  lampPoints.forEach((pos, idx) => {
    const pt = new pc.Entity(`Lamp PointLight ${idx + 1}`);
    pt.addComponent('light', {
      type: 'point',
      color: new pc.Color(1, 0.72, 0.3),
      intensity: 2.2,
      range: 10,
      castShadows: false,
    });
    pt.setLocalPosition(pos[0], pos[1], pos[2]);
    rig.addChild(pt);
  });

  return rig;
}

export async function buildMainAndAcousticStages(
  engine: EditorEngine,
  sceneRoot: pc.Entity,
  mats: SharedLoungeMaterials,
  fetchBuffer: (url: string) => Promise<ArrayBuffer>,
  assetIdByUrl: Map<string, string>
): Promise<void> {
  const app = engine.getApp();
  if (!app) return;

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

  const tvFrame = createBox('Main Stage LED Screen', [0, 3.9, -16.72], [10.2, 5.8, 0.12], mats.trussMetal);
  tvFrame.addChild(createBox('LED Screen Panel', [0, 0, 0.07], [9.8, 5.4, 0.02], mats.screenBlack));
  mainStage.addChild(tvFrame);

  // 4x PF_PA_Speaker (Shared GLB Container)
  const speakerUrl = '/models/pa-speaker.glb';
  const speakerBuf = await fetchBuffer(speakerUrl);
  const speakerAssetId = assetIdByUrl.get(speakerUrl);
  for (const sx of [-6.45, 6.45]) {
    for (const sz of [-15.47, -9.7]) {
      const loaded = await loadGlbFromArrayBuffer(app, speakerBuf, 'pa-speaker.glb', speakerAssetId ?? speakerUrl);
      engine.registerExternalResources(loaded.destroyResources);
      const spk = loaded.entity;
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
        intensity: 4.0,
        range: 18,
        innerConeAngle: 22,
        outerConeAngle: 42,
        castShadows: false,
      });
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
    createBox('Acoustic Stage Step', [14.675, 0.09, 3], [0.55, 0.18, 9.0], mats.stageStep2, {
      castShadows: true,
      collider: true,
    })
  );

  const gigUrl = '/models/every_other_gig_ever.glb';
  const gigBuf = await fetchBuffer(gigUrl);
  const gigAssetId = assetIdByUrl.get(gigUrl);
  const gigLoaded = await loadGlbFromArrayBuffer(app, gigBuf, 'every_other_gig_ever.glb', gigAssetId ?? gigUrl);
  engine.registerExternalResources(gigLoaded.destroyResources);
  const gig = gigLoaded.entity;
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

  for (const bz of [-4, 10]) {
    const board = new pc.Entity(`PF_LED_Board_${bz}`);
    board.setLocalPosition(18.74, 3.15, bz);
    board.setLocalEulerAngles(0, -90, 0);
    board.addChild(createBox('LED Cabinet', [0, 0, 0], [3.02, 3.7, 0.08], mats.trussMetal, { castShadows: true }));
    const screen = createBox('LED Video Screen', [0, 0, 0.055], [2.72, 3.4, 0.02], videoHandle.material);
    board.addChild(screen);
    acousticStage.addChild(board);
  }
}
