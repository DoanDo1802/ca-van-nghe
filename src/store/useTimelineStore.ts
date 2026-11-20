import { create } from 'zustand';
import { EditorEngine } from '../engine/EditorEngine';
import type { AnimationClipData } from '../types';

export interface SelectedKeyframeRef {
  trackIndex: number;
  keyframeId: string;
}

export interface TimelineStoreState {
  clips: Record<string, AnimationClipData>;
  activeClipId: string | null;
  playheadTime: number;
  isPlayingPreview: boolean;
  isRecording: boolean;
  zoom: number; // Pixels per second
  selectedKeyframe: SelectedKeyframeRef | null;

  setActiveClipId: (clipId: string | null) => void;
  setPlayheadTime: (time: number) => void;
  setIsPlayingPreview: (playing: boolean) => void;
  setIsRecording: (recording: boolean) => void;
  setZoom: (zoom: number) => void;
  setSelectedKeyframe: (selection: SelectedKeyframeRef | null) => void;
  syncFromEngine: () => void;
}

function cloneClips(raw: Record<string, AnimationClipData>): Record<string, AnimationClipData> {
  const next: Record<string, AnimationClipData> = {};
  for (const [id, clip] of Object.entries(raw)) {
    next[id] = {
      ...clip,
      tracks: clip.tracks.map((track) => ({
        ...track,
        keyframes: track.keyframes.map((kf) => ({ ...kf })),
      })),
    };
  }
  return next;
}

export const useTimelineStore = create<TimelineStoreState>()((set, get) => ({
  clips: {},
  activeClipId: null,
  playheadTime: 0,
  isPlayingPreview: false,
  isRecording: false,
  zoom: 120,
  selectedKeyframe: null,

  setActiveClipId: (clipId) =>
    set((state) => ({
      activeClipId: clipId,
      selectedKeyframe: null,
      playheadTime: clipId && state.clips[clipId] ? Math.min(state.playheadTime, state.clips[clipId].duration) : 0,
    })),

  setPlayheadTime: (time) => set({ playheadTime: Math.max(0, time) }),

  setIsPlayingPreview: (playing) => set({ isPlayingPreview: playing }),

  setIsRecording: (recording) => set({ isRecording: recording }),

  setZoom: (zoom) => set({ zoom: Math.max(30, Math.min(480, zoom)) }),

  setSelectedKeyframe: (selection) => set({ selectedKeyframe: selection }),

  syncFromEngine: () => {
    const engine = EditorEngine.getInstance();
    const clips = cloneClips(engine.getAnimationClips());
    const state = get();

    let nextActiveClipId = state.activeClipId;
    if (!nextActiveClipId || !clips[nextActiveClipId]) {
      const ids = Object.keys(clips);
      nextActiveClipId = ids.length > 0 ? ids[0] : null;
    }

    let nextSelectedKeyframe = state.selectedKeyframe;
    if (nextSelectedKeyframe && nextActiveClipId && clips[nextActiveClipId]) {
      const track = clips[nextActiveClipId].tracks[nextSelectedKeyframe.trackIndex];
      const exists = track?.keyframes.some((kf) => kf.id === nextSelectedKeyframe!.keyframeId);
      if (!exists) {
        nextSelectedKeyframe = null;
      }
    } else if (!nextActiveClipId) {
      nextSelectedKeyframe = null;
    }

    const activeClip = nextActiveClipId ? clips[nextActiveClipId] : null;
    const nextPlayhead = activeClip
      ? Math.max(0, Math.min(state.playheadTime, activeClip.duration))
      : 0;

    set({
      clips,
      activeClipId: nextActiveClipId,
      selectedKeyframe: nextSelectedKeyframe,
      playheadTime: nextPlayhead,
    });
  },
}));
