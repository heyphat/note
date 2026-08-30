---
id: 4f3b69a0-b0b1-41c4-8a99-a978d95c35ae
title: Đồng bộ giữa các tab
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Đồng bộ giữa các tab

Bạn có thể mở cùng một kho trong nhiều tab trình duyệt. Ứng dụng giữ các tab đồng nhất.

## Những gì được đồng bộ

Khi hai tab cùng trỏ vào một kho:

- **Sửa đổi một ghi chú** trong tab này hiện ra ở tab kia khi bạn chuyển qua. Ứng dụng đọc lại tệp, nên nội dung trên đĩa thắng.
- **Danh sách ghi chú** giữ nhất quán. Tạo một ghi chú trong tab A, chuyển qua tab B, ghi chú mới có mặt trong thanh bên.
- **Tùy chọn UI sống trong `localStorage`** — giao diện, kích thước phông, hiển thị thanh bên, bảng màu — lan ra giữa các tab cùng trình duyệt, vì `localStorage` được chia sẻ.
- **Bộ đếm Pomodoro** được chia sẻ qua các tab: bắt đầu một phiên trong tab này hiển thị chip đang chạy ở các tab khác.

## Những gì không đồng bộ (cố ý)

- **Ghi chú đang mở** là theo từng tab. Tab A có thể mở `Sách cần đọc` trong khi tab B mở `Kế hoạch dự án`. Mỗi tab giữ URL và trạng thái trình soạn thảo của riêng nó.
- **Sửa đổi chưa gửi qua nhiều máy.** Đồng bộ giữa các tab là theo trình duyệt. Nếu bạn mở cùng kho trên hai laptop qua công cụ đồng bộ tệp, công cụ đó giải quyết xung đột — Note không vươn qua mạng.
- **Trạng thái mở của ngăn chat** là theo từng tab.

## Sửa kiểu xung đột

Nếu cả hai tab sửa cùng một ghi chú gần như cùng lúc, ứng dụng dùng một lớp phát hiện nhỏ để đánh dấu xung đột thay vì lặng lẽ ghi đè. Sửa đổi đang hoạt động thắng; tab kia sẽ tải lại view để bắt theo những gì trên đĩa.

## Trong một tab

Tự động lưu giữ sửa đổi cục bộ bền theo từng giây. `Cmd/Ctrl + S` đẩy mọi thay đổi đang chờ ngay lập tức, hữu ích ngay trước khi bạn đóng tab. Xem [Tạo ghi chú đầu tiên](../01-bat-dau/ghi-chu-dau-tien.md).

## Tham khảo

- [[Tạo ghi chú đầu tiên]]
