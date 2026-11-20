import type { ColorRGB, Vec3 } from './scene';

export type InterpolationMode = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step';
export type LoopMode = 'once' | 'loop' | 'pingpong';

export type AnimatablePropertyPath =
  | 'position'
  | 'rotation'
  | 'scale'
  | 'material.diffuse'
  | 'material.opacity'
  | 'light.intensity';

export interface KeyframeData<T = number | Vec3 | ColorRGB> {
  id: string;
  time: number; // Seconds
  value: T;
  interpolation: InterpolationMode;
}

export interface PropertyTrackData {
  id: string;
  targetEntityId: string;
  property: AnimatablePropertyPath;
  keyframes: KeyframeData[];
}

export interface AnimationClipData {
  id: string;
  name: string;
  duration: number;
  fps: number;
  loopMode: LoopMode;
  tracks: PropertyTrackData[];
}
