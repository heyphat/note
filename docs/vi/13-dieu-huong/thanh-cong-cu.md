---
id: 4c0159c8-7af0-48a1-9822-d7aba8ff76fc
title: Thanh công cụ header
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Thanh công cụ header

Thanh ở đầu khung trình soạn thảo. Giữ truy cập nhanh đến các thao tác định dạng phổ biến và toggle hiển thị cho các bảng xung quanh.

## Cái sống ở đó

Thanh công cụ chia thành ba khu vực thô:

### Bên trái

- **Tiêu đề** ghi chú hiện tại (sửa được inline).
- Một breadcrumb hiển thị thư mục của ghi chú, khi nó không ở gốc kho.

### Giữa

Thanh công cụ vùng chọn, xuất hiện khi bạn có văn bản được chọn:

- **Đậm**, **Nghiêng**, **Gạch dưới**, **Gạch ngang**, **Mã inline**.
- **Liên kết** — biến vùng chọn thành liên kết.
- **Hỏi AI** — mở [ngăn trò chuyện](../08-ai/ngan-chat.md) với vùng chọn được nạp sẵn.

### Bên phải

Toggle hiển thị cho các bảng [ngăn phải](./ngan-phai.md):

- **Liên kết ngược** hiển thị / ẩn.
- **Lịch sử** hiển thị / ẩn.
- **Công việc dự án** hiển thị / ẩn.
- Một affordance **toggle cả ba** kết hợp (cùng tác dụng `Cmd/Ctrl + Shift + B`).

Cộng các mục truy cập nhanh không vừa nơi khác:

- **Chip Pomodoro** (khi phiên đang chạy) — xem [Pomodoro](../11-pomodoro/index.md).
- **Đếm từ** (khi bật) — xem [Thiết lập](../14-tuy-bien/giao-dien-hien-thi.md).
- Nút **đổi giao diện**.

## Cái thanh công cụ không có

- Một nút "Save". Ứng dụng tự động lưu; `Cmd/Ctrl + S` đẩy thủ công nếu bạn muốn.
- Một nút "New note". Thanh bên có một; bàn phím có `Ctrl + N` (macOS) / `Ctrl + Alt + N`.
- Một bộ chọn mô hình. Cái đó sống trong ngăn trò chuyện, vì nó scope theo chat.

## Ẩn trong chế độ zen / khóa

Khi bạn ở [chế độ zen](../03-trinh-soan-thao/che-do-soan-thao.md), header bị ẩn. Khi bạn ở [chế độ khóa](../03-trinh-soan-thao/che-do-soan-thao.md), các thao tác định dạng trơ (toggle ngăn vẫn chạy).

## Trên màn hình nhỏ hơn

Thanh công cụ thu gọn duyên dáng — các thao tác di chuyển vào menu "more" thay vì wrap. Phím tắt chạy bất kể thao tác nào nhìn được.

## Tham khảo

- [[Ngăn trò chuyện]]
- [[Ngăn phải]]
- [[Pomodoro / phiên tập trung]]
- [[Giao diện hiển thị]]
- [[Chế độ soạn thảo]]
