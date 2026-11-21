import React, { useState } from 'react';
import { Users, Radio, Sparkles, ArrowRight, WifiOff } from 'lucide-react';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { isSupabaseConfigured } from '../network/supabaseClient';

interface LobbyModalProps {
  onJoined: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({ onJoined }) => {
  const params = new URLSearchParams(window.location.search);
  const initialRoom = params.get('room') || 'ca-van-nghe-1';

  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('cavannghe:player-name') || 'Khách Lounge'
  );
  const [roomId, setRoomId] = useState(initialRoom);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const supabaseReady = isSupabaseConfigured();

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
    const ok = await MultiplayerManager.getInstance().joinRoom(cleanRoom, cleanName);
    setJoining(false);

    if (ok) {
      onJoined();
    } else {
      setError('Không thể kết nối phòng Supabase Realtime. Kiểm tra mạng hoặc thử Offline.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090b10]/85 backdrop-blur-md">
      <form
        onSubmit={(e) => void handleJoinOnline(e)}
        className="w-full max-w-md rounded-2xl bg-neutral-900 border border-white/15 shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-amber-500/15 via-transparent to-sky-500/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                Ca Văn Nghệ — Lounge 3D
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  ONLINE
                </span>
              </h1>
              <p className="text-xs text-neutral-400">
                Nghe nhạc 3D loa kép & tụ họp cùng bạn bè
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-neutral-300">
              Tên hiển thị của bạn
            </label>
            <input
              type="text"
              maxLength={24}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Nhập tên nhân vật..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-neutral-300 flex items-center justify-between">
              <span>Mã phòng (Room ID)</span>
              <span className="text-[11px] text-neutral-500 font-normal">
                Người vào đầu tiên làm Chủ phòng
              </span>
            </label>
            <div className="relative">
              <Users className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                maxLength={32}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="ca-van-nghe-1"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-sm text-white font-mono placeholder:text-neutral-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/80 border border-white/10 text-[11px] text-neutral-400 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Bấm vào phòng sẽ tự động bật âm thanh 3D từ 2 loa sân khấu. Chỉ <strong className="text-amber-300">Chủ phòng</strong> mới có quyền đổi video/nhạc sân khấu.
            </span>
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={joining}
              className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30 transition"
            >
              <span>{joining ? 'Đang vào phòng...' : 'Tham gia phòng Online'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onJoined}
              className="py-2.5 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition"
              title="Vào thẳng chế độ chơi đơn Offline"
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
