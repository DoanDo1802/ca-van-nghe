import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { EditorEngine } from '../../../engine/EditorEngine';
import type {
  AnimComponentData,
  AnimStateConfig,
  AnimTransitionConfig,
} from '../../../types';
import { NumberScrubber } from './NumberScrubber';

export interface AnimInspectorProps {
  entityId: string;
  component: AnimComponentData;
}

const PRESET_STATE_NAMES = ['Idle', 'Walk', 'Run', 'Attack'];

export const AnimInspector: React.FC<AnimInspectorProps> = ({ entityId, component }) => {
  const [customTrackRows, setCustomTrackRows] = useState<Record<number, boolean>>({});

  const update = (patch: Partial<AnimComponentData>) => {
    EditorEngine.getInstance().updateComponentProperty(
      entityId,
      component.id,
      patch as Record<string, unknown>
    );
  };

  const availableTracks = useMemo(() => {
    const tracks = new Set<string>();
    const maybeExtra = (component as AnimComponentData & { availableTracks?: string[] })
      .availableTracks;
    if (Array.isArray(maybeExtra)) {
      for (const t of maybeExtra) {
        if (t) tracks.add(t);
      }
    }
    for (const s of component.states) {
      if (s.clipAssetId) {
        tracks.add(s.clipAssetId);
      }
    }
    return Array.from(tracks);
  }, [component]);

  const stateNames = useMemo(
    () => component.states.map((s) => s.name).filter((n) => n.trim().length > 0),
    [component.states]
  );

  const handleAddState = () => {
    const existing = new Set(component.states.map((s) => s.name));
    const nextName =
      PRESET_STATE_NAMES.find((n) => !existing.has(n)) ??
      `State_${component.states.length + 1}`;
    const newState: AnimStateConfig = {
      name: nextName,
      clipAssetId: availableTracks[0] ?? '',
      speed: 1,
      loop: true,
    };
    const nextStates = [...component.states, newState];
    const patch: Partial<AnimComponentData> = { states: nextStates };
    if (!component.defaultState) {
      patch.defaultState = nextName;
    }
    update(patch);
  };

  const handleUpdateState = (index: number, statePatch: Partial<AnimStateConfig>) => {
    const prev = component.states[index];
    if (!prev) return;
    const nextStates = component.states.map((s, i) =>
      i === index ? { ...s, ...statePatch } : s
    );
    const patch: Partial<AnimComponentData> = { states: nextStates };
    if (statePatch.name !== undefined && component.defaultState === prev.name) {
      patch.defaultState = statePatch.name;
    }
    update(patch);
  };

  const handleRemoveState = (index: number) => {
    const removed = component.states[index];
    const nextStates = component.states.filter((_, i) => i !== index);
    const patch: Partial<AnimComponentData> = { states: nextStates };
    if (removed && component.defaultState === removed.name) {
      patch.defaultState = nextStates[0]?.name ?? '';
    }
    update(patch);
  };

  const handleAddTransition = () => {
    const fromState = stateNames[0] ?? '';
    const toState = stateNames[1] ?? stateNames[0] ?? '';
    const newTransition: AnimTransitionConfig = {
      from: fromState,
      to: toState,
      blendTime: 0.2,
      trigger: '',
    };
    update({ transitions: [...component.transitions, newTransition] });
  };

  const handleUpdateTransition = (
    index: number,
    transPatch: Partial<AnimTransitionConfig>
  ) => {
    const nextTransitions = component.transitions.map((t, i) =>
      i === index ? { ...t, ...transPatch } : t
    );
    update({ transitions: nextTransitions });
  };

  const handleRemoveTransition = (index: number) => {
    update({
      transitions: component.transitions.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-3">
      {/* Core PlayCanvas v2 anim properties */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={component.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500"
          />
          <span>Enabled</span>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={component.activate}
            onChange={(e) => update({ activate: e.target.checked })}
            className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500"
          />
          <span>Activate</span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">Speed</span>
        <div className="w-24">
          <NumberScrubber
            value={component.speed}
            min={0}
            step={0.1}
            precision={2}
            onChange={(val, commit) => {
              if (commit) update({ speed: val });
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-gray-400">Default State</label>
        <select
          value={component.defaultState}
          onChange={(e) => update({ defaultState: e.target.value })}
          className="w-36 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">(None)</option>
          {stateNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {component.defaultState && !stateNames.includes(component.defaultState) && (
            <option value={component.defaultState}>{component.defaultState}</option>
          )}
        </select>
      </div>

      {/* Extracted GLB AnimTrack list */}
      {availableTracks.length > 0 && (
        <div className="pt-2 border-t border-[#2b313d] space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Available GLB Tracks ({availableTracks.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {availableTracks.map((track) => (
              <span
                key={track}
                className="px-1.5 py-0.5 rounded bg-[#12151b] border border-[#2f3644] text-[10px] font-mono text-sky-300"
                title={track}
              >
                {track}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Animation States */}
      <div className="pt-2 border-t border-[#2b313d] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            States ({component.states.length})
          </span>
          <button
            type="button"
            onClick={handleAddState}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#252b36] hover:bg-[#303846] text-[10px] text-gray-200"
          >
            <Plus className="w-3 h-3" />
            <span>Add State</span>
          </button>
        </div>

        {component.states.length === 0 ? (
          <div className="text-[10px] text-gray-500 italic">
            No animation states configured.
          </div>
        ) : (
          <div className="space-y-1.5">
            {component.states.map((state, idx) => {
              const isCustomTrack =
                customTrackRows[idx] ||
                (availableTracks.length > 0 &&
                  state.clipAssetId.length > 0 &&
                  !availableTracks.includes(state.clipAssetId));

              return (
                <div
                  key={idx}
                  className="p-2 rounded bg-[#12151b] border border-[#2a303c] space-y-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={state.name}
                      placeholder="State name"
                      onChange={(e) => handleUpdateState(idx, { name: e.target.value })}
                      className="flex-1 min-w-0 bg-[#1b1f27] border border-[#2f3644] rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveState(idx)}
                      title="Remove State"
                      className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-[#1f242e]"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-gray-400 shrink-0">Track</span>
                      {availableTracks.length > 0 && !isCustomTrack ? (
                        <select
                          value={state.clipAssetId}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setCustomTrackRows((prev) => ({ ...prev, [idx]: true }));
                            } else {
                              handleUpdateState(idx, { clipAssetId: e.target.value });
                            }
                          }}
                          className="flex-1 min-w-0 bg-[#1b1f27] border border-[#2f3644] rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
                        >
                          <option value="">(Select track)</option>
                          {availableTracks.map((track) => (
                            <option key={track} value={track}>
                              {track}
                            </option>
                          ))}
                          <option value="__custom__">Custom...</option>
                        </select>
                      ) : (
                        <div className="flex-1 min-w-0 flex items-center gap-1">
                          <input
                            type="text"
                            value={state.clipAssetId}
                            placeholder="Track or Clip ID"
                            onChange={(e) =>
                              handleUpdateState(idx, { clipAssetId: e.target.value })
                            }
                            className="flex-1 min-w-0 bg-[#1b1f27] border border-[#2f3644] rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
                          />
                          {availableTracks.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setCustomTrackRows((prev) => ({ ...prev, [idx]: false }))
                              }
                              className="px-1.5 py-0.5 rounded bg-[#252b36] hover:bg-[#303846] text-[10px] text-gray-300 shrink-0"
                              title="Pick from available tracks"
                            >
                              List
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-[10px] text-gray-400">Speed</span>
                        <div className="w-20">
                          <NumberScrubber
                            value={state.speed}
                            min={0}
                            step={0.1}
                            precision={2}
                            onChange={(val, commit) => {
                              if (commit) handleUpdateState(idx, { speed: val });
                            }}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-1 text-[10px] text-gray-300 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={state.loop}
                          onChange={(e) =>
                            handleUpdateState(idx, { loop: e.target.checked })
                          }
                          className="rounded border-[#2f3644] bg-[#1b1f27] accent-blue-500"
                        />
                        <span>Loop</span>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Animation Transitions */}
      <div className="pt-2 border-t border-[#2b313d] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Transitions ({component.transitions.length})
          </span>
          <button
            type="button"
            onClick={handleAddTransition}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#252b36] hover:bg-[#303846] text-[10px] text-gray-200"
          >
            <Plus className="w-3 h-3" />
            <span>Add Transition</span>
          </button>
        </div>

        {component.transitions.length === 0 ? (
          <div className="text-[10px] text-gray-500 italic">
            No transitions configured.
          </div>
        ) : (
          <div className="space-y-1.5">
            {component.transitions.map((trans, idx) => (
              <div
                key={idx}
                className="p-2 rounded bg-[#12151b] border border-[#2a303c] space-y-1.5"
              >
                <div className="flex items-center gap-1">
                  {stateNames.length > 0 ? (
                    <select
                      value={trans.from}
                      onChange={(e) =>
                        handleUpdateTransition(idx, { from: e.target.value })
                      }
                      title="From State"
                      className="flex-1 min-w-0 bg-[#1b1f27] border border-[#2f3644] rounded px-1 py-0.5 text-[10px] text-gray-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="*">* (Any)</option>
                      {stateNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      {trans.from &&
                        trans.from !== '*' &&
                        !stateNames.includes(trans.from) && (
                          <option value={trans.from}>{trans.from}</option>
                        )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={trans.from}
                      placeholder="From"
                      onChange={(e) =>
                        handleUpdateTransition(idx, { from: e.target.value })
                      }
                      className="flex-1 min-w-0 bg-[#1b1f27] border border-[#2f3644] rounded px-1.5 py-0.5 text-[10px] text-gray-200 focus:outline-none focus:border-blue-500"
                    />
                  )}

                  <span className="text-[10px] text-gray-500 shrink-0">-&gt;</span>

                  {stateNames.length > 0 ? (
                    <select
                      value={trans.to}
                      onChange={(e) =>
                        handleUpdateTransition(idx, { to: e.target.value })
                      }
                      title="To State"
                      className="flex-1 min-w-0 bg-[#1b1f27] border border-[#2f3644] rounded px-1 py-0.5 text-[10px] text-gray-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">(Select)</option>
                      {stateNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      {trans.to && !stateNames.includes(trans.to) && (
                        <option value={trans.to}>{trans.to}</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={trans.to}
                      placeholder="To"
                      onChange={(e) =>
                        handleUpdateTransition(idx, { to: e.target.value })
                      }
                      className="flex-1 min-w-0 bg-[#1b1f27] border border-[#2f3644] rounded px-1.5 py-0.5 text-[10px] text-gray-200 focus:outline-none focus:border-blue-500"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveTransition(idx)}
                    title="Remove Transition"
                    className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-[#1f242e] shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-400 shrink-0">Blend</span>
                    <NumberScrubber
                      value={trans.blendTime}
                      min={0}
                      step={0.05}
                      precision={2}
                      onChange={(val, commit) => {
                        if (commit) handleUpdateTransition(idx, { blendTime: val });
                      }}
                    />
                  </div>
                  <input
                    type="text"
                    value={trans.trigger ?? ''}
                    placeholder="Trigger"
                    onChange={(e) =>
                      handleUpdateTransition(idx, { trigger: e.target.value })
                    }
                    className="min-w-0 bg-[#1b1f27] border border-[#2f3644] rounded px-1.5 py-0.5 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
