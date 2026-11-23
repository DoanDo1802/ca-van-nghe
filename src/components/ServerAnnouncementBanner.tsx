import React, { useEffect, useRef, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { getSupabaseClient } from '../network/supabaseClient';
import type { ServerAnnouncementPayload } from '../network/AdminService';
import type { ChatMessage } from '../network/MultiplayerManager';

export const ServerAnnouncementBanner: React.FC = () => {
  const [notice, setNotice] = useState<ServerAnnouncementPayload | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase.channel('server:announcements');
    channel.on('broadcast', { event: 'announcement' }, ({ payload }) => {
      const data = payload as ServerAnnouncementPayload;
      if (!data?.message) return;

      setNotice(data);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setNotice(null);
      }, 15_000);

      const sysMsg: ChatMessage = {
        id: `srv_${data.id}`,
        senderId: 'server_admin',
        senderName: `THÔNG BÁO SERVER (${data.senderName})`,
        isHost: true,
        text: data.message,
        timestamp: data.createdAt || Date.now(),
        kind: 'system',
      };
      window.dispatchEvent(
        new CustomEvent<ChatMessage>('cavannghe:chat-message', { detail: sysMsg })
      );
    });

    channel.subscribe();

    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
      void channel.unsubscribe();
    };
  }, []);

  if (!notice) return null;

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[90] w-[min(92vw,540px)] pointer-events-auto">
      <div className="rounded-2xl bg-[#121212]/95 border border-rose-400/40 backdrop-blur-md shadow-2xl px-4 py-3 flex items-start gap-3">
        <span className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-400/40 flex items-center justify-center shrink-0 mt-0.5">
          <Megaphone className="w-4 h-4 text-rose-300" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 text-[9px] font-bold uppercase tracking-wider">
              Thông báo Server
            </span>
            <span className="text-[11px] text-neutral-400 truncate">
              từ {notice.senderName}
            </span>
          </div>
          <p className="text-sm text-white font-medium mt-1 leading-snug break-words">
            {notice.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition shrink-0"
          title="Đóng thông báo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
