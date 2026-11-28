import type * as pc from 'playcanvas';
import type { AnimEditLayer, AnyHumanoidBoneKey } from '../../types/characterStudio';

export type BoneGroupId =
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg'
  | 'leftFingers'
  | 'rightFingers';

export interface BoneGroupSpec {
  id: BoneGroupId;
  label: string;
  defaultExpanded: boolean;
  bones: AnyHumanoidBoneKey[];
}

export const EDITOR_BONE_GROUPS: BoneGroupSpec[] = [
  {
    id: 'torso',
    label: 'Thân & Đầu',
    defaultExpanded: true,
    bones: ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'],
  },
  {
    id: 'leftArm',
    label: 'Tay Trái',
    defaultExpanded: true,
    bones: ['leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand'],
  },
  {
    id: 'rightArm',
    label: 'Tay Phải',
    defaultExpanded: true,
    bones: ['rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand'],
  },
  {
    id: 'leftLeg',
    label: 'Chân Trái',
    defaultExpanded: true,
    bones: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes'],
  },
  {
    id: 'rightLeg',
    label: 'Chân Phải',
    defaultExpanded: true,
    bones: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'],
  },
  {
    id: 'leftFingers',
    label: 'Ngón Tay Trái',
    defaultExpanded: false,
    bones: [
      'leftThumb1', 'leftThumb2', 'leftThumb3',
      'leftIndex1', 'leftIndex2', 'leftIndex3',
      'leftMiddle1', 'leftMiddle2', 'leftMiddle3',
      'leftRing1', 'leftRing2', 'leftRing3',
      'leftPinky1', 'leftPinky2', 'leftPinky3',
    ],
  },
  {
    id: 'rightFingers',
    label: 'Ngón Tay Phải',
    defaultExpanded: false,
    bones: [
      'rightThumb1', 'rightThumb2', 'rightThumb3',
      'rightIndex1', 'rightIndex2', 'rightIndex3',
      'rightMiddle1', 'rightMiddle2', 'rightMiddle3',
      'rightRing1', 'rightRing2', 'rightRing3',
      'rightPinky1', 'rightPinky2', 'rightPinky3',
    ],
  },
];

export const EDITOR_BONE_LABELS: Partial<Record<AnyHumanoidBoneKey, string>> = {
  hips: 'Hips (Hông)',
  spine: 'Spine (Bụng)',
  chest: 'Chest (Ngực)',
  upperChest: 'UpperChest (Ngực trên)',
  neck: 'Neck (Cổ)',
  head: 'Head (Đầu)',
  leftShoulder: 'Vai Trái',
  leftUpperArm: 'Bắp Tay Trái',
  leftLowerArm: 'Khuỷu Tay Trái',
  leftHand: 'Bàn Tay Trái',
  rightShoulder: 'Vai Phải',
  rightUpperArm: 'Bắp Tay Phải',
  rightLowerArm: 'Khuỷu Tay Phải',
  rightHand: 'Bàn Tay Phải',
  leftUpperLeg: 'Đùi Trái',
  leftLowerLeg: 'Đầu Gối Trái',
  leftFoot: 'Bàn Chân Trái',
  leftToes: 'Mũi Chân Trái',
  rightUpperLeg: 'Đùi Phải',
  rightLowerLeg: 'Đầu Gối Phải',
  rightFoot: 'Bàn Chân Phải',
  rightToes: 'Mũi Chân Phải',
};

export function getEditorBoneLabel(key: AnyHumanoidBoneKey): string {
  return EDITOR_BONE_LABELS[key] ?? key;
}

export type IKLimbId = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export type GizmoToolMode = 'fk-rotate' | 'ik-move';

export interface BaseClipPoseCache {
  duration: number;
  frameCount: number;
  fps: number;
  /** Mapped bone keys in parent-before-child topological order */
  orderedBones: AnyHumanoidBoneKey[];
  /** Nearest mapped ancestor for each bone in target rig */
  nearestAncestor: Partial<Record<AnyHumanoidBoneKey, AnyHumanoidBoneKey | null>>;
  /** Base retargeted local rotation per frame [frameIdx][boneKey] (WITHOUT editLayer applied) */
  baseLocalRots: Map<AnyHumanoidBoneKey, pc.Quat[]>;
  /** Base retargeted local hips position per frame */
  baseHipsLocalPos: pc.Vec3[];
}

export interface AnimEditorSession {
  clipId: string;
  stateName: string;
  displayLabel: string;
  duration: number;
  fps: number;
  layer: AnimEditLayer;
  savedSnapshotJson: string;
}

export interface SelectedKeyRef {
  bone: AnyHumanoidBoneKey;
  t: number;
}
