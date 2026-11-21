# Danh Sách Rào Cản & Điểm Cần Khắc Phục Khi Lên Online

Tài liệu này tổng hợp các bất cập kỹ thuật đã phân tích khi chuyển **Ca Văn Nghệ Web 3D** sang chế độ **Online (Multiplayer)** để theo dõi và khắc phục dần sau khi hoàn thiện luồng kết nối mạng.

---

## 1. Đồng bộ Video / Âm thanh sân khấu (YouTube vs Media tự host)
- **Hiện trạng:** `StageAudioManager.ts` + `YouTubeStagePlayer.tsx` hỗ trợ cả file `.mp4`/`.mp3` (Loa kép 3D HRTF thật) và link YouTube (chiếu CSS3D `matrix3d` + âm lượng theo khoảng cách 2 loa trước).
- **Rào cản khi lên Online:**
  1. **Lệch thời gian (Drift) & Quảng cáo trên YouTube:** Tốc độ buffer và quảng cáo đầu video ở mỗi người chơi khác nhau, dễ làm cả phòng xem lệch nhịp vài giây đến vài chục giây.
  2. **Video YouTube bị tắt nhúng (Embed Disabled):** Một số video/livestream không cho phép phát qua `<iframe>` trên web ngoài.
  3. **Không có HRTF trái/phải thật với YouTube:** Trình duyệt chặn trích xuất âm thanh từ `<iframe>` cross-origin sang Web Audio `PannerNode`.
- **Hướng khắc phục dần:**
  - [ ] Giai đoạn đầu: Đồng bộ `{ sourceType, mediaUrl / youtubeVideoId, isPlaying, serverTimestamp }` qua Realtime Broadcast; cho phép nút **"Đồng bộ lại theo Host"** nếu bị lệch.
  - [ ] Nâng cấp sau: Ưu tiên phát file `.mp4`/`.mp3` hoặc stream HLS (`.m3u8`) qua Storage/CDN có CORS (hoặc Backend Proxy) để chạy thẳng qua `StageAudioManager` với âm thanh loa kép 3D HRTF thật.

---

## 2. Độ trễ 1 frame khi chiếu YouTube bằng CSS3D (`matrix3d`)
- **Hiện trạng:** `YouTubeStagePlayer.tsx` nằm sau `<canvas>` (`z-0`) và dùng `StageScreenPunchHole` (`alpha: true` trên WebGL) để không che mất nhân vật đứng trước TV.
- **Rào cản:** DOM (`<iframe>`) và WebGL2 (`<canvas>`) được trình duyệt render trên 2 pipeline tách biệt. Khi xoay camera rất nhanh hoặc trên thiết bị yếu, khung hình YouTube có thể bị trễ ~1 frame (~16ms) so với viền TV 3D.
- **Hướng khắc phục dần:**
  - [ ] Khuyến khích dùng nguồn `.mp4` / HLS render trực tiếp vào `pc.Texture` cho các buổi live chính thức (dính chặt 100% vào khung 3D, không bao giờ lệch frame).
  - [ ] Tối ưu thêm smoothed camera / giới hạn tốc độ xoay cực đoan nếu cần khi dùng YouTube.

---

## 3. Chính sách chặn Autoplay của trình duyệt
- **Rào cản:** Khi người chơi mới bấm link vào phòng Online, trình duyệt sẽ chặn phát tiếng (`AudioContext` ở trạng thái `suspended`, video không có tiếng) nếu chưa có thao tác click/chạm từ người dùng.
- **Hướng khắc phục dần:**
  - [ ] Tạo màn hình chờ **"Tham gia phòng / Click to Enter"** trước khi vào cảnh 3D để lấy 1 cú click đầu tiên mở khóa `AudioContext` và Video ngay lập tức.

---

## 4. Đồng bộ nhân vật & Tránh giật lag mạng (10–30 người/phòng)
- **Rào cản:**
  1. Gửi tọa độ mỗi frame (60Hz) sẽ gây nghẽn băng thông và vượt hạn mức gói Free.
  2. `ammo.js` (WASM) chỉ chạy ở Client; không phù hợp chạy server-authoritative nặng cho game lounge miễn phí.
  3. Nếu dùng P2P WebRTC, máy Host yếu hoặc rớt mạng sẽ làm cả phòng lag/mất kết nối.
- **Hướng khắc phục dần:**
  - [ ] Dùng **Supabase Realtime (Region Singapore)** cho Broadcast + Presence (chi phí 0đ trong gói Free, ping VN ~35–50ms).
  - [ ] Chỉ gửi gói tin vị trí `(x, y, z, yaw, animState, sittingChairId)` ở tần suất **10–15 Hz** (70–100ms/lần) và chỉ gửi khi có thay đổi.
  - [ ] Dùng **Interpolation (`lerp`) 60fps** ở Client khi render nhân vật người chơi khác.

---

## 5. Hiệu năng GPU/FPS & Dung lượng tải ban đầu trên Mobile
- **Hiện trạng:** Đã tách riêng build bản Player (`npm run build:player` → `dist-player/`) không chứa Editor và Three.js legacy, và đã có chỉnh **Độ phân giải Render 3D** (`0.5x – 2.0x`) + **Độ phân giải Video** (`240p – 1080p`).
- **Rào cản khi đông người:**
  1. Mỗi nhân vật `Character.glb` có skeleton + animation + `castShadow` sẽ làm tụt FPS nếu có 20–30 người đứng cùng khung hình trên mobile.
  2. Các file `.glb` và texture chưa nén Draco/KTX2 làm lần tải đầu trên 4G hơi chậm.
- **Hướng khắc phục dần:**
  - [ ] Tắt `castShadow` cho các nhân vật người chơi khác ở xa (chỉ giữ bóng cho nhân vật chính hoặc trong bán kính gần).
  - [ ] Giới hạn sức chứa **15–30 người / phòng** (chia nhiều phòng).
  - [ ] Nén các model `.glb` trong `public/models/` bằng **Draco / Meshopt** và chuyển texture nặng sang **WebP / KTX2**.

---

## 6. Bảo mật Key & Lưu trữ dữ liệu (khi dùng Supabase Free / 0đ)
- **Rào cản:**
  1. `VITE_SUPABASE_ANON_KEY` nằm ở Frontend (ai mở F12 cũng thấy).
  2. Hiện tại dữ liệu scene/project đang lưu cục bộ ở `IndexedDB` (`src/storage/`).
- **Hướng khắc phục dần:**
  - [ ] Tuyệt đối không đưa `service_role` key vào Frontend.
  - [ ] Bật **RLS (Row Level Security)** cho mọi bảng Database nếu có lưu đặt bàn / tài khoản / lịch sử.
  - [ ] Chuyển scene JSON mặc định & asset sang CDN tĩnh (Cloudflare Pages / R2) thay vì phụ thuộc `IndexedDB` khi người chơi vào bản Online.
