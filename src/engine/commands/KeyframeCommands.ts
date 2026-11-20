import type {
  AnimatablePropertyPath,
  AnimationClipData,
  ICommand,
  InterpolationMode,
  KeyframeData,
  PropertyTrackData,
  Vec3,
} from '../../types';

export interface KeyframeCommandContext {
  getClip: (clipId: string) => AnimationClipData | null;
  notifyTimelineChanged: (
    clipId: string,
    entityId: string,
    property: AnimatablePropertyPath,
    time: number
  ) => void;
  evaluateClipAtCurrentTime?: (clipId: string) => void;
}

const TIME_EPSILON = 1e-4;

function cloneKeyframe(kf: KeyframeData): KeyframeData {
  return {
    id: kf.id,
    time: kf.time,
    value: Array.isArray(kf.value) ? ([kf.value[0], kf.value[1], kf.value[2]] as Vec3) : kf.value,
    interpolation: kf.interpolation,
  };
}

function sortTrackKeyframes(track: PropertyTrackData): void {
  track.keyframes.sort((a, b) => a.time - b.time);
}

export class AddKeyframeCommand implements ICommand {
  readonly id = crypto.randomUUID();
  readonly label: string;
  readonly timestamp = Date.now();

  private readonly ctx: KeyframeCommandContext;
  private readonly clipId: string;
  private readonly entityId: string;
  private readonly property: AnimatablePropertyPath;
  private readonly keyframe: KeyframeData;

  private createdTrackId: string | null = null;
  private replacedKeyframe: KeyframeData | null = null;

  constructor(
    ctx: KeyframeCommandContext,
    clipId: string,
    entityId: string,
    property: AnimatablePropertyPath,
    keyframe: KeyframeData
  ) {
    this.ctx = ctx;
    this.clipId = clipId;
    this.entityId = entityId;
    this.property = property;
    this.keyframe = cloneKeyframe(keyframe);
    this.label = `Add Keyframe (${property})`;
  }

  execute(): void {
    const clip = this.ctx.getClip(this.clipId);
    if (!clip) return;

    let track = clip.tracks.find(
      (t) => t.targetEntityId === this.entityId && t.property === this.property
    );
    if (!track) {
      track = {
        id: crypto.randomUUID(),
        targetEntityId: this.entityId,
        property: this.property,
        keyframes: [],
      };
      clip.tracks.push(track);
      this.createdTrackId = track.id;
    }

    const existingIdx = track.keyframes.findIndex(
      (kf) => Math.abs(kf.time - this.keyframe.time) < TIME_EPSILON
    );
    if (existingIdx !== -1) {
      this.replacedKeyframe = cloneKeyframe(track.keyframes[existingIdx]);
      track.keyframes[existingIdx] = cloneKeyframe(this.keyframe);
    } else {
      this.replacedKeyframe = null;
      track.keyframes.push(cloneKeyframe(this.keyframe));
    }

    sortTrackKeyframes(track);
    this.ctx.evaluateClipAtCurrentTime?.(this.clipId);
    this.ctx.notifyTimelineChanged(this.clipId, this.entityId, this.property, this.keyframe.time);
  }

  undo(): void {
    const clip = this.ctx.getClip(this.clipId);
    if (!clip) return;

    const trackIdx = clip.tracks.findIndex(
      (t) => t.targetEntityId === this.entityId && t.property === this.property
    );
    if (trackIdx === -1) return;

    const track = clip.tracks[trackIdx];
    const kfIdx = track.keyframes.findIndex((kf) => kf.id === this.keyframe.id);
    if (kfIdx !== -1) {
      track.keyframes.splice(kfIdx, 1);
    }

    if (this.replacedKeyframe) {
      track.keyframes.push(cloneKeyframe(this.replacedKeyframe));
      sortTrackKeyframes(track);
    } else if (this.createdTrackId && track.id === this.createdTrackId && track.keyframes.length === 0) {
      clip.tracks.splice(trackIdx, 1);
    }

    this.ctx.evaluateClipAtCurrentTime?.(this.clipId);
    this.ctx.notifyTimelineChanged(this.clipId, this.entityId, this.property, this.keyframe.time);
  }
}

export class MoveKeyframeCommand implements ICommand {
  readonly id = crypto.randomUUID();
  readonly label = 'Move Keyframe';
  readonly timestamp = Date.now();

  private readonly ctx: KeyframeCommandContext;
  private readonly clipId: string;
  private readonly trackIndex: number;
  private readonly keyframeId: string;
  private readonly oldTime: number;
  private readonly newTime: number;

  constructor(
    ctx: KeyframeCommandContext,
    clipId: string,
    trackIndex: number,
    keyframeId: string,
    oldTime: number,
    newTime: number
  ) {
    this.ctx = ctx;
    this.clipId = clipId;
    this.trackIndex = trackIndex;
    this.keyframeId = keyframeId;
    this.oldTime = Math.max(0, oldTime);
    this.newTime = Math.max(0, newTime);
  }

  execute(): void {
    this.applyTime(this.newTime);
  }

  undo(): void {
    this.applyTime(this.oldTime);
  }

  private applyTime(time: number): void {
    const clip = this.ctx.getClip(this.clipId);
    const track = clip?.tracks[this.trackIndex];
    if (!track) return;

    const kf = track.keyframes.find((k) => k.id === this.keyframeId);
    if (!kf) return;

    kf.time = time;
    sortTrackKeyframes(track);
    this.ctx.evaluateClipAtCurrentTime?.(this.clipId);
    this.ctx.notifyTimelineChanged(this.clipId, track.targetEntityId, track.property, time);
  }
}

export class DeleteKeyframeCommand implements ICommand {
  readonly id = crypto.randomUUID();
  readonly label = 'Delete Keyframe';
  readonly timestamp = Date.now();

  private readonly ctx: KeyframeCommandContext;
  private readonly clipId: string;
  private readonly trackIndex: number;
  private readonly keyframeId: string;
  private deletedKeyframe: KeyframeData | null = null;

  constructor(
    ctx: KeyframeCommandContext,
    clipId: string,
    trackIndex: number,
    keyframeId: string
  ) {
    this.ctx = ctx;
    this.clipId = clipId;
    this.trackIndex = trackIndex;
    this.keyframeId = keyframeId;
  }

  execute(): void {
    const clip = this.ctx.getClip(this.clipId);
    const track = clip?.tracks[this.trackIndex];
    if (!track) return;

    const idx = track.keyframes.findIndex((k) => k.id === this.keyframeId);
    if (idx === -1) return;

    this.deletedKeyframe = cloneKeyframe(track.keyframes[idx]);
    track.keyframes.splice(idx, 1);

    this.ctx.evaluateClipAtCurrentTime?.(this.clipId);
    this.ctx.notifyTimelineChanged(
      this.clipId,
      track.targetEntityId,
      track.property,
      this.deletedKeyframe.time
    );
  }

  undo(): void {
    if (!this.deletedKeyframe) return;
    const clip = this.ctx.getClip(this.clipId);
    const track = clip?.tracks[this.trackIndex];
    if (!track) return;

    track.keyframes.push(cloneKeyframe(this.deletedKeyframe));
    sortTrackKeyframes(track);

    this.ctx.evaluateClipAtCurrentTime?.(this.clipId);
    this.ctx.notifyTimelineChanged(
      this.clipId,
      track.targetEntityId,
      track.property,
      this.deletedKeyframe.time
    );
  }
}

export class UpdateKeyframeInterpolationCommand implements ICommand {
  readonly id = crypto.randomUUID();
  readonly label = 'Update Keyframe Interpolation';
  readonly timestamp = Date.now();

  private readonly ctx: KeyframeCommandContext;
  private readonly clipId: string;
  private readonly trackIndex: number;
  private readonly keyframeId: string;
  private readonly oldInterpolation: InterpolationMode;
  private readonly newInterpolation: InterpolationMode;

  constructor(
    ctx: KeyframeCommandContext,
    clipId: string,
    trackIndex: number,
    keyframeId: string,
    oldInterpolation: InterpolationMode,
    newInterpolation: InterpolationMode
  ) {
    this.ctx = ctx;
    this.clipId = clipId;
    this.trackIndex = trackIndex;
    this.keyframeId = keyframeId;
    this.oldInterpolation = oldInterpolation;
    this.newInterpolation = newInterpolation;
  }

  execute(): void {
    this.applyInterpolation(this.newInterpolation);
  }

  undo(): void {
    this.applyInterpolation(this.oldInterpolation);
  }

  private applyInterpolation(interpolation: InterpolationMode): void {
    const clip = this.ctx.getClip(this.clipId);
    const track = clip?.tracks[this.trackIndex];
    if (!track) return;

    const kf = track.keyframes.find((k) => k.id === this.keyframeId);
    if (!kf) return;

    kf.interpolation = interpolation;
    this.ctx.evaluateClipAtCurrentTime?.(this.clipId);
    this.ctx.notifyTimelineChanged(this.clipId, track.targetEntityId, track.property, kf.time);
  }
}
