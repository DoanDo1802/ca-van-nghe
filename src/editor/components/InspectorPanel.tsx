import React, { useEffect, useState } from 'react';
import {
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  Code,
  Film,
  Plus,
  Sliders,
  Sun,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { EditorEngine } from '../../engine/EditorEngine';
import { useEditorStore } from '../../store/useEditorStore';
import type {
  ComponentData,
  ComponentType,
  EntityData,
  TransformData,
  Vec3,
} from '../../types';
import { AnimInspector } from './inspector/AnimInspector';
import { CameraInspector } from './inspector/CameraInspector';
import { InteractiveInspector } from './inspector/InteractiveInspector';
import { LightInspector } from './inspector/LightInspector';
import { NumberScrubber } from './inspector/NumberScrubber';
import { CollisionInspector, RigidBodyInspector } from './inspector/PhysicsInspector';
import { RenderInspector } from './inspector/RenderInspector';
import { ScriptInspector } from './inspector/ScriptInspector';

const ADDABLE_COMPONENTS: Array<{ type: ComponentType; label: string }> = [
  { type: 'render', label: 'Render' },
  { type: 'light', label: 'Light' },
  { type: 'camera', label: 'Camera' },
  { type: 'collision', label: 'Collision' },
  { type: 'rigidbody', label: 'RigidBody' },
  { type: 'anim', label: 'Animation' },
  { type: 'interactive', label: 'Interactive Rules' },
  { type: 'script', label: 'Custom Script' },
];

const COMPONENT_LABELS: Record<ComponentType, string> = {
  render: 'Render',
  light: 'Light',
  camera: 'Camera',
  collision: 'Collision',
  rigidbody: 'RigidBody',
  anim: 'Animation',
  interactive: 'Interactive',
  script: 'Script',
};

function renderComponentIcon(type: ComponentType): React.ReactNode {
  switch (type) {
    case 'render':
      return <Box className="w-3.5 h-3.5 text-sky-400" />;
    case 'light':
      return <Sun className="w-3.5 h-3.5 text-amber-400" />;
    case 'camera':
      return <Camera className="w-3.5 h-3.5 text-emerald-400" />;
    case 'anim':
      return <Film className="w-3.5 h-3.5 text-pink-400" />;
    case 'interactive':
      return <Zap className="w-3.5 h-3.5 text-yellow-400" />;
    case 'script':
      return <Code className="w-3.5 h-3.5 text-cyan-400" />;
    default:
      return <Sliders className="w-3.5 h-3.5 text-purple-400" />;
  }
}

export const InspectorPanel: React.FC = () => {
  const selectedEntityIds = useEditorStore((s) => s.selectedEntityIds);
  const inspectorVersion = useEditorStore((s) => s.inspectorVersion);
  const playState = useEditorStore((s) => s.playState);

  const primaryId = selectedEntityIds[0] ?? null;
  const [entityData, setEntityData] = useState<EntityData | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [collapsedComponents, setCollapsedComponents] = useState<Record<string, boolean>>({});
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const engine = EditorEngine.getInstance();
  const isReadOnly = playState !== 'edit';

  useEffect(() => {
    if (!primaryId) {
      setEntityData(null);
      setNameDraft('');
      return;
    }

    const data = engine.getEntityData(primaryId);
    setEntityData(data);
    if (data) {
      setNameDraft(data.name);
    }

    const unsub = engine.eventBus.on('entity:transform-updated', (payload) => {
      if (payload.entityId !== primaryId) return;
      setEntityData((prev) => (prev ? { ...prev, transform: payload.transform } : prev));
    });

    return unsub;
  }, [primaryId, inspectorVersion, engine]);

  const commitName = () => {
    if (!entityData || isReadOnly) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(entityData.name);
      return;
    }
    if (trimmed !== entityData.name) {
      engine.renameEntity(entityData.id, trimmed);
    }
  };

  const handleAddTag = () => {
    if (!entityData || isReadOnly) return;
    const trimmed = tagDraft.trim();
    if (!trimmed) return;
    if (!entityData.tags.includes(trimmed)) {
      engine.setEntityTags(entityData.id, [...entityData.tags, trimmed]);
    }
    setTagDraft('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!entityData || isReadOnly) return;
    engine.setEntityTags(
      entityData.id,
      entityData.tags.filter((t) => t !== tag)
    );
  };

  const handleTransformAxis = (
    field: keyof TransformData,
    axis: 0 | 1 | 2,
    value: number,
    commitCommand: boolean
  ) => {
    if (!entityData || isReadOnly) return;
    const nextVec: Vec3 = [...entityData.transform[field]];
    nextVec[axis] = value;
    const nextTransform: TransformData = {
      ...entityData.transform,
      [field]: nextVec,
    };
    setEntityData((prev) => (prev ? { ...prev, transform: nextTransform } : prev));
    engine.setEntityTransform(entityData.id, nextTransform, commitCommand);
  };

  const toggleCollapse = (compId: string) => {
    setCollapsedComponents((prev) => ({ ...prev, [compId]: !prev[compId] }));
  };

  const handleAddComponent = (type: ComponentType) => {
    if (!entityData || isReadOnly) return;
    engine.addComponent(entityData.id, type);
    setAddMenuOpen(false);
  };

  const renderComponentBody = (comp: ComponentData) => {
    if (!entityData) return null;
    const onUpdate = (patch: Record<string, unknown>) => {
      if (isReadOnly) return;
      engine.updateComponentProperty(entityData.id, comp.id, patch);
    };

    switch (comp.type) {
      case 'render':
        return <RenderInspector component={comp} onUpdate={onUpdate} />;
      case 'light':
        return <LightInspector component={comp} onUpdate={onUpdate} />;
      case 'camera':
        return <CameraInspector component={comp} onUpdate={onUpdate} />;
      case 'collision':
        return <CollisionInspector component={comp} onUpdate={onUpdate} />;
      case 'rigidbody':
        return <RigidBodyInspector component={comp} onUpdate={onUpdate} />;
      case 'anim':
        return <AnimInspector entityId={entityData.id} component={comp} />;
      case 'interactive':
        return <InteractiveInspector entityId={entityData.id} component={comp} />;
      case 'script':
        return <ScriptInspector entityId={entityData.id} component={comp} />;
      default: {
        const fallbackType = (comp as ComponentData).type;
        return (
          <div className="text-[11px] text-gray-500 italic">
            {COMPONENT_LABELS[fallbackType]} inspector arrives in a later phase.
          </div>
        );
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#161922] text-xs">
      <div className="h-8 shrink-0 px-2.5 bg-[#1b1f27] border-b border-[#2b313d] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-semibold text-gray-200 tracking-wide uppercase text-[11px]">
            Inspector
          </span>
        </div>
        {isReadOnly && (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px]">
            Play Mode
          </span>
        )}
      </div>

      {!entityData ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-gray-500">
          Select an entity in the Hierarchy or Viewport to inspect its properties.
        </div>
      ) : (
        <div
          className={`flex-1 overflow-y-auto p-2.5 space-y-2.5 ${
            isReadOnly ? 'opacity-80 pointer-events-none' : ''
          }`}
        >
          {/* Entity Header */}
          <div className="p-2.5 rounded bg-[#1b1f27] border border-[#2b313d] space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={entityData.enabled}
                onChange={(e) => engine.setEntityEnabled(entityData.id, e.target.checked)}
                title="Entity Enabled"
                className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500 cursor-pointer"
              />
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitName();
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    setNameDraft(entityData.name);
                    e.currentTarget.blur();
                  }
                }}
                className="flex-1 min-w-0 bg-[#12151b] border border-[#2f3644] rounded px-2 py-1 text-xs font-medium text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-gray-500">
              <span className="truncate">ID: {entityData.id}</span>
              {selectedEntityIds.length > 1 && (
                <span className="text-sky-400 shrink-0">
                  +{selectedEntityIds.length - 1} more
                </span>
              )}
            </div>

            {/* Tag Editor */}
            <div className="pt-1.5 border-t border-[#2b313d] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-400">
                <Tag className="w-3 h-3" />
                <span>Tags</span>
              </div>
              {entityData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {entityData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#12151b] border border-[#2f3644] text-[10px] text-gray-200"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        title={`Remove tag ${tag}`}
                        className="text-gray-400 hover:text-rose-400"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={tagDraft}
                  placeholder="Add tag..."
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="flex-1 min-w-0 bg-[#12151b] border border-[#2f3644] rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  title="Add Tag"
                  className="h-6 px-2 rounded bg-[#252b36] hover:bg-[#303846] text-gray-200 text-[11px]"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Transform Section */}
          <div className="p-2.5 rounded bg-[#1b1f27] border border-[#2b313d] space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-300">
              Transform
            </div>

            {(
              [
                { key: 'position', label: 'Position', step: 0.1 },
                { key: 'rotation', label: 'Rotation', step: 1 },
                { key: 'scale', label: 'Scale', step: 0.05 },
              ] as const
            ).map(({ key, label, step }) => (
              <div key={key} className="space-y-1">
                <span className="text-[10px] text-gray-400 block">{label}</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <NumberScrubber
                    label="X"
                    labelColorClass="text-rose-400"
                    value={entityData.transform[key][0]}
                    step={step}
                    onChange={(val, commit) => handleTransformAxis(key, 0, val, commit)}
                  />
                  <NumberScrubber
                    label="Y"
                    labelColorClass="text-emerald-400"
                    value={entityData.transform[key][1]}
                    step={step}
                    onChange={(val, commit) => handleTransformAxis(key, 1, val, commit)}
                  />
                  <NumberScrubber
                    label="Z"
                    labelColorClass="text-sky-400"
                    value={entityData.transform[key][2]}
                    step={step}
                    onChange={(val, commit) => handleTransformAxis(key, 2, val, commit)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Dynamic Components */}
          {entityData.components.map((comp) => {
            const isCollapsed = !!collapsedComponents[comp.id];
            return (
              <div
                key={comp.id}
                className="rounded bg-[#1b1f27] border border-[#2b313d] overflow-hidden"
              >
                <div className="px-2.5 py-1.5 bg-[#1f242e] border-b border-[#2b313d] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(comp.id)}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {renderComponentIcon(comp.type)}
                    <input
                      type="checkbox"
                      checked={comp.enabled}
                      onChange={(e) =>
                        engine.updateComponentProperty(entityData.id, comp.id, {
                          enabled: e.target.checked,
                        })
                      }
                      title="Enable/Disable Component"
                      className="rounded border-[#2f3644] bg-[#12151b] accent-blue-500 cursor-pointer"
                    />
                    <span className="font-semibold text-[11px] text-gray-200 truncate">
                      {COMPONENT_LABELS[comp.type] ?? comp.type}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => engine.removeComponent(entityData.id, comp.id)}
                    title={`Remove ${COMPONENT_LABELS[comp.type] ?? comp.type}`}
                    className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-[#2a303c]"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {!isCollapsed && <div className="p-2.5">{renderComponentBody(comp)}</div>}
              </div>
            );
          })}

          {/* Add Component Dropdown */}
          <div className="relative pt-1">
            <button
              type="button"
              onClick={() => setAddMenuOpen((prev) => !prev)}
              className="w-full h-7 px-3 rounded bg-blue-600/90 hover:bg-blue-500 text-white font-medium text-[11px] flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Component</span>
            </button>

            {addMenuOpen && (
              <div className="mt-1 rounded bg-[#1b1f27] border border-[#2f3644] shadow-lg overflow-hidden divide-y divide-[#252b36]">
                {ADDABLE_COMPONENTS.map(({ type, label }) => {
                  const alreadyExists = entityData.components.some((c) => c.type === type);
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={alreadyExists}
                      onClick={() => handleAddComponent(type)}
                      className={`w-full px-3 py-1.5 text-left text-[11px] flex items-center justify-between transition-colors ${
                        alreadyExists
                          ? 'text-gray-600 cursor-not-allowed bg-[#151820]'
                          : 'text-gray-200 hover:bg-[#252b36]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {renderComponentIcon(type)}
                        <span>{label}</span>
                      </span>
                      {alreadyExists && (
                        <span className="text-[10px] text-gray-500">Added</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
