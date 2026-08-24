# 📺 BYOS IPTV Live Streamer Plugin

> Universal Live TV Streaming Plugin for BYOS TV Client & Ecosystem.

---

## 🌟 Overview
**BYOS IPTV Live Streamer** là plugin chính thức dành cho BYOS TV, cho phép người dùng xem truyền hình trực tuyến Live TV đa nguồn (VTV, HTV, SCTV, THVL, Thể thao, Tin tức quốc tế và các luồng tùy biến) với chi phí máy chủ **$0 Server** (chạy native bằng QuickJS C++ ES2023 trên thiết bị).

---

## 🚀 How to Install (Cách Cài Đặt)

### Cách 1: Cài đặt từ TV Interface (1-Click)
1. Mở **BYOS TV** $\rightarrow$ Vào mục **Kho Plugin (Plugin Store)**.
2. Chọn **Thêm Repository** $\rightarrow$ Chọn preset **"📺 BYOS IPTV"** hoặc dán URL:
   ```
   https://thiennq.github.io/byos-tv/plugins/byos-iptv/manifest.json
   ```
3. Bấm **Cài đặt**.

### Cách 2: Cài đặt từ Điện Thoại qua Web Pairing (`:3579`)
1. Quét mã QR trên TV bằng điện thoại để mở Web Config Dashboard.
2. Chuyển sang Tab **"Plugins & Scrapers"**.
3. Bấm nút preset **"📺 BYOS IPTV Hub"** và bấm **"📥 Install Repository"**.

---

## ⚙️ Plugin Configuration (Cấu Hình Nguồn Phát)
Sau khi cài đặt, bạn có thể bấm nút **"⚙️ Cài Đặt"** trên TV hoặc qua Web Dashboard:
- **Tự động làm mới danh mục**: Hỗ trợ tự động cập nhật luồng sau mỗi 6 tiếng, 24 tiếng.
- **Nguồn có sẵn (Built-in Presets)**:
  - 🇻🇳 **IPTV.org - Kênh Quốc Gia Việt Nam** (VTV1, VTV2, VTV3, HTV, VTC...)
  - ⚽ **IPTV.org - Kênh Thể Thao Quốc Tế** (Sports 24/7)
  - 📰 **IPTV.org - Kênh Tin Tức Quốc Tế** (News Live)
- **Nguồn tùy biến (Custom M3U / M3U8 URLs)**:
  - Dễ dàng nhập tên nguồn và link playlist `.m3u` riêng của bạn.

---

## 📁 Repository Files
- `manifest.json`: Manifest định nghĩa plugin repository & Form Schema UI.
- `iptv_plugin.js`: Source code plugin JavaScript ES2023 xử lý parse M3U và trích xuất luồng Live HLS.
