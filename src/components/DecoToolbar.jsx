import React, { useState } from 'react';
import {
  Move,
  RotateCw,
  RotateCcw,
  Copy,
  Trash2,
  Save,
  Download,
  Plus,
  X,
  Compass,
  Eye,
  Layers,
  Magnet,
  ChevronUp,
  ChevronDown,
  Check,
  Armchair,
  Wine,
  UtensilsCrossed,
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';
import { DECO_CATALOG } from '../data/decoCatalog';

// Clean Minimalist Category Definitions with SVG Line Icons (No emojis)
const MINIMAL_CATEGORIES = [
  { id: 'furniture', label: 'Bàn ghế', icon: Armchair },
  { id: 'counter',   label: 'Quầy bar & Kệ', icon: Wine },
  { id: 'food',      label: 'Món ăn & Ẩm thực', icon: UtensilsCrossed },
  { id: 'decor',     label: 'Trang trí & Đèn', icon: Sparkles }
];

export default function DecoToolbar({
  isOpen,
  onClose,
  selectedItem,
  gizmoMode,
  onSetGizmoMode,
  isSnapEnabled = true,
  onToggleSnap = () => {},
  cameraPreset = 'god',
  onSetCameraPreset = () => {},
  onRotateItem,
  onNudgeItem = () => {},
  onSnapItem = () => {},
  onDuplicateItem,
  onDeleteItem,
  onDeselectItem,
  onAddItem,
  onSaveScene,
  onExportScene,
  onClearAll,
  onResetLayout = () => {},
  itemCount = 0,
  isNightMode = false,
  onToggleNightMode = () => {}
}) {
  const [activeCategory, setActiveCategory] = useState('furniture');
  const [isCatalogOpen, setIsCatalogOpen] = useState(true);
  const [copiedToast, setCopiedToast] = useState(false);

  if (!isOpen) return null;

  const filteredCatalog = DECO_CATALOG.filter(
    (item) => item.category === activeCategory
  );

  const handleExport = () => {
    onExportScene();
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  return (
    <>
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. UNIFIED MINIMAL TOP STUDIO BAR (Architectural & Clean)    */}
      {/* ───────────────────────────────────────────────────────────── */}
      <header className="fixed top-3 left-3 right-3 z-40 flex items-center justify-between pointer-events-none select-none">
        {/* Brand / Mode Indicator */}
        <div className="bg-neutral-950/70 backdrop-blur-xl border border-white/10 px-3.5 py-1.5 rounded-xl shadow-lg flex items-center space-x-2.5 pointer-events-auto">
          <span className="font-serif tracking-wider font-semibold text-xs text-neutral-200">
            CA VĂN NGHỆ
          </span>
          <span className="text-white/20 text-xs">/</span>
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
              Studio
            </span>
          </div>
        </div>

        {/* Center: Camera Presets & Transform Tools */}
        <div className="bg-neutral-950/80 backdrop-blur-xl border border-white/10 p-1 rounded-xl shadow-xl flex items-center space-x-1 pointer-events-auto">
          {/* Camera View Switcher */}
          <div className="flex items-center space-x-0.5 bg-white/[0.04] p-0.5 rounded-lg border border-white/5">
            <button
              onClick={() => onSetCameraPreset('god')}
              title="Góc nhìn Thượng Đế (Top-down từ trên cao)"
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition ${
                cameraPreset === 'god'
                  ? 'bg-white/15 text-white shadow-sm border border-white/15'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden sm:inline">Thượng đế</span>
            </button>
            <button
              onClick={() => onSetCameraPreset('iso')}
              title="Góc nhìn Phối cảnh (Isometric 45°)"
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition ${
                cameraPreset === 'iso'
                  ? 'bg-white/15 text-white shadow-sm border border-white/15'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden sm:inline">Phối cảnh</span>
            </button>
            <button
              onClick={() => onSetCameraPreset('eye')}
              title="Góc nhìn Ngang sảnh"
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition ${
                cameraPreset === 'eye'
                  ? 'bg-white/15 text-white shadow-sm border border-white/15'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden sm:inline">Ngang</span>
            </button>
          </div>

          <div className="h-4 w-[1px] bg-white/10 mx-0.5" />

          {/* Gizmo Mode Switcher */}
          <div className="flex items-center space-x-0.5 bg-white/[0.04] p-0.5 rounded-lg border border-white/5">
            <button
              onClick={() => onSetGizmoMode('translate')}
              title="Chế độ Di chuyển [Phím G]"
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition ${
                gizmoMode === 'translate'
                  ? 'bg-white/15 text-white shadow-sm border border-white/15'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Move className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Di chuyển</span>
              <kbd className="font-mono text-[9px] text-neutral-400 ml-0.5">G</kbd>
            </button>
            <button
              onClick={() => onSetGizmoMode('rotate')}
              title="Chế độ Xoay [Phím R]"
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition ${
                gizmoMode === 'rotate'
                  ? 'bg-white/15 text-white shadow-sm border border-white/15'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xoay</span>
              <kbd className="font-mono text-[9px] text-neutral-400 ml-0.5">R</kbd>
            </button>
          </div>

          {/* Grid Snap Toggle */}
          <button
            onClick={onToggleSnap}
            title={isSnapEnabled ? "Đang bật Hít lưới 0.25m / 15° (Click để tắt)" : "Đang tắt Hít lưới (Click để bật)"}
            className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1 transition border ${
              isSnapEnabled
                ? 'bg-amber-400/10 text-amber-300 border-amber-400/25'
                : 'text-neutral-500 hover:text-neutral-300 border-transparent hover:bg-white/5'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden md:inline font-mono text-[10px]">Lưới</span>
          </button>
        </div>

        {/* Right: Quick Settings & Exit Studio */}
        <div className="flex items-center space-x-1.5 pointer-events-auto">
          <button
            onClick={onToggleNightMode}
            title={isNightMode ? "Chuyển sang Ban Ngày" : "Chuyển sang Đêm Nhạc"}
            className="p-1.5 rounded-lg bg-neutral-950/70 backdrop-blur-xl border border-white/10 text-neutral-400 hover:text-white transition"
          >
            {isNightMode ? <Moon className="w-3.5 h-3.5 text-amber-300" /> : <Sun className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClose}
            title="Thoát chế độ Decor (Phím B)"
            className="px-3 py-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 hover:text-white text-xs font-medium border border-white/15 transition flex items-center space-x-1.5 shadow-md"
          >
            <span>Thoát</span>
            <kbd className="font-mono text-[10px] text-neutral-400 px-1 py-0.2 bg-white/10 rounded">B</kbd>
          </button>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. SELECTED ITEM FLOATING BAR (Appears when item is active)   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 flex items-center pointer-events-none animate-fadeIn">
          <div className="bg-neutral-950/85 backdrop-blur-xl border border-white/15 px-3 py-1.5 rounded-xl shadow-2xl flex items-center space-x-2.5 pointer-events-auto text-xs">
            <span className="text-white font-medium truncate max-w-[160px] sm:max-w-[220px]">
              {selectedItem.name}
            </span>
            <span className="font-mono text-[10px] text-neutral-500 hidden sm:inline">
              [{selectedItem.position[0]}, {selectedItem.position[2]}]
            </span>

            <div className="h-3 w-[1px] bg-white/15" />

            {/* Quick 90° Rotate */}
            <button
              onClick={() => onRotateItem(selectedItem.id, Math.PI / 2)}
              title="Xoay nhanh 90°"
              className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition flex items-center space-x-1"
            >
              <RotateCw className="w-3 h-3" />
              <span className="text-[11px]">90°</span>
            </button>

            {/* Snap To Grid button (Align straight) */}
            <button
              onClick={() => onSnapItem(selectedItem.id)}
              title="Căn chuẩn toạ độ lưới 0.25m & xoay vuông góc"
              className="px-2 py-1 rounded-md bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 transition flex items-center space-x-1 border border-amber-400/20"
            >
              <Magnet className="w-3 h-3" />
              <span className="text-[11px] font-mono">Căn thẳng</span>
            </button>

            {/* Nudge X/Z Step Buttons */}
            <div className="flex items-center space-x-0.5 bg-white/5 p-0.5 rounded-md border border-white/5">
              <button
                onClick={() => onNudgeItem(selectedItem.id, -0.25, 0)}
                title="Dịch trái X (-0.25m)"
                className="px-1.5 py-0.5 rounded text-[10px] text-neutral-300 hover:text-white hover:bg-white/10 font-mono"
              >
                ←X
              </button>
              <button
                onClick={() => onNudgeItem(selectedItem.id, 0.25, 0)}
                title="Dịch phải X (+0.25m)"
                className="px-1.5 py-0.5 rounded text-[10px] text-neutral-300 hover:text-white hover:bg-white/10 font-mono"
              >
                X→
              </button>
              <button
                onClick={() => onNudgeItem(selectedItem.id, 0, -0.25)}
                title="Dịch lên Z (-0.25m)"
                className="px-1.5 py-0.5 rounded text-[10px] text-neutral-300 hover:text-white hover:bg-white/10 font-mono"
              >
                ↑Z
              </button>
              <button
                onClick={() => onNudgeItem(selectedItem.id, 0, 0.25)}
                title="Dịch xuống Z (+0.25m)"
                className="px-1.5 py-0.5 rounded text-[10px] text-neutral-300 hover:text-white hover:bg-white/10 font-mono"
              >
                Z↓
              </button>
            </div>

            {/* Duplicate */}
            <button
              onClick={() => onDuplicateItem(selectedItem.id)}
              title="Nhân bản vật phẩm này"
              className="p-1.5 rounded-md bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition"
            >
              <Copy className="w-3 h-3" />
            </button>

            {/* Delete */}
            <button
              onClick={() => onDeleteItem(selectedItem.id)}
              title="Xoá vật phẩm [Phím Delete]"
              className="p-1.5 rounded-md hover:bg-rose-500/20 text-neutral-400 hover:text-rose-300 transition"
            >
              <Trash2 className="w-3 h-3" />
            </button>

            <button
              onClick={onDeselectItem}
              title="Bỏ chọn [Phím Esc]"
              className="p-1 rounded-md hover:bg-white/10 text-neutral-500 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. MINIMAL FLOATING CATALOG DOCK (Bottom center)              */}
      {/* ───────────────────────────────────────────────────────────── */}
      <footer className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-full max-w-4xl px-3 pointer-events-none">
        <div className="bg-neutral-950/85 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-2.5 pointer-events-auto transition-all duration-300">
          {/* Category Tabs & Quick Action Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-2 mb-2">
            {/* Category Tabs */}
            <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
              {MINIMAL_CATEGORIES.map((cat) => {
                const IconComponent = cat.icon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setIsCatalogOpen(true);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition shrink-0 ${
                      isActive
                        ? 'bg-white/15 text-white shadow-sm border border-white/15'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                    }`}
                  >
                    <IconComponent className={`w-3.5 h-3.5 ${isActive ? 'text-neutral-200' : 'text-neutral-400'}`} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Utility Actions (Save, Export, Reset, Clear) */}
            <div className="flex items-center space-x-1 shrink-0 ml-2">
              <button
                onClick={onSaveScene}
                title="Lưu cách bố trí vào bộ nhớ trình duyệt"
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-medium flex items-center space-x-1 transition"
              >
                <Save className="w-3 h-3 text-neutral-400" />
                <span className="hidden sm:inline text-[11px]">Lưu</span>
              </button>

              <button
                onClick={handleExport}
                title="Sao chép toạ độ JSON"
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-medium flex items-center space-x-1 transition"
              >
                {copiedToast ? <Check className="w-3 h-3 text-emerald-400" /> : <Download className="w-3 h-3 text-neutral-400" />}
                <span className="hidden sm:inline text-[11px]">{copiedToast ? 'Đã chép' : 'Xuất'}</span>
              </button>

              <button
                onClick={onResetLayout}
                title="Khôi phục lại sảnh mặc định ban đầu"
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 text-xs font-medium flex items-center space-x-1 transition"
              >
                <RotateCcw className="w-3 h-3 text-neutral-400" />
                <span className="hidden md:inline text-[11px]">Mặc định</span>
              </button>

              <button
                onClick={onClearAll}
                title="Dọn sạch toàn bộ bàn ghế để tự do bài trí từ đầu"
                className="px-2.5 py-1 rounded-lg hover:bg-rose-500/15 text-neutral-400 hover:text-rose-300 text-xs font-medium flex items-center space-x-1 transition"
              >
                <Trash2 className="w-3 h-3" />
                <span className="hidden md:inline text-[11px]">Dọn sạch</span>
              </button>

              <button
                onClick={() => setIsCatalogOpen((prev) => !prev)}
                title={isCatalogOpen ? "Thu gọn kho đồ" : "Mở rộng kho đồ"}
                className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-neutral-200 transition ml-1"
              >
                {isCatalogOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Catalog Item Carousel (Minimalist Cards) */}
          {isCatalogOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 max-h-[125px] overflow-y-auto pr-1">
              {filteredCatalog.map((catalogItem) => (
                <button
                  key={catalogItem.id}
                  onClick={() => onAddItem(catalogItem)}
                  className="p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/20 text-left transition group flex items-center space-x-2 shadow-sm"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Plus className="w-3.5 h-3.5 text-neutral-300 group-hover:text-white" />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-[11px] font-medium text-neutral-200 group-hover:text-white truncate">
                      {catalogItem.name}
                    </h4>
                    <span className="text-[10px] text-neutral-400 block truncate">
                      Thêm vào sảnh
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </footer>
    </>
  );
}
