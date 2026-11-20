import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Code2,
  Maximize2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { EditorEngine } from '../../../engine/EditorEngine';
import { useAssetStore } from '../../../store/useAssetStore';
import { useEditorStore } from '../../../store/useEditorStore';
import type {
  ColorRGB,
  ScriptAttributeType,
  ScriptAttributeValue,
  ScriptComponentData,
  Vec3,
} from '../../../types';
import { ColorField } from './ColorField';
import { NumberScrubber } from './NumberScrubber';

export interface ScriptInspectorProps {
  entityId: string;
  component: ScriptComponentData;
}

const ATTRIBUTE_TYPES: Array<{ value: ScriptAttributeType; label: string }> = [
  { value: 'number', label: 'Number' },
  { value: 'vec3', label: 'Vec3' },
  { value: 'string', label: 'String' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'color', label: 'Color' },
  { value: 'entity', label: 'Entity' },
  { value: 'asset', label: 'Asset' },
];

export const DEFAULT_SCRIPT_TEMPLATE = `// Lifecycle hooks: onStart(), onUpdate(dt), onClick(), onCollision(other)
function onStart() {
  // Called once when Play Mode starts
}

function onUpdate(dt) {
  // Called every frame with delta time (seconds)
}

function onClick() {
  // Called when this entity is clicked in Play Mode
}

function onCollision(other) {
  // Called when a physics collision occurs with another entity
}
`;

function getDefaultValueForType(type: ScriptAttributeType): unknown {
  switch (type) {
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'boolean':
      return false;
    case 'color':
      return [1, 1, 1] as ColorRGB;
    case 'entity':
      return null;
    case 'vec3':
      return [0, 0, 0];
    case 'asset':
      return null;
  }
}

function normalizeColor(val: unknown): ColorRGB {
  if (
    Array.isArray(val) &&
    val.length >= 3 &&
    typeof val[0] === 'number' &&
    typeof val[1] === 'number' &&
    typeof val[2] === 'number'
  ) {
    return [val[0], val[1], val[2]];
  }
  return [1, 1, 1];
}

function normalizeVec3(val: unknown): Vec3 {
  if (
    Array.isArray(val) &&
    val.length >= 3 &&
    typeof val[0] === 'number' &&
    typeof val[1] === 'number' &&
    typeof val[2] === 'number'
  ) {
    return [val[0], val[1], val[2]];
  }
  return [0, 0, 0];
}

interface CodeEditorAreaProps {
  code: string;
  readOnly: boolean;
  heightClass: string;
  onChange: (nextCode: string) => void;
  onCommit: (nextCode: string) => void;
}

const CodeEditorArea: React.FC<CodeEditorAreaProps> = ({
  code,
  readOnly,
  heightClass,
  onChange,
  onCommit,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineCount = useMemo(() => Math.max(1, code.split('\n').length), [code]);

  const syncScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onCommit(code);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;

      if (e.shiftKey) {
        // Unindent current line(s) by up to 2 spaces
        const lineStart = code.lastIndexOf('\n', start - 1) + 1;
        const selectedBlock = code.slice(lineStart, end);
        const lines = selectedBlock.split('\n');
        let removedFromFirst = 0;
        let totalRemoved = 0;
        const nextLines = lines.map((line, idx) => {
          if (line.startsWith('  ')) {
            if (idx === 0) removedFromFirst = 2;
            totalRemoved += 2;
            return line.slice(2);
          }
          if (line.startsWith('\t') || line.startsWith(' ')) {
            if (idx === 0) removedFromFirst = 1;
            totalRemoved += 1;
            return line.slice(1);
          }
          return line;
        });
        if (totalRemoved > 0) {
          const nextCode =
            code.slice(0, lineStart) + nextLines.join('\n') + code.slice(end);
          onChange(nextCode);
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = Math.max(
                lineStart,
                start - removedFromFirst
              );
              textareaRef.current.selectionEnd = Math.max(
                lineStart,
                end - totalRemoved
              );
            }
          });
        }
        return;
      }

      const nextCode = code.slice(0, start) + '  ' + code.slice(end);
      onChange(nextCode);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      });
    }
  };

  return (
    <div
      className={`flex rounded border border-[#2b313d] bg-[#0d1017] overflow-hidden ${heightClass}`}
    >
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="w-9 shrink-0 py-2 px-1.5 bg-[#121620] border-r border-[#232936] text-right font-mono text-[11px] leading-5 text-gray-500 select-none overflow-hidden"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i + 1}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={code}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        onScroll={syncScroll}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit(code)}
        onKeyDown={handleKeyDown}
        className="flex-1 h-full py-2 px-2.5 bg-transparent text-gray-200 font-mono text-[11px] leading-5 resize-none focus:outline-none overflow-auto whitespace-pre"
      />
    </div>
  );
};

export const ScriptInspector: React.FC<ScriptInspectorProps> = ({
  entityId,
  component,
}) => {
  const playState = useEditorStore((s) => s.playState);
  const entitySummaries = useEditorStore((s) => s.entitySummaries);
  const rootEntityId = useEditorStore((s) => s.rootEntityId);
  const assets = useAssetStore((s) => s.assets);
  const isReadOnly = playState !== 'edit';

  const [scriptNameDraft, setScriptNameDraft] = useState(component.scriptName);
  const [codeDraft, setCodeDraft] = useState(component.code);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Add-attribute mini form state
  const [showAddAttr, setShowAddAttr] = useState(false);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrType, setNewAttrType] = useState<ScriptAttributeType>('number');
  const [newAttrDefault, setNewAttrDefault] = useState<unknown>(0);

  // Per-row name drafts and drag-over state for entity attributes
  const [attrNameDrafts, setAttrNameDrafts] = useState<Record<number, string>>({});
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    setScriptNameDraft(component.scriptName);
  }, [component.scriptName]);

  useEffect(() => {
    setCodeDraft(component.code);
  }, [component.code]);

  useEffect(() => {
    setAttrNameDrafts({});
  }, [component.attributes]);

  const update = (patch: Partial<ScriptComponentData>) => {
    if (isReadOnly) return;
    EditorEngine.getInstance().updateComponentProperty(
      entityId,
      component.id,
      patch as Record<string, unknown>
    );
  };

  const commitScriptName = () => {
    if (isReadOnly) return;
    const trimmed = scriptNameDraft.trim();
    if (!trimmed) {
      setScriptNameDraft(component.scriptName);
      return;
    }
    if (trimmed !== component.scriptName) {
      update({ scriptName: trimmed });
    }
  };

  const commitCode = (nextCode: string) => {
    if (isReadOnly) return;
    if (nextCode !== component.code) {
      update({ code: nextCode });
    }
  };

  const handleResetTemplate = () => {
    if (isReadOnly) return;
    setCodeDraft(DEFAULT_SCRIPT_TEMPLATE);
    update({ code: DEFAULT_SCRIPT_TEMPLATE });
  };

  const handleOpenAddAttr = () => {
    const existing = new Set(component.attributes.map((a) => a.name));
    let idx = component.attributes.length + 1;
    let candidate = `attr${idx}`;
    while (existing.has(candidate)) {
      idx += 1;
      candidate = `attr${idx}`;
    }
    setNewAttrName(candidate);
    setNewAttrType('number');
    setNewAttrDefault(0);
    setShowAddAttr(true);
  };

  const handleAddAttribute = () => {
    if (isReadOnly) return;
    const trimmed = newAttrName.trim();
    if (!trimmed) return;
    if (component.attributes.some((a) => a.name === trimmed)) return;

    const nextAttr: ScriptAttributeValue = {
      name: trimmed,
      type: newAttrType,
      value: newAttrDefault,
    };
    update({ attributes: [...component.attributes, nextAttr] });
    setShowAddAttr(false);
  };

  const handleRemoveAttribute = (index: number) => {
    if (isReadOnly) return;
    update({
      attributes: component.attributes.filter((_, i) => i !== index),
    });
  };

  const handleUpdateAttribute = (
    index: number,
    patch: Partial<ScriptAttributeValue>
  ) => {
    if (isReadOnly) return;
    const next = component.attributes.map((attr, i) =>
      i === index ? { ...attr, ...patch } : attr
    );
    update({ attributes: next });
  };

  const commitAttrName = (index: number) => {
    const attr = component.attributes[index];
    if (!attr) return;
    const draft = attrNameDrafts[index];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === attr.name) {
      setAttrNameDrafts((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });
      return;
    }
    handleUpdateAttribute(index, { name: trimmed });
  };

  const selectableEntities = useMemo(() => {
    return Object.values(entitySummaries)
      .filter((e) => e.id !== rootEntityId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entitySummaries, rootEntityId]);

  const hasUnsavedCode = codeDraft !== component.code;

  const renderEntityPicker = (
    value: unknown,
    onSelect: (nextId: string | null) => void,
    dropIndex: number | null
  ) => {
    const selectedId = typeof value === 'string' && value.length > 0 ? value : null;
    const selectedEntity = selectedId ? entitySummaries[selectedId] : undefined;
    const isDragOver = dropIndex !== null && dragOverIndex === dropIndex;

    return (
      <div
        onDragOver={(e) => {
          if (isReadOnly) return;
          if (
            e.dataTransfer.types.includes('application/x-editor-entity-id') ||
            e.dataTransfer.types.includes('text/plain')
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'link';
            if (dropIndex !== null && dragOverIndex !== dropIndex) {
              setDragOverIndex(dropIndex);
            }
          }
        }}
        onDragLeave={() => {
          if (dropIndex !== null && dragOverIndex === dropIndex) {
            setDragOverIndex(null);
          }
        }}
        onDrop={(e) => {
          if (isReadOnly) return;
          e.preventDefault();
          setDragOverIndex(null);
          const droppedId =
            e.dataTransfer.getData('application/x-editor-entity-id') ||
            e.dataTransfer.getData('text/plain');
          if (droppedId && droppedId !== rootEntityId) {
            onSelect(droppedId);
          }
        }}
        className={`flex items-center gap-1 rounded border px-1.5 py-1 transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-500/15'
            : 'border-[#2f3644] bg-[#12151b]'
        }`}
      >
        <select
          disabled={isReadOnly}
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value || null)}
          title="Select or drop an Entity from Hierarchy"
          className="flex-1 min-w-0 bg-transparent text-[11px] text-gray-200 focus:outline-none truncate"
        >
          <option value="" className="bg-[#161922] text-gray-400">
            Drop entity or select...
          </option>
          {selectedId && !selectedEntity && (
            <option value={selectedId} className="bg-[#161922] text-amber-300">
              Missing ({selectedId.slice(0, 8)})
            </option>
          )}
          {selectableEntities.map((ent) => (
            <option key={ent.id} value={ent.id} className="bg-[#161922] text-gray-200">
              {ent.name}
            </option>
          ))}
        </select>
        {selectedId && !isReadOnly && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            title="Clear entity reference"
            className="text-gray-500 hover:text-gray-200 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  const renderAssetPicker = (
    value: unknown,
    onSelect: (nextId: string | null) => void,
    dropIndex: number | null
  ) => {
    const selectedId = typeof value === 'string' && value.length > 0 ? value : null;
    const selectedAsset = selectedId ? assets.find((a) => a.id === selectedId) : undefined;
    const isDragOver = dropIndex !== null && dragOverIndex === dropIndex;

    return (
      <div
        onDragOver={(e) => {
          if (isReadOnly) return;
          if (e.dataTransfer.types.includes('application/x-pc-asset')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (dropIndex !== null && dragOverIndex !== dropIndex) {
              setDragOverIndex(dropIndex);
            }
          }
        }}
        onDragLeave={() => {
          if (dropIndex !== null && dragOverIndex === dropIndex) {
            setDragOverIndex(null);
          }
        }}
        onDrop={(e) => {
          if (isReadOnly) return;
          e.preventDefault();
          setDragOverIndex(null);
          const raw = e.dataTransfer.getData('application/x-pc-asset');
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw) as { assetId?: string };
            if (parsed.assetId) {
              onSelect(parsed.assetId);
            }
          } catch {
            /* ignore malformed asset drag payload */
          }
        }}
        className={`flex items-center gap-1 rounded border px-1.5 py-1 transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-500/15'
            : 'border-[#2f3644] bg-[#12151b]'
        }`}
      >
        <select
          disabled={isReadOnly}
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value || null)}
          title="Select or drop an Asset from Asset Browser"
          className="flex-1 min-w-0 bg-transparent text-[11px] text-gray-200 focus:outline-none truncate"
        >
          <option value="" className="bg-[#161922] text-gray-400">
            Drop asset or select...
          </option>
          {selectedId && !selectedAsset && (
            <option value={selectedId} className="bg-[#161922] text-amber-300">
              Missing ({selectedId.slice(0, 8)})
            </option>
          )}
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id} className="bg-[#161922] text-gray-200">
              {asset.name} ({asset.type})
            </option>
          ))}
        </select>
        {selectedId && !isReadOnly && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            title="Clear asset reference"
            className="text-gray-500 hover:text-gray-200 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  const renderAttributeValueEditor = (
    attr: ScriptAttributeValue,
    index: number
  ) => {
    switch (attr.type) {
      case 'number': {
        const numVal = typeof attr.value === 'number' ? attr.value : 0;
        return (
          <NumberScrubber
            label="Value"
            value={numVal}
            step={0.1}
            onChange={(next) => handleUpdateAttribute(index, { value: next })}
          />
        );
      }
      case 'vec3': {
        const vecVal = normalizeVec3(attr.value);
        return (
          <div className="grid grid-cols-3 gap-1">
            <NumberScrubber
              label="X"
              labelColorClass="text-rose-400"
              value={vecVal[0]}
              step={0.05}
              onChange={(next) =>
                handleUpdateAttribute(index, { value: [next, vecVal[1], vecVal[2]] as Vec3 })
              }
            />
            <NumberScrubber
              label="Y"
              labelColorClass="text-emerald-400"
              value={vecVal[1]}
              step={0.05}
              onChange={(next) =>
                handleUpdateAttribute(index, { value: [vecVal[0], next, vecVal[2]] as Vec3 })
              }
            />
            <NumberScrubber
              label="Z"
              labelColorClass="text-sky-400"
              value={vecVal[2]}
              step={0.05}
              onChange={(next) =>
                handleUpdateAttribute(index, { value: [vecVal[0], vecVal[1], next] as Vec3 })
              }
            />
          </div>
        );
      }
      case 'string': {
        const strVal = typeof attr.value === 'string' ? attr.value : '';
        return (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">Value</span>
            <input
              type="text"
              disabled={isReadOnly}
              value={strVal}
              onChange={(e) =>
                handleUpdateAttribute(index, { value: e.target.value })
              }
              className="w-36 px-2 py-1 rounded bg-[#12151b] border border-[#2f3644] text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        );
      }
      case 'boolean': {
        const boolVal = Boolean(attr.value);
        return (
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-[11px] text-gray-400">Value</span>
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                disabled={isReadOnly}
                checked={boolVal}
                onChange={(e) =>
                  handleUpdateAttribute(index, { value: e.target.checked })
                }
                className="accent-blue-500 rounded"
              />
              <span className="text-[11px] text-gray-300 font-mono">
                {boolVal ? 'true' : 'false'}
              </span>
            </div>
          </label>
        );
      }
      case 'color': {
        return (
          <ColorField
            label="Value"
            color={normalizeColor(attr.value)}
            onChange={(next) =>
              handleUpdateAttribute(index, {
                value: [next[0], next[1], next[2]] as ColorRGB,
              })
            }
          />
        );
      }
      case 'entity':
        return (
          <div className="space-y-1">
            <span className="text-[11px] text-gray-400 block">
              Entity Reference
            </span>
            {renderEntityPicker(
              attr.value,
              (nextId) => handleUpdateAttribute(index, { value: nextId }),
              index
            )}
          </div>
        );
      case 'asset':
        return (
          <div className="space-y-1">
            <span className="text-[11px] text-gray-400 block">
              Asset Reference
            </span>
            {renderAssetPicker(
              attr.value,
              (nextId) => handleUpdateAttribute(index, { value: nextId }),
              index
            )}
          </div>
        );
      default:
        return (
          <div className="text-[10px] text-gray-500 font-mono">
            {JSON.stringify(attr.value)}
          </div>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* Script Name & Enabled */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400 shrink-0">Script Name</span>
          <input
            type="text"
            disabled={isReadOnly}
            value={scriptNameDraft}
            onChange={(e) => setScriptNameDraft(e.target.value)}
            onBlur={commitScriptName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitScriptName();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setScriptNameDraft(component.scriptName);
                e.currentTarget.blur();
              }
            }}
            className="w-40 px-2 py-1 rounded bg-[#12151b] border border-[#2f3644] text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-[11px] text-gray-400">Enabled</span>
          <input
            type="checkbox"
            disabled={isReadOnly}
            checked={component.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="accent-blue-500 rounded"
          />
        </label>
      </div>

      {/* Exposed Attributes */}
      <div className="pt-2 border-t border-[#252b36] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-gray-300">
            Attributes ({component.attributes.length})
          </span>
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleOpenAddAttr}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#232936] hover:bg-[#2c3444] text-[10px] text-gray-200 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
        </div>

        {showAddAttr && !isReadOnly && (
          <div className="p-2 rounded bg-[#12151b] border border-blue-500/40 space-y-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Attribute name"
                value={newAttrName}
                onChange={(e) => setNewAttrName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddAttribute();
                  if (e.key === 'Escape') setShowAddAttr(false);
                }}
                className="flex-1 min-w-0 px-2 py-1 rounded bg-[#161922] border border-[#2f3644] text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
              />
              <select
                value={newAttrType}
                onChange={(e) => {
                  const nextType = e.target.value as ScriptAttributeType;
                  setNewAttrType(nextType);
                  setNewAttrDefault(getDefaultValueForType(nextType));
                }}
                className="px-1.5 py-1 rounded bg-[#161922] border border-[#2f3644] text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
              >
                {ATTRIBUTE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Default Value Input */}
            {newAttrType === 'number' && (
              <NumberScrubber
                label="Default"
                value={typeof newAttrDefault === 'number' ? newAttrDefault : 0}
                step={0.1}
                onChange={(val) => setNewAttrDefault(val)}
              />
            )}
            {newAttrType === 'string' && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400">Default</span>
                <input
                  type="text"
                  value={typeof newAttrDefault === 'string' ? newAttrDefault : ''}
                  onChange={(e) => setNewAttrDefault(e.target.value)}
                  className="w-36 px-2 py-1 rounded bg-[#161922] border border-[#2f3644] text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            {newAttrType === 'boolean' && (
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-[11px] text-gray-400">Default</span>
                <input
                  type="checkbox"
                  checked={Boolean(newAttrDefault)}
                  onChange={(e) => setNewAttrDefault(e.target.checked)}
                  className="accent-blue-500 rounded"
                />
              </label>
            )}
            {newAttrType === 'color' && (
              <ColorField
                label="Default"
                color={normalizeColor(newAttrDefault)}
                onChange={(val) =>
                  setNewAttrDefault([val[0], val[1], val[2]] as ColorRGB)
                }
              />
            )}
            {newAttrType === 'entity' && (
              <div className="space-y-1">
                <span className="text-[11px] text-gray-400 block">Default</span>
                {renderEntityPicker(
                  newAttrDefault,
                  (nextId) => setNewAttrDefault(nextId),
                  null
                )}
              </div>
            )}
            {newAttrType === 'asset' && (
              <div className="space-y-1">
                <span className="text-[11px] text-gray-400 block">Default</span>
                {renderAssetPicker(
                  newAttrDefault,
                  (nextId) => setNewAttrDefault(nextId),
                  null
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowAddAttr(false)}
                className="px-2 py-1 rounded bg-[#232936] hover:bg-[#2c3444] text-[10px] text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddAttribute}
                disabled={!newAttrName.trim()}
                className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-[10px] text-white font-medium"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {component.attributes.length === 0 && !showAddAttr ? (
          <div className="text-[11px] text-gray-500 italic">
            No attributes exposed. Access attributes in script via{' '}
            <code className="text-gray-400">attributes.name</code>.
          </div>
        ) : (
          <div className="space-y-2">
            {component.attributes.map((attr, idx) => (
              <div
                key={`${attr.name}-${idx}`}
                className="p-2 rounded bg-[#12151b]/70 border border-[#252b36] space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={attrNameDrafts[idx] ?? attr.name}
                    onChange={(e) =>
                      setAttrNameDrafts((prev) => ({
                        ...prev,
                        [idx]: e.target.value,
                      }))
                    }
                    onBlur={() => commitAttrName(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        commitAttrName(idx);
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        setAttrNameDrafts((prev) => {
                          const copy = { ...prev };
                          delete copy[idx];
                          return copy;
                        });
                        e.currentTarget.blur();
                      }
                    }}
                    className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[#161922] border border-[#2f3644] text-[11px] font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                  <select
                    disabled={isReadOnly}
                    value={attr.type}
                    onChange={(e) => {
                      const nextType = e.target.value as ScriptAttributeType;
                      handleUpdateAttribute(idx, {
                        type: nextType,
                        value: getDefaultValueForType(nextType),
                      });
                    }}
                    className="px-1 py-0.5 rounded bg-[#161922] border border-[#2f3644] text-[10px] text-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    {ATTRIBUTE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAttribute(idx)}
                      title="Remove attribute"
                      className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {renderAttributeValueEditor(attr, idx)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code Editor Section */}
      <div className="pt-2 border-t border-[#252b36] space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-medium text-gray-300">Script</span>
            {hasUnsavedCode && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">
                Modified
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleResetTemplate}
                title="Reset to lifecycle template"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#232936] hover:bg-[#2c3444] text-[10px] text-gray-300 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Template
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              title="Expand code editor"
              className="p-1 rounded bg-[#232936] hover:bg-[#2c3444] text-gray-300 transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        <CodeEditorArea
          code={codeDraft}
          readOnly={isReadOnly}
          heightClass="h-52"
          onChange={setCodeDraft}
          onCommit={commitCode}
        />

        <div className="text-[10px] text-gray-500 flex items-center justify-between">
          <span>Tab to indent · Blur or Ctrl+S to apply</span>
        </div>
      </div>

      {/* Expanded Code Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
          <div className="w-full max-w-4xl h-[80vh] bg-[#161922] border border-[#2b313d] rounded-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="h-10 shrink-0 px-3 bg-[#1b1f27] border-b border-[#2b313d] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-semibold text-gray-200">
                  {component.scriptName}.js
                </span>
                {hasUnsavedCode && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                    Unsaved changes
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isReadOnly && (
                  <>
                    <button
                      type="button"
                      onClick={handleResetTemplate}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[#232936] hover:bg-[#2c3444] text-[11px] text-gray-200"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset Template
                    </button>
                    <button
                      type="button"
                      onClick={() => commitCode(codeDraft)}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-[11px] text-white font-medium"
                    >
                      Apply
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!isReadOnly) commitCode(codeDraft);
                    setIsModalOpen(false);
                  }}
                  title="Close editor"
                  className="p-1 rounded hover:bg-[#2b313d] text-gray-400 hover:text-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-3 min-h-0 flex flex-col gap-2">
              <CodeEditorArea
                code={codeDraft}
                readOnly={isReadOnly}
                heightClass="flex-1 min-h-0"
                onChange={setCodeDraft}
                onCommit={commitCode}
              />
              <div className="text-[11px] text-gray-400 flex items-center justify-between shrink-0">
                <span>
                  Hooks: <code>onStart()</code>, <code>onUpdate(dt)</code>,{' '}
                  <code>onClick()</code>, <code>onCollision(other)</code>
                </span>
                <span>Tab / Shift+Tab to indent · Ctrl+S to apply</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
