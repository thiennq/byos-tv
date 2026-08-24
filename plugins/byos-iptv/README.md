# 📺 BYOS IPTV Live Streamer Plugin

> Universal Live TV Streaming Plugin for BYOS TV Client & Ecosystem.

---

## 🌟 Overview
**BYOS IPTV Live Streamer** là plugin chính thức dành cho BYOS TV, cho phép người dùng xem truyền hình trực tuyến Live TV đa nguồn (VTV, HTV, SCTV, THVL, Thể thao, Tin tức quốc tế và 240+ quốc gia) với chi phí máy chủ **$0 Server** (chạy native bằng QuickJS C++ ES2023 trên thiết bị).

---

## 🚀 Kiến Trúc & Tính Năng Nổi Bật (Architecture & Key Highlights)

1. **Static Countries Asset (`countries.json`) & Offline 0ms**:
   - Nhúng sẵn danh mục 240+ quốc gia kèm mã ISO chuẩn và cờ emoji.
   - Nạp siêu tốc 0ms offline thông qua Native Asset Reader `byos.readAsset('countries.json')`.

2. **Dynamic Cascading Form Builder (`country` $\rightarrow$ `selected_channels`)**:
   - Khai báo declarative dynamic hooks trong `manifest.json` (`dynamicHook: "getCountries"`, `dynamicHook: "getChannelsByCountry"`, `dependsOn: "country"`).
   - Khi chọn quốc gia, hệ thống tự động tải playlist tương ứng từ kho iptv-org, parse danh sách kênh và lưu vào `byos.storage`.
   - Tìm kiếm kênh realtime mượt mà qua D-Pad / Voice Search trên TV.

3. **0ms Instant Direct Playback**:
   - Người dùng tick chọn các kênh yêu thích $\rightarrow$ Toàn bộ thông tin kênh (ID, Tên, Logo, Stream URL) được lưu trực tiếp vào `settings.json`.
   - Khi mở TV, `getChannels()` và `getStreams()` trả về luồng phát trực tiếp ngay lập tức mà không tốn round-trip mạng để tải lại file M3U.

4. **Isolated Caching với `byos.storage`**:
   - Tự động cache danh sách kênh sau khi parse vào storage sandbox của plugin.
   - Hỗ trợ cấu hình TTL tự động làm mới (`auto_reload_hours`).

5. **Nâng Cấp Bộ Phân Tích M3U (Robust Parser)**:
   - Xử lý triệt để ký tự UTF-8 BOM (`\uFEFF`).
   - Trích xuất tự động custom HTTP headers từ `#EXTVLCOPT` (`User-Agent`, `Referer`, `Origin`), `#EXTHTTP` (JSON), và URL pipe parameters (`url|Header=Value`).
   - Giới hạn an toàn `MAX_CHANNELS_PER_SOURCE = 1000` bảo vệ bộ nhớ RAM trên Android TV.

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
- **Chọn Quốc Gia**: Chọn từ 240+ quốc gia (Việt Nam 🇻🇳, Mỹ 🇺🇸, Anh 🇬🇧, Nhật Bản 🇯🇵, Hàn Quốc 🇰🇷, Pháp 🇫🇷...).
- **Danh Sách Kênh Muốn Phát**: Tìm kiếm và tick chọn các kênh yêu thích để đưa ra màn hình Live TV.
- **Tự động làm mới danh mục**: Hỗ trợ tự động cập nhật luồng sau mỗi 6 tiếng, 24 tiếng, hoặc không tự động làm mới.
- **Nguồn tùy biến thêm (Custom M3U / M3U8 URLs)**: Nhập thêm các playlist `.m3u` riêng của bạn nếu có.

---

## 📁 Repository Files
- `manifest.json`: Manifest định nghĩa plugin repository, assets và Dynamic Form Schema UI.
- `iptv_plugin.js`: Source code plugin JavaScript ES2023 xử lý Dynamic Hooks, parse M3U và trích xuất luồng Live HLS.
- `countries.json`: Danh mục 240+ quốc gia tĩnh kèm emoji flag.
- `README.md`: Hướng dẫn sử dụng & kiến trúc plugin.
