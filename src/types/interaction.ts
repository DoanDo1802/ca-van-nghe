import type { InterpolationMode } from './animation';
import type { ColorRGB, Vec3 } from './scene';

export type TriggerType =
  | 'OnStart'
  | 'OnPointerClick'
  | 'OnPointerHoverEnter'
  | 'OnPointerHoverExit'
  | 'OnKeyDown'
  | 'OnCollisionEnter'
  | 'OnTriggerEnter'
  | 'OnProximityEnter'
  | 'OnCustomEvent';

export interface TriggerConfig {
  type: TriggerType;
  key?: string; // For OnKeyDown
  targetEntityId?: string; // For OnProximityEnter / collision filter
  distance?: number; // For OnProximityEnter
  eventName?: string; // For OnCustomEvent
}

export type ActionType =
  | 'PlayAnimation'
  | 'TweenTransform'
  | 'SetActive'
  | 'ChangeMaterialColor'
  | 'ApplyForce'
  | 'PlaySound'
  | 'Wait'
  | 'EmitCustomEvent';

export interface ActionConfig {
  id: string;
  type: ActionType;
  targetEntityId?: string | null; // Supports drag-drop from Hierarchy; null = self
  clipOrStateName?: string; // PlayAnimation
  transformProperty?: 'position' | 'rotation' | 'scale'; // TweenTransform
  targetVec3?: Vec3; // TweenTransform / ApplyForce
  duration?: number; // TweenTransform / Wait
  easing?: InterpolationMode; // TweenTransform
  active?: boolean; // SetActive
  color?: ColorRGB; // ChangeMaterialColor
  soundAssetId?: string; // PlaySound
  eventName?: string; // EmitCustomEvent
}

export interface InteractionRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: TriggerConfig;
  actions: ActionConfig[];
}
