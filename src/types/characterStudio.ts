/**
 * Core contracts for the Local Character & Animation Studio,
 * Humanoid Rig Mapping, Retargeting, and Dynamic Runtime Registries.
 */

export const HUMANOID_BONE_KEYS = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
] as const;

export type HumanoidBoneKey = (typeof HUMANOID_BONE_KEYS)[number];

export type HumanoidBoneMap = Partial<Record<HumanoidBoneKey, string>>;

export type CoreAnimSlotId =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'jumpRun'
  | 'sit'
  | 'talk';

export interface CharacterManifestEntry {
  id: string;
  label: string;
  subtitle: string;
  url: string;
  filename: string;
  scale: number;
  /** Vertical offset in meters so feet touch Y=0 cleanly */
  groundOffsetY?: number;
  /** Yaw offset in degrees applied to visual model child so character faces forward (-Z in local controller) */
  facingYawOffset?: number;
  /** Optional arm A-pose -> T-pose calibration angle in degrees (-45..45) */
  armPoseOffsetDeg?: number;
  tintable: boolean;
  isBuiltIn?: boolean;
  /** Default/original URL when built-in slot was replaced, enabling 1-click restore */
  originalPreset?: {
    label: string;
    subtitle: string;
    url: string;
    filename: string;
    scale: number;
    groundOffsetY?: number;
    facingYawOffset?: number;
    armPoseOffsetDeg?: number;
    tintable: boolean;
  };
  /** Optional explicit bone mapping overrides saved from Studio */
  boneMap?: HumanoidBoneMap;
  updatedAt?: string;
}

export interface CharacterManifest {
  version: string;
  defaultCharacterId: string;
  characters: CharacterManifestEntry[];
}

export interface AnimationClipEntry {
  id: string;
  name: string;
  /** Path to .glb containing this animation clip (e.g. "/animations/samba.glb") */
  url: string;
  /** Specific track name inside the GLB; if omitted, uses first track */
  trackName?: string;
  speed: number;
  loop: boolean;
  /** Locks horizontal X/Z root motion on Hips while preserving vertical bounce */
  inPlace: boolean;
  /** Optional start/end trim in seconds */
  trimStart?: number;
  trimEnd?: number;
  /** Optional yaw rotation offset in degrees (0, 90, 180, -90) if source clip faces sideways/backwards */
  yawOffsetDeg?: number;
  /** Optional vertical Hips height offset in meters if clip floats or sinks */
  hipsYOffset?: number;
  /** Optional arm pose offset on source rig */
  sourceArmPoseOffsetDeg?: number;
  /** Optional bone map override for source animation rig */
  sourceBoneMap?: HumanoidBoneMap;
  isBuiltIn?: boolean;
  updatedAt?: string;
}

export type EmoteIconKind = 'mic' | 'sparkles' | 'music' | 'flame' | 'heart' | 'smile';

export interface EmoteSliceEntry {
  id: string;
  label: string;
  sublabel: string;
  accent: string;
  icon?: EmoteIconKind;
  /** State/Clip ID from AnimationManifest.clips */
  clipId: string;
  isBuiltIn?: boolean;
}

export interface AnimationManifest {
  version: string;
  /** Maps core gameplay locomotion states to a clipId in `clips` */
  slots: Record<CoreAnimSlotId, string>;
  /** Original default slot clipIds for 1-click restore */
  defaultSlots?: Record<CoreAnimSlotId, string>;
  /** Radial Emote Wheel (Hold R) entries */
  emotes: EmoteSliceEntry[];
  /** Library of all available animation clips */
  clips: AnimationClipEntry[];
}
