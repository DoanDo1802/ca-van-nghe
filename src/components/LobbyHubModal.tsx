import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  DoorOpen,
  KeyRound,
  Lock,
  LogOut,
  Palette,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AdminService, type ActiveRoomInfo, type AdminAccount } from '../network/AdminService';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { isSupabaseConfigured } from '../network/supabaseClient';
import { LOBBY_SCENE_ID } from '../engine/serialization/SceneRegistry';
import {
  AVATAR_COLOR_PRESETS,
  AVATAR_MODEL_PRESETS,
  getSavedAvatarColor,
  getSavedAvatarModel,
  saveAvatarColor,
  saveAvatarModel,
  type AvatarModelId,
} from '../utils/avatarColor';
import { matchesRoomSearch, supportsWebkitTextSecurity } from '../utils/roomInputHelpers';

export type LobbyHubTab = 'lobby' | 'avatar';

interface LobbyHubModalProps {
  isOpen: boolean;
  initialTab: LobbyHubTab;
  onClose: () => void;
  onSwitchedRoom: () => void;
}

export const LobbyHubModal: React.FC<LobbyHubModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  onSwitchedRoom,
}) => {
  const [activeTab, setActiveTab] = useState<LobbyHubTab>(initialTab);
  const [account, setAccount] = useState<AdminAccount | null>(() =>
    AdminService.getSavedPlayerAccount()
  );
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [submittingAuth, setSubmittingAuth] = useState(false);

  const [guestNameDraft, setGuestNameDraft] = useState(
    () => localStorage.getItem('cavannghe:guest-name') || localStorage.getItem('cavannghe:player-name') || 'Khách Lounge'
  );

  const [rooms, setRooms] = useState<ActiveRoomInfo[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [joinPasswordRoomId, setJoinPasswordRoomId] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [roomError, setRoomError] = useState('');
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [closingRoomId, setClosingRoomId] = useState<string | null>(null);

  const [avatarColor, setAvatarColor] = useState<string>(() => getSavedAvatarColor());
  const [avatarModel, setAvatarModel] = useState<AvatarModelId>(() => getSavedAvatarModel());

  const supabaseReady = isSupabaseConfigured();
  const useMaskedTextPasscode = supportsWebkitTextSecurity();

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab === 'lobby') {
      setRoomSearchQuery('');
      setJoinPasswordRoomId(null);
      setJoinPassword('');
      setRoomError('');
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void AdminService.getCurrentAdminAccount().then((adminAcc) => {
      if (!active) return;
      if (adminAcc) {
        setAccount(adminAcc);
        AdminService.savePlayerAccount(adminAcc);
        MultiplayerManager.getInstance().setLocalIsAdmin(true);
        MultiplayerManager.getInstance().setLocalPlayerName(
          adminAcc.display_name || adminAcc.username
        );
      } else {
        setAccount(AdminService.getSavedPlayerAccount());
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const loadRooms = useCallback(async () => {
    if (!supabaseReady) {
      setRooms([]);
      return;
    }
    setLoadingRooms(true);
    await MultiplayerManager.getInstance().waitForPendingCleanup();
    const list = await AdminService.fetchActiveRooms();
    setRooms(list);
    setLoadingRooms(false);
  }, [supabaseReady]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'lobby') return;
    void loadRooms();
  }, [isOpen, activeTab, loadRooms]);

  if (!isOpen) return null;

  const isAdmin = account?.role === 'admin';
  const currentStatus = MultiplayerManager.getInstance().getRoomStatus();
  const activePlayerName = account
    ? account.display_name || account.username
    : guestNameDraft.trim() || currentStatus.localPlayerName || 'Khách Lounge';

  const applyAccountSession = (acc: AdminAccount) => {
    setAccount(acc);
    const mp = MultiplayerManager.getInstance();
    mp.setLocalIsAdmin(acc.role === 'admin');
    mp.setLocalPlayerName(acc.display_name || acc.username);
    if (acc.avatar_color) {
      const savedHex = saveAvatarColor(acc.avatar_color);
      setAvatarColor(savedHex);
      mp.setLocalAvatarColor(savedHex);
      window.dispatchEvent(new CustomEvent('cavannghe:avatar-color', { detail: savedHex }));
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setSubmittingAuth(true);

    const res =
      authMode === 'register'
        ? await AdminService.registerPlayerAccount(username, password, displayName, avatarColor)
        : await AdminService.loginPlayerAccount(username, password);

    setSubmittingAuth(false);
    if (res.error) {
      setAuthError(res.error);
      return;
    }
    if (res.account) {
      applyAccountSession(res.account);
      setPassword('');
    }
  };

  const handleUpdateGuestName = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = guestNameDraft.trim() || 'Khách Lounge';
    setGuestNameDraft(clean);
    try {
      localStorage.setItem('cavannghe:guest-name', clean);
      localStorage.setItem('cavannghe:player-name', clean);
    } catch {
      // ignore
    }
    MultiplayerManager.getInstance().setLocalPlayerName(clean);
  };

  const handleLeaveCurrentLobby = () => {
    onClose();
    window.dispatchEvent(
      new CustomEvent('cavannghe:open-entry-gate', { detail: { step: 'room' } })
    );
  };

  const handleExitToEntryGate = async () => {
    if (account) {
      AdminService.clearPlayerAccount();
      if (account.role === 'admin') {
        await AdminService.signOutAdmin();
      }
      setAccount(null);
      MultiplayerManager.getInstance().setLocalIsAdmin(false);
    }
    onClose();
    window.dispatchEvent(
      new CustomEvent('cavannghe:open-entry-gate', { detail: { step: 'identity' } })
    );
  };

  const handleSelectColor = (hex: string) => {
    const clean = saveAvatarColor(hex);
    setAvatarColor(clean);
    MultiplayerManager.getInstance().setLocalAvatarColor(clean);
    window.dispatchEvent(new CustomEvent('cavannghe:avatar-color', { detail: clean }));
    if (account?.id) {
      void AdminService.updatePlayerAvatarColor(account.id, clean);
    }
  };

  const handleSelectModel = (modelId: AvatarModelId) => {
    const clean = saveAvatarModel(modelId);
    setAvatarModel(clean);
    MultiplayerManager.getInstance().setLocalAvatarModel(clean);
    window.dispatchEvent(new CustomEvent('cavannghe:avatar-model', { detail: clean }));
  };

  const handleJoinExistingRoom = async (room: ActiveRoomInfo, pwd = '') => {
    setRoomError('');
    setJoiningRoomId(room.room_id);
    const mp = MultiplayerManager.getInstance();
    mp.setLocalIsAdmin(Boolean(isAdmin));
    const ok = await mp.joinRoom(room.room_id, activePlayerName, LOBBY_SCENE_ID, {
      password: pwd,
      bypassLimits: Boolean(isAdmin),
    });
    setJoiningRoomId(null);
    if (ok) {
      setJoinPasswordRoomId(null);
      setJoinPassword('');
      onSwitchedRoom();
    } else {
      setRoomError(mp.getLastJoinError() || 'Không thể tham gia phòng Lobby.');
    }
  };

  const handleCloseRoom = async (room: ActiveRoomInfo) => {
    setRoomError('');
    setClosingRoomId(room.room_id);
    await AdminService.closeOwnedRoom(
      room.room_id,
      room.host_name || activePlayerName,
      room.scene_id || LOBBY_SCENE_ID
    );
    setClosingRoomId(null);
    await loadRooms();
  };

  const filteredRooms = roomSearchQuery.trim()
    ? rooms.filter((r) => matchesRoomSearch(r, roomSearchQuery))
    : rooms;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm select-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl max-h-[90dvh] rounded-2xl bg-[#121212] border border-white/10 shadow-2xl overflow-hidden flex flex-col text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-white">
              Quầy Phòng Lobby & Nhân Vật
            </h2>
            <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-0.5 truncate">
              {isAdmin && (
                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[9px] font-bold uppercase inline-flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  ADMIN
                </span>
              )}
              <span className="text-neutral-200 font-medium">{activePlayerName}</span>
              {account ? (
                <span className="font-mono text-neutral-500">(@{account.username})</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 text-[10px]">
                  Khách
                </span>
              )}
              {currentStatus.connected && (
                <>
                  <span>•</span>
                  <span className="font-mono text-neutral-400">Phòng: {currentStatus.roomId}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLeaveCurrentLobby}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] text-rose-200 hover:text-white flex items-center gap-1 transition"
              title="Rời phòng Lobby hiện tại ra ngoài Sảnh để tạo phòng mới"
            >
              <DoorOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rời phòng</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExitToEntryGate()}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-neutral-300 hover:text-white flex items-center gap-1 transition"
              title="Thoát ra màn hình Đăng nhập / Chọn Khách"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{account ? 'Đăng xuất' : 'Đổi tài khoản'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2 Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-2.5 border-b border-white/10 bg-[#0d0d0d]">
          {[
            { id: 'lobby' as const, label: 'Đổi Phòng Lobby', icon: DoorOpen },
            { id: 'avatar' as const, label: 'Nhân Vật & Tài Khoản', icon: Palette },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setRoomError('');
                }}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition ${
                  active
                    ? 'bg-white text-black font-semibold'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {activeTab === 'avatar' ? (
            <div className="space-y-5">
              {/* Character Model Selector */}
              <div className="space-y-2.5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Chọn nhân vật</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Đổi nhân vật hiển thị ngay lập tức cho bạn và mọi người trong phòng.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {AVATAR_MODEL_PRESETS.map((model) => {
                    const selected = avatarModel === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelectModel(model.id)}
                        className={`p-3 rounded-xl border text-left transition flex items-center justify-between gap-3 ${
                          selected
                            ? 'bg-white/10 border-white text-white'
                            : 'bg-[#181818] border-white/10 hover:border-white/25 text-neutral-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{model.label}</div>
                          <div className="text-[11px] text-neutral-400 truncate mt-0.5">
                            {model.subtitle}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                            selected ? 'bg-white text-black' : 'bg-white/5 text-neutral-400'
                          }`}
                        >
                          {selected ? 'Đang dùng' : 'Chọn'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Avatar Color */}
              <div className={`space-y-4 ${avatarModel !== 'default' ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Chọn màu trang phục nhân vật</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {avatarModel === 'default'
                        ? 'Thay đổi hiển thị ngay lập tức cho bạn và mọi người trong phòng.'
                        : 'Chỉ áp dụng cho Nhân vật Mặc định (Tyler giữ trang phục gốc).'}
                    </p>
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl border border-white/20 shrink-0 shadow-inner"
                    style={{ backgroundColor: avatarColor }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {AVATAR_COLOR_PRESETS.map((preset) => {
                    const selected = avatarColor.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectColor(preset.hex)}
                        className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${
                          selected
                            ? 'bg-white/10 border-white text-white'
                            : 'bg-[#181818] border-white/10 hover:border-white/25 text-neutral-300'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full border border-white/25 shrink-0"
                          style={{ backgroundColor: preset.hex }}
                        />
                        <span className="text-[11px] font-medium truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#181818] border border-white/10">
                  <div className="text-xs">
                    <div className="font-medium text-white">Chọn màu tự do</div>
                    <div className="text-neutral-400 text-[11px] mt-0.5 font-mono">{avatarColor}</div>
                  </div>
                  <input
                    type="color"
                    value={avatarColor}
                    onChange={(e) => handleSelectColor(e.target.value)}
                    className="w-12 h-9 rounded-lg bg-transparent border border-white/20 cursor-pointer"
                  />
                </div>
              </div>

              {/* Guest Display Name OR Link Account */}
              {!account && (
                <div className="space-y-4 pt-3 border-t border-white/10">
                  <form onSubmit={handleUpdateGuestName} className="space-y-2">
                    <label className="block text-xs font-semibold text-white">
                      Đổi tên hiển thị (Khách)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="hub-guest-display-name"
                        autoComplete="off"
                        maxLength={24}
                        value={guestNameDraft}
                        onChange={(e) => setGuestNameDraft(e.target.value)}
                        placeholder="Nhập tên hiển thị..."
                        className="flex-1 px-3 py-2 rounded-lg bg-neutral-950 border border-white/10 text-base sm:text-xs text-white focus:outline-none focus:border-white/30 select-text"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-2 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold shrink-0"
                      >
                        Lưu tên
                      </button>
                    </div>
                  </form>

                  {supabaseReady && (
                    <form
                      key={authMode}
                      onSubmit={(e) => void handleAuthSubmit(e)}
                      className="rounded-xl bg-[#181818] border border-white/10 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">
                          Đăng nhập hoặc Tạo tài khoản để lưu hồ sơ
                        </span>
                        <div className="flex rounded-lg bg-neutral-950 border border-white/10 p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('login');
                              setAuthError('');
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 ${
                              authMode === 'login' ? 'bg-white text-black' : 'text-neutral-400'
                            }`}
                          >
                            <KeyRound className="w-3 h-3" />
                            <span>Đăng nhập</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('register');
                              setAuthError('');
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 ${
                              authMode === 'register' ? 'bg-white text-black' : 'text-neutral-400'
                            }`}
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Đăng ký</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          name="hub-account-username"
                          autoComplete="username"
                          required
                          minLength={3}
                          maxLength={24}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Tên đăng nhập"
                          className="px-3 py-2 rounded-lg bg-neutral-950 border border-white/10 text-base sm:text-xs text-white select-text"
                        />
                        <input
                          type="password"
                          name="hub-account-password"
                          autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                          required
                          minLength={4}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Mật khẩu"
                          className="px-3 py-2 rounded-lg bg-neutral-950 border border-white/10 text-base sm:text-xs text-white select-text"
                        />
                      </div>

                      {authMode === 'register' && (
                        <input
                          type="text"
                          name="hub-account-display-name"
                          autoComplete="name"
                          maxLength={24}
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Tên hiển thị trong game (tùy chọn)"
                          className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-white/10 text-base sm:text-xs text-white select-text"
                        />
                      )}

                      {authError && (
                        <p className="text-xs text-rose-400">{authError}</p>
                      )}

                      <button
                        type="submit"
                        disabled={submittingAuth}
                        className="px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-black text-xs font-semibold"
                      >
                        {submittingAuth
                          ? 'Đang xử lý...'
                          : authMode === 'register'
                            ? 'Đăng ký tài khoản'
                            : 'Đăng nhập'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ) : !supabaseReady ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              Đang chạy chế độ Offline (chưa cấu hình Supabase).
            </div>
          ) : (
            /* Lobby Rooms List (Switch Only while in Lobby) */
            <div className="space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Phòng Lobby đang mở ({rooms.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadRooms()}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-neutral-300 flex items-center gap-1 transition"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingRooms ? 'animate-spin' : ''}`} />
                    <span>Làm mới</span>
                  </button>
                </div>

                {/* Search Room Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    name="hub-room-search"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    value={roomSearchQuery}
                    onChange={(e) => setRoomSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm mã phòng hoặc tên chủ phòng..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30 select-text [&::-webkit-search-cancel-button]:hidden"
                  />
                  {roomSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setRoomSearchQuery('')}
                      aria-label="Xóa tìm kiếm"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-neutral-400 hover:text-white transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {roomError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                    {roomError}
                  </p>
                )}

                {rooms.length === 0 ? (
                  <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-white/10 rounded-xl bg-[#181818]">
                    Chưa có phòng Lobby nào khác đang hoạt động.
                  </div>
                ) : filteredRooms.length === 0 ? (
                  <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-white/10 rounded-xl bg-[#181818]">
                    Không tìm thấy phòng nào khớp với &ldquo;{roomSearchQuery.trim()}&rdquo;.
                  </div>
                ) : (
                  <div className="max-h-64 sm:max-h-72 overflow-y-auto overscroll-contain pr-1 space-y-2">
                    {filteredRooms.map((room) => {
                      const myDisplayLower = activePlayerName.trim().toLowerCase();
                      const isMyRoom = Boolean(
                        room.host_name && room.host_name.trim().toLowerCase() === myDisplayLower
                      );
                      const isCurrentRoom =
                        currentStatus.connected && currentStatus.roomId === room.room_id;
                      const needsPasswordPrompt =
                        room.has_password &&
                        !isAdmin &&
                        !isMyRoom &&
                        joinPasswordRoomId === room.room_id;
                      const busy = joiningRoomId === room.room_id;
                      const closing = closingRoomId === room.room_id;
                      return (
                        <div
                          key={room.room_id}
                          className="rounded-xl bg-[#181818] border border-white/10 p-3 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white font-mono truncate">
                                  {room.room_id}
                                </span>
                                {isCurrentRoom && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-medium">
                                    Đang ở đây
                                  </span>
                                )}
                                {room.has_password ? (
                                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 text-[10px] inline-flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" />
                                    Mật khẩu
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-neutral-400 text-[10px] inline-flex items-center gap-1">
                                    <Unlock className="w-2.5 h-2.5" />
                                    Mở
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
                                <span>Chủ phòng: {room.host_name || 'Ẩn danh'}</span>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 text-neutral-200">
                                  <Users className="w-3 h-3" />
                                  {room.player_count} người
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {(isMyRoom || isAdmin) && !isCurrentRoom && (
                                <button
                                  type="button"
                                  disabled={closing || busy}
                                  onClick={() => void handleCloseRoom(room)}
                                  title="Đóng phòng cũ"
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 disabled:opacity-60 text-rose-200 text-xs font-medium flex items-center gap-1 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{closing ? 'Đang đóng...' : 'Đóng'}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={busy || closing || isCurrentRoom}
                                onClick={() => {
                                  if (room.has_password && !isAdmin && !isMyRoom) {
                                    setJoinPasswordRoomId(
                                      joinPasswordRoomId === room.room_id ? null : room.room_id
                                    );
                                    setJoinPassword('');
                                    setRoomError('');
                                  } else {
                                    void handleJoinExistingRoom(room);
                                  }
                                }}
                                className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-50 text-black text-xs font-semibold flex items-center gap-1.5 transition"
                              >
                                <span>
                                  {isCurrentRoom
                                    ? 'Phòng hiện tại'
                                    : busy
                                      ? 'Đang vào...'
                                      : isMyRoom
                                        ? 'Vào lại'
                                        : isAdmin && room.has_password
                                          ? 'Vào (Admin)'
                                          : 'Chuyển phòng'}
                                </span>
                                {!isCurrentRoom && <ArrowRight className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {needsPasswordPrompt && (
                            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                              <input
                                type={useMaskedTextPasscode ? 'text' : joinPassword.length > 0 ? 'password' : 'text'}
                                name="hub-join-room-passcode"
                                autoComplete={useMaskedTextPasscode ? 'off' : 'new-password'}
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                data-form-type="other"
                                value={joinPassword}
                                onChange={(e) => setJoinPassword(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !busy) {
                                    e.preventDefault();
                                    void handleJoinExistingRoom(room, joinPassword);
                                  }
                                }}
                                placeholder="Nhập mật khẩu phòng..."
                                className={`flex-1 px-3 py-1.5 rounded-lg bg-neutral-950 border border-white/15 text-base sm:text-xs text-white focus:outline-none focus:border-white/35 select-text ${
                                  useMaskedTextPasscode ? 'room-passcode-mask' : ''
                                }`}
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleJoinExistingRoom(room, joinPassword)}
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold shrink-0"
                              >
                                Xác nhận
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Leave Lobby Notice & Action */}
              <div className="rounded-xl bg-[#181818] border border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-neutral-400 flex-1 min-w-[200px]">
                  Bạn đang ở trong phòng Lobby nên chỉ có thể chuyển sang phòng khác. Muốn tạo phòng
                  mới, hãy rời phòng hiện tại trước.
                </p>
                <button
                  type="button"
                  onClick={handleLeaveCurrentLobby}
                  className="px-3.5 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
                >
                  <DoorOpen className="w-3.5 h-3.5" />
                  <span>Rời phòng Lobby</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
