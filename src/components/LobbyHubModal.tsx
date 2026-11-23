import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Film,
  KeyRound,
  Lock,
  LogOut,
  Mic,
  Palette,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AdminService, type ActiveRoomInfo, type AdminAccount } from '../network/AdminService';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { CINEMA_SCENE_ID, TEAROOM_SCENE_ID } from '../engine/serialization/SceneRegistry';
import {
  AVATAR_COLOR_PRESETS,
  getSavedAvatarColor,
  saveAvatarColor,
} from '../utils/avatarColor';

export type LobbyHubTab = 'cinema' | 'tearoom' | 'avatar';

interface LobbyHubModalProps {
  isOpen: boolean;
  initialTab: LobbyHubTab;
  onClose: () => void;
  onEnterModeRoom: (sceneId: string) => void;
}

export const LobbyHubModal: React.FC<LobbyHubModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  onEnterModeRoom,
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

  const [rooms, setRooms] = useState<ActiveRoomInfo[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [joinPasswordRoomId, setJoinPasswordRoomId] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [roomError, setRoomError] = useState('');
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

  const [avatarColor, setAvatarColor] = useState<string>(() => getSavedAvatarColor());

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

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
        const saved = AdminService.getSavedPlayerAccount();
        setAccount(saved);
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    const list = await AdminService.fetchActiveRooms();
    setRooms(list);
    setLoadingRooms(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadRooms();
  }, [isOpen, activeTab, loadRooms]);

  if (!isOpen) return null;

  const targetSceneId = activeTab === 'cinema' ? CINEMA_SCENE_ID : TEAROOM_SCENE_ID;
  const filteredRooms = rooms.filter((r) => r.scene_id === targetSceneId);
  const isAdmin = account?.role === 'admin';

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

  const handleSignOutAccount = async () => {
    AdminService.clearPlayerAccount();
    if (account?.role === 'admin') {
      await AdminService.signOutAdmin();
    }
    setAccount(null);
    MultiplayerManager.getInstance().setLocalIsAdmin(false);
    MultiplayerManager.getInstance().setLocalPlayerName(
      localStorage.getItem('cavannghe:player-name') || 'Khách Lounge'
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

  const handleJoinExistingRoom = async (room: ActiveRoomInfo, pwd = '') => {
    if (!account) return;
    setRoomError('');
    setJoiningRoomId(room.room_id);
    const mp = MultiplayerManager.getInstance();
    mp.setLocalIsAdmin(account.role === 'admin');
    const ok = await mp.joinRoom(
      room.room_id,
      account.display_name || account.username,
      targetSceneId,
      {
        password: pwd,
        bypassLimits: account.role === 'admin',
      }
    );
    setJoiningRoomId(null);
    if (ok) {
      setJoinPasswordRoomId(null);
      setJoinPassword('');
      onEnterModeRoom(targetSceneId);
    } else {
      setRoomError(mp.getLastJoinError() || 'Không thể tham gia phòng.');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setRoomError('');
    const prefix = activeTab === 'cinema' ? 'cinema' : 'karaoke';
    const rawSlug = newRoomName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const roomId = rawSlug
      ? rawSlug.startsWith(prefix)
        ? rawSlug
        : `${prefix}-${rawSlug}`
      : `${prefix}-${Math.random().toString(36).slice(2, 6)}`;

    setJoiningRoomId('__new__');
    const mp = MultiplayerManager.getInstance();
    mp.setLocalIsAdmin(account.role === 'admin');
    const ok = await mp.joinRoom(
      roomId,
      account.display_name || account.username,
      targetSceneId,
      {
        password: newRoomPassword.trim(),
        bypassLimits: account.role === 'admin',
      }
    );
    setJoiningRoomId(null);
    if (ok) {
      setNewRoomName('');
      setNewRoomPassword('');
      onEnterModeRoom(targetSceneId);
    } else {
      setRoomError(mp.getLastJoinError() || 'Không thể tạo phòng mới.');
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm select-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl max-h-[90dvh] rounded-2xl bg-[#121212] border border-white/10 shadow-2xl overflow-hidden flex flex-col text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-white">
              Quầy Chọn Phòng & Nhân Vật
            </h2>
            {account ? (
              <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-0.5 truncate">
                {isAdmin && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[9px] font-bold uppercase inline-flex items-center gap-1">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    ADMIN
                  </span>
                )}
                <span className="text-neutral-200 font-medium">{account.display_name}</span>
                <span className="font-mono text-neutral-500">(@{account.username})</span>
              </p>
            ) : (
              <p className="text-xs text-neutral-400 mt-0.5">
                Đang tham quan Sảnh Chờ — Đăng nhập để tạo hoặc vào phòng chơi
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {account && (
              <button
                type="button"
                onClick={() => void handleSignOutAccount()}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-neutral-300 hover:text-white flex items-center gap-1 transition"
                title="Đăng xuất tài khoản"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3 Mode / Avatar Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-2.5 border-b border-white/10 bg-[#0d0d0d]">
          {[
            { id: 'cinema' as const, label: 'Rạp Chiếu Phim', icon: Film },
            { id: 'tearoom' as const, label: 'Phòng Trà Karaoke', icon: Mic },
            { id: 'avatar' as const, label: 'Đổi Màu Nhân Vật', icon: Palette },
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
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Chọn màu trang phục nhân vật</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Thay đổi hiển thị ngay lập tức cho bạn và tất cả mọi người trong sảnh.
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
          ) : !account ? (
            /* Auth Gate before joining or creating mode rooms */
            <form onSubmit={(e) => void handleAuthSubmit(e)} className="max-w-sm mx-auto space-y-4 py-2">
              <div className="flex rounded-xl bg-[#181818] border border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    authMode === 'login' ? 'bg-white text-black' : 'text-neutral-300'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Đăng nhập</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError('');
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    authMode === 'register' ? 'bg-white text-black' : 'text-neutral-300'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Tạo tài khoản</span>
                </button>
              </div>

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

                {authMode === 'register' && (
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
                className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-60 text-black text-sm font-semibold transition"
              >
                {submittingAuth
                  ? 'Đang xử lý...'
                  : authMode === 'register'
                    ? 'Đăng ký & Vào chọn phòng'
                    : 'Đăng nhập & Vào chọn phòng'}
              </button>
            </form>
          ) : (
            /* Mode-Filtered Active Rooms + Create Room */
            <div className="space-y-5">
              {/* Active Rooms List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Phòng {activeTab === 'cinema' ? 'Rạp Chiếu Phim' : 'Phòng Trà Karaoke'} đang mở ({filteredRooms.length})
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

                {roomError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                    {roomError}
                  </p>
                )}

                {filteredRooms.length === 0 ? (
                  <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-white/10 rounded-xl bg-[#181818]">
                    Chưa có phòng nào đang hoạt động ở chế độ này. Hãy tạo phòng mới bên dưới!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredRooms.map((room) => {
                      const needsPasswordPrompt =
                        room.has_password && !isAdmin && joinPasswordRoomId === room.room_id;
                      const busy = joiningRoomId === room.room_id;
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

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (room.has_password && !isAdmin) {
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
                              <span>{busy ? 'Đang vào...' : isAdmin && room.has_password ? 'Vào (Admin)' : 'Vào phòng'}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
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

              {/* Create New Mode Room */}
              <form
                onSubmit={(e) => void handleCreateRoom(e)}
                className="rounded-xl bg-[#181818] border border-white/10 p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    Tạo phòng {activeTab === 'cinema' ? 'Rạp Chiếu Phim' : 'Phòng Trà Karaoke'} mới
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    maxLength={24}
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder={
                      activeTab === 'cinema' ? 'Tên phòng (vd: rap-1)' : 'Tên phòng (vd: hat-1)'
                    }
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

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={joiningRoomId === '__new__'}
                    className="px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-60 text-black text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {joiningRoomId === '__new__'
                        ? 'Đang tạo...'
                        : 'Tạo phòng & Làm chủ phòng'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
