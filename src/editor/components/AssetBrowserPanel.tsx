import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ChevronRight,
  FileAudio,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Package,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAssetStore } from '../../store/useAssetStore';
import type { AssetManifestEntry, AssetType } from '../../types';

const ACCEPTED_EXTENSIONS = '.glb,.gltf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAssetBadge(type: AssetType): { label: string; colorClass: string } {
  switch (type) {
    case 'glb':
    case 'gltf':
      return { label: type.toUpperCase(), colorClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    case 'texture':
      return { label: 'TEX', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    case 'audio':
      return { label: 'AUDIO', colorClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    case 'prefab':
      return { label: 'PREFAB', colorClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
  }
}

function AssetFallbackIcon({ type }: { type: AssetType }) {
  switch (type) {
    case 'glb':
    case 'gltf':
      return <Box className="w-8 h-8 text-blue-400" />;
    case 'texture':
      return <ImageIcon className="w-8 h-8 text-emerald-400" />;
    case 'audio':
      return <FileAudio className="w-8 h-8 text-amber-400" />;
    case 'prefab':
      return <Package className="w-8 h-8 text-purple-400" />;
  }
}

export const AssetBrowserPanel: React.FC = () => {
  const assets = useAssetStore((s) => s.assets);
  const folders = useAssetStore((s) => s.folders);
  const currentFolder = useAssetStore((s) => s.currentFolder);
  const selectedAssetId = useAssetStore((s) => s.selectedAssetId);
  const isLoading = useAssetStore((s) => s.isLoading);

  const loadAssets = useAssetStore((s) => s.loadAssets);
  const setCurrentFolder = useAssetStore((s) => s.setCurrentFolder);
  const setSelectedAssetId = useAssetStore((s) => s.setSelectedAssetId);
  const importFiles = useAssetStore((s) => s.importFiles);
  const createFolder = useAssetStore((s) => s.createFolder);
  const createPrefabFromEntity = useAssetStore((s) => s.createPrefabFromEntity);
  const deleteAsset = useAssetStore((s) => s.deleteAsset);

  const [searchQuery, setSearchQuery] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragHoverMode, setDragHoverMode] = useState<'none' | 'files' | 'entity'>('none');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (creatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [creatingFolder]);

  const breadcrumbParts = useMemo(() => {
    if (currentFolder === '/') return [];
    const parts = currentFolder.split('/').filter(Boolean);
    return parts.map((name, idx) => ({
      name,
      path: `/${parts.slice(0, idx + 1).join('/')}`,
    }));
  }, [currentFolder]);

  const childFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) return [];
    const prefix = currentFolder === '/' ? '/' : `${currentFolder}/`;
    return folders.filter((f) => {
      if (f === '/' || f === currentFolder) return false;
      if (!f.startsWith(prefix)) return false;
      const rest = f.slice(prefix.length);
      return !rest.includes('/');
    });
  }, [folders, currentFolder, searchQuery]);

  const visibleAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return assets.filter((a) => a.name.toLowerCase().includes(q));
    }
    return assets.filter((a) => (a.folderPath || '/') === currentFolder);
  }, [assets, currentFolder, searchQuery]);

  const handleCommitFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      createFolder(trimmed);
    }
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes('application/x-pc-asset')) {
      return;
    }
    if (types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dragHoverMode !== 'files') setDragHoverMode('files');
      return;
    }
    if (
      types.includes('application/x-pc-entity') ||
      types.includes('application/x-editor-entity-id') ||
      types.includes('text/plain')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dragHoverMode !== 'entity') setDragHoverMode('entity');
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDragHoverMode('none');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragHoverMode('none');

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void importFiles(e.dataTransfer.files);
      return;
    }

    const entityId =
      e.dataTransfer.getData('application/x-pc-entity') ||
      e.dataTransfer.getData('application/x-editor-entity-id') ||
      e.dataTransfer.getData('text/plain');

    if (entityId && !e.dataTransfer.getData('application/x-pc-asset')) {
      void createPrefabFromEntity(entityId);
    }
  };

  const handleAssetDragStart = (e: React.DragEvent<HTMLDivElement>, asset: AssetManifestEntry) => {
    const isSpawnable = asset.type === 'glb' || asset.type === 'gltf' || asset.type === 'prefab';
    if (!isSpawnable) {
      // Still allow dragging for inspector texture/audio slots if needed
      e.dataTransfer.setData(
        'application/x-pc-asset',
        JSON.stringify({ assetId: asset.id, type: asset.type, name: asset.name })
      );
      e.dataTransfer.effectAllowed = 'copy';
      return;
    }
    e.dataTransfer.setData(
      'application/x-pc-asset',
      JSON.stringify({ assetId: asset.id, type: asset.type, name: asset.name })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="h-full flex bg-[#151820] text-xs select-none">
      {/* Left: Virtual Folder Sidebar */}
      <aside className="w-44 shrink-0 bg-[#161922] border-r border-[#2b313d] flex flex-col">
        <div className="h-8 px-2.5 border-b border-[#242934] flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Folders
          </span>
          <button
            type="button"
            title="New Virtual Folder"
            onClick={() => setCreatingFolder(true)}
            className="h-5 w-5 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#252b36] transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {folders.map((folder) => {
            const isSelected = currentFolder === folder;
            const depth = folder === '/' ? 0 : folder.split('/').filter(Boolean).length;
            const label = folder === '/' ? 'Assets' : folder.split('/').pop() ?? folder;

            return (
              <button
                key={folder}
                type="button"
                onClick={() => setCurrentFolder(folder)}
                style={{ paddingLeft: `${depth * 12 + 10}px` }}
                className={`w-full h-6 pr-2 flex items-center gap-1.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-blue-600/30 text-white'
                    : 'text-gray-300 hover:bg-[#222733]'
                }`}
              >
                {isSelected ? (
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                )}
                <span className="truncate">{label}</span>
              </button>
            );
          })}

          {creatingFolder && (
            <div className="px-2 py-1">
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={handleCommitFolder}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleCommitFolder();
                  if (e.key === 'Escape') {
                    setNewFolderName('');
                    setCreatingFolder(false);
                  }
                }}
                placeholder="Folder name..."
                className="w-full h-5 px-1.5 rounded bg-[#101319] border border-blue-500 text-[11px] text-white focus:outline-none"
              />
            </div>
          )}
        </div>
      </aside>

      {/* Right: Breadcrumb + Asset Grid */}
      <div
        className="flex-1 min-w-0 flex flex-col relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Top Bar: Breadcrumb + Search + Import */}
        <div className="h-8 shrink-0 px-2.5 border-b border-[#242934] bg-[#181c25] flex items-center justify-between gap-2">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto text-[11px]">
            <button
              type="button"
              onClick={() => setCurrentFolder('/')}
              className={`px-1.5 py-0.5 rounded hover:bg-[#252b36] transition-colors ${
                currentFolder === '/' ? 'text-white font-medium' : 'text-gray-400'
              }`}
            >
              Assets
            </button>
            {breadcrumbParts.map((part) => (
              <React.Fragment key={part.path}>
                <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />
                <button
                  type="button"
                  onClick={() => setCurrentFolder(part.path)}
                  className={`px-1.5 py-0.5 rounded hover:bg-[#252b36] transition-colors truncate ${
                    currentFolder === part.path ? 'text-white font-medium' : 'text-gray-400'
                  }`}
                >
                  {part.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-gray-500 absolute left-2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assets..."
                className="h-5 w-36 pl-6 pr-5 rounded bg-[#101319] border border-[#2b313d] text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
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

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void importFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-5 px-2 rounded bg-[#12151b] border border-[#2b313d] hover:bg-[#252b36] text-gray-200 flex items-center gap-1 text-[11px] transition-colors"
            >
              <Upload className="w-3 h-3 text-blue-400" />
              <span>Import</span>
            </button>
          </div>
        </div>

        {/* Grid Area */}
        <div
          className="flex-1 overflow-y-auto p-2.5"
          onClick={() => setSelectedAssetId(null)}
        >
          {isLoading && assets.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              Loading assets from IndexedDB...
            </div>
          ) : childFolders.length === 0 && visibleAssets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-1.5 border border-dashed border-[#2b313d] rounded-md p-4">
              <Upload className="w-6 h-6 text-gray-600" />
              <div className="text-xs text-gray-400 font-medium">
                {searchQuery ? 'No matching assets found' : 'Folder is empty'}
              </div>
              <div className="text-[11px] text-gray-500 max-w-md">
                Drop <span className="text-gray-300">.glb, .gltf, .png, .jpg, .mp3</span> files here to import, or drag an Entity from Hierarchy to create a Prefab.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2.5">
              {/* Subfolders */}
              {childFolders.map((folder) => {
                const name = folder.split('/').pop() ?? folder;
                return (
                  <div
                    key={folder}
                    onDoubleClick={() => setCurrentFolder(folder)}
                    className="group rounded-md bg-[#1b1f27] border border-[#2b313d] hover:border-blue-500/60 p-2 flex flex-col items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <div className="w-full h-16 rounded bg-[#12151b] flex items-center justify-center">
                      <Folder className="w-8 h-8 text-amber-400/90" />
                    </div>
                    <span className="w-full text-center text-[11px] text-gray-200 truncate">
                      {name}
                    </span>
                  </div>
                );
              })}

              {/* Asset Cards */}
              {visibleAssets.map((asset) => {
                const isSelected = selectedAssetId === asset.id;
                const badge = getAssetBadge(asset.type);
                const isDraggable =
                  asset.type === 'glb' || asset.type === 'gltf' || asset.type === 'prefab';

                return (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => handleAssetDragStart(e, asset)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAssetId(asset.id);
                    }}
                    title={`${asset.name} (${formatBytes(asset.sizeBytes)})${
                      isDraggable ? ' — Drag into Viewport to spawn' : ''
                    }`}
                    className={`group relative rounded-md p-2 flex flex-col items-center gap-1.5 cursor-pointer transition-colors border ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500'
                        : 'bg-[#1b1f27] border-[#2b313d] hover:border-[#3e4758]'
                    }`}
                  >
                    {/* Delete button */}
                    <button
                      type="button"
                      title="Delete Asset"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteAsset(asset.id);
                      }}
                      className="absolute top-1 right-1 z-10 w-5 h-5 rounded bg-[#12151b]/90 text-gray-400 hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>

                    {/* Thumbnail */}
                    <div className="w-full h-16 rounded bg-[#12151b] overflow-hidden flex items-center justify-center relative">
                      {asset.thumbnailDataUrl ? (
                        <img
                          src={asset.thumbnailDataUrl}
                          alt={asset.name}
                          draggable={false}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <AssetFallbackIcon type={asset.type} />
                      )}
                      <span
                        className={`absolute bottom-1 left-1 px-1 py-0 rounded border text-[9px] font-semibold ${badge.colorClass}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {/* Name */}
                    <span className="w-full text-center text-[11px] text-gray-200 truncate">
                      {asset.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drag-and-Drop Overlay */}
        {dragHoverMode !== 'none' && (
          <div className="absolute inset-0 z-20 bg-blue-950/60 border-2 border-dashed border-blue-400 flex flex-col items-center justify-center pointer-events-none gap-1">
            {dragHoverMode === 'files' ? (
              <>
                <Upload className="w-7 h-7 text-blue-300" />
                <span className="text-xs font-semibold text-blue-100">
                  Drop files to import into {currentFolder}
                </span>
              </>
            ) : (
              <>
                <Package className="w-7 h-7 text-purple-300" />
                <span className="text-xs font-semibold text-purple-100">
                  Drop entity to create Prefab in {currentFolder}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
