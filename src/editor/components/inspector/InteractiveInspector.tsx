import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { EditorEngine } from '../../../engine/EditorEngine';
import { useEditorStore } from '../../../store/useEditorStore';
import type {
  ActionConfig,
  ActionType,
  ColorRGB,
  InteractionRule,
  InteractiveComponentData,
  InterpolationMode,
  TriggerConfig,
  TriggerType,
  Vec3,
} from '../../../types';
import { ColorField } from './ColorField';
import { NumberScrubber } from './NumberScrubber';

export interface InteractiveInspectorProps {
  entityId: string;
  component: InteractiveComponentData;
}

const TRIGGER_OPTIONS: Array<{ value: TriggerType; label: string }> = [
  { value: 'OnStart', label: 'On Start' },
  { value: 'OnPointerClick', label: 'On Pointer Click' },
  { value: 'OnPointerHoverEnter', label: 'On Hover Enter' },
  { value: 'OnPointerHoverExit', label: 'On Hover Exit' },
  { value: 'OnKeyDown', label: 'On Key Down' },
  { value: 'OnCollisionEnter', label: 'On Collision Enter' },
  { value: 'OnTriggerEnter', label: 'On Trigger Enter' },
  { value: 'OnProximityEnter', label: 'On Proximity Enter' },
  { value: 'OnCustomEvent', label: 'On Custom Event' },
];

const ACTION_OPTIONS: Array<{ value: ActionType; label: string }> = [
  { value: 'PlayAnimation', label: 'Play Animation' },
  { value: 'TweenTransform', label: 'Tween Transform' },
  { value: 'SetActive', label: 'Set Active' },
  { value: 'ChangeMaterialColor', label: 'Change Material Color' },
  { value: 'ApplyForce', label: 'Apply Force' },
  { value: 'PlaySound', label: 'Play Sound' },
  { value: 'Wait', label: 'Wait' },
  { value: 'EmitCustomEvent', label: 'Emit Custom Event' },
];

const EASING_OPTIONS: Array<{ value: InterpolationMode; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease In' },
  { value: 'easeOut', label: 'Ease Out' },
  { value: 'easeInOut', label: 'Ease In-Out' },
  { value: 'step', label: 'Step' },
];

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultTrigger(type: TriggerType): TriggerConfig {
  switch (type) {
    case 'OnKeyDown':
      return { type, key: 'Space' };
    case 'OnProximityEnter':
      return { type, distance: 2 };
    case 'OnCustomEvent':
      return { type, eventName: 'myEvent' };
    default:
      return { type };
  }
}

function createDefaultAction(type: ActionType, existingId?: string, targetEntityId?: string | null): ActionConfig {
  const id = existingId ?? createId('act');
  const base: ActionConfig = { id, type, targetEntityId: targetEntityId ?? null };
  switch (type) {
    case 'PlayAnimation':
      return { ...base, clipOrStateName: '' };
    case 'TweenTransform':
      return {
        ...base,
        transformProperty: 'position',
        targetVec3: [0, 1, 0],
        duration: 0.5,
        easing: 'easeInOut',
      };
    case 'SetActive':
      return { ...base, active: true };
    case 'ChangeMaterialColor':
      return { ...base, color: [1, 0.3, 0.3] };
    case 'ApplyForce':
      return { ...base, targetVec3: [0, 5, 0] };
    case 'PlaySound':
      return { ...base, soundAssetId: '' };
    case 'Wait':
      return { id, type, duration: 1 };
    case 'EmitCustomEvent':
      return { ...base, eventName: 'myEvent' };
  }
}

interface EntityTargetFieldProps {
  label?: string;
  value?: string | null;
  placeholder?: string;
  onChange: (entityId: string | null) => void;
}

const EntityTargetField: React.FC<EntityTargetFieldProps> = ({
  label = 'Target Entity',
  value,
  placeholder = 'Self (drop entity)',
  onChange,
}) => {
  const entitySummaries = useEditorStore((s) => s.entitySummaries);
  const [isDragOver, setIsDragOver] = useState(false);

  const resolvedName = value ? entitySummaries[value]?.name ?? value : null;

  const hasEntityMime = (dt: DataTransfer) =>
    dt.types.includes('application/x-editor-entity-id') ||
    dt.types.includes('application/x-pc-entity') ||
    dt.types.includes('text/plain');

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasEntityMime(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'link';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedId =
      e.dataTransfer.getData('application/x-editor-entity-id') ||
      e.dataTransfer.getData('application/x-pc-entity') ||
      e.dataTransfer.getData('text/plain');
    const trimmed = droppedId.trim();
    if (trimmed) {
      onChange(trimmed);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-gray-400 shrink-0">{label}</span>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        title="Drag an entity from the Hierarchy panel and drop it here"
        className={`flex-1 min-w-0 max-w-[165px] h-6 px-1.5 rounded border flex items-center justify-between gap-1 text-[10px] transition-colors ${
          isDragOver
            ? 'border-blue-400 bg-blue-500/15 text-blue-200'
            : resolvedName
              ? 'border-[#334155] bg-[#12151b] text-sky-300'
              : 'border-dashed border-[#2f3644] bg-[#12151b]/70 text-gray-500'
        }`}
      >
        <div className="flex items-center gap-1 min-w-0">
          <Crosshair className="w-3 h-3 shrink-0 opacity-70" />
          <span className="truncate">{resolvedName ?? placeholder}</span>
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Clear target entity"
            className="text-gray-400 hover:text-rose-400 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export const InteractiveInspector: React.FC<InteractiveInspectorProps> = ({
  entityId,
  component,
}) => {
  const [collapsedRules, setCollapsedRules] = useState<Record<string, boolean>>({});
  const rules = component.rules ?? [];

  const updateRules = (nextRules: InteractionRule[]) => {
    EditorEngine.getInstance().updateComponentProperty(entityId, component.id, {
      rules: nextRules,
    });
  };

  const handleAddRule = () => {
    const nextRule: InteractionRule = {
      id: createId('rule'),
      name: `Rule ${rules.length + 1}`,
      enabled: true,
      trigger: { type: 'OnPointerClick' },
      actions: [createDefaultAction('SetActive')],
    };
    updateRules([...rules, nextRule]);
  };

  const handleRemoveRule = (ruleId: string) => {
    updateRules(rules.filter((r) => r.id !== ruleId));
  };

  const handlePatchRule = (ruleId: string, patch: Partial<InteractionRule>) => {
    updateRules(rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)));
  };

  const handleAddAction = (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    handlePatchRule(ruleId, {
      actions: [...rule.actions, createDefaultAction('TweenTransform')],
    });
  };

  const handleRemoveAction = (ruleId: string, actionId: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    handlePatchRule(ruleId, {
      actions: rule.actions.filter((a) => a.id !== actionId),
    });
  };

  const handleMoveAction = (ruleId: string, index: number, direction: -1 | 1) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= rule.actions.length) return;
    const nextActions = [...rule.actions];
    const [moved] = nextActions.splice(index, 1);
    nextActions.splice(targetIdx, 0, moved);
    handlePatchRule(ruleId, { actions: nextActions });
  };

  const handlePatchAction = (
    ruleId: string,
    actionId: string,
    patch: Partial<ActionConfig>
  ) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    handlePatchRule(ruleId, {
      actions: rule.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
    });
  };

  const renderVec3Field = (
    label: string,
    vec: Vec3 | undefined,
    step: number,
    onVecChange: (next: Vec3) => void
  ) => {
    const current: Vec3 = vec ?? [0, 0, 0];
    return (
      <div className="space-y-1">
        <span className="text-[10px] text-gray-400 block">{label}</span>
        <div className="grid grid-cols-3 gap-1">
          <NumberScrubber
            label="X"
            labelColorClass="text-rose-400"
            value={current[0]}
            step={step}
            onChange={(val) => onVecChange([val, current[1], current[2]])}
          />
          <NumberScrubber
            label="Y"
            labelColorClass="text-emerald-400"
            value={current[1]}
            step={step}
            onChange={(val) => onVecChange([current[0], val, current[2]])}
          />
          <NumberScrubber
            label="Z"
            labelColorClass="text-sky-400"
            value={current[2]}
            step={step}
            onChange={(val) => onVecChange([current[0], current[1], val])}
          />
        </div>
      </div>
    );
  };

  const renderTriggerInputs = (rule: InteractionRule) => {
    const { trigger } = rule;
    const updateTrigger = (patch: Partial<TriggerConfig>) =>
      handlePatchRule(rule.id, { trigger: { ...trigger, ...patch } });

    switch (trigger.type) {
      case 'OnKeyDown':
        return (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-400">Key</span>
            <input
              type="text"
              value={trigger.key ?? ''}
              placeholder="Space, KeyW, Enter..."
              onChange={(e) => updateTrigger({ key: e.target.value })}
              className="flex-1 max-w-[165px] bg-[#12151b] border border-[#2f3644] rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        );

      case 'OnCollisionEnter':
      case 'OnTriggerEnter':
        return (
          <EntityTargetField
            label="Filter Entity"
            value={trigger.targetEntityId ?? null}
            placeholder="Any Entity (or drop)"
            onChange={(id) => updateTrigger({ targetEntityId: id ?? undefined })}
          />
        );

      case 'OnProximityEnter':
        return (
          <div className="space-y-1.5">
            <EntityTargetField
              label="Target Entity"
              value={trigger.targetEntityId ?? null}
              placeholder="Drop Target Entity..."
              onChange={(id) => updateTrigger({ targetEntityId: id ?? undefined })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-400">Distance (m)</span>
              <div className="w-24">
                <NumberScrubber
                  value={trigger.distance ?? 2}
                  min={0.05}
                  step={0.25}
                  precision={2}
                  onChange={(val) => updateTrigger({ distance: val })}
                />
              </div>
            </div>
          </div>
        );

      case 'OnCustomEvent':
        return (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-400">Event Name</span>
            <input
              type="text"
              value={trigger.eventName ?? ''}
              placeholder="Event name..."
              onChange={(e) => updateTrigger({ eventName: e.target.value })}
              className="flex-1 max-w-[165px] bg-[#12151b] border border-[#2f3644] rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        );

      default:
        return null;
    }
  };

  const renderActionInputs = (ruleId: string, action: ActionConfig) => {
    const patchAction = (patch: Partial<ActionConfig>) =>
      handlePatchAction(ruleId, action.id, patch);

    switch (action.type) {
      case 'PlayAnimation':
        return (
          <div className="space-y-1.5">
            <EntityTargetField
              value={action.targetEntityId ?? null}
              onChange={(id) => patchAction({ targetEntityId: id })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-400">Clip / State</span>
              <input
                type="text"
                value={action.clipOrStateName ?? ''}
                placeholder="State or clip name..."
                onChange={(e) => patchAction({ clipOrStateName: e.target.value })}
                className="flex-1 max-w-[165px] bg-[#12151b] border border-[#2f3644] rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        );

      case 'TweenTransform':
        return (
          <div className="space-y-1.5">
            <EntityTargetField
              value={action.targetEntityId ?? null}
              onChange={(id) => patchAction({ targetEntityId: id })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-400">Property</span>
              <select
                value={action.transformProperty ?? 'position'}
                onChange={(e) =>
                  patchAction({
                    transformProperty: e.target.value as 'position' | 'rotation' | 'scale',
                  })
                }
                className="w-32 bg-[#12151b] border border-[#2f3644] rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="position">Position</option>
                <option value="rotation">Rotation</option>
                <option value="scale">Scale</option>
              </select>
            </div>
            {renderVec3Field(
              'Target Value',
              action.targetVec3,
              action.transformProperty === 'rotation' ? 1 : 0.1,
              (next) => patchAction({ targetVec3: next })
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <span className="text-[10px] text-gray-400 block">Duration (s)</span>
                <NumberScrubber
                  value={action.duration ?? 0.5}
                  min={0}
                  step={0.1}
                  precision={2}
                  onChange={(val) => patchAction({ duration: val })}
                />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-gray-400 block">Easing</span>
                <select
                  value={action.easing ?? 'easeInOut'}
                  onChange={(e) =>
                    patchAction({ easing: e.target.value as InterpolationMode })
                  }
                  className="w-full h-6 bg-[#12151b] border border-[#2f3644] rounded px-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  {EASING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );

      case 'SetActive':
        return (
          <div className="space-y-1.5">
            <EntityTargetField
              value={action.targetEntityId ?? null}
              onChange={(id) => patchAction({ targetEntityId: id })}
            />
            <label className="flex items-center justify-between gap-2 text-[10px] text-gray-300 cursor-pointer">
              <span className="text-gray-400">Active</span>
              <input
                type="checkbox"
                checked={action.active ?? true}
                onChange={(e) => patchAction({ active: e.target.checked })}
                className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500"
              />
            </label>
          </div>
        );

      case 'ChangeMaterialColor':
        return (
          <div className="space-y-1.5">
            <EntityTargetField
              value={action.targetEntityId ?? null}
              onChange={(id) => patchAction({ targetEntityId: id })}
            />
            <ColorField
              label="Color"
              color={action.color ?? [1, 1, 1]}
              onChange={(next) => patchAction({ color: next as ColorRGB })}
            />
          </div>
        );

      case 'ApplyForce':
        return (
          <div className="space-y-1.5">
            <EntityTargetField
              value={action.targetEntityId ?? null}
              onChange={(id) => patchAction({ targetEntityId: id })}
            />
            {renderVec3Field('Force / Impulse', action.targetVec3, 0.5, (next) =>
              patchAction({ targetVec3: next })
            )}
          </div>
        );

      case 'PlaySound':
        return (
          <div className="space-y-1.5">
            <EntityTargetField
              value={action.targetEntityId ?? null}
              onChange={(id) => patchAction({ targetEntityId: id })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-400">Audio Asset</span>
              <input
                type="text"
                value={action.soundAssetId ?? ''}
                placeholder="Audio asset ID..."
                onChange={(e) => patchAction({ soundAssetId: e.target.value })}
                className="flex-1 max-w-[165px] bg-[#12151b] border border-[#2f3644] rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        );

      case 'Wait':
        return (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-400">Duration (s)</span>
            <div className="w-24">
              <NumberScrubber
                value={action.duration ?? 1}
                min={0}
                step={0.1}
                precision={2}
                onChange={(val) => patchAction({ duration: val })}
              />
            </div>
          </div>
        );

      case 'EmitCustomEvent':
        return (
          <div className="space-y-1.5">
            <EntityTargetField
              label="Target"
              value={action.targetEntityId ?? null}
              placeholder="Self / Global (drop)"
              onChange={(id) => patchAction({ targetEntityId: id })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-400">Event Name</span>
              <input
                type="text"
                value={action.eventName ?? ''}
                placeholder="Event name..."
                onChange={(e) => patchAction({ eventName: e.target.value })}
                className="flex-1 max-w-[165px] bg-[#12151b] border border-[#2f3644] rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-2.5">
      {rules.length === 0 ? (
        <div className="p-2.5 rounded bg-[#141821] border border-dashed border-[#2b313d] text-center text-[11px] text-gray-500">
          No interaction rules yet. Add a rule to build WHEN → DO logic.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const isCollapsed = !!collapsedRules[rule.id];
            return (
              <div
                key={rule.id}
                className="rounded bg-[#141821] border border-[#2b313d] overflow-hidden"
              >
                {/* Rule Header */}
                <div className="px-2 py-1.5 bg-[#191e29] border-b border-[#2b313d] flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedRules((prev) => ({ ...prev, [rule.id]: !prev[rule.id] }))
                      }
                      className="text-gray-400 hover:text-gray-200 shrink-0"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) =>
                        handlePatchRule(rule.id, { enabled: e.target.checked })
                      }
                      title="Enable/Disable Rule"
                      className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={rule.name}
                      onChange={(e) => handlePatchRule(rule.id, { name: e.target.value })}
                      className="flex-1 min-w-0 bg-transparent border border-transparent hover:border-[#2f3644] focus:border-blue-500 focus:bg-[#12151b] rounded px-1 py-0.5 text-[11px] font-medium text-gray-200 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(rule.id)}
                    title="Delete Rule"
                    className="p-0.5 rounded text-gray-400 hover:text-rose-400 hover:bg-[#252b36] shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Rule Body */}
                {!isCollapsed && (
                  <div className="p-2 space-y-2.5">
                    {/* WHEN Section */}
                    <div className="space-y-1.5 p-2 rounded bg-[#10131a] border border-[#232936]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold tracking-wider uppercase text-amber-300">
                          <Zap className="w-2.5 h-2.5" />
                          WHEN
                        </span>
                        <select
                          value={rule.trigger.type}
                          onChange={(e) =>
                            handlePatchRule(rule.id, {
                              trigger: createDefaultTrigger(e.target.value as TriggerType),
                            })
                          }
                          className="flex-1 bg-[#12151b] border border-[#2f3644] rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
                        >
                          {TRIGGER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {renderTriggerInputs(rule)}
                    </div>

                    {/* DO Section */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold tracking-wider uppercase text-emerald-300">
                          DO ({rule.actions.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddAction(rule.id)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#232936] hover:bg-[#2d3545] text-[10px] text-gray-200 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Action</span>
                        </button>
                      </div>

                      {rule.actions.length === 0 ? (
                        <div className="text-[10px] text-gray-500 italic px-1">
                          No actions configured.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {rule.actions.map((action, idx) => (
                            <div
                              key={action.id}
                              className="p-2 rounded bg-[#10131a] border border-[#232936] space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-mono text-gray-500 shrink-0">
                                  #{idx + 1}
                                </span>
                                <select
                                  value={action.type}
                                  onChange={(e) =>
                                    handlePatchAction(
                                      rule.id,
                                      action.id,
                                      createDefaultAction(
                                        e.target.value as ActionType,
                                        action.id,
                                        action.targetEntityId
                                      )
                                    )
                                  }
                                  className="flex-1 min-w-0 bg-[#12151b] border border-[#2f3644] rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
                                >
                                  {ACTION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveAction(rule.id, idx, -1)}
                                    title="Move Up"
                                    className="p-0.5 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:pointer-events-none"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === rule.actions.length - 1}
                                    onClick={() => handleMoveAction(rule.id, idx, 1)}
                                    title="Move Down"
                                    className="p-0.5 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:pointer-events-none"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAction(rule.id, action.id)}
                                    title="Remove Action"
                                    className="p-0.5 rounded text-gray-400 hover:text-rose-400"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {renderActionInputs(rule.id, action)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddRule}
        className="w-full h-6 px-2.5 rounded bg-[#252b36] hover:bg-[#303846] text-gray-200 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add Rule</span>
      </button>
    </div>
  );
};
