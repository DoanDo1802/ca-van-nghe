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

export const ChatBox: React.FC<{ hideOnMobile?: boolean }> = ({ hideOnMobile = false }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
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
      <div
        className={`fixed left-3 z-30 pointer-events-auto bottom-36 sm:bottom-3 ${
          hideOnMobile ? 'hidden sm:block' : ''
        }`}
      >
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 rounded-xl bg-black/45 hover:bg-black/60 backdrop-blur-md border border-white/15 text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] shadow-lg transition"
        >
          <MessageSquare className="w-3.5 h-3.5 text-cyan-300" />
          <span>Chat</span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-black/35 text-[10px] font-mono text-amber-200 border border-white/10">
            T
          </kbd>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-cyan-500 text-white text-[10px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed left-3 z-30 pointer-events-auto bottom-36 sm:bottom-3 w-[calc(100vw-1.5rem)] max-w-80 rounded-2xl bg-black/45 sm:bg-black/30 backdrop-blur-md border border-white/15 shadow-2xl overflow-hidden flex-col ${
        hideOnMobile ? 'hidden sm:flex' : 'flex'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          <MessageSquare className="w-3.5 h-3.5 text-cyan-300" />
          <span>Khung Chat</span>
          <span className="hidden sm:inline text-[10px] font-normal text-amber-200/80">(Enter / T)</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          title="Thu gọn khung chat"
          className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="h-36 sm:h-44 overflow-y-auto px-3 py-2 space-y-1.5 text-xs scrollbar-thin"
      >
        {messages.length === 0 ? (
          <p className="text-[11px] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] text-center py-10">
            Chưa có tin nhắn. Nhấn <kbd className="px-1 py-0.5 rounded bg-black/40 text-amber-200 border border-white/15 font-mono">T</kbd> để trò chuyện!
          </p>
        ) : (
          messages.map((m) => {
            if (m.kind === 'system') {
              return (
                <div
                  key={m.id}
                  className="text-[11px] text-amber-200 bg-amber-500/20 border border-amber-400/30 rounded-lg px-2 py-1 leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                >
                  {m.text}
                </div>
              );
            }
            const isLocal = m.senderId === localPlayerId;
            return (
              <div key={m.id} className="leading-snug break-words drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                <span className="text-[10px] text-amber-200/85 font-mono mr-1.5">
                  {formatTime(m.timestamp)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold mr-1.5 ${
                    isLocal ? 'text-emerald-300' : 'text-cyan-300'
                  }`}
                >
                  {m.isHost && <Crown className="w-3 h-3 text-amber-300 inline" />}
                  {m.senderName}
                  {isLocal ? ' (Bạn)' : ''}:
                </span>
                <span className="text-white">{m.text}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-1.5 p-2 border-t border-white/10 bg-black/25"
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
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-black/30 border border-white/15 text-base sm:text-xs text-white placeholder:text-neutral-300/80 focus:outline-none focus:border-cyan-400/60"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="p-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-white transition shrink-0"
          title="Gửi tin nhắn"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
