import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  Diamond,
  Film,
  Pause,
  Play,
  Plus,
  SkipBack,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { EditorEngine } from '../../engine/EditorEngine';
import { useEditorStore } from '../../store/useEditorStore';
import { useTimelineStore } from '../../store/useTimelineStore';
import type {
  AnimatablePropertyPath,
  EntityData,
  InterpolationMode,
  LoopMode,
  PropertyTrackData,
  RenderComponentData,
  LightComponentData,
} from '../../types';

const ANIMATABLE_PROPERTIES: Array<{ value: AnimatablePropertyPath; label: string }> = [
  { value: 'position', label: 'Position' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'scale', label: 'Scale' },
  { value: 'material.diffuse', label: 'Material Diffuse' },
  { value: 'material.opacity', label: 'Material Opacity' },
  { value: 'light.intensity', label: 'Light Intensity' },
];

const INTERPOLATION_MODES: Array<{ value: InterpolationMode; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease In' },
  { value: 'easeOut', label: 'Ease Out' },
  { value: 'easeInOut', label: 'Ease In-Out' },
  { value: 'step', label: 'Step' },
];

const LOOP_MODES: Array<{ value: LoopMode; label: string }> = [
  { value: 'once', label: 'Once' },
  { value: 'loop', label: 'Loop' },
  { value: 'pingpong', label: 'Ping-Pong' },
];

function readEntityPropertyValue(
  entityData: EntityData | null,
  property: AnimatablePropertyPath
): number[] {
  if (!entityData) {
    if (property === 'scale' || property === 'material.diffuse') return [1, 1, 1];
    if (property === 'material.opacity' || property === 'light.intensity') return [1];
    return [0, 0, 0];
  }

  switch (property) {
    case 'position':
      return [...entityData.transform.position];
    case 'rotation':
      return [...entityData.transform.rotation];
    case 'scale':
      return [...entityData.transform.scale];
    case 'material.diffuse': {
      const render = entityData.components.find((c): c is RenderComponentData => c.type === 'render');
      return render ? [...render.material.diffuseColor] : [1, 1, 1];
    }
    case 'material.opacity': {
      const render = entityData.components.find((c): c is RenderComponentData => c.type === 'render');
      return [render ? render.material.opacity : 1];
    }
    case 'light.intensity': {
      const light = entityData.components.find((c): c is LightComponentData => c.type === 'light');
      return [light ? light.intensity : 1];
    }
  }
}

export const TimelinePanel: React.FC = () => {
  const clips = useTimelineStore((s) => s.clips);
  const activeClipId = useTimelineStore((s) => s.activeClipId);
  const playheadTime = useTimelineStore((s) => s.playheadTime);
  const isPlayingPreview = useTimelineStore((s) => s.isPlayingPreview);
  const isRecording = useTimelineStore((s) => s.isRecording);
  const zoom = useTimelineStore((s) => s.zoom);
  const selectedKeyframe = useTimelineStore((s) => s.selectedKeyframe);

  const setActiveClipId = useTimelineStore((s) => s.setActiveClipId);
  const setPlayheadTime = useTimelineStore((s) => s.setPlayheadTime);
  const setIsPlayingPreview = useTimelineStore((s) => s.setIsPlayingPreview);
  const setIsRecording = useTimelineStore((s) => s.setIsRecording);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const setSelectedKeyframe = useTimelineStore((s) => s.setSelectedKeyframe);
  const syncFromEngine = useTimelineStore((s) => s.syncFromEngine);

  const selectedEntityIds = useEditorStore((s) => s.selectedEntityIds);
  const entitySummaries = useEditorStore((s) => s.entitySummaries);
  const playState = useEditorStore((s) => s.playState);

  const [newTrackProperty, setNewTrackProperty] = useState<AnimatablePropertyPath>('position');
  const [draggingKf, setDraggingKf] = useState<{
    trackIndex: number;
    keyframeId: string;
    previewTime: number;
  } | null>(null);

  const rulerRef = useRef<HTMLDivElement | null>(null);
  const pingPongDirRef = useRef<1 | -1>(1);
  const lastFrameTimeRef = useRef<number | null>(null);

  const clipList = useMemo(() => Object.values(clips), [clips]);
  const activeClip = activeClipId ? clips[activeClipId] ?? null : null;
  const selectedEntityId = selectedEntityIds[0] ?? null;
  const isEditMode = playState === 'edit';

  // Initial sync on mount
  useEffect(() => {
    syncFromEngine();
  }, [syncFromEngine]);

  // Stop preview & recording if leaving Edit Mode
  useEffect(() => {
    if (!isEditMode) {
      if (isPlayingPreview) {
        setIsPlayingPreview(false);
      }
      if (isRecording) {
        EditorEngine.getInstance().setRecording(false, null);
        setIsRecording(false);
      }
    }
  }, [isEditMode, isPlayingPreview, isRecording, setIsPlayingPreview, setIsRecording]);

  // Keep engine recording target synced when activeClipId changes while recording
  useEffect(() => {
    if (isRecording) {
      EditorEngine.getInstance().setRecording(true, activeClipId);
    }
  }, [isRecording, activeClipId]);

  // Edit-Mode preview playback loop via requestAnimationFrame
  useEffect(() => {
    if (!isPlayingPreview || !activeClip || !isEditMode) {
      lastFrameTimeRef.current = null;
      return;
    }

    let rafId = 0;
    const tick = (now: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = now;
      }
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
      lastFrameTimeRef.current = now;

      const storeState = useTimelineStore.getState();
      const clip = storeState.activeClipId ? storeState.clips[storeState.activeClipId] : null;
      if (!clip || !storeState.isPlayingPreview) return;

      const duration = Math.max(0.01, clip.duration);
      let nextTime = storeState.playheadTime + dt * pingPongDirRef.current;

      if (clip.loopMode === 'once') {
        if (nextTime >= duration) {
          nextTime = duration;
          EditorEngine.getInstance().scrubAnimation(clip.id, nextTime);
          storeState.setPlayheadTime(nextTime);
          storeState.setIsPlayingPreview(false);
          return;
        }
      } else if (clip.loopMode === 'loop') {
        if (nextTime >= duration) {
          nextTime = nextTime % duration;
        }
      } else if (clip.loopMode === 'pingpong') {
        if (nextTime >= duration) {
          nextTime = Math.max(0, duration - (nextTime - duration));
          pingPongDirRef.current = -1;
        } else if (nextTime <= 0) {
          nextTime = Math.min(duration, -nextTime);
          pingPongDirRef.current = 1;
        }
      }

      EditorEngine.getInstance().scrubAnimation(clip.id, nextTime);
      storeState.setPlayheadTime(nextTime);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      lastFrameTimeRef.current = null;
    };
  }, [isPlayingPreview, activeClip?.id, isEditMode]);

  const scrubToTime = useCallback(
    (time: number) => {
      if (!activeClip) return;
      const clamped = Math.max(0, Math.min(activeClip.duration, time));
      setPlayheadTime(clamped);
      if (isEditMode) {
        EditorEngine.getInstance().scrubAnimation(activeClip.id, clamped);
      }
    },
    [activeClip, isEditMode, setPlayheadTime]
  );

  const handleCreateClip = () => {
    const engine = EditorEngine.getInstance();
    const nextIndex = clipList.length + 1;
    const created = engine.createAnimationClip(`Clip ${nextIndex}`, selectedEntityId ?? undefined);
    syncFromEngine();
    setActiveClipId(created.id);
    setPlayheadTime(0);
  };

  const handleDeleteClip = () => {
    if (!activeClip) return;
    const engine = EditorEngine.getInstance();
    if (isRecording) {
      engine.setRecording(false, null);
      setIsRecording(false);
    }
    if (isPlayingPreview) {
      setIsPlayingPreview(false);
    }
    engine.deleteAnimationClip(activeClip.id);
    setSelectedKeyframe(null);
    syncFromEngine();
  };

  const handleToggleRecording = () => {
    if (!activeClip || !isEditMode) return;
    const next = !isRecording;
    EditorEngine.getInstance().setRecording(next, next ? activeClip.id : null);
    setIsRecording(next);
  };

  const handleTogglePlayPreview = () => {
    if (!activeClip || !isEditMode) return;
    if (!isPlayingPreview) {
      if (activeClip.loopMode === 'once' && playheadTime >= activeClip.duration) {
        scrubToTime(0);
      }
      pingPongDirRef.current = 1;
      setIsPlayingPreview(true);
    } else {
      setIsPlayingPreview(false);
    }
  };

  const handleAddTrack = () => {
    if (!activeClip || !selectedEntityId) return;
    EditorEngine.getInstance().addPropertyTrack(activeClip.id, selectedEntityId, newTrackProperty);
    syncFromEngine();
  };

  const handleRecordKeyframeForTrack = (track: PropertyTrackData) => {
    if (!activeClip) return;
    const engine = EditorEngine.getInstance();
    const entityData = engine.getEntityData(track.targetEntityId);
    const value = readEntityPropertyValue(entityData, track.property);
    engine.recordKeyframe(activeClip.id, track.targetEntityId, track.property, playheadTime, value);
    syncFromEngine();
  };

  const handleAddKeyframeAtPlayhead = () => {
    if (!activeClip) return;
    if (selectedKeyframe && activeClip.tracks[selectedKeyframe.trackIndex]) {
      handleRecordKeyframeForTrack(activeClip.tracks[selectedKeyframe.trackIndex]);
      return;
    }
    if (selectedEntityId) {
      const entityTracks = activeClip.tracks.filter((t) => t.targetEntityId === selectedEntityId);
      if (entityTracks.length > 0) {
        for (const track of entityTracks) {
          handleRecordKeyframeForTrack(track);
        }
        return;
      }
    }
    if (activeClip.tracks.length > 0) {
      handleRecordKeyframeForTrack(activeClip.tracks[0]);
    }
  };

  const handleDeleteSelectedKeyframe = () => {
    if (!activeClip || !selectedKeyframe) return;
    EditorEngine.getInstance().deleteKeyframe(
      activeClip.id,
      selectedKeyframe.trackIndex,
      selectedKeyframe.keyframeId
    );
    setSelectedKeyframe(null);
    syncFromEngine();
  };

  const handleChangeInterpolation = (interpolation: InterpolationMode) => {
    if (!activeClip || !selectedKeyframe) return;
    EditorEngine.getInstance().updateKeyframeInterpolation(
      activeClip.id,
      selectedKeyframe.trackIndex,
      selectedKeyframe.keyframeId,
      interpolation
    );
    syncFromEngine();
  };

  // Ruler scrubbing via pointer events
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeClip || !rulerRef.current) return;
    e.preventDefault();
    if (isPlayingPreview) {
      setIsPlayingPreview(false);
    }

    const updateFromClientX = (clientX: number) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = Math.max(0, clientX - rect.left);
      scrubToTime(x / zoom);
    };

    updateFromClientX(e.clientX);

    const onMove = (moveEvent: PointerEvent) => {
      updateFromClientX(moveEvent.clientX);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Keyframe horizontal drag
  const handleKeyframePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    trackIndex: number,
    keyframeId: string,
    initialTime: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!activeClip) return;

    setSelectedKeyframe({ trackIndex, keyframeId });
    const startX = e.clientX;
    let latestTime = initialTime;
    setDraggingKf({ trackIndex, keyframeId, previewTime: initialTime });

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const rawTime = initialTime + dx / zoom;
      latestTime = Math.round(Math.max(0, Math.min(activeClip.duration, rawTime)) * 1000) / 1000;
      setDraggingKf({ trackIndex, keyframeId, previewTime: latestTime });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDraggingKf(null);
      if (Math.abs(latestTime - initialTime) > 0.0005) {
        EditorEngine.getInstance().moveKeyframe(activeClip.id, trackIndex, keyframeId, latestTime);
        syncFromEngine();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const selectedKeyframeObj = useMemo(() => {
    if (!activeClip || !selectedKeyframe) return null;
    const track = activeClip.tracks[selectedKeyframe.trackIndex];
    return track?.keyframes.find((kf) => kf.id === selectedKeyframe.keyframeId) ?? null;
  }, [activeClip, selectedKeyframe]);

  const timelineWidth = activeClip ? Math.max(600, Math.ceil(activeClip.duration * zoom) + 48) : 600;

  // Build ruler ticks (seconds & frames)
  const rulerTicks = useMemo(() => {
    if (!activeClip) return [];
    const fps = Math.max(1, activeClip.fps || 30);
    const totalSeconds = activeClip.duration;
    // Choose major step based on zoom so labels never overlap
    const majorStep = zoom >= 160 ? 0.5 : zoom >= 70 ? 1 : 2;
    const ticks: Array<{ time: number; label: string; frame: number; major: boolean }> = [];

    const totalMajor = Math.floor(totalSeconds / majorStep + 1e-6);
    for (let i = 0; i <= totalMajor; i++) {
      const t = Math.round(i * majorStep * 1000) / 1000;
      const frame = Math.round(t * fps);
      ticks.push({
        time: t,
        label: `${t.toFixed(majorStep < 1 ? 1 : 0)}s (${frame}f)`,
        frame,
        major: true,
      });
    }

    // Sub-ticks for frames when zoomed in enough
    const framePx = zoom / fps;
    if (framePx >= 6) {
      const totalFrames = Math.floor(totalSeconds * fps + 1e-6);
      for (let f = 0; f <= totalFrames; f++) {
        const t = f / fps;
        if (ticks.some((tk) => Math.abs(tk.time - t) < 0.002)) continue;
        ticks.push({ time: t, label: '', frame: f, major: false });
      }
    } else {
      // Quarter-second minor ticks
      const minorStep = majorStep / 4;
      const totalMinor = Math.floor(totalSeconds / minorStep + 1e-6);
      for (let i = 0; i <= totalMinor; i++) {
        const t = i * minorStep;
        if (ticks.some((tk) => Math.abs(tk.time - t) < 0.002)) continue;
        ticks.push({ time: t, label: '', frame: Math.round(t * fps), major: false });
      }
    }

    return ticks;
  }, [activeClip, zoom]);

  return (
    <div className="h-full flex flex-col bg-[#151820] text-gray-200 text-xs select-none">
      {/* Top Controls Bar */}
      <div className="h-8 shrink-0 px-2 bg-[#1a1e27] border-b border-[#2b313d] flex items-center gap-2 overflow-x-auto">
        {/* Record & Transport */}
        <div className="flex items-center gap-1 pr-2 border-r border-[#2b313d]">
          <button
            type="button"
            title={isRecording ? 'Stop Recording Keyframes' : 'Record Mode (Auto-keyframe transforms)'}
            disabled={!activeClip || !isEditMode}
            onClick={handleToggleRecording}
            className={`h-6 px-2 rounded flex items-center gap-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
              isRecording
                ? 'bg-red-600/25 text-red-300 border border-red-500/70'
                : 'bg-[#232834] text-gray-300 hover:bg-[#2c3342] border border-transparent'
            }`}
          >
            <Circle className={`w-3 h-3 ${isRecording ? 'fill-red-500 text-red-500 animate-pulse' : 'text-red-400'}`} />
            <span>Rec</span>
          </button>

          <button
            type="button"
            title="Jump to Start"
            disabled={!activeClip}
            onClick={() => {
              setIsPlayingPreview(false);
              scrubToTime(0);
            }}
            className="h-6 w-6 rounded flex items-center justify-center bg-[#232834] hover:bg-[#2c3342] text-gray-300 disabled:opacity-40"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title={isPlayingPreview ? 'Pause Preview' : 'Play Edit-Mode Preview'}
            disabled={!activeClip || !isEditMode}
            onClick={handleTogglePlayPreview}
            className={`h-6 w-6 rounded flex items-center justify-center transition-colors disabled:opacity-40 ${
              isPlayingPreview
                ? 'bg-blue-600 text-white'
                : 'bg-[#232834] hover:bg-[#2c3342] text-gray-300'
            }`}
          >
            {isPlayingPreview ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <span className="font-mono text-[11px] text-gray-300 px-1.5 min-w-[74px] text-right">
            {playheadTime.toFixed(2)}s
            {activeClip ? ` / ${Math.round(playheadTime * activeClip.fps)}f` : ''}
          </span>
        </div>

        {/* Clip Selector + New/Delete */}
        <div className="flex items-center gap-1 pr-2 border-r border-[#2b313d]">
          <Film className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <select
            value={activeClipId ?? ''}
            onChange={(e) => setActiveClipId(e.target.value || null)}
            className="h-6 px-1.5 rounded bg-[#11141b] border border-[#2d3340] text-gray-200 text-[11px] max-w-[140px]"
          >
            {clipList.length === 0 && <option value="">No Clips</option>}
            {clipList.map((clip) => (
              <option key={clip.id} value={clip.id}>
                {clip.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="New Animation Clip"
            onClick={handleCreateClip}
            className="h-6 px-1.5 rounded bg-[#232834] hover:bg-[#2c3342] text-gray-200 flex items-center gap-0.5 text-[11px]"
          >
            <Plus className="w-3 h-3" />
            <span>New</span>
          </button>
          <button
            type="button"
            title="Delete Active Clip"
            disabled={!activeClip}
            onClick={handleDeleteClip}
            className="h-6 w-6 rounded bg-[#232834] hover:bg-red-900/50 text-gray-300 hover:text-red-300 flex items-center justify-center disabled:opacity-40"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* Clip Settings: Duration & LoopMode */}
        {activeClip && (
          <div className="flex items-center gap-1.5 pr-2 border-r border-[#2b313d]">
            <label className="text-[10px] text-gray-400">Dur</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={activeClip.duration}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!Number.isFinite(val) || val < 0.1) return;
                EditorEngine.getInstance().updateAnimationClipSettings(activeClip.id, { duration: val });
                syncFromEngine();
              }}
              className="h-6 w-14 px-1.5 rounded bg-[#11141b] border border-[#2d3340] text-gray-200 font-mono text-[11px]"
            />
            <select
              value={activeClip.loopMode}
              onChange={(e) => {
                EditorEngine.getInstance().updateAnimationClipSettings(activeClip.id, {
                  loopMode: e.target.value as LoopMode,
                });
                syncFromEngine();
              }}
              className="h-6 px-1.5 rounded bg-[#11141b] border border-[#2d3340] text-gray-200 text-[11px]"
            >
              {LOOP_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Keyframe Tools */}
        <div className="flex items-center gap-1 pr-2 border-r border-[#2b313d]">
          <button
            type="button"
            title="Add Keyframe at Playhead"
            disabled={!activeClip || activeClip.tracks.length === 0}
            onClick={handleAddKeyframeAtPlayhead}
            className="h-6 px-2 rounded bg-[#232834] hover:bg-[#2c3342] text-blue-300 flex items-center gap-1 text-[11px] disabled:opacity-40"
          >
            <Diamond className="w-3 h-3" />
            <span>+ Key</span>
          </button>
          <button
            type="button"
            title="Delete Selected Keyframe"
            disabled={!selectedKeyframeObj}
            onClick={handleDeleteSelectedKeyframe}
            className="h-6 px-1.5 rounded bg-[#232834] hover:bg-red-900/50 text-gray-300 hover:text-red-300 text-[11px] disabled:opacity-40"
          >
            Del Key
          </button>
          <select
            title="Keyframe Interpolation"
            disabled={!selectedKeyframeObj}
            value={selectedKeyframeObj?.interpolation ?? 'linear'}
            onChange={(e) => handleChangeInterpolation(e.target.value as InterpolationMode)}
            className="h-6 px-1.5 rounded bg-[#11141b] border border-[#2d3340] text-gray-200 text-[11px] disabled:opacity-40"
          >
            {INTERPOLATION_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            title="Zoom Out"
            onClick={() => setZoom(zoom - 30)}
            className="h-6 w-6 rounded bg-[#232834] hover:bg-[#2c3342] flex items-center justify-center text-gray-300"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="font-mono text-[10px] text-gray-400 w-9 text-center">{zoom}px</span>
          <button
            type="button"
            title="Zoom In"
            onClick={() => setZoom(zoom + 30)}
            className="h-6 w-6 rounded bg-[#232834] hover:bg-[#2c3342] flex items-center justify-center text-gray-300"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Dope Sheet Body */}
      {!activeClip ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
          <Film className="w-6 h-6 text-gray-600" />
          <div className="text-xs text-gray-400">No Animation Clip selected</div>
          <button
            type="button"
            onClick={handleCreateClip}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium"
          >
            Create Animation Clip
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left Track List Column */}
          <div className="w-60 shrink-0 border-r border-[#2b313d] bg-[#181c24] flex flex-col">
            {/* Add Property Track Header */}
            <div className="h-7 shrink-0 px-2 border-b border-[#2b313d] flex items-center gap-1 bg-[#1b1f27]">
              <select
                value={newTrackProperty}
                onChange={(e) => setNewTrackProperty(e.target.value as AnimatablePropertyPath)}
                className="h-5 flex-1 min-w-0 px-1 rounded bg-[#11141b] border border-[#2d3340] text-[10px] text-gray-200"
              >
                {ANIMATABLE_PROPERTIES.map((prop) => (
                  <option key={prop.value} value={prop.value}>
                    {prop.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedEntityId}
                title={selectedEntityId ? 'Add Property Track for Selected Entity' : 'Select an entity in Hierarchy/Viewport first'}
                onClick={handleAddTrack}
                className="h-5 px-1.5 rounded bg-blue-600/80 hover:bg-blue-500 text-white text-[10px] font-medium disabled:opacity-40 flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                <span>Track</span>
              </button>
            </div>

            {/* Track Rows */}
            <div className="flex-1 overflow-y-auto">
              {activeClip.tracks.length === 0 ? (
                <div className="p-3 text-[11px] text-gray-500">
                  {selectedEntityId
                    ? 'Click "+ Track" above to animate a property.'
                    : 'Select an entity, then click "+ Track".'}
                </div>
              ) : (
                activeClip.tracks.map((track) => {
                  const entityName =
                    entitySummaries[track.targetEntityId]?.name ?? track.targetEntityId.slice(0, 8);
                  return (
                    <div
                      key={track.id}
                      className="h-7 px-2 border-b border-[#232834] flex items-center justify-between gap-1 hover:bg-[#1f2430]"
                    >
                      <div className="truncate text-[11px]" title={`${entityName}.${track.property}`}>
                        <span className="text-gray-300 font-medium">{entityName}</span>
                        <span className="text-gray-500">.{track.property}</span>
                      </div>
                      <button
                        type="button"
                        title="Record Keyframe at Playhead"
                        onClick={() => handleRecordKeyframeForTrack(track)}
                        className="h-5 w-5 shrink-0 rounded hover:bg-[#2c3342] text-blue-400 flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Scrollable Ruler & Keyframe Lanes */}
          <div className="flex-1 min-w-0 overflow-auto relative bg-[#13161d]">
            <div style={{ width: timelineWidth }} className="min-h-full relative">
              {/* Time Ruler */}
              <div
                ref={rulerRef}
                onPointerDown={handleRulerPointerDown}
                className="h-7 sticky top-0 z-20 bg-[#1b1f27] border-b border-[#2b313d] cursor-ew-resize relative"
              >
                {/* Duration End Marker */}
                <div
                  style={{ left: activeClip.duration * zoom }}
                  className="absolute top-0 bottom-0 w-px bg-amber-500/60"
                />
                {rulerTicks.map((tick, i) => (
                  <div
                    key={`${tick.time}-${i}`}
                    style={{ left: tick.time * zoom }}
                    className="absolute bottom-0 pointer-events-none"
                  >
                    <div
                      className={`w-px ${
                        tick.major ? 'h-3.5 bg-gray-400' : 'h-1.5 bg-gray-600'
                      }`}
                    />
                    {tick.major && (
                      <span className="absolute -top-3.5 left-1 text-[9px] font-mono text-gray-400 whitespace-nowrap">
                        {tick.label}
                      </span>
                    )}
                  </div>
                ))}

                {/* Playhead Handle */}
                <div
                  style={{ left: playheadTime * zoom }}
                  className="absolute top-0 bottom-0 -translate-x-1/2 pointer-events-none flex flex-col items-center"
                >
                  <div className="w-2.5 h-3 bg-red-500 rounded-b-sm" />
                </div>
              </div>

              {/* Track Lanes */}
              <div className="relative">
                {activeClip.tracks.map((track, trackIndex) => (
                  <div
                    key={track.id}
                    className="h-7 border-b border-[#20242f] relative hover:bg-[#181c26]"
                  >
                    {/* Clip duration boundary shading */}
                    <div
                      style={{ left: activeClip.duration * zoom }}
                      className="absolute top-0 bottom-0 right-0 bg-black/25 pointer-events-none"
                    />

                    {track.keyframes.map((kf) => {
                      const isSelected =
                        selectedKeyframe?.trackIndex === trackIndex &&
                        selectedKeyframe?.keyframeId === kf.id;
                      const displayTime =
                        draggingKf &&
                        draggingKf.trackIndex === trackIndex &&
                        draggingKf.keyframeId === kf.id
                          ? draggingKf.previewTime
                          : kf.time;

                      return (
                        <button
                          key={kf.id}
                          type="button"
                          title={`${kf.time.toFixed(3)}s (${kf.interpolation})`}
                          onPointerDown={(e) =>
                            handleKeyframePointerDown(e, trackIndex, kf.id, kf.time)
                          }
                          style={{ left: displayTime * zoom }}
                          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 border transition-transform ${
                            isSelected
                              ? 'bg-amber-400 border-white scale-125 z-10'
                              : 'bg-blue-400 border-blue-200 hover:bg-blue-300'
                          }`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Full-height Playhead Line */}
              <div
                style={{ left: playheadTime * zoom }}
                className="absolute top-7 bottom-0 w-px bg-red-500/80 pointer-events-none z-10"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
