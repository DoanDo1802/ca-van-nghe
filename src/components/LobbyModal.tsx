import React, { useEffect, useState } from 'react';
import { Users, ArrowRight, WifiOff, Lock, ShieldCheck } from 'lucide-react';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { AdminService } from '../network/AdminService';
import { isSupabaseConfigured } from '../network/supabaseClient';

interface LobbyModalProps {
  onJoined: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({ onJoined }) => {
  const params = new URLSearchParams(window.location.search);
  const initialRoom = params.get('room') || 'ca-van-nghe-1';
  const wantsAdminJoin = params.get('admin') === '1';

  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('cavannghe:player-name') || 'Khách Lounge'
  );
  const [roomId, setRoomId] = useState(initialRoom);
  const [roomPassword, setRoomPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(() => MultiplayerManager.getInstance().getLastJoinError());

  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    let active = true;
    void AdminService.getCurrentAdminAccount().then(async (acc) => {
      if (!active || !acc) return;
      setIsAdmin(true);
      const mp = MultiplayerManager.getInstance();
      mp.setLocalIsAdmin(true);
      const adminName = acc.display_name || acc.username || 'Admin';
      setPlayerName(adminName);

      if (wantsAdminJoin && initialRoom) {
        setJoining(true);
        const ok = await mp.joinRoom(initialRoom, adminName, undefined, {
          bypassLimits: true,
        });
        if (!active) return;
        setJoining(false);
        if (ok) {
          onJoined();
        } else {
          setError(mp.getLastJoinError() || 'Không thể vào phòng.');
        }
      }
    });
    return () => {
      active = false;
    };
  }, [initialRoom, wantsAdminJoin, onJoined]);

  const handleJoinOnline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseReady) {
      onJoined();
      return;
    }

    const cleanName = playerName.trim() || 'Khách Lounge';
    const cleanRoom = roomId.trim() || 'ca-van-nghe-1';
    localStorage.setItem('cavannghe:player-name', cleanName);

    setJoining(true);
    setError('');
    const mp = MultiplayerManager.getInstance();
    mp.setLocalIsAdmin(isAdmin);
    const ok = await mp.joinRoom(cleanRoom, cleanName, undefined, {
      password: roomPassword,
      bypassLimits: isAdmin,
    });
    setJoining(false);

    if (ok) {
      onJoined();
    } else {
      setError(
        mp.getLastJoinError() ||
          'Không thể kết nối phòng Supabase Realtime. Kiểm tra mạng hoặc thử Offline.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <form
        onSubmit={(e) => void handleJoinOnline(e)}
        className="w-full max-w-sm max-h-[92dvh] overflow-y-auto rounded-2xl bg-[#121212] border border-white/10 shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-white flex items-center gap-2">
              Ca Văn Nghệ
              {isAdmin && (
                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[10px] font-bold uppercase flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  ADMIN
                </span>
              )}
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">Nhập tên và mã phòng để tham gia</p>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-neutral-300">
            Online
          </span>
        </div>

        <div className="p-5 space-y-3.5">
          <div className="space-y-1.5">
            <label className="block text-xs text-neutral-400">Tên hiển thị</label>
            <input
              type="text"
              maxLength={24}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Nhập tên..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-neutral-400">Mã phòng</label>
            <div className="relative">
              <Users className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                maxLength={32}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="ca-van-nghe-1"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-sm text-white font-mono placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          {!isAdmin && (
            <div className="space-y-1.5">
              <label className="block text-xs text-neutral-400">
                Mật khẩu phòng <span className="text-neutral-500">(tùy chọn)</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  maxLength={32}
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  placeholder="Để trống nếu phòng mở..."
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={joining}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-60 text-black text-sm font-semibold flex items-center justify-center gap-2 transition"
            >
              <span>{joining ? 'Đang vào...' : isAdmin ? 'Vào phòng (Admin)' : 'Vào phòng'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onJoined}
              className="py-2.5 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition"
              title="Chơi đơn Offline"
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
