import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Crown,
  DoorOpen,
  Gamepad2,
  Gauge,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  Radio,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Sliders,
  Terminal,
  Unlock,
  UserCheck,
  UserX,
  Users,
  Wrench,
} from 'lucide-react';
import { AdminAnalyticsPanel } from './components/AdminAnalyticsPanel';
import {
  AdminService,
  type ActiveRoomInfo,
  type AdminAccount,
  type BannedPlayerInfo,
  type RoomPlayerInfo,
} from '../network/AdminService';

export const AdminDashboard: React.FC = () => {
  const [adminTab, setAdminTab] = useState<'ops' | 'analytics'>('ops');
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AdminAccount | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [submittingAuth, setSubmittingAuth] = useState(false);

  const [maxTotalPlayers, setMaxTotalPlayers] = useState(50);
  const [maxPlayersPerRoom, setMaxPlayersPerRoom] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  const [announcementText, setAnnouncementText] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [announcementMsg, setAnnouncementMsg] = useState('');

  const [rooms, setRooms] = useState<ActiveRoomInfo[]>([]);
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayerInfo[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<BannedPlayerInfo[]>([]);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [moderationMsg, setModerationMsg] = useState('');
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setRefreshing(true);
    const [settings, activeRooms, playersList, bansList, accList] = await Promise.all([
      AdminService.fetchAppSettings(),
      AdminService.fetchActiveRooms(),
      AdminService.fetchRoomPlayers(),
      AdminService.fetchBannedPlayers(),
      AdminService.fetchAccounts(),
    ]);
    setMaxTotalPlayers(settings.max_total_players);
    setMaxPlayersPerRoom(settings.max_players_per_room);
    setRooms(activeRooms);
    setRoomPlayers(playersList);
    setBannedPlayers(bansList);
    setAccounts(accList);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const current = await AdminService.getCurrentAdminAccount();
      if (!active) return;
      setAccount(current);
      if (current) {
        await loadDashboardData();
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadDashboardData]);

  useEffect(() => {
    if (!account) return;
    const timer = window.setInterval(() => {
      void loadDashboardData();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [account, loadDashboardData]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setSubmittingAuth(true);

    const res = await AdminService.signInAdmin(identifier, password);

    setSubmittingAuth(false);
    if (res.error) {
      setAuthError(res.error);
      return;
    }
    if (res.account) {
      setAccount(res.account);
      await loadDashboardData();
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setSavingSettings(true);
    setSettingsMsg('');
    const res = await AdminService.updateAppSettings(
      maxTotalPlayers,
      maxPlayersPerRoom,
      account.id
    );
    setSavingSettings(false);
    setSettingsMsg(res.ok ? 'Đã lưu thiết lập lên Supabase.' : res.error || 'Lỗi khi lưu.');
  };

  const handleSignOut = async () => {
    await AdminService.signOutAdmin();
    setAccount(null);
  };

  const handleModeratePlayer = async (
    action: 'kick' | 'ban',
    player: RoomPlayerInfo
  ) => {
    if (!account) return;
    setModerationMsg('');
    const res = await AdminService.kickOrBanPlayer({
      action,
      roomId: player.room_id,
      sceneId: player.scene_id,
      playerId: player.player_id,
      playerName: player.player_name,
      deviceId: player.device_id,
      isHost: player.is_host,
      adminAccountId: account.id,
    });
    if (res.ok) {
      setModerationMsg(
        player.is_host
          ? `Đã ${action === 'ban' ? 'Ban' : 'đá'} chủ phòng "${player.player_name}" và giải tán phòng ${player.room_id}.`
          : action === 'ban'
            ? `Đã Ban "${player.player_name}" khỏi phòng ${player.room_id}.`
            : `Đã đá "${player.player_name}" khỏi phòng ${player.room_id}.`
      );
      await loadDashboardData();
    } else {
      setModerationMsg(res.error || 'Thao tác thất bại.');
    }
  };

  const handleUnban = async (banId: string) => {
    const res = await AdminService.unbanPlayer(banId);
    if (res.ok) {
      await loadDashboardData();
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setSendingAnnouncement(true);
    setAnnouncementMsg('');
    const res = await AdminService.sendServerAnnouncement(
      announcementText,
      account.display_name || account.username
    );
    setSendingAnnouncement(false);
    if (res.ok) {
      setAnnouncementText('');
      setAnnouncementMsg('Đã gửi thông báo tới tất cả các phòng!');
    } else {
      setAnnouncementMsg(res.error || 'Gửi thông báo thất bại.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0d12] text-neutral-300 flex items-center justify-center gap-2.5 text-sm">
        <Terminal className="w-4 h-4 text-neutral-400 animate-pulse" />
        <span>Đang kiểm tra phiên Admin...</span>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-[#0b0d12] text-white flex items-center justify-center p-4">
        <form
          onSubmit={(e) => void handleAuthSubmit(e)}
          className="w-full max-w-md rounded-2xl bg-[#12151c] border border-white/[0.08] p-7 space-y-5 shadow-2xl"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-white shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white">Ca Văn Nghệ</h1>
                <span className="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/15 text-neutral-200 text-[10px] font-bold tracking-wider uppercase">
                  Admin Console
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Chỉ tài khoản Admin được cấp sẵn mới truy cập được trang này
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Username hoặc Email</label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="admin hoặc email..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d12] border border-white/[0.08] text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d12] border border-white/[0.08] text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30 transition"
            />
          </div>

          {authError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={submittingAuth}
            className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-60 text-neutral-950 text-sm font-semibold flex items-center justify-center gap-2 transition"
          >
            <KeyRound className="w-4 h-4" />
            <span>{submittingAuth ? 'Đang đăng nhập...' : 'Đăng nhập Admin'}</span>
          </button>

          <div className="pt-1 text-center">
            <a href="/" className="text-xs text-neutral-400 hover:text-white transition">
              ← Quay lại trang game
            </a>
          </div>
        </form>
      </div>
    );
  }

  const totalOnline = rooms.reduce((sum, r) => sum + r.player_count, 0);
  const onlinePercent = Math.min(100, Math.round((totalOnline / Math.max(1, maxTotalPlayers)) * 100));

  return (
    <div className="h-screen overflow-y-auto bg-[#0b0d12] text-neutral-100">
      {/* Full-Width Sticky Command Header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#0f1218]/90 backdrop-blur-md px-5 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-white shrink-0">
            <Terminal className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight">
                Ca Văn Nghệ
              </h1>
              <span className="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/15 text-neutral-200 text-[10px] font-bold tracking-wider uppercase flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Control Center
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
              <span className="inline-flex items-center gap-1.5 text-neutral-300 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Trực tuyến
              </span>
              <span className="text-neutral-600">•</span>
              <span className="truncate text-neutral-300">
                {account.display_name}{' '}
                <span className="text-neutral-500 font-mono">(@{account.username})</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg bg-white/[0.04] border border-white/[0.08] p-0.5 mr-1">
            <button
              type="button"
              onClick={() => setAdminTab('ops')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                adminTab === 'ops'
                  ? 'bg-white text-neutral-950'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              Vận hành
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('analytics')}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                adminTab === 'analytics'
                  ? 'bg-white text-neutral-950'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboardData()}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs text-neutral-200 flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-neutral-300 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
          <a
            href="/editor"
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs text-neutral-200 flex items-center gap-1.5 transition"
          >
            <Wrench className="w-3.5 h-3.5 text-neutral-300" />
            <span>Map Editor</span>
          </a>
          <a
            href="/?admin=1"
            className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-neutral-950 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Vào Game (Admin)</span>
          </a>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-neutral-300 hover:text-white transition"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Edge-to-Edge Main Workspace */}
      <main className="w-full px-5 lg:px-8 py-6 space-y-6">
        {adminTab === 'analytics' ? (
          <AdminAnalyticsPanel accountId={account.id} />
        ) : (
          <>
        {/* Row 1: 4-Column KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-neutral-400">Phòng đang hoạt động</div>
              <div className="text-2xl font-bold text-white mt-1.5 tabular-nums">{rooms.length}</div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 shrink-0">
              <DoorOpen className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-4 flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-neutral-400">Người chơi online</div>
                <div className="text-2xl font-bold text-white mt-1.5 tabular-nums">
                  {totalOnline}{' '}
                  <span className="text-sm font-normal text-neutral-400">/ {maxTotalPlayers}</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 shrink-0">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-white/80 transition-all duration-300"
                style={{ width: `${onlinePercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-neutral-400">Giới hạn mỗi phòng</div>
              <div className="text-2xl font-bold text-white mt-1.5 tabular-nums">
                {maxPlayersPerRoom}{' '}
                <span className="text-sm font-normal text-neutral-400">người</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 shrink-0">
              <Gauge className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-neutral-400">Thiết bị đang bị Ban</div>
              <div className="text-2xl font-bold text-white mt-1.5 tabular-nums">
                {bannedPlayers.length}
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Row 2: 12-Column Asymmetric Bento Workspace */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Primary Column (8/12): Rooms & Banned Devices */}
          <div className="xl:col-span-8 space-y-6">
            {/* Active Rooms List */}
            <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-white">Danh sách phòng hiện có</h2>
                      <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-neutral-300">
                        {rooms.length}
                      </span>
                    </div>
                  </div>
                  {moderationMsg && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/15 text-xs text-neutral-200">
                      {moderationMsg}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void loadDashboardData()}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs text-neutral-300 flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {rooms.length === 0 ? (
                <div className="py-12 text-center text-xs text-neutral-500 border border-dashed border-white/[0.08] rounded-xl bg-[#0e1117]">
                  Hiện chưa có phòng nào đang hoạt động.
                </div>
              ) : (
                <div className="space-y-3">
                  {rooms.map((room) => {
                    const playersInRoom = roomPlayers.filter((p) => p.room_id === room.room_id);
                    const isExpanded = expandedRoomId === room.room_id;
                    return (
                      <div
                        key={room.room_id}
                        className="rounded-xl bg-[#0e1117] border border-white/[0.08] overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-white font-mono">
                                {room.room_id}
                              </span>
                              {room.has_password ? (
                                <span className="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/15 text-neutral-200 text-[10px] font-medium flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  Có mật khẩu
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-neutral-400 text-[10px] font-medium flex items-center gap-1">
                                  <Unlock className="w-2.5 h-2.5" />
                                  Mở
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-neutral-400 flex items-center gap-2 flex-wrap">
                              <span>
                                Chủ phòng:{' '}
                                <span className="text-neutral-200 font-medium">
                                  {room.host_name || 'Ẩn danh'}
                                </span>
                              </span>
                              <span className="text-neutral-600">•</span>
                              <span>
                                Khu vực:{' '}
                                <span className="text-neutral-300 font-mono">{room.scene_id}</span>
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono text-neutral-200 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                              {room.player_count} / {maxPlayersPerRoom}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRoomId(isExpanded ? null : room.room_id)
                              }
                              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition"
                            >
                              <span>Chi tiết ({playersInRoom.length})</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <a
                              href={`/?room=${encodeURIComponent(room.room_id)}&admin=1`}
                              className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-neutral-950 text-xs font-semibold flex items-center gap-1.5 transition"
                            >
                              <span>Vào nhanh (Không cần Pass)</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-white/[0.08] bg-[#090b10] p-3.5 space-y-2">
                            {playersInRoom.length === 0 ? (
                              <p className="text-xs text-neutral-500 py-2 text-center">
                                Chưa có dữ liệu chi tiết người chơi trong phòng này.
                              </p>
                            ) : (
                              playersInRoom.map((p) => (
                                <div
                                  key={p.player_id}
                                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-[#12151c] border border-white/[0.06] text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                    {p.is_admin && (
                                      <span className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/20 text-white text-[10px] font-bold uppercase inline-flex items-center gap-1">
                                        <BadgeCheck className="w-3 h-3" />
                                        ADMIN
                                      </span>
                                    )}
                                    {p.is_host && (
                                      <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-neutral-200 text-[10px] font-medium"
                                        title="Chủ phòng"
                                      >
                                        <Crown className="w-3 h-3 shrink-0" />
                                        Chủ phòng
                                      </span>
                                    )}
                                    <span className="font-medium text-white truncate">
                                      {p.player_name}
                                    </span>
                                    <span className="text-[11px] font-mono text-neutral-500">
                                      ({p.player_id})
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-white/[0.04] text-[11px] font-mono text-neutral-400">
                                      {p.scene_id}
                                    </span>
                                  </div>

                                  {!p.is_admin && (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => void handleModeratePlayer('kick', p)}
                                        className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-neutral-200 text-[11px] flex items-center gap-1 transition"
                                      >
                                        <UserX className="w-3 h-3" />
                                        <span>Đá</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleModeratePlayer('ban', p)}
                                        className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-rose-500/20 border border-white/[0.08] hover:border-rose-500/35 text-neutral-200 hover:text-rose-200 text-[11px] flex items-center gap-1 transition"
                                      >
                                        <Ban className="w-3 h-3" />
                                        <span>Ban</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Banned Players */}
            {bannedPlayers.length > 0 && (
              <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300">
                      <Ban className="w-4 h-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-white">
                      Danh sách người chơi bị Ban
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-neutral-300">
                      {bannedPlayers.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {bannedPlayers.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#0e1117] border border-white/[0.08] text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">{b.player_name}</span>
                          <span className="text-neutral-400 font-mono text-[11px]">
                            Phòng: {b.room_id}
                            {b.device_id ? ` • Device: ${b.device_id.slice(0, 8)}…` : ''}
                          </span>
                        </div>
                        <div className="text-neutral-500 text-[11px]">{b.reason}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleUnban(b.id)}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-neutral-200 flex items-center gap-1.5 transition shrink-0"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-neutral-300" />
                        <span>Gỡ Ban</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Control Sidebar (4/12): Announcements, Limits, Admin Accounts */}
          <aside className="xl:col-span-4 space-y-6">
            {/* Server-wide Announcement */}
            <form
              onSubmit={(e) => void handleSendAnnouncement(e)}
              className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-5 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-white">Thông báo toàn Server</h2>
                </div>
              </div>

              <textarea
                rows={3}
                maxLength={240}
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                placeholder="Nhập thông báo gửi tới tất cả các phòng hiện có..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b0d12] border border-white/[0.08] text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30 resize-none transition"
              />

              {announcementMsg && (
                <p className="text-xs text-neutral-200 bg-white/[0.06] border border-white/15 rounded-lg px-3 py-1.5">
                  {announcementMsg}
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-mono text-neutral-500">
                  {announcementText.length}/240
                </span>
                <button
                  type="submit"
                  disabled={sendingAnnouncement || !announcementText.trim()}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-50 text-neutral-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingAnnouncement ? 'Đang gửi...' : 'Gửi thông báo'}</span>
                </button>
              </div>
            </form>

            {/* Settings Form */}
            <form
              onSubmit={(e) => void handleSaveSettings(e)}
              className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-white">Thiết lập giới hạn</h2>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-neutral-400">
                    Tối đa toàn server
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={maxTotalPlayers}
                    onChange={(e) => setMaxTotalPlayers(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0b0d12] border border-white/[0.08] text-sm text-white font-mono focus:outline-none focus:border-white/30 transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] text-neutral-400">
                    Tối đa mỗi phòng
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={maxPlayersPerRoom}
                    onChange={(e) => setMaxPlayersPerRoom(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0b0d12] border border-white/[0.08] text-sm text-white font-mono focus:outline-none focus:border-white/30 transition"
                  />
                </div>
              </div>

              {settingsMsg && (
                <p className="text-xs text-neutral-200 bg-white/[0.06] border border-white/15 rounded-lg px-3 py-1.5">
                  {settingsMsg}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-60 text-neutral-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingSettings ? 'Đang lưu...' : 'Lưu thiết lập'}</span>
                </button>
              </div>
            </form>

            {/* Admin Accounts List */}
            <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-white">Tài khoản quản trị</h2>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-neutral-300">
                  {accounts.length}
                </span>
              </div>

              <div className="space-y-2">
                {accounts.map((acc) => {
                  const initial = (acc.display_name || acc.username || 'A').charAt(0).toUpperCase();
                  return (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#0e1117] border border-white/[0.06] text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.07] border border-white/15 text-neutral-200 font-bold flex items-center justify-center shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{acc.display_name}</div>
                          <div className="text-[11px] font-mono text-neutral-500 truncate">
                            @{acc.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-neutral-300 text-[10px] font-bold uppercase">
                          {acc.role}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] ${
                            acc.is_active ? 'text-neutral-300' : 'text-neutral-500'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              acc.is_active ? 'bg-emerald-400' : 'bg-neutral-500'
                            }`}
                          />
                          {acc.is_active ? 'Hoạt động' : 'Tạm khóa'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </section>
          </>
        )}
      </main>
    </div>
  );
};
