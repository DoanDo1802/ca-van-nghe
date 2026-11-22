import React, { useEffect, useRef, useState } from 'react';
import { Crown, MessageSquare, Minimize2, Send } from 'lucide-react';
import { MultiplayerManager, type ChatMessage } from '../network/MultiplayerManager';

const MAX_MESSAGES = 80;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const ChatBox: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const localPlayerId = MultiplayerManager.getInstance().getLocalPlayerId();

  useEffect(() => {
    const onChatMessage = (e: Event) => {
      const msg = (e as CustomEvent<ChatMessage>).detail;
      if (!msg) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const next = [...prev, msg];
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
      });
      if (!isOpenRef.current) {
        setUnreadCount((c) => c + 1);
      }
    };

    const onVoicePolicy = (e: Event) => {
      const policy = (e as CustomEvent<{ mode: 'free' | 'muted_all'; updatedAt: number }>).detail;
      if (!policy || !policy.updatedAt) return;
      const sysMsg: ChatMessage = {
        id: `sys_vp_${policy.updatedAt}`,
        senderId: 'system',
        senderName: 'Hệ thống',
        isHost: false,
        text:
          policy.mode === 'muted_all'
            ? 'Chủ phòng đã tắt mic tất cả thành viên trong phòng.'
            : 'Chủ phòng đã mở quyền tự do bật mic cho cả phòng.',
        timestamp: policy.updatedAt,
        kind: 'system',
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === sysMsg.id)) return prev;
        return [...prev, sysMsg].slice(-MAX_MESSAGES);
      });
    };

    const onRoomLeft = () => {
      setMessages([]);
      setUnreadCount(0);
      setDraft('');
    };

    window.addEventListener('cavannghe:chat-message', onChatMessage);
    window.addEventListener('cavannghe:voice-policy', onVoicePolicy);
    window.addEventListener('cavannghe:room-left', onRoomLeft);
    return () => {
      window.removeEventListener('cavannghe:chat-message', onChatMessage);
      window.removeEventListener('cavannghe:voice-policy', onVoicePolicy);
      window.removeEventListener('cavannghe:room-left', onRoomLeft);
    };
  }, []);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Enter' || e.code === 'KeyT') {
        e.preventDefault();
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
        setIsOpen(true);
        setUnreadCount(0);
        window.setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      inputRef.current?.blur();
      return;
    }
    MultiplayerManager.getInstance().sendChatMessage(trimmed);
    setDraft('');
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 left-4 z-30 pointer-events-auto hidden sm:block">
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#121212]/85 hover:bg-[#1a1a1a] backdrop-blur-md border border-white/15 text-xs font-medium text-neutral-200 shadow-xl transition"
        >
          <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
          <span>Chat</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-neutral-400">
            T
          </kbd>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-sky-500 text-white text-[10px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-30 pointer-events-auto w-72 sm:w-80 rounded-2xl bg-[#121212]/80 backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden flex flex-col hidden sm:flex">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-200">
          <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
          <span>Khung Chat</span>
          <span className="text-[10px] font-normal text-neutral-500">(Enter / T)</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          title="Thu gọn khung chat"
          className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="h-44 overflow-y-auto px-3 py-2 space-y-1.5 text-xs scrollbar-thin"
      >
        {messages.length === 0 ? (
          <p className="text-[11px] text-neutral-500 text-center py-10">
            Chưa có tin nhắn. Nhấn <kbd className="px-1 py-0.5 rounded bg-white/10 text-neutral-300 font-mono">T</kbd> để trò chuyện!
          </p>
        ) : (
          messages.map((m) => {
            if (m.kind === 'system') {
              return (
                <div
                  key={m.id}
                  className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2 py-1 leading-snug"
                >
                  {m.text}
                </div>
              );
            }
            const isLocal = m.senderId === localPlayerId;
            return (
              <div key={m.id} className="leading-snug break-words">
                <span className="text-[10px] text-neutral-500 font-mono mr-1.5">
                  {formatTime(m.timestamp)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold mr-1.5 ${
                    isLocal ? 'text-emerald-300' : 'text-sky-300'
                  }`}
                >
                  {m.isHost && <Crown className="w-3 h-3 text-amber-400 inline" />}
                  {m.senderName}
                  {isLocal ? ' (Bạn)' : ''}:
                </span>
                <span className="text-neutral-200">{m.text}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-1.5 p-2 border-t border-white/10 bg-black/30"
      >
        <input
          ref={inputRef}
          type="text"
          maxLength={300}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.code === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          placeholder="Nhập tin nhắn..."
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-sky-400/50"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="p-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-white transition shrink-0"
          title="Gửi tin nhắn"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
