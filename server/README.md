# 🗄️ Node.js + SQLite Backend Server - BaoCaoAnCa

Hệ thống Backend Node.js Express kết nối CSDL **SQLite** để lưu trữ tự động toàn bộ dữ liệu cào từ Google Looker Studio qua Chrome Extension.

---

## 📁 Cấu trúc CSDL SQLite (`server/bao_cao_an_ca.sqlite`)

### 1. Bảng `reports`
Lưu vết từng phiên cào báo cáo (ID, tiêu đề, thời gian, số dòng thu thập).

### 2. Bảng `kpi_metrics`
Lưu các thẻ chỉ số KPI tổng quan (`SỐ LƯỢT PHÁT HÀNH`, `SỐ LƯỢT ĐÃ SỬ DỤNG`, ...).

### 3. Bảng `voucher_records`
Lưu chi tiết từng dòng voucher với 20 trường thông tin:
- `campaign_name` (`TÊN CAMPAIGN`)
- `voucher_code` (`MÃ VOUCHER`)
- `booth_area` (`KHU GIAN HÀNG`)
- `lot_code` (`MÃ LÔ`)
- `booth_code` (`MÃ GIAN HÀNG`)
- `booth_name` (`TÊN GIAN HÀNG`)
- `store_status` (`TRẠNG THÁI CỬA HÀNG`)
- `voucher_status` (`TRẠNG THÁI VOUCHER`)
- `remaining_hours` (`SỐ GIỜ SỬ DỤNG CÒN LẠI`)
- `use_date` (`NGÀY SỬ DỤNG`)
- `use_time` (`GIỜ SỬ DỤNG`)
- `vgid` (`VGID`)
- `staff_code` (`MÃ NHÂN VIÊN`)
- `issue_date` (`NGÀY PHÁT HÀNH`)
- `expiry_date` (`NGÀY HẾT HẠN`)
- `voucher_value` (`GIÁ TRỊ VOUCHER`)
- `pnl` (`PnL`)
- `user_topup` (`User Topup`)
- `max_usage` (`SỐ LƯỢT SỬ DỤNG TỐI ĐA`)
- `usage_count` (`SỐ LƯỢT SỬ DỤNG`)

---

## 🚀 Hướng dẫn Chạy Server

### Khởi động Server:
```bash
cd server
npm start
```

Server sẽ lắng nghe tại địa chỉ: **`http://localhost:3000`**

---

## 🔌 Danh sách REST APIs

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `POST` | `/api/reports` | Chrome Extension gọi API này để lưu dữ liệu báo cáo vào CSDL SQLite |
| `GET` | `/api/reports` | Lấy danh sách các phiên báo cáo đã lưu |
| `GET` | `/api/reports/:id` | Lấy chi tiết báo cáo và dữ liệu theo ID |
| `GET` | `/api/vouchers` | Tìm kiếm & phân trang danh sách Voucher (`?page=1&limit=50&search=TECHNOPARK`) |
| `GET` | `/api/export/excel/:id` | Xuất và tải trực tiếp file Excel (.xlsx) từ CSDL SQLite theo ID |
