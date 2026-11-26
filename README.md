# 🎵 Ca Văn Nghệ - Không Gian 3D Trực Tuyến (Web3D Game-Standard)

Dự án Website 3D trải nghiệm không gian quán cafe / lounge / quầy bar nghệ thuật **Ca Văn Nghệ**, chuẩn trải nghiệm game phổ thông với **2 chế độ góc nhìn (Góc nhìn thứ nhất FPV & Góc nhìn thứ ba TPV)**, xoay chuột 360 độ tự do, và nhân vật có thể đi lại, chạy, ngồi xuống ghế tự nhiên!

---

## 🎮 Hệ Thống Điều Khiển Chuẩn Game

| Thao Tác | Phím Tắt / Chuột | Cảm Ứng Di Động |
| :--- | :--- | :--- |
| **Xoay Camera 360°** | Kéo giữ chuột trái / phải trên màn hình | Vuốt ngón tay trên màn hình |
| **Phóng to / Thu nhỏ** | Cuộn chuột (Scroll wheel) | N/A |
| **Đổi chế độ Góc nhìn (1st / 3rd)** | Phím `[V]` hoặc bấm nút `[V] Góc nhìn` trên thanh công cụ | Bấm nút `[V] Góc nhìn` trên HUD |
| **Di chuyển 360° theo hướng nhìn** | Phím `W` (Tiến), `S` (Lùi), `A` (Trái), `D` (Phải) | Cần xoay ảo (Joystick) góc trái |
| **Chạy nhanh** | Giữ phím `Shift` + `WASD` | Kéo cần joystick ra biên ngoài |
| **Ngồi xuống ghế / Đứng dậy** | Phím `[E]` hoặc `Space` khi ở gần ghế | Nút tròn `[E]` góc phải |
| **Xem chi tiết món ăn / quầy bar** | Phím `[E]` khi ở gần món ăn | Chạm vào nút prompt hiện giữa màn hình |

---

## 🌟 Chi Tiết 2 Chế Độ Góc Nhìn

1. **Góc Nhìn Thứ 3 (Third-Person View - TPV)**:
   - Camera bay theo sau lưng nhân vật.
   - Kéo chuột để xoay camera 360 độ xung quanh nhân vật tự do.
   - Khi ấn `W`, nhân vật tự động quay mặt và bước đi thẳng về hướng camera đang nhìn.
   - Khi ngồi xuống: Thấy nhân vật gập chân ngồi ngay ngắn trên mặt đệm ghế.

2. **Góc Nhìn Thứ 1 (First-Person View - FPV)**:
   - Camera đặt ngay tại tầm mắt nhân vật (1.65m khi đứng, 1.2m khi ngồi).
   - Mô hình nhân vật ẩn đi để không vướng tầm nhìn.
   - Nhìn trực tiếp bằng mắt nhân vật: ngắm quầy bar, ly cocktail, sân khấu Acoustic và bàn tiệc.
   - Khi ngồi xuống ghế ở FPV: Bạn trực tiếp ngồi tại ghế và ngắm nhìn quán từ bàn của mình!

---

## 🚀 Trải Nghiệm Trực Tiếp

```bash
# Mở trình duyệt tại:
http://localhost:3000
```

### TURN cho voice chat và karaoke

Đặt `VITE_VOICE_TURN_CREDENTIAL_URL` thành URL của endpoint GET do máy chủ cấp thông tin TURN tạm thời. Endpoint trả JSON dạng `{ "iceServers": [{ "urls": ["turn:relay.example.com:3478", "turns:relay.example.com:5349"], "username": "...", "credential": "..." }], "expiresAt": 1795651200000 }`, với `expiresAt` là thời điểm hết hạn theo Unix milliseconds. Giữ khóa cấp thông tin TURN ở máy chủ. Sau khi đặt biến môi trường, build lại ứng dụng. Voice chat và karaoke dùng STUN khi chưa cấu hình endpoint hoặc khi endpoint lỗi.
