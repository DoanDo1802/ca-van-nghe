import React from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface LegalNoticeModalProps {
  tab: 'terms' | 'privacy' | null;
  onClose: () => void;
  onSwitchTab: (tab: 'terms' | 'privacy') => void;
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({
  tab,
  onClose,
  onSwitchTab,
}) => {
  if (!tab) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl bg-[#141414] border border-white/15 shadow-2xl overflow-hidden text-xs text-neutral-300">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#0d0d0d]">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{tab === 'terms' ? 'Điều khoản sử dụng' : 'Chính sách bảo mật'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 flex gap-2 border-b border-white/10 bg-[#111]">
          <button
            type="button"
            onClick={() => onSwitchTab('terms')}
            className={`pb-2.5 px-2 font-medium border-b-2 transition ${
              tab === 'terms'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Điều khoản sử dụng (ToS)
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab('privacy')}
            className={`pb-2.5 px-2 font-medium border-b-2 transition ${
              tab === 'privacy'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Chính sách bảo mật (Privacy)
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto leading-relaxed">
          {tab === 'terms' ? (
            <>
              <p>
                Khi sử dụng <strong>Ca Văn Nghệ — Web 3D Lounge</strong> (bao gồm khu vực Rạp Chiếu
                Phim và Phòng Trà), bạn đồng ý tuân thủ các quy định cộng đồng và không phát tán nội
                dung vi phạm bản quyền hoặc pháp luật.
              </p>
              <p>
                Ứng dụng tích hợp <strong>YouTube API Services</strong> (YouTube IFrame Player API
                và YouTube Data API v3) để tìm kiếm và phát video công khai từ YouTube. Bằng việc sử
                dụng các tính năng phát video trên, bạn đồng ý chịu sự ràng buộc của{' '}
                <a
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-300 underline hover:text-amber-200"
                >
                  Điều khoản Dịch vụ của YouTube (YouTube Terms of Service)
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>Ca Văn Nghệ</strong> chỉ lưu trữ tên hiển thị cục bộ (localStorage), trạng
                thái phòng tạm thời (Supabase Realtime) và không thu thập hay bán dữ liệu cá nhân
                của người dùng cho bên thứ ba.
              </p>
              <p>
                Các tính năng tìm kiếm và phát video YouTube sử dụng{' '}
                <strong>YouTube API Services</strong>. Dữ liệu tương tác với trình phát YouTube
                tuân theo{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-300 underline hover:text-amber-200"
                >
                  Chính sách Bảo mật của Google (Google Privacy Policy)
                </a>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
