import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  User,
  UserPlus,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { AdminService, type ActiveRoomInfo, type AdminAccount } from '../network/AdminService';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { isSupabaseConfigured } from '../network/supabaseClient';
import { LOBBY_SCENE_ID } from '../engine/serialization/SceneRegistry';
import {
  AVATAR_COLOR_PRESETS,
  getSavedAvatarColor,
  saveAvatarColor,
} from '../utils/avatarColor';
import { LegalNoticeModal } from './LegalNoticeModal';

export interface EntryLobbyFlowModalProps {
  isOpen: boolean;
  initialStep?: 'identity' | 'room';
  notice?: string | null;
  onDismissNotice?: () => void;
  onEnteredLobby: (roomId: string) => void;
}

type IdentityMode = 'guest' | 'login' | 'register';

function getDefaultGuestName(): string {
  try {
    const saved = localStorage.getItem('cavannghe:guest-name') || localStorage.getItem('cavannghe:player-name');
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore
  }
  return `Khách ${Math.floor(1000 + Math.random() * 9000)}`;
}

export const EntryLobbyFlowModal: React.FC<EntryLobbyFlowModalProps> = ({
  isOpen,
  initialStep,
  notice,
  onDismissNotice,
  onEnteredLobby,
}) => {
  const supabaseReady = isSupabaseConfigured();

  const [account, setAccount] = useState<AdminAccount | null>(() =>
    AdminService.getSavedPlayerAccount()
  );
  const [step, setStep] = useState<'identity' | 'room'>(() => {
    if (initialStep) return initialStep;
    return AdminService.getSavedPlayerAccount() ? 'room' : 'identity';
  });
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);
  const [identityMode, setIdentityMode] = useState<IdentityMode>('guest');
  const [guestName, setGuestName] = useState<string>(() => getDefaultGuestName());
  const [avatarColor, setAvatarColor] = useState<string>(() => getSavedAvatarColor());

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [submittingAuth, setSubmittingAuth] = useState(false);

  const [rooms, setRooms] = useState<ActiveRoomInfo[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [joinPasswordRoomId, setJoinPasswordRoomId] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [roomError, setRoomError] = useState('');
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [closingRoomId, setClosingRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !initialStep) return;
    setStep(initialStep);
  }, [isOpen, initialStep]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void AdminService.getCurrentAdminAccount().then((adminAcc) => {
      if (!active) return;
      if (adminAcc) {
        setAccount(adminAcc);
        AdminService.savePlayerAccount(adminAcc);
        const mp = MultiplayerManager.getInstance();
        mp.setLocalIsAdmin(true);
        mp.setLocalPlayerName(adminAcc.display_name || adminAcc.username);
        if (initialStep !== 'identity') {
          setStep('room');
        }
      } else {
        const saved = AdminService.getSavedPlayerAccount();
        setAccount(saved);
        if (saved && initialStep !== 'identity') {
          setStep('room');
        } else if (!saved && initialStep === 'room') {
          const fallbackGuest = getDefaultGuestName();
          setGuestName(fallbackGuest);
          const mp = MultiplayerManager.getInstance();
          mp.setLocalIsAdmin(false);
          mp.setLocalPlayerName(fallbackGuest);
          setStep('room');
        }
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen, initialStep]);

  const loadRooms = useCallback(async () => {
    if (!supabaseReady) {
      setRooms([]);
      return;
    }
    setLoadingRooms(true);
    const list = await AdminService.fetchActiveRooms();
    setRooms(list);
    setLoadingRooms(false);
  }, [supabaseReady]);

  useEffect(() => {
    if (!isOpen || step !== 'room') return;
    void loadRooms();
  }, [isOpen, step, loadRooms]);

  if (!isOpen) return null;

  const isAdmin = account?.role === 'admin';
  const activePlayerName = account
    ? account.display_name || account.username
    : guestName.trim() || 'Khách Lounge';

  const normalizedRoomQuery = roomSearchQuery.trim().toLowerCase();
  const filteredRooms = normalizedRoomQuery
    ? rooms.filter(
        (r) =>
          r.room_id.toLowerCase().includes(normalizedRoomQuery) ||
          (r.host_name || '').toLowerCase().includes(normalizedRoomQuery)
      )
    : rooms;

  const handleSelectColor = (hex: string) => {
    const clean = saveAvatarColor(hex);
    setAvatarColor(clean);
    MultiplayerManager.getInstance().setLocalAvatarColor(clean);
    window.dispatchEvent(new CustomEvent('cavannghe:avatar-color', { detail: clean }));
    if (account?.id) {
      void AdminService.updatePlayerAvatarColor(account.id, clean);
    }
  };

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

  const handleGuestContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const cleanName = guestName.trim() || `Khách ${Math.floor(1000 + Math.random() * 9000)}`;
    setGuestName(cleanName);
    AdminService.clearPlayerAccount();
    setAccount(null);
    try {
      localStorage.setItem('cavannghe:guest-name', cleanName);
      localStorage.setItem('cavannghe:player-name', cleanName);
    } catch {
      // ignore
    }
    const mp = MultiplayerManager.getInstance();
    mp.setLocalIsAdmin(false);
    mp.setLocalPlayerName(cleanName);
    mp.setLocalAvatarColor(avatarColor);
    setStep('room');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!supabaseReady) {
      setAuthError('Chưa cấu hình Supabase. Hãy chọn Tài khoản Khách để vào Offline.');
      return;
    }
    setSubmittingAuth(true);

    const res =
      identityMode === 'register'
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
      setStep('room');
    }
  };

  const handleSwitchIdentity = async () => {
    if (account) {
      AdminService.clearPlayerAccount();
      if (account.role === 'admin') {
        await AdminService.signOutAdmin();
      }
      setAccount(null);
      MultiplayerManager.getInstance().setLocalIsAdmin(false);
    }
    setRoomError('');
    setStep('identity');
  };

  const handleJoinExistingRoom = async (room: ActiveRoomInfo, pwd = '') => {
    setRoomError('');
    setJoiningRoomId(room.room_id);
    const mp = MultiplayerManager.getInstance();
    mp.setLocalIsAdmin(Boolean(isAdmin));
    mp.setLocalAvatarColor(avatarColor);
    const ok = await mp.joinRoom(room.room_id, activePlayerName, LOBBY_SCENE_ID, {
      password: pwd,
      bypassLimits: Boolean(isAdmin),
    });
    setJoiningRoomId(null);
    if (ok) {
      setJoinPasswordRoomId(null);
      setJoinPassword('');
      onEnteredLobby(room.room_id);
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

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoomError('');

    if (!supabaseReady) {
      onEnteredLobby('offline-lobby');
      return;
    }

    const rawSlug = newRoomName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const roomId = rawSlug || `lobby-${Math.random().toString(36).slice(2, 6)}`;

    setJoiningRoomId('__new__');
    const myDisplayLower = activePlayerName.trim().toLowerCase();
    const latestRooms = await AdminService.fetchActiveRooms();
    const existing = latestRooms.find((r) => r.room_id === roomId);
    if (existing) {
      const ownedByMe =
        Boolean(existing.host_name && existing.host_name.trim().toLowerCase() === myDisplayLower) ||
        Boolean(isAdmin);
      if (!ownedByMe) {
        setJoiningRoomId(null);
        setRoomError(
          `Phòng "${roomId}" đang có người khác làm chủ. Hãy chọn tên khác hoặc vào phòng ở danh sách trên.`
        );
        return;
      }
      await AdminService.closeOwnedRoom(
        roomId,
        existing.host_name || activePlayerName,
        existing.scene_id || LOBBY_SCENE_ID
      );
    }

    const mp = MultiplayerManager.getInstance();
    mp.setLocalIsAdmin(Boolean(isAdmin));
    mp.setLocalAvatarColor(avatarColor);
    const ok = await mp.joinRoom(roomId, activePlayerName, LOBBY_SCENE_ID, {
      password: newRoomPassword.trim(),
      bypassLimits: Boolean(isAdmin),
    });
    setJoiningRoomId(null);
    if (ok) {
      setNewRoomName('');
      setNewRoomPassword('');
      onEnteredLobby(roomId);
    } else {
      setRoomError(mp.getLastJoinError() || 'Không thể tạo phòng Lobby mới.');
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-5 bg-[#080a0f]/90 backdrop-blur-md select-none">
      <div className="w-full max-w-2xl max-h-[92dvh] rounded-2xl bg-[#121212] border border-white/10 shadow-2xl overflow-hidden flex flex-col text-neutral-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-white">Ca Văn Nghệ</h1>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-medium text-neutral-300">
                {step === 'identity' ? 'Bước 1/2: Người chơi' : 'Bước 2/2: Phòng Lobby'}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              {step === 'identity'
                ? 'Chọn chơi bằng Tài khoản Khách hoặc Đăng nhập trước khi vào Sảnh'
                : 'Chọn phòng Lobby đang mở hoặc tạo phòng Lobby mới để làm Chủ phòng'}
            </p>
          </div>

          {step === 'room' && (
            <button
              type="button"
              onClick={() => void handleSwitchIdentity()}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-neutral-300 hover:text-white flex items-center gap-1.5 transition shrink-0"
              title="Đổi tài khoản hoặc chuyển sang Khách"
            >
              {account ? <LogOut className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
              <span>{account ? 'Đăng xuất' : 'Đổi tên / Tài khoản'}</span>
            </button>
          )}
        </div>

        {/* Kick/Ban Notice */}
        {notice && (
          <div className="mx-5 mt-4 px-3.5 py-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-100 text-xs flex items-center justify-between gap-3">
            <span>{notice}</span>
            {onDismissNotice && (
              <button
                type="button"
                onClick={onDismissNotice}
                className="text-rose-300 hover:text-white font-bold px-1"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {step === 'identity' ? (
            <div className="space-y-5">
              {/* Identity Mode Switcher */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#181818] border border-white/10">
                {[
                  { id: 'guest' as const, label: 'Tài khoản Khách', icon: User },
                  { id: 'login' as const, label: 'Đăng nhập', icon: KeyRound },
                  { id: 'register' as const, label: 'Tạo tài khoản', icon: UserPlus },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = identityMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setIdentityMode(tab.id);
                        setAuthError('');
                      }}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        active ? 'bg-white text-black' : 'text-neutral-300 hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {identityMode === 'guest' ? (
                <form onSubmit={handleGuestContinue} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-2.5 text-xs text-neutral-300">
                    <Sparkles className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <span>
                      Không cần đăng ký tài khoản. Bạn vẫn có đầy đủ quyền tạo phòng Lobby, làm Chủ phòng,
                      vào Rạp Chiếu Phim, hát Karaoke và trò chuyện cùng mọi người.
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs text-neutral-400">Tên hiển thị của bạn</label>
                    <input
                      type="text"
                      maxLength={24}
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Nhập tên hiển thị..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
                    />
                  </div>

                  {/* Avatar Color Picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-neutral-400">Màu trang phục nhân vật</label>
                      <input
                        type="color"
                        value={avatarColor}
                        onChange={(e) => handleSelectColor(e.target.value)}
                        className="w-8 h-6 rounded bg-transparent border border-white/20 cursor-pointer"
                        title="Chọn màu tự do"
                      />
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                      {AVATAR_COLOR_PRESETS.map((preset) => {
                        const selected = avatarColor.toLowerCase() === preset.hex.toLowerCase();
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleSelectColor(preset.hex)}
                            title={preset.label}
                            className={`h-8 rounded-lg border flex items-center justify-center transition ${
                              selected
                                ? 'border-white ring-2 ring-white/40 scale-105'
                                : 'border-white/15 hover:border-white/40'
                            }`}
                            style={{ backgroundColor: preset.hex }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black text-sm font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <span>Tiếp tục vào chọn phòng Lobby</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs text-neutral-400">Tên đăng nhập (a-z, 0-9, _)</label>
                      <input
                        type="text"
                        required
                        minLength={3}
                        maxLength={24}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="vd: minh_tuan"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
                      />
                    </div>

                    {identityMode === 'register' && (
                      <div className="space-y-1">
                        <label className="text-xs text-neutral-400">Tên hiển thị trong game</label>
                        <input
                          type="text"
                          maxLength={24}
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="vd: Minh Tuấn"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs text-neutral-400">Mật khẩu</label>
                      <input
                        type="password"
                        required
                        minLength={4}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Tối thiểu 4 ký tự..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
                      />
                    </div>
                  </div>

                  {authError && (
                    <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                      {authError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submittingAuth}
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-60 text-black text-sm font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <span>
                      {submittingAuth
                        ? 'Đang xử lý...'
                        : identityMode === 'register'
                          ? 'Đăng ký & Chọn phòng Lobby'
                          : 'Đăng nhập & Chọn phòng Lobby'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Step 2: Choose or Create Lobby Room */
            <div className="space-y-5">
              {/* Current Player Identity Strip */}
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#181818] border border-white/10">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-4 h-4 rounded-full border border-white/30 shrink-0"
                    style={{ backgroundColor: avatarColor }}
                  />
                  <div className="min-w-0 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isAdmin && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[9px] font-bold uppercase inline-flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          ADMIN
                        </span>
                      )}
                      <span className="font-semibold text-white truncate">{activePlayerName}</span>
                      {account ? (
                        <span className="font-mono text-neutral-400">(@{account.username})</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 text-[10px]">
                          Khách
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-neutral-400 shrink-0">
                  Sảnh + Rạp Phim + Phòng Trà
                </span>
              </div>

              {!supabaseReady ? (
                <div className="rounded-xl bg-[#181818] border border-white/10 p-5 text-center space-y-3">
                  <WifiOff className="w-6 h-6 text-neutral-400 mx-auto" />
                  <p className="text-xs text-neutral-300">
                    Chưa cấu hình Supabase Realtime. Bạn có thể vào Sảnh ở chế độ chơi đơn Offline.
                  </p>
                  <button
                    type="button"
                    onClick={() => onEnteredLobby('offline-lobby')}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold inline-flex items-center gap-1.5 transition"
                  >
                    <span>Vào Sảnh (Offline)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  {/* Active Lobby Rooms List */}
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
                        type="text"
                        value={roomSearchQuery}
                        onChange={(e) => setRoomSearchQuery(e.target.value)}
                        placeholder="Tìm kiếm mã phòng hoặc tên chủ phòng..."
                        className="w-full pl-9 pr-8 py-2 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
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
                        Chưa có phòng Lobby nào đang hoạt động. Hãy tạo phòng mới bên dưới để làm Chủ phòng!
                      </div>
                    ) : filteredRooms.length === 0 ? (
                      <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-white/10 rounded-xl bg-[#181818]">
                        Không tìm thấy phòng nào khớp với &ldquo;{roomSearchQuery.trim()}&rdquo;.
                      </div>
                    ) : (
                      <div className="max-h-52 sm:max-h-60 overflow-y-auto overscroll-contain pr-1 space-y-2">
                        {filteredRooms.map((room) => {
                          const myDisplayLower = activePlayerName.trim().toLowerCase();
                          const isMyRoom = Boolean(
                            room.host_name && room.host_name.trim().toLowerCase() === myDisplayLower
                          );
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
                                  {(isMyRoom || isAdmin) && (
                                    <button
                                      type="button"
                                      disabled={closing || busy}
                                      onClick={() => void handleCloseRoom(room)}
                                      title="Đóng phòng cũ để tạo lại"
                                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 disabled:opacity-60 text-rose-200 text-xs font-medium flex items-center gap-1 transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>{closing ? 'Đang đóng...' : 'Đóng'}</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    disabled={busy || closing}
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
                                    className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-black text-xs font-semibold flex items-center gap-1.5 transition"
                                  >
                                    <span>
                                      {busy
                                        ? 'Đang vào...'
                                        : isMyRoom
                                          ? 'Vào lại'
                                          : isAdmin && room.has_password
                                            ? 'Vào (Admin)'
                                            : 'Vào Sảnh'}
                                    </span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {needsPasswordPrompt && (
                                <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                                  <input
                                    type="password"
                                    value={joinPassword}
                                    onChange={(e) => setJoinPassword(e.target.value)}
                                    placeholder="Nhập mật khẩu phòng..."
                                    className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-950 border border-white/15 text-base sm:text-xs text-white focus:outline-none focus:border-white/35"
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

                  {/* Create New Lobby Room */}
                  <form
                    onSubmit={(e) => void handleCreateRoom(e)}
                    className="rounded-xl bg-[#181818] border border-white/10 p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tạo phòng Lobby mới</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        maxLength={24}
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="Tên phòng (vd: phong-cua-toi)"
                        className="px-3 py-2 rounded-lg bg-neutral-950 border border-white/10 text-base sm:text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
                      />
                      <input
                        type="password"
                        maxLength={32}
                        value={newRoomPassword}
                        onChange={(e) => setNewRoomPassword(e.target.value)}
                        placeholder="Mật khẩu phòng (tùy chọn)"
                        className="px-3 py-2 rounded-lg bg-neutral-950 border border-white/10 text-base sm:text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-neutral-400">
                        Bao gồm Sảnh Chờ, Rạp Chiếu Phim và Phòng Trà
                      </span>
                      <button
                        type="submit"
                        disabled={joiningRoomId === '__new__'}
                        className="px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-black text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {joiningRoomId === '__new__' ? 'Đang tạo...' : 'Tạo phòng & Vào Sảnh'}
                        </span>
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          )}

          {/* Legal & YouTube API Services Compliance Footer */}
          <div className="px-6 py-3 border-t border-white/10 bg-[#0d0d0d] text-[11px] text-neutral-400 text-center leading-relaxed">
            Sử dụng{' '}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-200 underline hover:text-white"
            >
              YouTube Terms of Service
            </a>{' '}
            &amp;{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-200 underline hover:text-white"
            >
              Google Privacy Policy
            </a>{' '}
            (YouTube API Services).{' '}
            <button
              type="button"
              onClick={() => setLegalTab('terms')}
              className="text-amber-300 underline hover:text-amber-200"
            >
              Điều khoản sử dụng
            </button>{' '}
            •{' '}
            <button
              type="button"
              onClick={() => setLegalTab('privacy')}
              className="text-amber-300 underline hover:text-amber-200"
            >
              Chính sách bảo mật
            </button>
          </div>
        </div>
      </div>

      <LegalNoticeModal
        tab={legalTab}
        onClose={() => setLegalTab(null)}
        onSwitchTab={(t) => setLegalTab(t)}
      />
    </div>
  );
};
