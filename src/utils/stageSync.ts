export const STAGE_SYNC_TOLERANCE_SEC = 1.5;
export const STAGE_SYNC_CATCHUP_DONE_SEC = 0.4;
export const STAGE_SYNC_TELEPORT_THRESHOLD_SEC = 60;
export const STAGE_SYNC_CATCHUP_RATE = 1.5;

export interface StageTimelineState {
  isPlaying: boolean;
  playbackStartedAt?: number;
  pausedAtSec?: number;
}

export type StageSyncAction =
  | { type: 'seek'; targetTime: number; drift: number }
  | { type: 'rate'; rate: number; targetTime: number; drift: number };

/**
 * Computes the expected playback position (in seconds) from a shared timeline anchor
 * so each client can catch up locally without being dragged backwards if the Host lags.
 */
export function computeExpectedPlaybackSec(
  timeline: StageTimelineState,
  nowMs: number = Date.now()
): number {
  if (!timeline.isPlaying) {
    return Math.max(0, timeline.pausedAtSec ?? 0);
  }
  if (typeof timeline.playbackStartedAt === 'number' && Number.isFinite(timeline.playbackStartedAt)) {
    return Math.max(0, (nowMs - timeline.playbackStartedAt) / 1000);
  }
  return Math.max(0, timeline.pausedAtSec ?? 0);
}

/**
 * Decides the local drift-correction action for a client's player:
 * - |drift| > 60s: teleport (seek) immediately to targetTime
 * - 1.5s < drift <= 60s (or > 0.4s while already catching up): speed up to 1.5x
 * - drift < -2.0s (ahead of anchor): seek back to targetTime
 * - otherwise: normal 1.0x playback
 */
export function computeStageSyncAction(params: {
  currentTime: number;
  expectedSec: number;
  duration: number;
  isLooping: boolean;
  isLive: boolean;
  isCatchingUp: boolean;
}): StageSyncAction {
  const { currentTime, expectedSec, duration, isLooping, isLive, isCatchingUp } = params;

  let targetTime = Math.max(0, expectedSec);
  if (!isLive && isLooping && duration > 0) {
    targetTime = targetTime % duration;
  } else if (duration > 0 && targetTime > duration) {
    targetTime = duration;
  }

  let drift = targetTime - currentTime;
  if (!isLive && isLooping && duration > 0) {
    if (drift > duration / 2) drift -= duration;
    if (drift < -duration / 2) drift += duration;
  }

  if (Math.abs(drift) > STAGE_SYNC_TELEPORT_THRESHOLD_SEC) {
    return { type: 'seek', targetTime, drift };
  }

  // If client somehow jumped noticeably ahead of the room timeline, snap back
  if (drift < -2.0) {
    return { type: 'seek', targetTime, drift };
  }

  const catchupThreshold = isCatchingUp
    ? STAGE_SYNC_CATCHUP_DONE_SEC
    : STAGE_SYNC_TOLERANCE_SEC;

  if (drift > catchupThreshold) {
    return { type: 'rate', rate: STAGE_SYNC_CATCHUP_RATE, targetTime, drift };
  }

  return { type: 'rate', rate: 1.0, targetTime, drift };
}
