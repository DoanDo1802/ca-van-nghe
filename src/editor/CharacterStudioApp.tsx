import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pc from 'playcanvas';
import {
  AlertTriangle,
  Bone,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Film,
  Flame,
  FolderOpen,
  Heart,
  Loader2,
  Mic,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Smile,
  Sparkles,
  Trash2,
  Upload,
  User,
  Wand2,
} from 'lucide-react';
import { AnimationRegistry, CORE_SLOT_STATE_NAMES } from '../engine/animation/AnimationRegistry';
import { CharacterRegistry } from '../engine/animation/CharacterRegistry';
import { clearGlbContainerCache, loadGlbFromArrayBuffer } from '../engine/animation/GlbAnimExtractor';
import {
  buildHumanoidRigProfile,
  measureCharacterBounds,
  type HumanoidRigProfile,
} from '../engine/animation/HumanoidRigMapper';
import {
  applyCharacterAnimations,
  clearHumanoidRetargetCaches,
  loadAnimSourceContainerFromBuffer,
  retargetTrackToHumanoid,
} from '../engine/animation/HumanoidRetargeter';
import {
  ALL_HUMANOID_BONE_KEYS,
  HUMANOID_BONE_KEYS,
  type AnimEditInterp,
  type AnimEditLayer,
  type AnyHumanoidBoneKey,
  type AnimationClipEntry,
  type AnimationManifest,
  type CharacterManifest,
  type CharacterManifestEntry,
  type CoreAnimSlotId,
  type EmoteIconKind,
  type HumanoidBoneKey,
  type HumanoidBoneMap,
} from '../types/characterStudio';
import {
  cloneAnimEditLayer,
  createEmptyAnimEditLayer,
  fetchAnimEditLayer,
  hasAnyEditKeys,
  moveBoneEditKey,
  removeBoneEditKey,
  sampleBoneDeltaAtTime,
  sampleHipsOffsetAtTime,
  setBoneEditKeyInterp,
  upsertBoneEditKey,
  upsertHipsOffsetKey,
} from '../engine/animation/AnimEditLayer';
import { AVATAR_COLOR_PRESETS, applyAvatarColor } from '../utils/avatarColor';
import { AnimationEditorInspector } from './studio/AnimationEditorInspector';
import { AnimationEditorTimeline } from './studio/AnimationEditorTimeline';
import {
  applyEditorPoseAtTime,
  applyTwoBoneIKToLayer,
  buildBaseClipPoseCache,
  getLimbBoneKeys,
} from './studio/AnimEditorRuntime';
import type {
  AnimEditorSession,
  BaseClipPoseCache,
  GizmoToolMode,
  IKLimbId,
  SelectedKeyRef,
} from './studio/AnimEditorTypes';
import { convertDroppedFileToGlb, type ConvertedGlbPayload } from './studio/FbxConverter';
import {
  checkStudioServerAvailable,
  deleteAnimEditLayer,
  deletePublicStudioAsset,
  listPublicAnimationFiles,
  persistAnimEditLayer,
  persistAnimationManifest,
  persistCharacterManifest,
  slugifyStudioId,
  uploadStudioGlbToPublic,
  type PublicAnimationFileEntry,
} from './studio/StudioApiClient';

type StudioTab = 'character' | 'animation';

const CORE_SLOT_LABELS: Record<CoreAnimSlotId, string> = {
  idle: 'Đứng yên (Idle)',
  walk: 'Đi bộ (Walk)',
  run: 'Chạy (Run)',
  jump: 'Nhảy tại chỗ (Jump)',
  jumpRun: 'Nhảy khi chạy (JumpRun)',
  sit: 'Ngồi ghế (Sit)',
  talk: 'Nói chuyện (Talk)',
};

const BONE_LABELS: Record<HumanoidBoneKey, string> = {
  hips: 'Hips (Hông gốc)',
  spine: 'Spine (Bụng dưới)',
  chest: 'Chest (Ngực)',
  upperChest: 'Upper Chest (Ngực trên)',
  neck: 'Neck (Cổ)',
  head: 'Head (Đầu)',
  leftShoulder: 'Left Shoulder (Vai trái)',
  leftUpperArm: 'Left Upper Arm (Bắp tay trái)',
  leftLowerArm: 'Left Lower Arm (Cẳng tay trái)',
  leftHand: 'Left Hand (Bàn tay trái)',
  rightShoulder: 'Right Shoulder (Vai phải)',
  rightUpperArm: 'Right Upper Arm (Bắp tay phải)',
  rightLowerArm: 'Right Lower Arm (Cẳng tay phải)',
  rightHand: 'Right Hand (Bàn tay phải)',
  leftUpperLeg: 'Left Upper Leg (Đùi trái)',
  leftLowerLeg: 'Left Lower Leg (Bắp chân trái)',
  leftFoot: 'Left Foot (Bàn chân trái)',
  leftToes: 'Left Toes (Mũi chân trái)',
  rightUpperLeg: 'Right Upper Leg (Đùi phải)',
  rightLowerLeg: 'Right Lower Leg (Bắp chân phải)',
  rightFoot: 'Right Foot (Bàn chân phải)',
  rightToes: 'Right Toes (Mũi chân phải)',
};

const ACCENT_SWATCHES = ['#f43f5e', '#f59e0b', '#38bdf8', '#a855f7', '#10b981', '#ec4899', '#eab308', '#06b6d4'];

interface DraftModelState {
  converted: ConvertedGlbPayload;
  rawFileName: string;
  label: string;
  subtitle: string;
  scale: number;
  rawHeight: number;
  groundOffsetY: number;
  facingYawOffset: number;
  armPoseOffsetDeg: number;
  autoArmConvergence: boolean;
  tintable: boolean;
  boneMap: HumanoidBoneMap;
}

interface DraftAnimationState {
  converted: ConvertedGlbPayload;
  rawFileName: string;
  selectedTrackName: string;
  clipLabel: string;
  speed: number;
  loop: boolean;
  inPlace: boolean;
  trimStart: number;
  trimEnd: number;
  maxDuration: number;
  yawOffsetDeg: number;
  hipsYOffset: number;
  emoteLabel: string;
  emoteSublabel: string;
  emoteAccent: string;
  emoteIcon: EmoteIconKind;
}

export const CharacterStudioApp: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<pc.Application | null>(null);
  const stageRootRef = useRef<pc.Entity | null>(null);
  const activeCharacterEntityRef = useRef<pc.Entity | null>(null);
  const showBonesRef = useRef(false);
  const camEntityRef = useRef<pc.Entity | null>(null);
  const rotateGizmoRef = useRef<pc.RotateGizmo | null>(null);
  const translateGizmoRef = useRef<pc.TranslateGizmo | null>(null);
  const gizmoProxyRef = useRef<pc.Entity | null>(null);
  const gizmoDraggingRef = useRef(false);
  const targetRigRef = useRef<HumanoidRigProfile | null>(null);
  const basePoseCacheRef = useRef<BaseClipPoseCache | null>(null);
  const accumCanonRef = useRef<Map<AnyHumanoidBoneKey, pc.Quat>>(new Map());
  const lockedLeftFootPosRef = useRef<pc.Vec3 | null>(null);
  const lockedRightFootPosRef = useRef<pc.Vec3 | null>(null);

  const [studioTab, setStudioTab] = useState<StudioTab>('character');
  const [localApiReady, setLocalApiReady] = useState<boolean | null>(null);
  const [charManifest, setCharManifest] = useState<CharacterManifest>(() =>
    CharacterRegistry.getManifestSync()
  );
  const [animManifest, setAnimManifest] = useState<AnimationManifest>(() =>
    AnimationRegistry.getManifestSync()
  );

  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('default');
  const [previewAnimState, setPreviewAnimState] = useState<string>('Idle_Loop');
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSkeletonGizmo, setShowSkeletonGizmo] = useState(false);
  const [testTintHex, setTestTintHex] = useState('#e8a246');
  const [isDragOver, setIsDragOver] = useState(false);

  // Character editing / draft state
  const [draftModel, setDraftModel] = useState<DraftModelState | null>(null);
  const [editPresetForm, setEditPresetForm] = useState<{
    label: string;
    subtitle: string;
    scale: number;
    groundOffsetY: number;
    facingYawOffset: number;
    armPoseOffsetDeg: number;
    autoArmConvergence: boolean;
    tintable: boolean;
    boneMap: HumanoidBoneMap;
  } | null>(null);
  const [rigProfileSummary, setRigProfileSummary] = useState<{
    mappedCount: number;
    rigType: string;
    allNodeNames: string[];
    autoBoneMap: HumanoidBoneMap;
  } | null>(null);
  const [boneMapperOpen, setBoneMapperOpen] = useState(false);
  const [replaceTargetCharId, setReplaceTargetCharId] = useState<string>('default');

  // Animation draft / replace state
  const [draftAnim, setDraftAnim] = useState<DraftAnimationState | null>(null);
  const [replaceAnimTarget, setReplaceAnimTarget] = useState<string>('slot:walk');
  const [animFolderFiles, setAnimFolderFiles] = useState<PublicAnimationFileEntry[]>([]);
  const [loadingAnimFolder, setLoadingAnimFolder] = useState(false);

  // Unity-style Keyframe / Gizmo / IK Animation Editor state
  const [animEditorSession, setAnimEditorSession] = useState<AnimEditorSession | null>(null);
  const [editorTime, setEditorTime] = useState(0);
  const [editorPlaying, setEditorPlaying] = useState(false);
  const [autoKey, setAutoKey] = useState(true);
  const [loopRegion, setLoopRegion] = useState<[number, number] | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoToolMode>('fk-rotate');
  const [coordSpace, setCoordSpace] = useState<'local' | 'world'>('local');
  const [selectedBone, setSelectedBone] = useState<AnyHumanoidBoneKey | null>('rightUpperArm');
  const [selectedKey, setSelectedKey] = useState<SelectedKeyRef | null>(null);
  const [selectedIKLimb, setSelectedIKLimb] = useState<IKLimbId>('rightArm');
  const [footLock, setFootLock] = useState(false);
  const [undoStack, setUndoStack] = useState<AnimEditLayer[]>([]);
  const [redoStack, setRedoStack] = useState<AnimEditLayer[]>([]);
  const [copiedKeyRot, setCopiedKeyRot] = useState<[number, number, number, number] | null>(null);
  const [availableEditorBones, setAvailableEditorBones] = useState<Set<AnyHumanoidBoneKey>>(
    () => new Set()
  );

  const editorSessionRef = useRef<AnimEditorSession | null>(null);
  const editorTimeRef = useRef(0);
  const editorPlayingRef = useRef(false);
  const loopRegionRef = useRef<[number, number] | null>(null);
  const gizmoModeRef = useRef<GizmoToolMode>('fk-rotate');
  const selectedBoneRef = useRef<AnyHumanoidBoneKey | null>('rightUpperArm');
  const selectedIKLimbRef = useRef<IKLimbId>('rightArm');
  const footLockRef = useRef(false);

  editorSessionRef.current = animEditorSession;
  editorTimeRef.current = editorTime;
  editorPlayingRef.current = editorPlaying;
  loopRegionRef.current = loopRegion;
  gizmoModeRef.current = gizmoMode;
  selectedBoneRef.current = selectedBone;
  selectedIKLimbRef.current = selectedIKLimb;
  footLockRef.current = footLock;

  // Status / busy banners
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const modelInputRef = useRef<HTMLInputElement>(null);
  const animInputRef = useRef<HTMLInputElement>(null);

  showBonesRef.current = showSkeletonGizmo;

  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
  }, []);

  const refreshAnimFolder = useCallback(async () => {
    setLoadingAnimFolder(true);
    try {
      const res = await listPublicAnimationFiles();
      setAnimFolderFiles(res.files);
    } catch {
      // ignore if dev studio API is unavailable
    } finally {
      setLoadingAnimFolder(false);
    }
  }, []);

  // Load manifests & check Vite local file server
  useEffect(() => {
    let active = true;
    void Promise.all([
      CharacterRegistry.ensureLoaded(true),
      AnimationRegistry.ensureLoaded(true),
      checkStudioServerAvailable(),
    ]).then(([cm, am, apiOk]) => {
      if (!active) return;
      setCharManifest(structuredClone(cm));
      setAnimManifest(structuredClone(am));
      setSelectedCharacterId(cm.defaultCharacterId || cm.characters[0]?.id || 'default');
      setReplaceTargetCharId(cm.defaultCharacterId || cm.characters[0]?.id || 'default');
      setLocalApiReady(apiOk);
      if (apiOk) {
        void refreshAnimFolder();
      }
    });
    return () => {
      active = false;
    };
  }, [refreshAnimFolder]);

  useEffect(() => {
    if (localApiReady && studioTab === 'animation') {
      void refreshAnimFolder();
    }
  }, [localApiReady, studioTab, refreshAnimFolder]);

  // Sync editPresetForm whenever selectedCharacterId changes (when no unsaved draft model is active)
  useEffect(() => {
    const found = charManifest.characters.find((c) => c.id === selectedCharacterId);
    if (!found) return;
    setEditPresetForm({
      label: found.label,
      subtitle: found.subtitle,
      scale: found.scale,
      groundOffsetY: found.groundOffsetY ?? 0,
      facingYawOffset: found.facingYawOffset ?? 0,
      armPoseOffsetDeg: found.armPoseOffsetDeg ?? 0,
      autoArmConvergence: found.autoArmConvergence !== false,
      tintable: found.tintable,
      boneMap: { ...(found.boneMap ?? {}) },
    });
  }, [selectedCharacterId, charManifest]);

  // Boot isolated PlayCanvas 3D Studio Viewport (orbit/zoom/pan + floor grid + forward arrow + skeleton overlay)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
      graphicsDeviceOptions: { antialias: true, alpha: false },
    });
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    app.start();
    app.scene.ambientLight = new pc.Color(0.28, 0.3, 0.36);
    app.scene.exposure = 1.1;

    appRef.current = app;
    const stageRoot = new pc.Entity('StudioStageRoot');
    app.root.addChild(stageRoot);
    stageRootRef.current = stageRoot;

    const gizmoProxy = new pc.Entity('StudioGizmoProxy');
    stageRoot.addChild(gizmoProxy);
    gizmoProxyRef.current = gizmoProxy;

    const gizmoLayer = pc.Gizmo.createLayer(app);

    // Camera with Orbit + Zoom + Pan
    const cam = new pc.Entity('StudioCamera');
    cam.addComponent('camera', {
      clearColor: new pc.Color(0.065, 0.075, 0.1, 1),
      fov: 42,
      nearClip: 0.05,
      farClip: 80,
      layers: [
        pc.LAYERID_WORLD,
        pc.LAYERID_DEPTH,
        pc.LAYERID_SKYBOX,
        pc.LAYERID_IMMEDIATE,
        gizmoLayer.id,
      ],
    });
    app.root.addChild(cam);
    camEntityRef.current = cam;

    const rotateGizmo = new pc.RotateGizmo(cam.camera!, gizmoLayer);
    rotateGizmo.size = 0.55;
    rotateGizmo.coordSpace = 'local';
    rotateGizmoRef.current = rotateGizmo;

    const translateGizmo = new pc.TranslateGizmo(cam.camera!, gizmoLayer);
    translateGizmo.size = 0.55;
    translateGizmo.coordSpace = 'world';
    translateGizmoRef.current = translateGizmo;

    let gizmoHovering = false;
    let startSnapLayer: AnimEditLayer | null = null;
    let startBoneWorldRot = new pc.Quat();
    let startProxyRot = new pc.Quat();
    let startLocalDelta = new pc.Quat();
    let startParentAccum = new pc.Quat();

    const wireGizmoDragFlags = (g: pc.TransformGizmo) => {
      g.on('pointer:down', () => {
        gizmoDraggingRef.current = true;
      });
      g.on('pointer:up', () => {
        gizmoDraggingRef.current = false;
      });
      g.on('pointer:move', (_x: number, _y: number, mi: unknown) => {
        gizmoHovering = Boolean(mi);
      });
    };
    wireGizmoDragFlags(rotateGizmo);
    wireGizmoDragFlags(translateGizmo);

    rotateGizmo.on('transform:start', () => {
      gizmoDraggingRef.current = true;
      const sess = editorSessionRef.current;
      const rig = targetRigRef.current;
      const boneKey = selectedBoneRef.current;
      if (!sess || !rig || !boneKey) return;
      const bone = rig.bones[boneKey];
      if (!bone) return;
      startSnapLayer = cloneAnimEditLayer(sess.layer);
      startBoneWorldRot.copy(bone.node.getRotation());
      startProxyRot.copy(gizmoProxy.getRotation());
      sampleBoneDeltaAtTime(sess.layer.tracks[boneKey], editorTimeRef.current, startLocalDelta);
      const ancKey = basePoseCacheRef.current?.nearestAncestor[boneKey] ?? null;
      startParentAccum.copy(
        (ancKey ? accumCanonRef.current.get(ancKey) : undefined) ?? new pc.Quat(0, 0, 0, 1)
      );
    });

    rotateGizmo.on('transform:move', () => {
      const sess = editorSessionRef.current;
      const rig = targetRigRef.current;
      const cache = basePoseCacheRef.current;
      const ent = activeCharacterEntityRef.current;
      const boneKey = selectedBoneRef.current;
      if (!sess || !rig || !cache || !ent || !boneKey) return;

      const stepWorld = new pc.Quat()
        .mul2(gizmoProxy.getRotation(), startProxyRot.clone().invert())
        .normalize();
      const invFacing = rig.facingQuat.clone().invert();
      const stepCanon = new pc.Quat()
        .mul2(rig.facingQuat, stepWorld)
        .mul(invFacing)
        .normalize();
      const invParent = startParentAccum.clone().invert();
      const localStep = new pc.Quat()
        .mul2(invParent, stepCanon)
        .mul(startParentAccum)
        .normalize();
      const finalLocal = new pc.Quat().mul2(localStep, startLocalDelta).normalize();

      const nextLayer = upsertBoneEditKey(
        sess.layer,
        boneKey,
        editorTimeRef.current,
        [finalLocal.x, finalLocal.y, finalLocal.z, finalLocal.w],
        'linear'
      );
      accumCanonRef.current = applyEditorPoseAtTime(
        ent,
        rig,
        cache,
        nextLayer,
        editorTimeRef.current,
        {
          footLock: footLockRef.current,
          lockedLeftFootPos: lockedLeftFootPosRef.current,
          lockedRightFootPos: lockedRightFootPosRef.current,
        }
      );
      setAnimEditorSession((prev) => (prev ? { ...prev, layer: nextLayer } : prev));
    });

    rotateGizmo.on('transform:end', () => {
      gizmoDraggingRef.current = false;
      if (startSnapLayer) {
        const snap = startSnapLayer;
        setUndoStack((u) => [...u.slice(-39), snap]);
        setRedoStack([]);
        startSnapLayer = null;
      }
    });

    translateGizmo.on('transform:start', () => {
      gizmoDraggingRef.current = true;
      const sess = editorSessionRef.current;
      if (sess) {
        startSnapLayer = cloneAnimEditLayer(sess.layer);
      }
    });

    translateGizmo.on('transform:move', () => {
      const sess = editorSessionRef.current;
      const rig = targetRigRef.current;
      const cache = basePoseCacheRef.current;
      const ent = activeCharacterEntityRef.current;
      if (!sess || !rig || !cache || !ent) return;

      const nextLayer = applyTwoBoneIKToLayer({
        entity: ent,
        targetRig: rig,
        cache,
        layer: sess.layer,
        limb: selectedIKLimbRef.current,
        timeSec: editorTimeRef.current,
        targetWorldPos: gizmoProxy.getPosition().clone(),
      });
      accumCanonRef.current = applyEditorPoseAtTime(
        ent,
        rig,
        cache,
        nextLayer,
        editorTimeRef.current
      );
      setAnimEditorSession((prev) => (prev ? { ...prev, layer: nextLayer } : prev));
    });

    translateGizmo.on('transform:end', () => {
      gizmoDraggingRef.current = false;
      if (startSnapLayer) {
        const snap = startSnapLayer;
        setUndoStack((u) => [...u.slice(-39), snap]);
        setRedoStack([]);
        startSnapLayer = null;
      }
    });

    let camYaw = 18;
    let camPitch = 14;
    let camDist = 3.6;
    const camTarget = new pc.Vec3(0, 0.92, 0);

    const updateCam = () => {
      const yr = (camYaw * Math.PI) / 180;
      const pr = (camPitch * Math.PI) / 180;
      const horiz = camDist * Math.cos(pr);
      cam.setPosition(
        camTarget.x + Math.sin(yr) * horiz,
        Math.max(0.15, camTarget.y + Math.sin(pr) * camDist),
        camTarget.z + Math.cos(yr) * horiz
      );
      cam.lookAt(camTarget);
    };
    updateCam();

    let draggingButton: number | null = null;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: MouseEvent) => {
      if (gizmoDraggingRef.current || gizmoHovering) return;
      draggingButton = e.button;
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: MouseEvent) => {
      if (draggingButton === null || gizmoDraggingRef.current) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (draggingButton === 0) {
        camYaw -= dx * 0.35;
        camPitch = pc.math.clamp(camPitch + dy * 0.28, -15, 75);
      } else {
        const yr = (camYaw * Math.PI) / 180;
        const rx = Math.cos(yr);
        const rz = -Math.sin(yr);
        camTarget.x -= rx * dx * 0.004;
        camTarget.z -= rz * dx * 0.004;
        camTarget.y = pc.math.clamp(camTarget.y + dy * 0.004, 0.1, 2.8);
      }
      updateCam();
    };
    const onUp = (e: MouseEvent) => {
      const wasLeftClick =
        draggingButton === 0 &&
        Math.hypot(e.clientX - downX, e.clientY - downY) < 4 &&
        !gizmoDraggingRef.current;
      draggingButton = null;

      if (wasLeftClick && editorSessionRef.current && targetRigRef.current && cam.camera) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const screenPos = new pc.Vec3();
        let bestBone: AnyHumanoidBoneKey | null = null;
        let bestDist = 22;
        for (const boneKey of HUMANOID_BONE_KEYS) {
          const b = targetRigRef.current.bones[boneKey];
          if (!b) continue;
          cam.camera.worldToScreen(b.node.getPosition(), screenPos);
          if (screenPos.z <= 0) continue;
          const d = Math.hypot(screenPos.x - clickX, screenPos.y - clickY);
          if (d < bestDist) {
            bestDist = d;
            bestBone = boneKey;
          }
        }
        if (bestBone) {
          setSelectedBone(bestBone);
          if (gizmoModeRef.current === 'ik-move') {
            if (
              bestBone === 'leftHand' ||
              bestBone === 'leftLowerArm' ||
              bestBone === 'leftUpperArm' ||
              bestBone === 'leftShoulder'
            ) {
              setSelectedIKLimb('leftArm');
            } else if (
              bestBone === 'rightHand' ||
              bestBone === 'rightLowerArm' ||
              bestBone === 'rightUpperArm' ||
              bestBone === 'rightShoulder'
            ) {
              setSelectedIKLimb('rightArm');
            } else if (
              bestBone === 'leftFoot' ||
              bestBone === 'leftLowerLeg' ||
              bestBone === 'leftUpperLeg'
            ) {
              setSelectedIKLimb('leftLeg');
            } else if (
              bestBone === 'rightFoot' ||
              bestBone === 'rightLowerLeg' ||
              bestBone === 'rightUpperLeg'
            ) {
              setSelectedIKLimb('rightLeg');
            }
          }
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camDist = pc.math.clamp(camDist * (1 + Math.sign(e.deltaY) * 0.1), 1.1, 10);
      updateCam();
    };
    const onContext = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);

    // Key + Rim + Fill lighting
    const keyLight = new pc.Entity('KeyLight');
    keyLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.97, 0.92),
      intensity: 1.55,
      castShadows: true,
      shadowBias: 0.2,
      normalOffsetBias: 0.05,
      shadowDistance: 12,
    });
    keyLight.setEulerAngles(48, 32, 0);
    app.root.addChild(keyLight);

    const fillLight = new pc.Entity('FillLight');
    fillLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.55, 0.72, 1.0),
      intensity: 0.65,
      castShadows: false,
    });
    fillLight.setEulerAngles(30, -145, 0);
    app.root.addChild(fillLight);

    // Pedestal floor disc
    const floorMat = new pc.StandardMaterial();
    floorMat.diffuse = new pc.Color(0.11, 0.13, 0.17);
    floorMat.metalness = 0.1;
    floorMat.gloss = 0.4;
    floorMat.update();
    const floor = new pc.Entity('Pedestal');
    floor.addComponent('render', {
      type: 'cylinder',
      castShadows: false,
      receiveShadows: true,
    });
    floor.setLocalScale(3.2, 0.02, 3.2);
    floor.setLocalPosition(0, -0.01, 0);
    if (floor.render) {
      floor.render.meshInstances.forEach((mi) => {
        mi.material = floorMat;
      });
    }
    app.root.addChild(floor);

    // Resize observer
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = Math.max(1, parent.clientWidth);
      const h = Math.max(1, parent.clientHeight);
      app.resizeCanvas(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    // Draw reference grid, 1.72m height bar, forward arrow (+Z in local preview facing camera), & skeleton bones
    const gridColor = new pc.Color(0.22, 0.26, 0.34, 1);
    const arrowColor = new pc.Color(0.22, 0.78, 0.98, 1);
    const heightColor = new pc.Color(0.95, 0.72, 0.25, 1);
    const boneColor = new pc.Color(0.2, 0.95, 0.55, 1);
    const jointPickColor = new pc.Color(0.35, 0.82, 1, 1);
    const jointSelectedColor = new pc.Color(1, 0.82, 0.15, 1);
    const pA = new pc.Vec3();
    const pB = new pc.Vec3();

    const onUpdate = (dt: number) => {
      // Advance animation editor playback if active & playing
      const sess = editorSessionRef.current;
      if (sess && editorPlayingRef.current && activeCharacterEntityRef.current && targetRigRef.current && basePoseCacheRef.current) {
        const lr = loopRegionRef.current;
        const minT = lr ? lr[0] : 0;
        const maxT = lr ? lr[1] : Math.max(0.05, sess.duration);
        let nextT = editorTimeRef.current + dt;
        if (nextT > maxT) {
          nextT = minT + ((nextT - minT) % Math.max(0.02, maxT - minT));
        }
        editorTimeRef.current = nextT;
        setEditorTime(nextT);
        accumCanonRef.current = applyEditorPoseAtTime(
          activeCharacterEntityRef.current,
          targetRigRef.current,
          basePoseCacheRef.current,
          sess.layer,
          nextT,
          {
            footLock: footLockRef.current,
            lockedLeftFootPos: lockedLeftFootPosRef.current,
            lockedRightFootPos: lockedRightFootPosRef.current,
          }
        );
      }

      // Floor grid lines (-1.5m .. +1.5m)
      for (let i = -3; i <= 3; i++) {
        const v = i * 0.5;
        app.drawLine(pA.set(v, 0.002, -1.5), pB.set(v, 0.002, 1.5), gridColor, true);
        app.drawLine(pA.set(-1.5, 0.002, v), pB.set(1.5, 0.002, v), gridColor, true);
      }

      // Forward direction arrow (+Z toward camera — in game Player has rotY=180 facing -Z, so model local +Z is forward!)
      app.drawLine(pA.set(0, 0.006, 0), pB.set(0, 0.006, 1.15), arrowColor, false);
      app.drawLine(pA.set(0, 0.006, 1.15), pB.set(-0.14, 0.006, 0.94), arrowColor, false);
      app.drawLine(pA.set(0, 0.006, 1.15), pB.set(0.14, 0.006, 0.94), arrowColor, false);

      // 1.72m human height ruler on left side
      app.drawLine(pA.set(-0.85, 0, 0), pB.set(-0.85, 1.72, 0), heightColor, true);
      app.drawLine(pA.set(-0.92, 1.72, 0), pB.set(-0.78, 1.72, 0), heightColor, true);

      // Optional skeleton gizmo lines + interactive joint markers in Animation Editor
      if ((showBonesRef.current || sess) && activeCharacterEntityRef.current) {
        const walkBones = (node: pc.GraphNode) => {
          if (node !== activeCharacterEntityRef.current && node.parent && node.parent !== activeCharacterEntityRef.current) {
            const cPos = node.getPosition();
            const parPos = node.parent.getPosition();
            if (cPos.distance(parPos) > 0.005 && cPos.distance(parPos) < 1.2) {
              app.drawLine(parPos, cPos, boneColor, false);
            }
          }
          for (const ch of node.children) {
            walkBones(ch);
          }
        };
        walkBones(activeCharacterEntityRef.current);

        if (sess && targetRigRef.current) {
          for (const boneKey of HUMANOID_BONE_KEYS) {
            const b = targetRigRef.current.bones[boneKey];
            if (!b) continue;
            const jp = b.node.getPosition();
            const isSel = selectedBoneRef.current === boneKey;
            const r = isSel ? 0.028 : 0.015;
            const col = isSel ? jointSelectedColor : jointPickColor;
            app.drawLine(pA.set(jp.x - r, jp.y, jp.z), pB.set(jp.x + r, jp.y, jp.z), col, false);
            app.drawLine(pA.set(jp.x, jp.y - r, jp.z), pB.set(jp.x, jp.y + r, jp.z), col, false);
            app.drawLine(pA.set(jp.x, jp.y, jp.z - r), pB.set(jp.x, jp.y, jp.z + r), col, false);
          }
        }
      }
    };
    app.on('update', onUpdate);

    return () => {
      app.off('update', onUpdate);
      rotateGizmo.destroy();
      translateGizmo.destroy();
      rotateGizmoRef.current = null;
      translateGizmoRef.current = null;
      gizmoProxyRef.current = null;
      camEntityRef.current = null;
      ro.disconnect();
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      clearGlbContainerCache(app);
      clearHumanoidRetargetCaches(app);
      floorMat.destroy();
      app.destroy();
      appRef.current = null;
      stageRootRef.current = null;
      activeCharacterEntityRef.current = null;
    };
  }, []);

  // Build active CharacterManifestEntry for preview (either Draft Model or Selected Saved Character with live form edits)
  const activePreviewPreset = useMemo<CharacterManifestEntry>(() => {
    if (draftModel) {
      return {
        id: '__studio_draft__',
        label: draftModel.label,
        subtitle: draftModel.subtitle,
        url: '__draft_buffer__',
        filename: draftModel.converted.suggestedFilename,
        scale: draftModel.scale,
        groundOffsetY: draftModel.groundOffsetY,
        facingYawOffset: draftModel.facingYawOffset,
        armPoseOffsetDeg: draftModel.armPoseOffsetDeg,
        autoArmConvergence: draftModel.autoArmConvergence,
        tintable: draftModel.tintable,
        boneMap: draftModel.boneMap,
      };
    }
    const base =
      charManifest.characters.find((c) => c.id === selectedCharacterId) ??
      charManifest.characters[0];
    if (!editPresetForm || !base) return base;
    return {
      ...base,
      label: editPresetForm.label,
      subtitle: editPresetForm.subtitle,
      scale: editPresetForm.scale,
      groundOffsetY: editPresetForm.groundOffsetY,
      facingYawOffset: editPresetForm.facingYawOffset,
      armPoseOffsetDeg: editPresetForm.armPoseOffsetDeg,
      autoArmConvergence: editPresetForm.autoArmConvergence,
      tintable: editPresetForm.tintable,
      boneMap: editPresetForm.boneMap,
    };
  }, [draftModel, charManifest, selectedCharacterId, editPresetForm]);

  // Mount / rebuild 3D preview character + retarget all animations + optional draft animation
  const rebuildPreviewEntity = useCallback(async () => {
    const app = appRef.current;
    const stageRoot = stageRootRef.current;
    if (!app || !stageRoot || !activePreviewPreset) return;

    try {
      let buffer: ArrayBuffer;
      let cacheKey: string;
      if (draftModel) {
        buffer = draftModel.converted.glbBuffer;
        cacheKey = `draft:${draftModel.rawFileName}:${buffer.byteLength}`;
      } else {
        const bustUrl = activePreviewPreset.updatedAt
          ? `${activePreviewPreset.url}?v=${encodeURIComponent(activePreviewPreset.updatedAt)}`
          : activePreviewPreset.url;
        const res = await fetch(bustUrl);
        if (!res.ok) throw new Error(`Không tải được ${activePreviewPreset.url}`);
        buffer = await res.arrayBuffer();
        cacheKey = bustUrl;
      }

      if (appRef.current !== app || !stageRootRef.current) return;

      const loaded = await loadGlbFromArrayBuffer(
        app,
        buffer,
        activePreviewPreset.filename,
        cacheKey
      );
      if (appRef.current !== app || !stageRootRef.current) {
        loaded.entity.destroy();
        return;
      }

      // Inspect rig profile in unscaled bind pose first
      const rawRig: HumanoidRigProfile = buildHumanoidRigProfile(loaded.entity, {
        explicitBoneMap: activePreviewPreset.boneMap,
        armPoseOffsetDeg: activePreviewPreset.armPoseOffsetDeg ?? 0,
        normalizeArmsToTPose: true,
      });
      setRigProfileSummary({
        mappedCount: rawRig.mappedCount,
        rigType: rawRig.detectedRigType,
        allNodeNames: rawRig.allNodeNames,
        autoBoneMap: rawRig.boneMap,
      });

      const entity = loaded.entity;
      entity.name = 'StudioPreviewCharacter';
      entity.setLocalPosition(0, 0, 0);
      // Local +Z faces the Studio camera & forward floor arrow
      entity.setLocalEulerAngles(0, 0, 0);
      entity.setLocalScale(
        activePreviewPreset.scale,
        activePreviewPreset.scale,
        activePreviewPreset.scale
      );

      entity.findComponents('render').forEach((comp) => {
        const rc = comp as pc.RenderComponent;
        rc.castShadows = true;
        for (const mi of rc.meshInstances) {
          mi.cull = false;
        }
      });

      if (activePreviewPreset.tintable) {
        applyAvatarColor(entity, testTintHex, activePreviewPreset.id);
      }

      await applyCharacterAnimations(app, entity, activePreviewPreset);

      // If an unsaved Draft Animation is active, retarget it live onto `__draft_anim__` state!
      if (draftAnim) {
        const srcContainer = await loadAnimSourceContainerFromBuffer(
          app,
          draftAnim.converted.glbBuffer,
          draftAnim.converted.suggestedFilename,
          `draft_anim:${draftAnim.rawFileName}:${draftAnim.converted.glbBuffer.byteLength}`
        );
        const srcTrack =
          srcContainer.animTrackMap[draftAnim.selectedTrackName] ??
          (srcContainer.animTracks[0]
            ? srcContainer.animTrackMap[srcContainer.animTracks[0]]
            : undefined);
        if (srcTrack && entity.anim) {
          const targetRig = buildHumanoidRigProfile(entity, {
            explicitBoneMap: activePreviewPreset.boneMap,
            armPoseOffsetDeg: activePreviewPreset.armPoseOffsetDeg ?? 0,
            normalizeArmsToTPose: true,
          });
          const retargetedDraft = retargetTrackToHumanoid(srcContainer, srcTrack, targetRig, {
            stateName: '__draft_anim__',
            inPlace: draftAnim.inPlace,
            trimStart: draftAnim.trimStart,
            trimEnd: draftAnim.trimEnd > draftAnim.trimStart ? draftAnim.trimEnd : undefined,
            yawOffsetDeg: draftAnim.yawOffsetDeg,
            hipsYOffset: draftAnim.hipsYOffset / Math.max(0.001, activePreviewPreset.scale || 1),
            autoArmConvergence: activePreviewPreset.autoArmConvergence !== false,
          });
          entity.anim.assignAnimation(
            '__draft_anim__',
            retargetedDraft,
            undefined,
            draftAnim.speed,
            draftAnim.loop
          );
        }
      }

      // Swap previous entity cleanly
      if (activeCharacterEntityRef.current) {
        activeCharacterEntityRef.current.destroy();
      }
      stageRoot.addChild(entity);
      activeCharacterEntityRef.current = entity;

      const liveTargetRig = buildHumanoidRigProfile(entity, {
        explicitBoneMap: activePreviewPreset.boneMap,
        armPoseOffsetDeg: activePreviewPreset.armPoseOffsetDeg ?? 0,
        normalizeArmsToTPose: true,
      });
      targetRigRef.current = liveTargetRig;
      setAvailableEditorBones(
        new Set(ALL_HUMANOID_BONE_KEYS.filter((k) => Boolean(liveTargetRig.bones[k])))
      );

      if (entity.anim) {
        entity.anim.activate = true;
        entity.anim.enabled = !editorSessionRef.current;
        entity.anim.playing = isPlaying;
        entity.anim.speed = playbackSpeed;
        const desiredState = draftAnim ? '__draft_anim__' : previewAnimState;
        const states = entity.anim.baseLayer?.states ?? [];
        const target = states.includes(desiredState)
          ? desiredState
          : states.includes('Idle_Loop')
            ? 'Idle_Loop'
            : states[0];
        if (target) {
          entity.anim.baseLayer?.play(target);
        }
      }

      // If Animation Editor is currently open (e.g. user switched preview character), rebuild basePoseCache for new rig
      const openSess = editorSessionRef.current;
      if (openSess) {
        const clip = animManifest.clips.find((c) => c.id === openSess.clipId);
        if (clip) {
          const clipRes = await fetch(clip.url);
          if (clipRes.ok) {
            const buf = await clipRes.arrayBuffer();
            const srcContainer = await loadAnimSourceContainerFromBuffer(
              app,
              buf,
              clip.url.split('/').pop() || 'anim.glb',
              `anim_edit_src:${clip.url}`,
              {
                sourceBoneMap: clip.sourceBoneMap,
                sourceArmPoseOffsetDeg: clip.sourceArmPoseOffsetDeg,
              }
            );
            const srcTrack =
              (clip.trackName ? srcContainer.animTrackMap[clip.trackName] : undefined) ??
              srcContainer.animTrackMap[clip.name] ??
              (srcContainer.animTracks[0]
                ? srcContainer.animTrackMap[srcContainer.animTracks[0]]
                : undefined);
            if (srcTrack) {
              const isCoreSlot = Object.values(CORE_SLOT_STATE_NAMES).includes(openSess.stateName);
              const baseTrack = retargetTrackToHumanoid(srcContainer, srcTrack, liveTargetRig, {
                stateName: openSess.stateName,
                inPlace: clip.inPlace,
                strictLockXZ: isCoreSlot,
                trimStart: clip.trimStart,
                trimEnd: clip.trimEnd,
                yawOffsetDeg: clip.yawOffsetDeg,
                hipsYOffset: (clip.hipsYOffset ?? 0) / Math.max(0.001, activePreviewPreset.scale || 1),
                autoArmConvergence: activePreviewPreset.autoArmConvergence !== false,
                editLayer: null,
              });
              const cache = buildBaseClipPoseCache(baseTrack, liveTargetRig, openSess.fps);
              basePoseCacheRef.current = cache;
              accumCanonRef.current = applyEditorPoseAtTime(
                entity,
                liveTargetRig,
                cache,
                openSess.layer,
                editorTimeRef.current
              );
            }
          }
        }
      }
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    }
  }, [activePreviewPreset, draftModel, draftAnim, testTintHex, showToast]);

  useEffect(() => {
    void rebuildPreviewEntity();
  }, [rebuildPreviewEntity]);

  // Fast playback / state transitions without rebuilding entity
  useEffect(() => {
    const ent = activeCharacterEntityRef.current;
    if (!ent?.anim) return;
    if (animEditorSession) {
      ent.anim.enabled = false;
      return;
    }
    ent.anim.enabled = true;
    ent.anim.playing = isPlaying;
    ent.anim.speed = playbackSpeed;
    const desired = draftAnim && previewAnimState === '__draft_anim__' ? '__draft_anim__' : previewAnimState;
    const states = ent.anim.baseLayer?.states ?? [];
    if (states.includes(desired)) {
      ent.anim.baseLayer?.transition(desired, 0.15);
    }
  }, [previewAnimState, isPlaying, playbackSpeed, draftAnim, animEditorSession]);

  // === UNITY-STYLE ANIMATION EDITOR HELPERS ===

  const syncGizmoAttachment = useCallback(() => {
    const rotG = rotateGizmoRef.current;
    const transG = translateGizmoRef.current;
    const proxy = gizmoProxyRef.current;
    const rig = targetRigRef.current;
    if (!rotG || !transG || !proxy) return;

    if (!animEditorSession || !rig) {
      rotG.detach();
      transG.detach();
      return;
    }

    if (gizmoMode === 'fk-rotate') {
      transG.detach();
      const bone = selectedBone ? rig.bones[selectedBone] : undefined;
      if (!bone) {
        rotG.detach();
        return;
      }
      proxy.setPosition(bone.node.getPosition());
      proxy.setRotation(bone.node.getRotation());
      rotG.coordSpace = coordSpace;
      rotG.attach([proxy]);
    } else {
      rotG.detach();
      const { end } = getLimbBoneKeys(selectedIKLimb);
      const endBone = rig.bones[end];
      if (!endBone) {
        transG.detach();
        return;
      }
      proxy.setPosition(endBone.node.getPosition());
      proxy.setRotation(0, 0, 0, 1);
      transG.attach([proxy]);
    }
  }, [animEditorSession, gizmoMode, coordSpace, selectedBone, selectedIKLimb]);

  // Re-evaluate pose and re-attach gizmo whenever editorTime, layer, or gizmo mode changes
  useEffect(() => {
    if (!animEditorSession) {
      syncGizmoAttachment();
      return;
    }
    const ent = activeCharacterEntityRef.current;
    const rig = targetRigRef.current;
    const cache = basePoseCacheRef.current;
    if (ent && rig && cache && !editorPlaying) {
      accumCanonRef.current = applyEditorPoseAtTime(
        ent,
        rig,
        cache,
        animEditorSession.layer,
        editorTime,
        {
          footLock,
          lockedLeftFootPos: lockedLeftFootPosRef.current,
          lockedRightFootPos: lockedRightFootPosRef.current,
        }
      );
    }
    if (!gizmoDraggingRef.current) {
      syncGizmoAttachment();
    }
  }, [animEditorSession, editorTime, editorPlaying, footLock, syncGizmoAttachment]);

  const commitLayerWithUndo = useCallback(
    (nextLayer: AnimEditLayer) => {
      setAnimEditorSession((prev) => {
        if (!prev) return prev;
        setUndoStack((u) => [...u.slice(-39), cloneAnimEditLayer(prev.layer)]);
        setRedoStack([]);
        return { ...prev, layer: nextLayer };
      });
    },
    []
  );

  const handleSeekEditor = useCallback((t: number) => {
    const sess = editorSessionRef.current;
    if (!sess) return;
    const clamped = pc.math.clamp(t, 0, Math.max(0.05, sess.duration));
    editorTimeRef.current = clamped;
    setEditorTime(clamped);
  }, []);

  const handleUndoEditor = useCallback(() => {
    setAnimEditorSession((prev) => {
      if (!prev || undoStack.length === 0) return prev;
      const top = undoStack[undoStack.length - 1];
      setUndoStack((u) => u.slice(0, -1));
      setRedoStack((r) => [...r, cloneAnimEditLayer(prev.layer)]);
      return { ...prev, layer: top };
    });
  }, [undoStack]);

  const handleRedoEditor = useCallback(() => {
    setAnimEditorSession((prev) => {
      if (!prev || redoStack.length === 0) return prev;
      const top = redoStack[redoStack.length - 1];
      setRedoStack((r) => r.slice(0, -1));
      setUndoStack((u) => [...u, cloneAnimEditLayer(prev.layer)]);
      return { ...prev, layer: top };
    });
  }, [redoStack]);

  const openAnimationEditor = useCallback(
    async (clip: AnimationClipEntry, stateName: string, displayLabel: string) => {
      const app = appRef.current;
      const ent = activeCharacterEntityRef.current;
      const rig = targetRigRef.current;
      if (!app || !ent || !rig) {
        showToast('err', 'Nhân vật 3D chưa sẵn sàng — hãy đợi load xong rồi thử lại.');
        return;
      }
      setBusyMessage(`Đang mở trình chỉnh sửa Keyframe cho "${displayLabel}"...`);
      try {
        const res = await fetch(clip.url);
        if (!res.ok) throw new Error(`Không tải được ${clip.url}`);
        const buf = await res.arrayBuffer();
        const srcContainer = await loadAnimSourceContainerFromBuffer(
          app,
          buf,
          clip.url.split('/').pop() || 'anim.glb',
          `anim_edit_src:${clip.url}`,
          {
            sourceBoneMap: clip.sourceBoneMap,
            sourceArmPoseOffsetDeg: clip.sourceArmPoseOffsetDeg,
          }
        );
        const srcTrack =
          (clip.trackName ? srcContainer.animTrackMap[clip.trackName] : undefined) ??
          srcContainer.animTrackMap[clip.name] ??
          (srcContainer.animTracks[0]
            ? srcContainer.animTrackMap[srcContainer.animTracks[0]]
            : undefined);
        if (!srcTrack) throw new Error('Không tìm thấy animation track trong file.');

        const fps = 30;
        const isCoreSlot = Object.values(CORE_SLOT_STATE_NAMES).includes(stateName);
        const baseTrack = retargetTrackToHumanoid(srcContainer, srcTrack, rig, {
          stateName,
          inPlace: clip.inPlace,
          strictLockXZ: isCoreSlot,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
          yawOffsetDeg: clip.yawOffsetDeg,
          hipsYOffset: (clip.hipsYOffset ?? 0) / Math.max(0.001, activePreviewPreset.scale || 1),
          autoArmConvergence: activePreviewPreset.autoArmConvergence !== false,
          editLayer: null,
        });

        const existingLayer = clip.editLayerUrl
          ? await fetchAnimEditLayer(clip.editLayerUrl, clip.editLayerUpdatedAt ?? clip.updatedAt)
          : null;
        const layer = existingLayer ? cloneAnimEditLayer(existingLayer) : createEmptyAnimEditLayer(clip.id);
        const cache = buildBaseClipPoseCache(baseTrack, rig, fps);
        basePoseCacheRef.current = cache;

        setDraftModel(null);
        setDraftAnim(null);
        setStudioTab('animation');
        setPreviewAnimState(stateName);
        setEditorPlaying(false);
        setEditorTime(0);
        setLoopRegion(null);
        setFootLock(false);
        setUndoStack([]);
        setRedoStack([]);
        setSelectedKey(null);
        setSelectedBone('rightUpperArm');
        setAnimEditorSession({
          clipId: clip.id,
          stateName,
          displayLabel,
          duration: cache.duration,
          fps,
          layer,
          savedSnapshotJson: JSON.stringify(layer),
        });

        if (ent.anim) {
          ent.anim.enabled = false;
        }
        accumCanonRef.current = applyEditorPoseAtTime(ent, rig, cache, layer, 0);
      } catch (err) {
        showToast('err', err instanceof Error ? err.message : String(err));
      } finally {
        setBusyMessage(null);
      }
    },
    [activePreviewPreset, showToast]
  );

  const handleOpenEditorForCurrentPreview = useCallback(() => {
    let resolvedClip: AnimationClipEntry | undefined;
    let displayLabel = previewAnimState;
    for (const [slotKey, st] of Object.entries(CORE_SLOT_STATE_NAMES) as Array<[CoreAnimSlotId, string]>) {
      if (st === previewAnimState) {
        resolvedClip = animManifest.clips.find((c) => c.id === animManifest.slots[slotKey]);
        displayLabel = CORE_SLOT_LABELS[slotKey];
        break;
      }
    }
    if (!resolvedClip) {
      resolvedClip = animManifest.clips.find(
        (c) => c.name === previewAnimState || c.id === previewAnimState
      );
      if (resolvedClip) {
        const em = animManifest.emotes.find((e) => e.clipId === resolvedClip!.id);
        displayLabel = em ? em.label : resolvedClip.name;
      }
    }
    if (!resolvedClip) {
      showToast('err', 'Hãy chọn một Slot hoặc Emote sẵn có để chỉnh sửa.');
      return;
    }
    void openAnimationEditor(resolvedClip, previewAnimState, displayLabel);
  }, [previewAnimState, animManifest, openAnimationEditor, showToast]);

  const handleExitAnimationEditor = useCallback(() => {
    if (
      animEditorSession &&
      JSON.stringify(animEditorSession.layer) !== animEditorSession.savedSnapshotJson
    ) {
      if (!window.confirm('Bạn có chỉnh sửa chưa lưu. Vẫn thoát trình chỉnh sửa Animation?')) {
        return;
      }
    }
    setEditorPlaying(false);
    setAnimEditorSession(null);
    basePoseCacheRef.current = null;
    rotateGizmoRef.current?.detach();
    translateGizmoRef.current?.detach();
    if (activeCharacterEntityRef.current?.anim) {
      activeCharacterEntityRef.current.anim.enabled = true;
    }
  }, [animEditorSession]);

  const handleSaveAnimationEditor = useCallback(async () => {
    if (!animEditorSession || !localApiReady) return;
    setBusyMessage('Đang lưu lớp chỉnh sửa Keyframe & cập nhật toàn bộ Game...');
    try {
      const layerToSave = cloneAnimEditLayer(animEditorSession.layer);
      layerToSave.updatedAt = new Date().toISOString();
      const hasKeys = hasAnyEditKeys(layerToSave);

      const nextManifest = structuredClone(animManifest);
      const clipIdx = nextManifest.clips.findIndex((c) => c.id === animEditorSession.clipId);
      if (clipIdx < 0) throw new Error('Không tìm thấy clip trong manifest.');

      if (hasKeys) {
        const saveRes = await persistAnimEditLayer(layerToSave, appRef.current ?? undefined);
        nextManifest.clips[clipIdx] = {
          ...nextManifest.clips[clipIdx],
          editLayerUrl: saveRes.url,
          editLayerUpdatedAt: layerToSave.updatedAt,
          updatedAt: layerToSave.updatedAt,
        };
      } else {
        await deleteAnimEditLayer(animEditorSession.clipId, appRef.current ?? undefined).catch(
          () => undefined
        );
        delete nextManifest.clips[clipIdx].editLayerUrl;
        delete nextManifest.clips[clipIdx].editLayerUpdatedAt;
        nextManifest.clips[clipIdx].updatedAt = layerToSave.updatedAt;
      }

      await persistAnimationManifest(nextManifest, appRef.current ?? undefined);
      setAnimManifest(nextManifest);
      setAnimEditorSession((prev) =>
        prev
          ? {
              ...prev,
              layer: layerToSave,
              savedSnapshotJson: JSON.stringify(layerToSave),
            }
          : prev
      );
      showToast(
        'ok',
        `Đã lưu chỉnh sửa "${animEditorSession.displayLabel}" — tự động áp dụng cho mọi nhân vật & Multiplayer!`
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  }, [animEditorSession, animManifest, localApiReady, showToast]);

  const handleDeleteAnimationEditorLayer = useCallback(async () => {
    if (!animEditorSession || !localApiReady) return;
    if (!window.confirm(`Xóa toàn bộ chỉnh sửa keyframe của "${animEditorSession.displayLabel}" để về bản gốc?`)) {
      return;
    }
    setBusyMessage('Đang xóa lớp chỉnh sửa & khôi phục bản gốc...');
    try {
      await deleteAnimEditLayer(animEditorSession.clipId, appRef.current ?? undefined);
      const nextManifest = structuredClone(animManifest);
      const clipIdx = nextManifest.clips.findIndex((c) => c.id === animEditorSession.clipId);
      if (clipIdx >= 0) {
        delete nextManifest.clips[clipIdx].editLayerUrl;
        delete nextManifest.clips[clipIdx].editLayerUpdatedAt;
        nextManifest.clips[clipIdx].updatedAt = new Date().toISOString();
      }
      await persistAnimationManifest(nextManifest, appRef.current ?? undefined);
      setAnimManifest(nextManifest);
      const empty = createEmptyAnimEditLayer(animEditorSession.clipId);
      setUndoStack([]);
      setRedoStack([]);
      setAnimEditorSession((prev) =>
        prev
          ? {
              ...prev,
              layer: empty,
              savedSnapshotJson: JSON.stringify(empty),
            }
          : prev
      );
      showToast('ok', `Đã khôi phục "${animEditorSession.displayLabel}" về animation gốc.`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  }, [animEditorSession, animManifest, localApiReady, showToast]);

  // Keyboard shortcuts when Animation Editor is active
  useEffect(() => {
    if (!animEditorSession) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setEditorPlaying((p) => !p);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoEditor();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedoEditor();
      } else if (e.key.toLowerCase() === 'k' && selectedBone) {
        e.preventDefault();
        const q = new pc.Quat(0, 0, 0, 1);
        sampleBoneDeltaAtTime(animEditorSession.layer.tracks[selectedBone], editorTimeRef.current, q);
        commitLayerWithUndo(
          upsertBoneEditKey(animEditorSession.layer, selectedBone, editorTimeRef.current, [
            q.x,
            q.y,
            q.z,
            q.w,
          ])
        );
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKey) {
        e.preventDefault();
        commitLayerWithUndo(
          removeBoneEditKey(animEditorSession.layer, selectedKey.bone, selectedKey.t)
        );
        setSelectedKey(null);
      } else if (e.key === ',') {
        e.preventDefault();
        handleSeekEditor(editorTimeRef.current - 1 / animEditorSession.fps);
      } else if (e.key === '.') {
        e.preventDefault();
        handleSeekEditor(editorTimeRef.current + 1 / animEditorSession.fps);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedKey) {
        const keyObj = animEditorSession.layer.tracks[selectedKey.bone]?.find(
          (k) => Math.abs(k.t - selectedKey.t) < 0.012
        );
        if (keyObj) setCopiedKeyRot([...keyObj.rot]);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'v' &&
        copiedKeyRot &&
        selectedBone
      ) {
        e.preventDefault();
        commitLayerWithUndo(
          upsertBoneEditKey(animEditorSession.layer, selectedBone, editorTimeRef.current, copiedKeyRot)
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    animEditorSession,
    selectedBone,
    selectedKey,
    copiedKeyRot,
    commitLayerWithUndo,
    handleUndoEditor,
    handleRedoEditor,
    handleSeekEditor,
  ]);

  // Handle dropping a file (Character Model or Animation Clip)
  const handleImportCharacterFile = async (file: File) => {
    const app = appRef.current;
    if (!app) return;
    setBusyMessage(`Đang xử lý & chuẩn hóa model "${file.name}"...`);
    try {
      const converted = await convertDroppedFileToGlb(file);
      if (!converted.hasMesh) {
        // User dropped a meshless animation file while on Character tab -> switch automatically to Animation tab!
        setStudioTab('animation');
        await handleImportAnimationFromConverted(file.name, converted);
        return;
      }

      const tempLoaded = await loadGlbFromArrayBuffer(
        app,
        converted.glbBuffer,
        converted.suggestedFilename,
        `measure:${file.name}:${Date.now()}`
      );
      const bounds = measureCharacterBounds(tempLoaded.entity, 1.72);
      const rig = buildHumanoidRigProfile(tempLoaded.entity);
      const leftArmX = rig.bones.leftUpperArm?.modelPos.x;
      const rightArmX = rig.bones.rightUpperArm?.modelPos.x;
      const autoFacingYaw =
        leftArmX !== undefined && rightArmX !== undefined && leftArmX < rightArmX ? 180 : 0;
      tempLoaded.entity.destroy();

      const cleanTitle = file.name.replace(/\.(glb|gltf|fbx)$/i, '').replace(/[_-]+/g, ' ').trim();
      setStudioTab('character');
      setDraftAnim(null);
      setDraftModel({
        converted,
        rawFileName: file.name,
        label: cleanTitle || 'Nhân vật Mới',
        subtitle: `Custom • ${rig.detectedRigType.toUpperCase()} Rig (${rig.mappedCount}/22 xương)`,
        scale: bounds.recommendedScale,
        rawHeight: bounds.rawHeight,
        groundOffsetY: bounds.recommendedGroundOffsetY,
        facingYawOffset: autoFacingYaw,
        armPoseOffsetDeg: 0,
        autoArmConvergence: true,
        tintable: false,
        boneMap: {},
      });
      setPreviewAnimState('Idle_Loop');
      const warnSuffix = converted.warnings?.length ? ` (${converted.warnings[0]})` : '';
      showToast(
        'ok',
        `Đã nạp "${file.name}" (${converted.sourceFormat.toUpperCase()}) • Tự căn chiều cao 1.72m & khớp ${rig.mappedCount}/22 xương!${warnSuffix}`
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleImportAnimationFromConverted = async (
    rawFileName: string,
    converted: ConvertedGlbPayload
  ) => {
    const app = appRef.current;
    if (!app) return;
    const srcContainer = await loadAnimSourceContainerFromBuffer(
      app,
      converted.glbBuffer,
      converted.suggestedFilename,
      `inspect_anim:${rawFileName}:${Date.now()}`
    );
    if (srcContainer.animTracks.length === 0) {
      throw new Error(`File "${rawFileName}" không chứa animation track nào.`);
    }
    const firstTrackName = srcContainer.animTracks[0];
    const firstTrack = srcContainer.animTrackMap[firstTrackName];
    const dur = Number((firstTrack?.duration || 2).toFixed(2));
    const cleanTitle = rawFileName
      .replace(/\.(glb|gltf|fbx)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();

    setDraftModel(null);
    setDraftAnim({
      converted: {
        ...converted,
        clipNames: srcContainer.animTracks,
      },
      rawFileName,
      selectedTrackName: firstTrackName,
      clipLabel: cleanTitle.replace(/\s+/g, '_') || 'Custom_Anim',
      speed: 1,
      loop: true,
      inPlace: true,
      trimStart: 0,
      trimEnd: dur,
      maxDuration: dur,
      yawOffsetDeg: 0,
      hipsYOffset: 0,
      emoteLabel: cleanTitle || 'Điệu nhảy Mới',
      emoteSublabel: firstTrackName,
      emoteAccent: ACCENT_SWATCHES[animManifest.emotes.length % ACCENT_SWATCHES.length],
      emoteIcon: 'music',
    });
    setPreviewAnimState('__draft_anim__');
    showToast(
      'ok',
      `Đã nạp animation "${rawFileName}" (${srcContainer.animTracks.length} track, ${dur}s) — Đang chạy thử trên nhân vật!`
    );
  };

  const handleImportAnimationFile = async (file: File) => {
    setBusyMessage(`Đang chuyển đổi & trích xuất animation "${file.name}"...`);
    try {
      const converted = await convertDroppedFileToGlb(file);
      await handleImportAnimationFromConverted(file.name, converted);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleViewportDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (studioTab === 'animation') {
      void handleImportAnimationFile(file);
    } else {
      void handleImportCharacterFile(file);
    }
  };

  // === PUBLISH ACTIONS: CHARACTER ===

  const handlePublishCharacter = async (mode: 'replace' | 'add') => {
    if (!draftModel) return;
    if (!localApiReady) {
      showToast('err', 'Chỉ lưu được khi chạy local dev server (`npm run dev`).');
      return;
    }

    setBusyMessage(
      mode === 'replace'
        ? 'Đang ghi file GLB vào public/models/ & thay thế nhân vật...'
        : 'Đang ghi file GLB vào public/models/ & thêm nhân vật mới...'
    );
    try {
      const slug = slugifyStudioId(draftModel.label, 'character');
      const uploadRes = await uploadStudioGlbToPublic(
        'model',
        slug,
        draftModel.converted.glbBuffer
      );

      const nowIso = new Date().toISOString();
      const nextManifest = structuredClone(charManifest);

      if (mode === 'replace') {
        const idx = nextManifest.characters.findIndex((c) => c.id === replaceTargetCharId);
        if (idx < 0) throw new Error('Không tìm thấy nhân vật cần thay thế.');
        const prev = nextManifest.characters[idx];
        const preservedOriginal =
          prev.originalPreset ??
          (prev.isBuiltIn
            ? {
                label: prev.label,
                subtitle: prev.subtitle,
                url: prev.url,
                filename: prev.filename,
                scale: prev.scale,
                groundOffsetY: prev.groundOffsetY ?? 0,
                facingYawOffset: prev.facingYawOffset ?? 0,
                armPoseOffsetDeg: prev.armPoseOffsetDeg ?? 0,
                autoArmConvergence: prev.autoArmConvergence,
                tintable: prev.tintable,
              }
            : undefined);

        nextManifest.characters[idx] = {
          ...prev,
          label: draftModel.label.trim() || prev.label,
          subtitle: draftModel.subtitle.trim() || prev.subtitle,
          url: uploadRes.url,
          filename: uploadRes.filename,
          scale: draftModel.scale,
          groundOffsetY: draftModel.groundOffsetY,
          facingYawOffset: draftModel.facingYawOffset,
          armPoseOffsetDeg: draftModel.armPoseOffsetDeg,
          autoArmConvergence: draftModel.autoArmConvergence,
          tintable: draftModel.tintable,
          boneMap: Object.keys(draftModel.boneMap).length > 0 ? draftModel.boneMap : undefined,
          originalPreset: preservedOriginal,
          updatedAt: nowIso,
        };
        await persistCharacterManifest(nextManifest, appRef.current ?? undefined);
        const oldUrlStillUsed =
          prev.url === uploadRes.url ||
          prev.url === preservedOriginal?.url ||
          nextManifest.characters.some((c) => c.url === prev.url);
        if (!oldUrlStillUsed && prev.url.startsWith('/models/')) {
          await deletePublicStudioAsset(prev.url).catch(() => undefined);
        }
        setCharManifest(nextManifest);
        setSelectedCharacterId(prev.id);
        setDraftModel(null);
        showToast(
          'ok',
          `Đã thay thế "${prev.label}" bằng "${uploadRes.diskPath}"! Game & git diff đã cập nhật.`
        );
      } else {
        let uniqueId = slug;
        let suffix = 2;
        while (nextManifest.characters.some((c) => c.id === uniqueId)) {
          uniqueId = `${slug}_${suffix++}`;
        }
        const newEntry: CharacterManifestEntry = {
          id: uniqueId,
          label: draftModel.label.trim() || 'Nhân vật Mới',
          subtitle: draftModel.subtitle.trim() || 'Custom Avatar',
          url: uploadRes.url,
          filename: uploadRes.filename,
          scale: draftModel.scale,
          groundOffsetY: draftModel.groundOffsetY,
          facingYawOffset: draftModel.facingYawOffset,
          armPoseOffsetDeg: draftModel.armPoseOffsetDeg,
          autoArmConvergence: draftModel.autoArmConvergence,
          tintable: draftModel.tintable,
          isBuiltIn: false,
          boneMap: Object.keys(draftModel.boneMap).length > 0 ? draftModel.boneMap : undefined,
          updatedAt: nowIso,
        };
        nextManifest.characters.push(newEntry);
        await persistCharacterManifest(nextManifest, appRef.current ?? undefined);
        setCharManifest(nextManifest);
        setSelectedCharacterId(uniqueId);
        setDraftModel(null);
        showToast(
          'ok',
          `Đã thêm nhân vật mới "${newEntry.label}" (${uploadRes.diskPath}) vào danh sách chọn trong Game!`
        );
      }
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleAutoFixCharacter = async () => {
    const app = appRef.current;
    if (!app) return;
    setBusyMessage('Đang tự động đo chiều cao, mặt sàn & ánh xạ 22 khớp xương...');
    try {
      let buffer: ArrayBuffer;
      let filename: string;
      let key: string;
      if (draftModel) {
        buffer = draftModel.converted.glbBuffer;
        filename = draftModel.converted.suggestedFilename;
        key = `autofix:draft:${buffer.byteLength}:${Date.now()}`;
      } else {
        const target = charManifest.characters.find((c) => c.id === selectedCharacterId);
        if (!target) return;
        const res = await fetch(target.url);
        if (!res.ok) throw new Error(`Không tải được ${target.url}`);
        buffer = await res.arrayBuffer();
        filename = target.filename;
        key = `autofix:${target.url}:${Date.now()}`;
      }

      const tempLoaded = await loadGlbFromArrayBuffer(app, buffer, filename, key);
      const bounds = measureCharacterBounds(tempLoaded.entity, 1.72);
      const rig = buildHumanoidRigProfile(tempLoaded.entity);
      const leftArmX = rig.bones.leftUpperArm?.modelPos.x;
      const rightArmX = rig.bones.rightUpperArm?.modelPos.x;
      const autoFacingYaw =
        leftArmX !== undefined && rightArmX !== undefined && leftArmX < rightArmX ? 180 : 0;
      tempLoaded.entity.destroy();

      if (draftModel) {
        setDraftModel({
          ...draftModel,
          scale: bounds.recommendedScale,
          rawHeight: bounds.rawHeight,
          groundOffsetY: bounds.recommendedGroundOffsetY,
          facingYawOffset: autoFacingYaw,
          armPoseOffsetDeg: 0,
          autoArmConvergence: true,
          boneMap: {},
        });
      } else if (editPresetForm) {
        setEditPresetForm({
          ...editPresetForm,
          scale: bounds.recommendedScale,
          groundOffsetY: bounds.recommendedGroundOffsetY,
          facingYawOffset: autoFacingYaw,
          armPoseOffsetDeg: 0,
          autoArmConvergence: true,
          boneMap: {},
        });
      }
      showToast(
        'ok',
        `Auto-Fix xong: cao 1.72m (scale ${bounds.recommendedScale}), hướng mặt ${autoFacingYaw}°, khớp ${rig.mappedCount}/22 xương!`
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleSaveExistingCharacterTweaks = async () => {
    if (!editPresetForm || !localApiReady) return;
    setBusyMessage('Đang lưu tinh chỉnh nhân vật vào public/characters/manifest.json...');
    try {
      const next = structuredClone(charManifest);
      const idx = next.characters.findIndex((c) => c.id === selectedCharacterId);
      if (idx < 0) return;
      next.characters[idx] = {
        ...next.characters[idx],
        label: editPresetForm.label.trim() || next.characters[idx].label,
        subtitle: editPresetForm.subtitle.trim(),
        scale: editPresetForm.scale,
        groundOffsetY: editPresetForm.groundOffsetY,
        facingYawOffset: editPresetForm.facingYawOffset,
        armPoseOffsetDeg: editPresetForm.armPoseOffsetDeg,
        autoArmConvergence: editPresetForm.autoArmConvergence,
        tintable: editPresetForm.tintable,
        boneMap:
          Object.keys(editPresetForm.boneMap).length > 0 ? editPresetForm.boneMap : undefined,
        updatedAt: new Date().toISOString(),
      };
      await persistCharacterManifest(next, appRef.current ?? undefined);
      setCharManifest(next);
      showToast('ok', `Đã cập nhật thông số nhân vật "${next.characters[idx].label}".`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleRestoreOriginalCharacter = async (charId: string) => {
    const target = charManifest.characters.find((c) => c.id === charId);
    if (!target?.originalPreset || !localApiReady) return;
    setBusyMessage(`Đang khôi phục "${target.originalPreset.label}" về model gốc...`);
    try {
      const next = structuredClone(charManifest);
      const idx = next.characters.findIndex((c) => c.id === charId);
      if (idx < 0) return;
      const orig = target.originalPreset;
      next.characters[idx] = {
        ...next.characters[idx],
        label: orig.label,
        subtitle: orig.subtitle,
        url: orig.url,
        filename: orig.filename,
        scale: orig.scale,
        groundOffsetY: orig.groundOffsetY ?? 0,
        facingYawOffset: orig.facingYawOffset ?? 0,
        armPoseOffsetDeg: orig.armPoseOffsetDeg ?? 0,
        autoArmConvergence: orig.autoArmConvergence,
        tintable: orig.tintable,
        boneMap: undefined,
        updatedAt: new Date().toISOString(),
      };
      await persistCharacterManifest(next, appRef.current ?? undefined);
      setCharManifest(next);
      showToast('ok', `Đã khôi phục "${orig.label}" về model mặc định ban đầu.`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleDeleteCustomCharacter = async (charId: string) => {
    const target = charManifest.characters.find((c) => c.id === charId);
    if (!target || target.isBuiltIn || !localApiReady) return;
    if (!window.confirm(`Xóa nhân vật "${target.label}" và file ${target.url}?`)) return;
    setBusyMessage(`Đang xóa nhân vật "${target.label}"...`);
    try {
      const next = structuredClone(charManifest);
      next.characters = next.characters.filter((c) => c.id !== charId);
      if (next.defaultCharacterId === charId) {
        next.defaultCharacterId = next.characters[0]?.id ?? 'default';
      }
      const stillReferenced = next.characters.some((c) => c.url === target.url);
      if (!stillReferenced) {
        await deletePublicStudioAsset(target.url).catch(() => undefined);
      }
      await persistCharacterManifest(next, appRef.current ?? undefined);
      setCharManifest(next);
      setSelectedCharacterId(next.defaultCharacterId);
      showToast('ok', `Đã xóa nhân vật "${target.label}".`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleSetDefaultCharacter = async (charId: string) => {
    if (!localApiReady) return;
    const next = structuredClone(charManifest);
    next.defaultCharacterId = charId;
    await persistCharacterManifest(next, appRef.current ?? undefined);
    setCharManifest(next);
    showToast('ok', 'Đã đặt làm nhân vật mặc định khi người chơi mới vào Game.');
  };

  // === PUBLISH ACTIONS: ANIMATION ===

  const cleanupUnusedCustomClips = async (manifest: AnimationManifest): Promise<void> => {
    const referencedIds = new Set<string>([
      ...Object.values(manifest.slots),
      ...Object.values(manifest.defaultSlots ?? {}),
      ...manifest.emotes.map((e) => e.clipId),
    ]);
    const removedClips = manifest.clips.filter((c) => !c.isBuiltIn && !referencedIds.has(c.id));
    if (removedClips.length === 0) return;

    manifest.clips = manifest.clips.filter((c) => c.isBuiltIn || referencedIds.has(c.id));
    const remainingUrls = new Set(manifest.clips.map((c) => c.url));
    for (const removed of removedClips) {
      if (
        removed.url &&
        !remainingUrls.has(removed.url) &&
        removed.url !== '/animations/core_locomotion.glb' &&
        removed.url !== '/animations/core_emotes.glb'
      ) {
        await deletePublicStudioAsset(removed.url).catch(() => undefined);
      }
    }
  };

  const handlePublishAnimation = async (mode: 'replace' | 'add_emote') => {
    if (!draftAnim) return;
    if (!localApiReady) {
      showToast('err', 'Chỉ lưu được khi chạy local dev server (`npm run dev`).');
      return;
    }

    setBusyMessage(
      mode === 'replace'
        ? 'Đang ghi đè clip GLB vào public/animations/ & cập nhật slot...'
        : 'Đang ghi clip GLB vào public/animations/ & thêm Emote mới...'
    );
    try {
      const slug = slugifyStudioId(draftAnim.clipLabel, 'anim_clip');
      const nextAnim = structuredClone(animManifest);
      const nowIso = new Date().toISOString();

      const buildClipProps = (id: string, name: string, url: string): AnimationClipEntry => ({
        id,
        name,
        url,
        trackName: draftAnim.selectedTrackName,
        speed: draftAnim.speed,
        loop: draftAnim.loop,
        inPlace: draftAnim.inPlace,
        trimStart: draftAnim.trimStart > 0.01 ? draftAnim.trimStart : undefined,
        trimEnd:
          draftAnim.trimEnd < draftAnim.maxDuration - 0.01 ? draftAnim.trimEnd : undefined,
        yawOffsetDeg:
          Math.abs(draftAnim.yawOffsetDeg) > 0.01 ? draftAnim.yawOffsetDeg : undefined,
        hipsYOffset:
          Math.abs(draftAnim.hipsYOffset) > 0.005 ? draftAnim.hipsYOffset : undefined,
        isBuiltIn: false,
        updatedAt: nowIso,
      });

      if (mode === 'replace') {
        const isSlot = replaceAnimTarget.startsWith('slot:');
        const slotKey = isSlot ? (replaceAnimTarget.slice(5) as CoreAnimSlotId) : null;
        const emoteId = !isSlot && replaceAnimTarget.startsWith('emote:') ? replaceAnimTarget.slice(6) : null;
        const emIdx = emoteId ? nextAnim.emotes.findIndex((e) => e.id === emoteId) : -1;

        const oldClipId = slotKey
          ? nextAnim.slots[slotKey]
          : emIdx >= 0
            ? nextAnim.emotes[emIdx].clipId
            : '';
        const oldClipIdx = nextAnim.clips.findIndex((c) => c.id === oldClipId);
        const oldClip = oldClipIdx >= 0 ? nextAnim.clips[oldClipIdx] : undefined;

        const oldUsedByOtherSlot = Object.entries(nextAnim.slots).some(
          ([k, cid]) => cid === oldClipId && k !== slotKey
        );
        const oldUsedByDefault = Object.values(nextAnim.defaultSlots ?? {}).includes(oldClipId);
        const oldUsedByOtherEmote = nextAnim.emotes.some(
          (e, idx) => e.clipId === oldClipId && idx !== emIdx
        );
        const canOverwriteInPlace = Boolean(
          oldClip &&
            !oldClip.isBuiltIn &&
            !oldUsedByOtherSlot &&
            !oldUsedByDefault &&
            !oldUsedByOtherEmote &&
            oldClip.url.startsWith('/animations/') &&
            oldClip.url !== '/animations/core_locomotion.glb' &&
            oldClip.url !== '/animations/core_emotes.glb'
        );

        const targetBaseName = canOverwriteInPlace && oldClip
          ? (oldClip.url.split('/').pop()?.replace(/\.(glb|gltf|fbx)$/i, '') || slug)
          : slug;

        const uploadRes = await uploadStudioGlbToPublic(
          'animation',
          targetBaseName,
          draftAnim.converted.glbBuffer
        );

        let finalClipId: string;
        let finalStateName: string;

        if (canOverwriteInPlace && oldClip) {
          finalClipId = oldClip.id;
          finalStateName = oldClip.name;
          nextAnim.clips[oldClipIdx] = buildClipProps(finalClipId, finalStateName, uploadRes.url);
        } else {
          let clipId = slug;
          let suffix = 2;
          while (nextAnim.clips.some((c) => c.id === clipId)) {
            clipId = `${slug}_${suffix++}`;
          }
          finalClipId = clipId;
          finalStateName = `Custom_${clipId}`;
          nextAnim.clips.push(buildClipProps(finalClipId, finalStateName, uploadRes.url));
        }

        if (slotKey) {
          nextAnim.slots[slotKey] = finalClipId;
          await cleanupUnusedCustomClips(nextAnim);
          await persistAnimationManifest(nextAnim, appRef.current ?? undefined);
          setAnimManifest(nextAnim);
          setDraftAnim(null);
          setPreviewAnimState(CORE_SLOT_STATE_NAMES[slotKey]);
          void refreshAnimFolder();
          showToast(
            'ok',
            `Đã ghi đè động tác "${CORE_SLOT_LABELS[slotKey]}" bằng "${uploadRes.diskPath}" trên toàn bộ nhân vật!`
          );
        } else if (emIdx >= 0) {
          nextAnim.emotes[emIdx] = {
            ...nextAnim.emotes[emIdx],
            label: draftAnim.emoteLabel.trim() || nextAnim.emotes[emIdx].label,
            sublabel: draftAnim.emoteSublabel.trim() || nextAnim.emotes[emIdx].sublabel,
            clipId: finalClipId,
          };
          await cleanupUnusedCustomClips(nextAnim);
          await persistAnimationManifest(nextAnim, appRef.current ?? undefined);
          setAnimManifest(nextAnim);
          setDraftAnim(null);
          setPreviewAnimState(finalStateName);
          void refreshAnimFolder();
          showToast(
            'ok',
            `Đã ghi đè Emote "${nextAnim.emotes[emIdx].label}" bằng "${uploadRes.diskPath}"!`
          );
        }
      } else {
        const uploadRes = await uploadStudioGlbToPublic(
          'animation',
          slug,
          draftAnim.converted.glbBuffer
        );
        let clipId = slug;
        let suffix = 2;
        while (nextAnim.clips.some((c) => c.id === clipId)) {
          clipId = `${slug}_${suffix++}`;
        }
        const stateName = `Custom_${clipId}`;
        nextAnim.clips.push(buildClipProps(clipId, stateName, uploadRes.url));

        let emoteId = slugifyStudioId(draftAnim.emoteLabel, 'emote');
        let eSuffix = 2;
        while (nextAnim.emotes.some((e) => e.id === emoteId)) {
          emoteId = `${slugifyStudioId(draftAnim.emoteLabel, 'emote')}_${eSuffix++}`;
        }
        nextAnim.emotes.push({
          id: emoteId,
          label: draftAnim.emoteLabel.trim() || 'Emote Mới',
          sublabel: draftAnim.emoteSublabel.trim() || stateName,
          accent: draftAnim.emoteAccent,
          icon: draftAnim.emoteIcon,
          clipId,
          isBuiltIn: false,
        });
        await persistAnimationManifest(nextAnim, appRef.current ?? undefined);
        setAnimManifest(nextAnim);
        setDraftAnim(null);
        setPreviewAnimState(stateName);
        void refreshAnimFolder();
        showToast(
          'ok',
          `Đã thêm Emote mới "${draftAnim.emoteLabel}" vào vòng quay Hold R (${uploadRes.diskPath})!`
        );
      }
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleRestoreCoreSlot = async (slotKey: CoreAnimSlotId) => {
    if (!localApiReady) return;
    const defClipId = animManifest.defaultSlots?.[slotKey];
    if (!defClipId) return;
    const next = structuredClone(animManifest);
    next.slots[slotKey] = defClipId;
    await cleanupUnusedCustomClips(next);
    await persistAnimationManifest(next, appRef.current ?? undefined);
    setAnimManifest(next);
    setPreviewAnimState(CORE_SLOT_STATE_NAMES[slotKey]);
    void refreshAnimFolder();
    showToast('ok', `Đã khôi phục "${CORE_SLOT_LABELS[slotKey]}" về animation mặc định và dọn clip cũ.`);
  };

  const handleDeleteCustomEmote = async (emoteId: string) => {
    const target = animManifest.emotes.find((e) => e.id === emoteId);
    if (!target || target.isBuiltIn || !localApiReady) return;
    if (!window.confirm(`Xóa Emote "${target.label}" khỏi vòng quay Hold R?`)) return;
    const next = structuredClone(animManifest);
    next.emotes = next.emotes.filter((e) => e.id !== emoteId);
    await cleanupUnusedCustomClips(next);
    await persistAnimationManifest(next, appRef.current ?? undefined);
    setAnimManifest(next);
    setPreviewAnimState('Idle_Loop');
    void refreshAnimFolder();
    showToast('ok', `Đã xóa Emote "${target.label}".`);
  };

  const handleDeleteAnimationFile = async (file: PublicAnimationFileEntry) => {
    if (!localApiReady || file.isProtected) return;
    const msg = file.isReferenced
      ? `File "${file.name}" đang được gán trong game (${file.usedBy.join(', ')}). Vẫn muốn xóa khỏi public/animations/?`
      : `Xóa file không dùng "${file.name}" khỏi thư mục public/animations/?`;
    if (!window.confirm(msg)) return;
    setBusyMessage(`Đang xóa ${file.name}...`);
    try {
      await deletePublicStudioAsset(file.url);
      await refreshAnimFolder();
      showToast('ok', `Đã xóa "${file.name}" khỏi public/animations/.`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const handleCleanupUnusedAnimFiles = async () => {
    if (!localApiReady) return;
    const unused = animFolderFiles.filter((f) => !f.isProtected && !f.isReferenced);
    if (unused.length === 0) return;
    const totalMb = (unused.reduce((acc, f) => acc + f.sizeBytes, 0) / (1024 * 1024)).toFixed(2);
    if (
      !window.confirm(
        `Dọn sạch ${unused.length} file animation không dùng (${totalMb} MB) trong public/animations/?`
      )
    ) {
      return;
    }
    setBusyMessage(`Đang dọn ${unused.length} file dư...`);
    try {
      for (const f of unused) {
        await deletePublicStudioAsset(f.url);
      }
      await refreshAnimFolder();
      showToast('ok', `Đã dọn ${unused.length} file không dùng (tiết kiệm ${totalMb} MB).`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMessage(null);
    }
  };

  const selectedSavedChar = charManifest.characters.find((c) => c.id === selectedCharacterId);
  const currentBoneMap = draftModel ? draftModel.boneMap : (editPresetForm?.boneMap ?? {});

  const updateActiveBoneMap = (boneKey: HumanoidBoneKey, nodeName: string) => {
    if (draftModel) {
      const nextMap = { ...draftModel.boneMap };
      if (nodeName) nextMap[boneKey] = nodeName;
      else delete nextMap[boneKey];
      setDraftModel({ ...draftModel, boneMap: nextMap });
    } else if (editPresetForm) {
      const nextMap = { ...editPresetForm.boneMap };
      if (nodeName) nextMap[boneKey] = nodeName;
      else delete nextMap[boneKey];
      setEditPresetForm({ ...editPresetForm, boneMap: nextMap });
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0f1218] text-gray-200 overflow-hidden select-none">
      {/* Top Header */}
      <header className="h-12 px-4 bg-[#161a23] border-b border-[#262c3a] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow">
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>Character & Animation Studio</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  localApiReady
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {localApiReady === null
                  ? 'Đang kiểm tra Server...'
                  : localApiReady
                    ? 'Local Sync Active (ghi trực tiếp vào public/)'
                    : 'Read-Only Preview (chạy npm run dev để lưu file)'}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Kéo thả model (.glb / .fbx) hoặc animation Mixamo (.fbx / .glb) — Tự động khớp xương Humanoid & lưu thẳng vào Game
            </p>
          </div>
        </div>

        {/* Center Mode Switcher */}
        <div className="flex items-center bg-[#0f1218] p-1 rounded-xl border border-[#262c3a]">
          <button
            type="button"
            onClick={() => setStudioTab('character')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              studioTab === 'character'
                ? 'bg-sky-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Nhân vật ({charManifest.characters.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setStudioTab('animation')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              studioTab === 'animation'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Animations & Emotes ({animManifest.emotes.length})</span>
          </button>
        </div>

        {/* Right Quick Navigation */}
        <div className="flex items-center gap-2">
          <a
            href="/?editor=1"
            className="px-3 py-1.5 rounded-lg bg-[#202634] hover:bg-[#2a3244] border border-[#313a4e] text-xs font-medium text-gray-200 transition"
          >
            3D Scene Editor
          </a>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 transition shadow"
          >
            <span>Mở Game Test</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* Main 3-Column Body */}
      <div className="flex-1 min-h-0 grid grid-cols-12">
        {/* LEFT COLUMN: Current Game Library */}
        <aside className="col-span-3 bg-[#141821] border-r border-[#242a38] flex flex-col min-h-0">
          {studioTab === 'character' ? (
            <>
              <div className="p-3 border-b border-[#242a38] flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                    Nhân vật trong Game
                  </h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    File: public/characters/manifest.json
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => modelInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-[11px] font-semibold text-white flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Import</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                {charManifest.characters.map((ch) => {
                  const isSelected = !draftModel && selectedCharacterId === ch.id;
                  const isDefault = charManifest.defaultCharacterId === ch.id;
                  const wasReplaced =
                    ch.originalPreset && ch.url !== ch.originalPreset.url;

                  return (
                    <div
                      key={ch.id}
                      onClick={() => {
                        setDraftModel(null);
                        setSelectedCharacterId(ch.id);
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-400 text-white'
                          : 'bg-[#191e2a] border-[#272e3f] hover:border-[#3a445d] text-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                            <span>{ch.label}</span>
                            {isDefault && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                                MẶC ĐỊNH
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 truncate mt-0.5">
                            {ch.subtitle}
                          </div>
                          <div className="text-[10px] font-mono text-gray-500 truncate mt-1">
                            {ch.url} • scale {ch.scale}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!isDefault && (
                            <button
                              type="button"
                              title="Đặt làm nhân vật mặc định"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleSetDefaultCharacter(ch.id);
                              }}
                              className="px-1.5 py-1 rounded bg-[#242b3b] hover:bg-emerald-600/30 text-[10px] text-gray-300 hover:text-emerald-200"
                            >
                              Set Default
                            </button>
                          )}
                          {wasReplaced && (
                            <button
                              type="button"
                              title="Khôi phục về model gốc ban đầu"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRestoreOriginalCharacter(ch.id);
                              }}
                              className="p-1.5 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!ch.isBuiltIn && (
                            <button
                              type="button"
                              title="Xóa nhân vật custom này"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteCustomCharacter(ch.id);
                              }}
                              className="p-1.5 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="p-3 border-b border-[#242a38] flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                    Slots Hành động & Emotes
                  </h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    File: public/animations/manifest.json
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => animInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Import Anim</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
                {/* Character switcher to verify retargeting across rigs */}
                <div className="p-2.5 rounded-xl bg-[#191e2a] border border-[#272e3f] space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block">
                    Xem thử trên Nhân vật
                  </label>
                  <select
                    value={selectedCharacterId}
                    onChange={(e) => {
                      setDraftModel(null);
                      setSelectedCharacterId(e.target.value);
                    }}
                    className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {charManifest.characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({c.filename})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Core Locomotion Slots */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1">
                    Hành động Cơ bản (Locomotion Slots)
                  </div>
                  {(Object.keys(CORE_SLOT_LABELS) as CoreAnimSlotId[]).map((slotKey) => {
                    const stateName = CORE_SLOT_STATE_NAMES[slotKey];
                    const clipId = animManifest.slots[slotKey];
                    const clip = animManifest.clips.find((c) => c.id === clipId);
                    const isOverridden =
                      animManifest.defaultSlots &&
                      animManifest.defaultSlots[slotKey] !== clipId;
                    const active = previewAnimState === stateName;

                    return (
                      <div
                        key={slotKey}
                        onClick={() => setPreviewAnimState(stateName)}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between gap-2 transition ${
                          active
                            ? 'bg-indigo-500/20 border-indigo-400 text-white'
                            : 'bg-[#191e2a] border-[#272e3f] hover:border-[#38425a] text-gray-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                            <span>{CORE_SLOT_LABELS[slotKey]}</span>
                            {clip?.editLayerUrl && (
                              <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                Đã sửa
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-gray-400 truncate">
                            {clip?.url ?? clipId} ({clip?.trackName || clip?.name})
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {clip && (
                            <button
                              type="button"
                              title="Mở trình chỉnh sửa Keyframe & IK (kiểu Unity)"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openAnimationEditor(clip, stateName, CORE_SLOT_LABELS[slotKey]);
                              }}
                              className="px-1.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-200 text-[10px] font-semibold flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Sửa</span>
                            </button>
                          )}
                          {isOverridden && (
                            <button
                              type="button"
                              title="Khôi phục động tác gốc"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRestoreCoreSlot(slotKey);
                              }}
                              className="p-1 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Radial Emote Wheel */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1">
                    Vòng quay Biểu cảm — Hold R ({animManifest.emotes.length})
                  </div>
                  {animManifest.emotes.map((emote) => {
                    const clip = animManifest.clips.find((c) => c.id === emote.clipId);
                    const stateName = clip?.name ?? emote.clipId;
                    const active = previewAnimState === stateName;
                    return (
                      <div
                        key={emote.id}
                        onClick={() => setPreviewAnimState(stateName)}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between gap-2 transition ${
                          active
                            ? 'bg-indigo-500/20 border-indigo-400 text-white'
                            : 'bg-[#191e2a] border-[#272e3f] hover:border-[#38425a] text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: emote.accent }}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                              <span>{emote.label}</span>
                              {clip?.editLayerUrl && (
                                <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                  Đã sửa
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-gray-400 truncate">
                              {clip?.url ?? emote.clipId}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {clip && (
                            <button
                              type="button"
                              title="Mở trình chỉnh sửa Keyframe & IK (kiểu Unity)"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openAnimationEditor(clip, stateName, emote.label);
                              }}
                              className="px-1.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-200 text-[10px] font-semibold flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Sửa</span>
                            </button>
                          )}
                          {!emote.isBuiltIn && (
                            <button
                              type="button"
                              title="Xóa Emote này"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteCustomEmote(emote.id);
                              }}
                              className="p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Public Animations Folder Explorer & Cleanup */}
                <div className="space-y-2 pt-2 border-t border-[#242a38]">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-300">
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>Thư mục public/animations/</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {animFolderFiles.some((f) => !f.isProtected && !f.isReferenced) && (
                        <button
                          type="button"
                          onClick={() => void handleCleanupUnusedAnimFiles()}
                          className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-200 text-[10px] font-semibold transition"
                          title="Xóa tất cả file không được slot/emote nào sử dụng"
                        >
                          Dọn file dư ({animFolderFiles.filter((f) => !f.isProtected && !f.isReferenced).length})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void refreshAnimFolder()}
                        disabled={loadingAnimFolder}
                        title="Làm mới danh sách file"
                        className="p-1 rounded bg-[#191e2a] hover:bg-[#232a3b] border border-[#272e3f] text-gray-300"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingAnimFolder ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {!localApiReady ? (
                    <div className="p-2.5 rounded-xl bg-[#191e2a] border border-[#272e3f] text-[11px] text-gray-400">
                      Chạy <code className="text-indigo-300">npm run dev</code> để xem và dọn file trong <code className="text-indigo-300">public/animations/</code>.
                    </div>
                  ) : animFolderFiles.length === 0 ? (
                    <div className="p-2.5 rounded-xl bg-[#191e2a] border border-[#272e3f] text-[11px] text-gray-400">
                      {loadingAnimFolder ? 'Đang quét thư mục...' : 'Chưa có file nào.'}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {animFolderFiles.map((file) => {
                        const sizeLabel =
                          file.sizeBytes >= 1024 * 1024
                            ? `${(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                            : `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB`;
                        return (
                          <div
                            key={file.url}
                            className="p-2 rounded-xl bg-[#191e2a] border border-[#272e3f] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-mono text-white truncate">
                                  {file.name}
                                </span>
                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/10 text-gray-300 shrink-0">
                                  {sizeLabel}
                                </span>
                                {file.isProtected ? (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-semibold shrink-0">
                                    Core
                                  </span>
                                ) : file.isReferenced ? (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold shrink-0">
                                    Đang dùng
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold shrink-0">
                                    Không dùng
                                  </span>
                                )}
                              </div>
                              {file.usedBy.length > 0 && (
                                <div className="text-[10px] text-gray-400 truncate mt-0.5">
                                  {file.usedBy.join(' • ')}
                                </div>
                              )}
                            </div>

                            {!file.isProtected && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteAnimationFile(file)}
                                title={`Xóa ${file.name}`}
                                className="p-1.5 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 shrink-0 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* CENTER COLUMN: 3D Live Retargeting Viewport */}
        <main
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDragOver) setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            const rel = e.relatedTarget as Node | null;
            if (!rel || !e.currentTarget.contains(rel)) setIsDragOver(false);
          }}
          onDrop={handleViewportDrop}
          className="col-span-5 relative bg-[#0c0e14] flex flex-col min-h-0"
        >
          <div className="flex-1 relative min-h-0">
            <canvas ref={canvasRef} className="w-full h-full block outline-none" />

            {/* Top Overlay Info Badges */}
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none gap-2">
              <div className="px-3 py-2 rounded-xl bg-black/65 backdrop-blur-md border border-white/10 space-y-0.5">
                <div className="text-xs font-semibold text-white">
                  {draftModel ? `[Bản xem thử] ${draftModel.label}` : activePreviewPreset?.label}
                </div>
                {rigProfileSummary && (
                  <div className="text-[11px] flex items-center gap-1.5">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        rigProfileSummary.mappedCount >= 15 ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-gray-300">
                      Hệ xương: <strong className="uppercase">{rigProfileSummary.rigType}</strong> • Đã khớp{' '}
                      <strong>{rigProfileSummary.mappedCount}/22</strong> khớp Humanoid
                    </span>
                  </div>
                )}
                <div className="text-[10px] text-sky-300">
                  Mũi tên xanh dưới sàn = Hướng mặt trước của nhân vật • Cột vàng = Chuẩn cao 1.72m
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSkeletonGizmo((v) => !v)}
                className={`pointer-events-auto px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 backdrop-blur-md transition ${
                  showSkeletonGizmo
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                    : 'bg-black/65 border-white/15 text-gray-300 hover:text-white'
                }`}
              >
                <Bone className="w-3.5 h-3.5" />
                <span>Hiện Xương</span>
              </button>
            </div>

            {/* Drag-Drop Overlay */}
            {isDragOver && (
              <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-sky-400 bg-sky-950/60 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 pointer-events-none">
                <Upload className="w-10 h-10 text-sky-300 mb-2 animate-bounce" />
                <p className="text-sm font-bold text-white">
                  Thả file .GLB / .GLTF / .FBX vào đây để xem thử trực tiếp!
                </p>
                <p className="text-xs text-sky-200 mt-1">
                  Chưa ghi vào ổ cứng cho tới khi bạn bấm &ldquo;Lưu vào Game&rdquo;
                </p>
              </div>
            )}

            {/* Busy Spinner */}
            {busyMessage && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-20">
                <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
                <p className="text-xs font-medium text-white">{busyMessage}</p>
              </div>
            )}

            {/* Toast Notification */}
            {toast && (
              <div
                className={`absolute bottom-3 left-3 right-3 px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 shadow-xl backdrop-blur-md z-10 ${
                  toast.kind === 'ok'
                    ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100'
                    : 'bg-rose-950/90 border-rose-500/40 text-rose-100'
                }`}
              >
                <span>{toast.text}</span>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="text-gray-300 hover:text-white font-bold px-1"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Bottom Area: Unity-style Dopesheet Timeline OR Animation Quick-Test Bar */}
          {animEditorSession ? (
            <AnimationEditorTimeline
              duration={animEditorSession.duration}
              fps={animEditorSession.fps}
              currentTime={editorTime}
              isPlaying={editorPlaying}
              autoKey={autoKey}
              loopRegion={loopRegion}
              layer={animEditorSession.layer}
              availableBones={availableEditorBones}
              selectedBone={selectedBone}
              selectedKey={selectedKey}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onSeek={(t) => {
                setEditorPlaying(false);
                handleSeekEditor(t);
              }}
              onTogglePlay={() => setEditorPlaying((p) => !p)}
              onToggleAutoKey={() => setAutoKey((a) => !a)}
              onSelectBone={(b) => setSelectedBone(b)}
              onSelectKey={(k) => setSelectedKey(k)}
              onAddKeyAtPlayhead={(b) => {
                const q = new pc.Quat(0, 0, 0, 1);
                sampleBoneDeltaAtTime(animEditorSession.layer.tracks[b], editorTime, q);
                commitLayerWithUndo(
                  upsertBoneEditKey(animEditorSession.layer, b, editorTime, [q.x, q.y, q.z, q.w])
                );
              }}
              onDeleteKey={(b, t) => {
                commitLayerWithUndo(removeBoneEditKey(animEditorSession.layer, b, t));
                setSelectedKey(null);
              }}
              onMoveKey={(b, oldT, newT) => {
                setAnimEditorSession((prev) =>
                  prev
                    ? { ...prev, layer: moveBoneEditKey(prev.layer, b, oldT, newT) }
                    : prev
                );
              }}
              onChangeKeyInterp={(b, t, interp: AnimEditInterp) => {
                commitLayerWithUndo(setBoneEditKeyInterp(animEditorSession.layer, b, t, interp));
              }}
              onCopyKey={() => {
                if (!selectedKey) return;
                const kObj = animEditorSession.layer.tracks[selectedKey.bone]?.find(
                  (k) => Math.abs(k.t - selectedKey.t) < 0.012
                );
                if (kObj) setCopiedKeyRot([...kObj.rot]);
              }}
              onPasteKey={() => {
                if (!copiedKeyRot || !selectedBone) return;
                commitLayerWithUndo(
                  upsertBoneEditKey(animEditorSession.layer, selectedBone, editorTime, copiedKeyRot)
                );
              }}
              hasCopiedKey={copiedKeyRot !== null}
              onUndo={handleUndoEditor}
              onRedo={handleRedoEditor}
              onSetLoopRegion={(r) => setLoopRegion(r)}
            />
          ) : (
            <div className="p-3 bg-[#141821] border-t border-[#242a38] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-300">
                  Test nhanh với kho Animation sẵn có:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenEditorForCurrentPreview}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1 shadow"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Chỉnh sửa Animation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    className="px-2.5 py-1 rounded-lg bg-[#202634] hover:bg-[#2b3346] text-xs text-white flex items-center gap-1"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlaying ? 'Tạm dừng' : 'Phát'}</span>
                  </button>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="bg-[#10141d] border border-[#2c3448] rounded-lg px-2 py-1 text-xs text-gray-200"
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1.0x</option>
                    <option value={1.5}>1.5x</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {draftAnim && (
                  <button
                    type="button"
                    onClick={() => setPreviewAnimState('__draft_anim__')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                      previewAnimState === '__draft_anim__'
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    ★ Anim vừa kéo thả
                  </button>
                )}
                {[
                  { label: 'Idle', state: 'Idle_Loop' },
                  { label: 'Walk', state: 'Walk_Loop' },
                  { label: 'Run', state: 'Running' },
                  { label: 'Jump', state: 'Jumping' },
                  { label: 'Ngồi ghế', state: 'Crouch_Idle_Loop' },
                  ...animManifest.emotes.map((em) => {
                    const cl = animManifest.clips.find((c) => c.id === em.clipId);
                    return { label: em.label, state: cl?.name ?? em.clipId };
                  }),
                ].map((btn) => (
                  <button
                    key={`${btn.label}:${btn.state}`}
                    type="button"
                    onClick={() => setPreviewAnimState(btn.state)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                      previewAnimState === btn.state
                        ? 'bg-sky-600 text-white border-sky-400'
                        : 'bg-[#1b2130] text-gray-300 border-[#2b3347] hover:border-gray-500'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT COLUMN: Import Dropzone, Calibration & Publish to Game */}
        <aside className="col-span-4 bg-[#141821] border-l border-[#242a38] flex flex-col min-h-0">
          <input
            ref={modelInputRef}
            type="file"
            accept=".glb,.gltf,.fbx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportCharacterFile(f);
              e.target.value = '';
            }}
          />
          <input
            ref={animInputRef}
            type="file"
            accept=".fbx,.glb,.gltf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportAnimationFile(f);
              e.target.value = '';
            }}
          />

          {studioTab === 'character' ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => modelInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleImportCharacterFile(f);
                }}
                className="p-4 rounded-2xl border-2 border-dashed border-sky-500/40 hover:border-sky-400 bg-sky-500/5 hover:bg-sky-500/10 cursor-pointer transition text-center space-y-1"
              >
                <Upload className="w-6 h-6 text-sky-400 mx-auto" />
                <div className="text-xs font-bold text-white">
                  Kéo thả Model Nhân vật (.GLB / .FBX / .GLTF) vào đây
                </div>
                <div className="text-[11px] text-gray-400">
                  Hỗ trợ Mixamo, Sketchfab, ReadyPlayerMe, Rigify... Tự động căn chiều cao & khớp toàn bộ Animation!
                </div>
              </div>

              {draftModel ? (
                /* === DRAFT MODEL IMPORT & PUBLISH PANEL === */
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-sky-200 truncate">
                        Đang xem thử: {draftModel.rawFileName}
                      </div>
                      <div className="text-[11px] text-sky-300/80">
                        Chưa lưu vào dự án — Tinh chỉnh bên dưới rồi chọn Thay thế hoặc Thêm mới
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraftModel(null)}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] text-white shrink-0"
                    >
                      Hủy nháp
                    </button>
                  </div>

                  <div className="space-y-3 bg-[#191e2a] p-3.5 rounded-xl border border-[#272e3f]">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">Tên hiển thị</label>
                        <input
                          type="text"
                          value={draftModel.label}
                          onChange={(e) =>
                            setDraftModel({ ...draftModel, label: e.target.value })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">Mô tả phụ</label>
                        <input
                          type="text"
                          value={draftModel.subtitle}
                          onChange={(e) =>
                            setDraftModel({ ...draftModel, subtitle: e.target.value })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>

                    {/* Scale & Ground Offset */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-gray-400">Scale kích thước</label>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftModel({
                                ...draftModel,
                                scale: Number((1.72 / Math.max(0.01, draftModel.rawHeight)).toFixed(4)),
                              })
                            }
                            className="text-[10px] text-sky-400 hover:underline"
                          >
                            Auto 1.72m
                          </button>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.001"
                          value={draftModel.scale}
                          onChange={(e) =>
                            setDraftModel({
                              ...draftModel,
                              scale: Math.max(0.001, Number(e.target.value) || 0.01),
                            })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">
                          Độ cao chân Y ({draftModel.groundOffsetY.toFixed(2)}m)
                        </label>
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.01"
                          value={draftModel.groundOffsetY}
                          onChange={(e) =>
                            setDraftModel({
                              ...draftModel,
                              groundOffsetY: Number(e.target.value),
                            })
                          }
                          className="w-full accent-sky-500 mt-2"
                        />
                      </div>
                    </div>

                    {/* Facing Yaw & Arm A/T-Pose Offset */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-gray-400 block">
                        Xoay hướng mặt (khớp mũi tên xanh dưới sàn)
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0, 90, 180, -90].map((deg) => (
                          <button
                            key={deg}
                            type="button"
                            onClick={() =>
                              setDraftModel({ ...draftModel, facingYawOffset: deg })
                            }
                            className={`py-1 rounded-lg text-xs font-mono border flex items-center justify-center gap-1 ${
                              draftModel.facingYawOffset === deg
                                ? 'bg-sky-600 text-white border-sky-400'
                                : 'bg-[#10141d] text-gray-300 border-[#2f384d]'
                            }`}
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>{deg}°</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400">Bù góc vai A/T-Pose</span>
                        <span className="font-mono text-gray-300">
                          {draftModel.armPoseOffsetDeg}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-45"
                        max="45"
                        step="1"
                        value={draftModel.armPoseOffsetDeg}
                        onChange={(e) =>
                          setDraftModel({
                            ...draftModel,
                            armPoseOffsetDeg: Number(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>

                    <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                      <span className="text-xs text-gray-300">
                        Tự động bù tỷ lệ vai rộng / tay ngắn (Vỗ tay &amp; Hát)
                      </span>
                      <input
                        type="checkbox"
                        checked={draftModel.autoArmConvergence}
                        onChange={(e) =>
                          setDraftModel({ ...draftModel, autoArmConvergence: e.target.checked })
                        }
                        className="w-4 h-4 accent-sky-500 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                      <span className="text-xs text-gray-300">
                        Cho phép người chơi đổi màu trang phục
                      </span>
                      <input
                        type="checkbox"
                        checked={draftModel.tintable}
                        onChange={(e) =>
                          setDraftModel({ ...draftModel, tintable: e.target.checked })
                        }
                        className="w-4 h-4 accent-sky-500 rounded"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void handleAutoFixCharacter()}
                      className="w-full py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Auto-Fix Xương, Hướng mặt & Chạm sàn (1-Click)</span>
                    </button>
                  </div>

                  {/* Publish Buttons: Replace vs Add Option */}
                  <div className="p-3.5 rounded-xl bg-[#191e2a] border border-emerald-500/30 space-y-3">
                    <div className="text-xs font-bold text-emerald-300">
                      Xuất bản vào Game (Ghi vào thư mục public/)
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] text-gray-400 block">
                        Cách 1: Thay thẳng vào nhân vật đang có
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={replaceTargetCharId}
                          onChange={(e) => setReplaceTargetCharId(e.target.value)}
                          className="flex-1 bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        >
                          {charManifest.characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              Thay cho: {c.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handlePublishCharacter('replace')}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1 shrink-0"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Thay thế</span>
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-[#272e3f] pt-3">
                      <button
                        type="button"
                        onClick={() => void handlePublishCharacter('add')}
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Cách 2: Thêm thành Option chọn Nhân vật Mới</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* === EDIT EXISTING SAVED CHARACTER PANEL === */
                editPresetForm &&
                selectedSavedChar && (
                  <div className="space-y-3 bg-[#191e2a] p-3.5 rounded-xl border border-[#272e3f]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white">
                        Thông số: {selectedSavedChar.label}
                      </h3>
                      <span className="text-[10px] font-mono text-gray-400">
                        ID: {selectedSavedChar.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">Tên hiển thị</label>
                        <input
                          type="text"
                          value={editPresetForm.label}
                          onChange={(e) =>
                            setEditPresetForm({ ...editPresetForm, label: e.target.value })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">Mô tả phụ</label>
                        <input
                          type="text"
                          value={editPresetForm.subtitle}
                          onChange={(e) =>
                            setEditPresetForm({ ...editPresetForm, subtitle: e.target.value })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">Scale</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.001"
                          value={editPresetForm.scale}
                          onChange={(e) =>
                            setEditPresetForm({
                              ...editPresetForm,
                              scale: Math.max(0.001, Number(e.target.value) || 0.01),
                            })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">
                          Độ cao chân Y ({editPresetForm.groundOffsetY.toFixed(2)}m)
                        </label>
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.01"
                          value={editPresetForm.groundOffsetY}
                          onChange={(e) =>
                            setEditPresetForm({
                              ...editPresetForm,
                              groundOffsetY: Number(e.target.value),
                            })
                          }
                          className="w-full accent-sky-500 mt-2"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-gray-400 block">Xoay hướng mặt</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0, 90, 180, -90].map((deg) => (
                          <button
                            key={deg}
                            type="button"
                            onClick={() =>
                              setEditPresetForm({ ...editPresetForm, facingYawOffset: deg })
                            }
                            className={`py-1 rounded-lg text-xs font-mono border ${
                              editPresetForm.facingYawOffset === deg
                                ? 'bg-sky-600 text-white border-sky-400'
                                : 'bg-[#10141d] text-gray-300 border-[#2f384d]'
                            }`}
                          >
                            {deg}°
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400">Bù góc vai A/T-Pose</span>
                        <span className="font-mono text-gray-300">
                          {editPresetForm.armPoseOffsetDeg}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-45"
                        max="45"
                        step="1"
                        value={editPresetForm.armPoseOffsetDeg}
                        onChange={(e) =>
                          setEditPresetForm({
                            ...editPresetForm,
                            armPoseOffsetDeg: Number(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>

                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <span className="text-xs text-gray-300">
                        Tự động bù tỷ lệ vai rộng / tay ngắn (Vỗ tay &amp; Hát)
                      </span>
                      <input
                        type="checkbox"
                        checked={editPresetForm.autoArmConvergence}
                        onChange={(e) =>
                          setEditPresetForm({
                            ...editPresetForm,
                            autoArmConvergence: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-sky-500 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <span className="text-xs text-gray-300">Cho phép đổi màu trang phục</span>
                      <input
                        type="checkbox"
                        checked={editPresetForm.tintable}
                        onChange={(e) =>
                          setEditPresetForm({ ...editPresetForm, tintable: e.target.checked })
                        }
                        className="w-4 h-4 accent-sky-500 rounded"
                      />
                    </label>

                    {editPresetForm.tintable && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-gray-400 mr-1">Test màu:</span>
                        {AVATAR_COLOR_PRESETS.slice(0, 7).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setTestTintHex(p.hex)}
                            className={`w-5 h-5 rounded-full border ${
                              testTintHex === p.hex ? 'border-white scale-110' : 'border-white/20'
                            }`}
                            style={{ backgroundColor: p.hex }}
                          />
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAutoFixCharacter()}
                        className="py-2 px-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Auto-Fix Xương & Sàn</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveExistingCharacterTweaks()}
                        className="py-2 px-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Lưu vào Game</span>
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Collapsible Bone Mapper Fallback for Exotic Rigs */}
              {rigProfileSummary && (
                <div className="rounded-xl bg-[#191e2a] border border-[#272e3f] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setBoneMapperOpen((o) => !o)}
                    className="w-full p-3 flex items-center justify-between text-xs font-semibold text-gray-200 hover:bg-[#202737]"
                  >
                    <span className="flex items-center gap-2">
                      <Bone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        Bảng Ánh xạ Xương Thủ công ({rigProfileSummary.mappedCount}/22 khớp)
                      </span>
                    </span>
                    {boneMapperOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  {boneMapperOpen && (
                    <div className="p-3 border-t border-[#272e3f] space-y-2 max-h-64 overflow-y-auto">
                      {rigProfileSummary.mappedCount < 10 && (
                        <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-200 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>
                            Model có tên xương lạ — hãy chọn khớp tương ứng bên dưới (ít nhất Hips, Spine, Head, Tay & Chân).
                          </span>
                        </div>
                      )}
                      {HUMANOID_BONE_KEYS.map((boneKey) => {
                        const chosen =
                          currentBoneMap[boneKey] ??
                          rigProfileSummary.autoBoneMap[boneKey] ??
                          '';
                        return (
                          <div
                            key={boneKey}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="text-gray-400 truncate w-40 shrink-0">
                              {BONE_LABELS[boneKey]}
                            </span>
                            <select
                              value={chosen}
                              onChange={(e) => updateActiveBoneMap(boneKey, e.target.value)}
                              className="flex-1 min-w-0 bg-[#10141d] border border-[#2f384d] rounded px-2 py-1 text-[11px] text-gray-200 font-mono"
                            >
                              <option value="">(Chưa gán)</option>
                              {rigProfileSummary.allNodeNames.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : animEditorSession ? (
            /* === UNITY-STYLE ANIMATION EDITOR INSPECTOR === */
            (() => {
              const curQ = new pc.Quat(0, 0, 0, 1);
              if (selectedBone) {
                sampleBoneDeltaAtTime(animEditorSession.layer.tracks[selectedBone], editorTime, curQ);
              }
              const eu = new pc.Vec3();
              curQ.getEulerAngles(eu);
              const hipsV = new pc.Vec3();
              sampleHipsOffsetAtTime(animEditorSession.layer.hipsOffsetKeys, editorTime, hipsV);
              const currentClip = animManifest.clips.find((c) => c.id === animEditorSession.clipId);

              const mirrorSide = (fromPrefix: 'left' | 'right', toPrefix: 'left' | 'right') => {
                let nextLayer = cloneAnimEditLayer(animEditorSession.layer);
                for (const key of ALL_HUMANOID_BONE_KEYS) {
                  if (!key.startsWith(fromPrefix)) continue;
                  const targetKey = `${toPrefix}${key.slice(fromPrefix.length)}` as AnyHumanoidBoneKey;
                  const q = new pc.Quat(0, 0, 0, 1);
                  if (sampleBoneDeltaAtTime(animEditorSession.layer.tracks[key], editorTime, q)) {
                    nextLayer = upsertBoneEditKey(nextLayer, targetKey, editorTime, [
                      q.x,
                      -q.y,
                      -q.z,
                      q.w,
                    ]);
                  }
                }
                commitLayerWithUndo(nextLayer);
              };

              return (
                <AnimationEditorInspector
                  clipDisplayLabel={animEditorSession.displayLabel}
                  dirty={
                    JSON.stringify(animEditorSession.layer) !==
                    animEditorSession.savedSnapshotJson
                  }
                  hasAnyEdits={hasAnyEditKeys(animEditorSession.layer)}
                  gizmoMode={gizmoMode}
                  coordSpace={coordSpace}
                  selectedBone={selectedBone}
                  isSelectedBoneOverridden={Boolean(
                    selectedBone && animEditorSession.layer.overrideBones?.includes(selectedBone)
                  )}
                  selectedIKLimb={selectedIKLimb}
                  footLock={footLock}
                  boneEulerDeg={[eu.x, eu.y, eu.z]}
                  hipsOffset={[hipsV.x, hipsV.y, hipsV.z]}
                  hasSavedLayer={Boolean(currentClip?.editLayerUrl)}
                  localApiReady={localApiReady}
                  onChangeGizmoMode={(m) => setGizmoMode(m)}
                  onChangeCoordSpace={(s) => setCoordSpace(s)}
                  onSelectIKLimb={(limb) => {
                    setSelectedIKLimb(limb);
                    const { end } = getLimbBoneKeys(limb);
                    setSelectedBone(end);
                  }}
                  onToggleFootLock={() => {
                    const rig = targetRigRef.current;
                    if (!footLock && rig) {
                      lockedLeftFootPosRef.current =
                        rig.bones.leftFoot?.node.getPosition().clone() ?? null;
                      lockedRightFootPosRef.current =
                        rig.bones.rightFoot?.node.getPosition().clone() ?? null;
                    } else {
                      lockedLeftFootPosRef.current = null;
                      lockedRightFootPosRef.current = null;
                    }
                    setFootLock((f) => !f);
                  }}
                  onChangeBoneEuler={([x, y, z]) => {
                    if (!selectedBone) return;
                    const q = new pc.Quat().setFromEulerAngles(x, y, z);
                    commitLayerWithUndo(
                      upsertBoneEditKey(animEditorSession.layer, selectedBone, editorTime, [
                        q.x,
                        q.y,
                        q.z,
                        q.w,
                      ])
                    );
                  }}
                  onToggleBoneOverride={() => {
                    if (!selectedBone) return;
                    const nextLayer = cloneAnimEditLayer(animEditorSession.layer);
                    const cur = new Set(nextLayer.overrideBones ?? []);
                    if (cur.has(selectedBone)) {
                      cur.delete(selectedBone);
                    } else {
                      cur.add(selectedBone);
                    }
                    nextLayer.overrideBones = Array.from(cur);
                    nextLayer.updatedAt = new Date().toISOString();
                    commitLayerWithUndo(nextLayer);
                  }}
                  onResetBoneAtTime={() => {
                    if (!selectedBone) return;
                    const keys = animEditorSession.layer.tracks[selectedBone] ?? [];
                    const hasOtherKeys = keys.some((k) => Math.abs(k.t - editorTime) > 0.012);
                    if (hasOtherKeys) {
                      commitLayerWithUndo(
                        upsertBoneEditKey(animEditorSession.layer, selectedBone, editorTime, [
                          0, 0, 0, 1,
                        ])
                      );
                    } else {
                      commitLayerWithUndo(
                        removeBoneEditKey(animEditorSession.layer, selectedBone, editorTime)
                      );
                    }
                  }}
                  onResetBoneTrack={() => {
                    if (!selectedBone) return;
                    const nextLayer = cloneAnimEditLayer(animEditorSession.layer);
                    delete nextLayer.tracks[selectedBone];
                    nextLayer.updatedAt = new Date().toISOString();
                    commitLayerWithUndo(nextLayer);
                  }}
                  onResetAllEdits={() => {
                    commitLayerWithUndo(createEmptyAnimEditLayer(animEditorSession.clipId));
                    setSelectedKey(null);
                  }}
                  onMirrorLeftToRight={() => mirrorSide('left', 'right')}
                  onMirrorRightToLeft={() => mirrorSide('right', 'left')}
                  onChangeHipsOffset={(pos) => {
                    commitLayerWithUndo(
                      upsertHipsOffsetKey(animEditorSession.layer, editorTime, pos)
                    );
                  }}
                  onResetHipsAtTime={() => {
                    commitLayerWithUndo(
                      upsertHipsOffsetKey(animEditorSession.layer, editorTime, [0, 0, 0])
                    );
                  }}
                  onSaveToGame={() => void handleSaveAnimationEditor()}
                  onDeleteEditLayer={() => void handleDeleteAnimationEditorLayer()}
                  onExitEditor={handleExitAnimationEditor}
                />
              );
            })()
          ) : (
            /* === ANIMATION STUDIO RIGHT PANEL === */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div
                onClick={() => animInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleImportAnimationFile(f);
                }}
                className="p-4 rounded-2xl border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 cursor-pointer transition text-center space-y-1"
              >
                <Upload className="w-6 h-6 text-indigo-400 mx-auto" />
                <div className="text-xs font-bold text-white">
                  Kéo thả File Animation (.FBX / .GLB) vào đây
                </div>
                <div className="text-[11px] text-gray-400">
                  Tải Mixamo &ldquo;Without Skin&rdquo; (.fbx) hoặc pack .glb — Tự động chạy khớp trên mọi nhân vật!
                </div>
              </div>

              {draftAnim ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-indigo-200 truncate">
                        Đang xem thử: {draftAnim.rawFileName}
                      </div>
                      <div className="text-[11px] text-indigo-300/80">
                        Đổi qua lại các nhân vật ở cột trái để kiểm tra độ khớp!
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftAnim(null);
                        setPreviewAnimState('Idle_Loop');
                      }}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] text-white shrink-0"
                    >
                      Hủy nháp
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#191e2a] border border-[#272e3f] space-y-3">
                    {draftAnim.converted.clipNames.length > 1 && (
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">
                          Chọn Track trong file ({draftAnim.converted.clipNames.length} tracks)
                        </label>
                        <select
                          value={draftAnim.selectedTrackName}
                          onChange={(e) =>
                            setDraftAnim({
                              ...draftAnim,
                              selectedTrackName: e.target.value,
                              clipLabel: e.target.value,
                            })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        >
                          {draftAnim.converted.clipNames.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">Tên định danh Clip</label>
                        <input
                          type="text"
                          value={draftAnim.clipLabel}
                          onChange={(e) =>
                            setDraftAnim({ ...draftAnim, clipLabel: e.target.value })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">Tốc độ (Speed)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="4"
                          value={draftAnim.speed}
                          onChange={(e) =>
                            setDraftAnim({
                              ...draftAnim,
                              speed: Math.max(0.1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-[#10141d] border border-[#2f384d] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftAnim.inPlace}
                          onChange={(e) =>
                            setDraftAnim({ ...draftAnim, inPlace: e.target.checked })
                          }
                          className="accent-indigo-500"
                        />
                        <span className="text-xs text-gray-200">In-Place (Khóa trôi X/Z)</span>
                      </label>
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-[#10141d] border border-[#2f384d] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftAnim.loop}
                          onChange={(e) =>
                            setDraftAnim({ ...draftAnim, loop: e.target.checked })
                          }
                          className="accent-indigo-500"
                        />
                        <span className="text-xs text-gray-200">Lặp lại (Loop)</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">
                          Cắt đầu ({draftAnim.trimStart.toFixed(2)}s)
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(0.05, draftAnim.maxDuration - 0.1)}
                          step={0.02}
                          value={draftAnim.trimStart}
                          onChange={(e) =>
                            setDraftAnim({ ...draftAnim, trimStart: Number(e.target.value) })
                          }
                          className="w-full accent-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-400">
                          Cắt cuối ({draftAnim.trimEnd.toFixed(2)}s)
                        </label>
                        <input
                          type="range"
                          min={Math.min(draftAnim.maxDuration, draftAnim.trimStart + 0.05)}
                          max={draftAnim.maxDuration}
                          step={0.02}
                          value={draftAnim.trimEnd}
                          onChange={(e) =>
                            setDraftAnim({ ...draftAnim, trimEnd: Number(e.target.value) })
                          }
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Fix animation orientation & floor sinking/floating */}
                    <div className="pt-2 border-t border-[#272e3f] space-y-2.5">
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-gray-400 block">
                          Fix hướng Animation bị xoay lệch
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[0, 90, 180, -90].map((deg) => (
                            <button
                              key={deg}
                              type="button"
                              onClick={() =>
                                setDraftAnim({ ...draftAnim, yawOffsetDeg: deg })
                              }
                              className={`py-1 rounded-lg text-xs font-mono border flex items-center justify-center gap-1 ${
                                draftAnim.yawOffsetDeg === deg
                                  ? 'bg-indigo-600 text-white border-indigo-400'
                                  : 'bg-[#10141d] text-gray-300 border-[#2f384d]'
                              }`}
                            >
                              <RotateCw className="w-3 h-3" />
                              <span>{deg}°</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-400">
                            Fix độ cao hông / chạm sàn ({draftAnim.hipsYOffset >= 0 ? '+' : ''}
                            {draftAnim.hipsYOffset.toFixed(2)}m)
                          </span>
                          <button
                            type="button"
                            onClick={() => setDraftAnim({ ...draftAnim, hipsYOffset: 0 })}
                            className="text-[10px] text-indigo-400 hover:underline"
                          >
                            Reset 0m
                          </button>
                        </div>
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.01"
                          value={draftAnim.hipsYOffset}
                          onChange={(e) =>
                            setDraftAnim({ ...draftAnim, hipsYOffset: Number(e.target.value) })
                          }
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Publish Animation: Replace Existing vs Add New Emote */}
                  <div className="p-3.5 rounded-xl bg-[#191e2a] border border-emerald-500/30 space-y-3">
                    <div className="text-xs font-bold text-emerald-300">
                      Xuất bản Animation vào Game (Ghi vào public/animations/)
                    </div>

                    {/* Option 1: Replace */}
                    <div className="space-y-2">
                      <label className="text-[11px] text-gray-400 block">
                        Cách 1: Thay thế Hành động / Emote hiện có
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={replaceAnimTarget}
                          onChange={(e) => setReplaceAnimTarget(e.target.value)}
                          className="flex-1 bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        >
                          <optgroup label="Hành động Cơ bản (Locomotion)">
                            {(Object.keys(CORE_SLOT_LABELS) as CoreAnimSlotId[]).map((k) => (
                              <option key={k} value={`slot:${k}`}>
                                Thay Slot: {CORE_SLOT_LABELS[k]}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Vòng quay Emotes (Hold R)">
                            {animManifest.emotes.map((em) => (
                              <option key={em.id} value={`emote:${em.id}`}>
                                Thay Emote: {em.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        <button
                          type="button"
                          onClick={() => void handlePublishAnimation('replace')}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1 shrink-0"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Thay thế</span>
                        </button>
                      </div>
                    </div>

                    {/* Option 2: Add New Emote */}
                    <div className="border-t border-[#272e3f] pt-3 space-y-2.5">
                      <label className="text-[11px] text-gray-400 block">
                        Cách 2: Thêm làm Ô Mới trên Vòng quay Emote (Hold R)
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={draftAnim.emoteLabel}
                          onChange={(e) =>
                            setDraftAnim({ ...draftAnim, emoteLabel: e.target.value })
                          }
                          placeholder="Tên trên vòng quay..."
                          className="bg-[#10141d] border border-[#2f384d] rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                        <div className="flex items-center gap-1 bg-[#10141d] border border-[#2f384d] rounded-lg px-2 py-1">
                          {(
                            [
                              ['music', Music],
                              ['sparkles', Sparkles],
                              ['flame', Flame],
                              ['mic', Mic],
                              ['heart', Heart],
                              ['smile', Smile],
                            ] as Array<[EmoteIconKind, React.ComponentType<{ className?: string }>]>
                          ).map(([icKey, IconComp]) => (
                            <button
                              key={icKey}
                              type="button"
                              onClick={() => setDraftAnim({ ...draftAnim, emoteIcon: icKey })}
                              className={`p-1 rounded ${
                                draftAnim.emoteIcon === icKey
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              <IconComp className="w-3.5 h-3.5" />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 mr-1">Màu nhấn:</span>
                        {ACCENT_SWATCHES.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setDraftAnim({ ...draftAnim, emoteAccent: hex })}
                            className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                              draftAnim.emoteAccent === hex
                                ? 'border-white scale-110'
                                : 'border-white/20'
                            }`}
                            style={{ backgroundColor: hex }}
                          >
                            {draftAnim.emoteAccent === hex && (
                              <Check className="w-3 h-3 text-black" />
                            )}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handlePublishAnimation('add_emote')}
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Thêm vào Vòng quay Emote (Hold R)</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#191e2a] border border-[#272e3f] space-y-2 text-xs text-gray-300 leading-relaxed">
                  <div className="font-bold text-white">Hướng dẫn nhanh thêm Animation mới:</div>
                  <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-gray-400">
                    <li>
                      Tải file animation trên <strong>Mixamo.com</strong> (chọn Format:{' '}
                      <code className="text-indigo-300">FBX (.fbx)</code>, Skin:{' '}
                      <code className="text-indigo-300">Without Skin</code>) hoặc file{' '}
                      <code className="text-indigo-300">.glb</code> bất kỳ.
                    </li>
                    <li>Kéo thả trực tiếp vào khung trên hoặc màn hình 3D ở giữa.</li>
                    <li>
                      Chọn thử các nhân vật ở cột trái để kiểm tra tự động khớp xương (Humanoid Retargeting).
                    </li>
                    <li>
                      Bấm <strong>Thay thế</strong> (để đổi động tác Đi/Chạy/Nhảy hiện tại) hoặc{' '}
                      <strong>Thêm vào Vòng quay Emote</strong> (để thêm điệu nhảy mới vào phím{' '}
                      <code className="text-emerald-300">Hold R</code>).
                    </li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default CharacterStudioApp;
