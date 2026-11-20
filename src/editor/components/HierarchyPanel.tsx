import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Folder,
  Layers,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { EditorEngine } from '../../engine/EditorEngine';
import { useEditorStore } from '../../store/useEditorStore';
import type { EntitySummary } from '../../types';

interface ContextMenuState {
  x: number;
  y: number;
  targetEntityId: string | null;
}

function EntityIcon({ summary, isRoot }: { summary: EntitySummary; isRoot: boolean }) {
  if (isRoot) {
    return <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  }
  if (summary.componentTypes.includes('camera')) {
    return <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  if (summary.componentTypes.includes('light')) {
    return <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  if (summary.componentTypes.includes('render')) {
    return <Box className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  }
  return <Folder className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
}

export const HierarchyPanel: React.FC = () => {
  const entitySummaries = useEditorStore((s) => s.entitySummaries);
  const rootEntityId = useEditorStore((s) => s.rootEntityId);
  const selectedEntityIds = useEditorStore((s) => s.selectedEntityIds);
  const hierarchyTreeVersion = useEditorStore((s) => s.hierarchyTreeVersion);

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastClickedIdRef = useRef<string | null>(null);

  const engine = EditorEngine.getInstance();

  // Compute root IDs (prefer rootEntityId from store, fallback to parentId === null)
  const rootIds = useMemo(() => {
    void hierarchyTreeVersion;
    if (rootEntityId && entitySummaries[rootEntityId]) {
      return [rootEntityId];
    }
    return Object.values(entitySummaries)
      .filter((item) => item.parentId === null)
      .map((item) => item.id);
  }, [entitySummaries, rootEntityId, hierarchyTreeVersion]);

  // Compute visible set when searchQuery is active
  const matchingIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    const visible = new Set<string>();
    const markAncestors = (id: string | null) => {
      let current = id;
      while (current && entitySummaries[current]) {
        if (visible.has(current)) break;
        visible.add(current);
        current = entitySummaries[current].parentId;
      }
    };

    for (const entity of Object.values(entitySummaries)) {
      const nameMatch = entity.name.toLowerCase().includes(q);
      const tagMatch = (entity.tags ?? []).some((t) => t.toLowerCase().includes(q));
      if (nameMatch || tagMatch) {
        markAncestors(entity.id);
      }
    }
    return visible;
  }, [entitySummaries, searchQuery]);

  // Flat ordered list of currently visible entity IDs (for Shift+Click range selection)
  const visibleOrderedIds = useMemo(() => {
    const list: string[] = [];
    const walk = (id: string) => {
      const summary = entitySummaries[id];
      if (!summary) return;
      if (matchingIds && !matchingIds.has(id)) return;
      list.push(id);
      const isCollapsed = Boolean(collapsedIds[id]) && !matchingIds;
      if (!isCollapsed) {
        for (const childId of summary.childIds) {
          walk(childId);
        }
      }
    };
    for (const rid of rootIds) {
      walk(rid);
    }
    return list;
  }, [entitySummaries, rootIds, collapsedIds, matchingIds]);

  // Auto-expand ancestors and scroll to newly selected entity (e.g. when clicked in 3D Viewport)
  useEffect(() => {
    const targetId = selectedEntityIds[selectedEntityIds.length - 1];
    if (!targetId || !entitySummaries[targetId]) return;

    const ancestorsToExpand: string[] = [];
    let parentId = entitySummaries[targetId].parentId;
    while (parentId && entitySummaries[parentId]) {
      if (collapsedIds[parentId]) {
        ancestorsToExpand.push(parentId);
      }
      parentId = entitySummaries[parentId].parentId;
    }

    if (ancestorsToExpand.length > 0) {
      setCollapsedIds((prev) => {
        const next = { ...prev };
        for (const aid of ancestorsToExpand) {
          next[aid] = false;
        }
        return next;
      });
    }

    const rafId = requestAnimationFrame(() => {
      const row = rowRefs.current.get(targetId);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedEntityIds, entitySummaries]);

  // Listen for F2 rename custom event
  useEffect(() => {
    const handleRenameEvent = (ev: Event) => {
      const customEv = ev as CustomEvent<{ entityId?: string }>;
      const targetId = customEv.detail?.entityId;
      if (!targetId || targetId === rootEntityId) return;
      const summary = useEditorStore.getState().entitySummaries[targetId];
      if (!summary) return;
      setRenamingId(targetId);
      setRenameValue(summary.name);
    };
    window.addEventListener('editor:rename-entity', handleRenameEvent);
    return () => window.removeEventListener('editor:rename-entity', handleRenameEvent);
  }, [rootEntityId]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && lastClickedIdRef.current) {
      const anchorIdx = visibleOrderedIds.indexOf(lastClickedIdRef.current);
      const targetIdx = visibleOrderedIds.indexOf(id);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const range = visibleOrderedIds.slice(start, end + 1);
        if (e.ctrlKey || e.metaKey) {
          const merged = new Set([...selectedEntityIds, ...range]);
          engine.selectEntities(Array.from(merged));
        } else {
          engine.selectEntities(range);
        }
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      const exists = selectedEntityIds.includes(id);
      const next = exists
        ? selectedEntityIds.filter((item) => item !== id)
        : [...selectedEntityIds, id];
      engine.selectEntities(next);
      lastClickedIdRef.current = id;
    } else {
      engine.selectEntities([id]);
      lastClickedIdRef.current = id;
    }
  };

  const handleToggleEnabled = (id: string, currentEnabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    engine.setEntityEnabled(id, !currentEnabled);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    const original = entitySummaries[renamingId]?.name ?? '';
    if (trimmed && trimmed !== original) {
      engine.renameEntity(renamingId, trimmed);
    }
    setRenamingId(null);
  };

  const openContextMenu = (e: React.MouseEvent, targetEntityId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (targetEntityId && !selectedEntityIds.includes(targetEntityId)) {
      engine.selectEntities([targetEntityId]);
    }
    const menuWidth = 196;
    const menuHeight = 360;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
    setContextMenu({ x, y, targetEntityId });
  };

  const getCreateParentId = (): string | undefined => {
    if (contextMenu?.targetEntityId) return contextMenu.targetEntityId;
    return rootEntityId ?? undefined;
  };

  const isDescendantOrSelf = (candidateId: string, ancestorId: string): boolean => {
    let current: string | null = candidateId;
    while (current) {
      if (current === ancestorId) return true;
      current = entitySummaries[current]?.parentId ?? null;
    }
    return false;
  };

  const canDropOn = (sourceId: string | null, targetId: string): boolean => {
    if (!sourceId || !targetId) return false;
    if (sourceId === rootEntityId) return false;
    if (sourceId === targetId) return false;
    if (entitySummaries[sourceId]?.parentId === targetId) return false;
    if (isDescendantOrSelf(targetId, sourceId)) return false;
    return true;
  };

  const renderNode = (id: string, depth: number): React.ReactNode => {
    const summary = entitySummaries[id];
    if (!summary) return null;
    if (matchingIds && !matchingIds.has(id)) return null;

    const isRoot = id === rootEntityId;
    const isSelected = selectedEntityIds.includes(id);
    const hasChildren = summary.childIds.length > 0;
    const isCollapsed = Boolean(collapsedIds[id]) && !matchingIds;
    const isRenaming = renamingId === id;
    const isDropTarget = dropTargetId === id;
    const isDragging = draggedId === id;

    return (
      <React.Fragment key={id}>
        <div
          ref={(el) => {
            if (el) {
              rowRefs.current.set(id, el);
            } else {
              rowRefs.current.delete(id);
            }
          }}
          draggable={!isRoot && !isRenaming}
          onDragStart={(e) => {
            if (isRoot || isRenaming) {
              e.preventDefault();
              return;
            }
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-editor-entity-id', id);
            e.dataTransfer.setData('text/plain', id);
            setDraggedId(id);
          }}
          onDragOver={(e) => {
            if (!canDropOn(draggedId, id)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            if (dropTargetId !== id) {
              setDropTargetId(id);
            }
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            const related = e.relatedTarget as Node | null;
            if (!related || !e.currentTarget.contains(related)) {
              if (dropTargetId === id) {
                setDropTargetId(null);
              }
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sourceId =
              draggedId ??
              (e.dataTransfer.getData('application/x-editor-entity-id') ||
                e.dataTransfer.getData('text/plain'));
            setDropTargetId(null);
            setDraggedId(null);
            if (!canDropOn(sourceId, id)) return;
            engine.reparentEntity(sourceId, id);
          }}
          onDragEnd={() => {
            setDraggedId(null);
            setDropTargetId(null);
          }}
          onClick={(e) => handleSelect(id, e)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (!isRoot) {
              setRenamingId(id);
              setRenameValue(summary.name);
            }
          }}
          onContextMenu={(e) => openContextMenu(e, id)}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`group h-6 pr-2 flex items-center justify-between gap-1 cursor-pointer text-xs transition-colors ${
            isDropTarget
              ? 'bg-blue-500/25 text-white ring-1 ring-inset ring-blue-400'
              : isSelected
                ? 'bg-blue-600/35 text-white'
                : 'text-gray-300 hover:bg-[#222733]'
          } ${!summary.enabled || isDragging ? 'opacity-50' : ''}`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleCollapse(id, e)}
                className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white shrink-0"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            <EntityIcon summary={summary} isRoot={isRoot} />

            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 h-5 px-1 bg-[#101319] border border-blue-500 rounded text-xs text-white focus:outline-none"
              />
            ) : (
              <span className="truncate">{summary.name}</span>
            )}
          </div>

          {!isRoot && (
            <button
              type="button"
              onClick={(e) => handleToggleEnabled(id, summary.enabled, e)}
              title={summary.enabled ? 'Disable Entity' : 'Enable Entity'}
              className={`w-5 h-5 rounded flex items-center justify-center transition-opacity ${
                summary.enabled
                  ? 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white'
                  : 'opacity-100 text-gray-500 hover:text-gray-200'
              }`}
            >
              {summary.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
          )}
        </div>

        {!isCollapsed &&
          summary.childIds.map((childId) => renderNode(childId, depth + 1))}
      </React.Fragment>
    );
  };

  const targetId = contextMenu?.targetEntityId ?? null;
  const canModifyTarget = Boolean(targetId && targetId !== rootEntityId);

  return (
    <div className="h-full flex flex-col bg-[#161922] text-xs relative">
      {/* Header */}
      <div className="h-8 shrink-0 px-2.5 bg-[#1b1f27] border-b border-[#2b313d] flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-200 tracking-wide uppercase text-[11px]">
          Hierarchy
        </span>
        <button
          type="button"
          title="Create Entity"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setContextMenu({
              x: rect.left,
              y: rect.bottom + 4,
              targetEntityId: selectedEntityIds[0] ?? rootEntityId ?? null,
            });
          }}
          className="h-5 px-1.5 rounded bg-[#12151b] border border-[#2b313d] hover:bg-[#252b36] text-gray-200 flex items-center gap-1 text-[11px]"
        >
          <Plus className="w-3 h-3" />
          <span>Add</span>
        </button>
      </div>

      {/* Search */}
      <div className="p-1.5 border-b border-[#242934]">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities or tags..."
            className="w-full h-6 pl-7 pr-6 rounded bg-[#101319] border border-[#2b313d] text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 text-gray-500 hover:text-gray-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onClick={() => engine.selectEntities([])}
        onContextMenu={(e) => openContextMenu(e, rootEntityId)}
      >
        {rootIds.length === 0 ? (
          <div className="px-3 py-4 text-center text-gray-500 text-xs">
            No entities in scene
          </div>
        ) : (
          rootIds.map((id) => renderNode(id, 0))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-48 py-1 rounded-md bg-[#1e232d] border border-[#323948] shadow-xl text-xs text-gray-200"
        >
          <button
            type="button"
            onClick={() => {
              engine.createEmpty('Empty Entity', getCreateParentId());
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center gap-2"
          >
            <Folder className="w-3.5 h-3.5 text-gray-400" />
            <span>Create Empty</span>
          </button>

          <div className="my-1 border-t border-[#2d3340]" />
          <div className="px-3 py-0.5 text-[10px] uppercase tracking-wider text-gray-500">
            3D Primitives
          </div>
          {(['box', 'sphere', 'plane', 'cylinder', 'capsule'] as const).map((shape) => (
            <button
              key={shape}
              type="button"
              onClick={() => {
                engine.createPrimitive(shape, getCreateParentId());
                setContextMenu(null);
              }}
              className="w-full px-3 py-1 text-left hover:bg-blue-600/40 flex items-center gap-2 capitalize"
            >
              <Box className="w-3.5 h-3.5 text-blue-400" />
              <span>{shape}</span>
            </button>
          ))}

          <div className="my-1 border-t border-[#2d3340]" />
          <div className="px-3 py-0.5 text-[10px] uppercase tracking-wider text-gray-500">
            Lights & Camera
          </div>
          {(['directional', 'point', 'spot'] as const).map((lightType) => (
            <button
              key={lightType}
              type="button"
              onClick={() => {
                engine.createLight(lightType, getCreateParentId());
                setContextMenu(null);
              }}
              className="w-full px-3 py-1 text-left hover:bg-blue-600/40 flex items-center gap-2 capitalize"
            >
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>{lightType} Light</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              engine.createCamera(getCreateParentId());
              setContextMenu(null);
            }}
            className="w-full px-3 py-1 text-left hover:bg-blue-600/40 flex items-center gap-2"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            <span>Camera</span>
          </button>

          {canModifyTarget && targetId && (
            <>
              <div className="my-1 border-t border-[#2d3340]" />
              <button
                type="button"
                onClick={() => {
                  engine.duplicateEntities([targetId]);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5 text-gray-400" />
                  <span>Duplicate</span>
                </span>
                <span className="text-[10px] text-gray-500">Ctrl+D</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const summary = entitySummaries[targetId];
                  if (summary) {
                    setRenamingId(targetId);
                    setRenameValue(summary.name);
                  }
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-600/40 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Pencil className="w-3.5 h-3.5 text-gray-400" />
                  <span>Rename</span>
                </span>
                <span className="text-[10px] text-gray-500">F2</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  engine.deleteEntities([targetId]);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-red-600/40 text-red-300 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </span>
                <span className="text-[10px] text-gray-500">Del</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
