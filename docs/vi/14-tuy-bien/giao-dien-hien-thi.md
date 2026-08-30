---
id: 7f6f4cb6-82bc-4e9a-a4a9-b6513259b582
title: Giao diện hiển thị
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Giao diện hiển thị

Typography của trình soạn thảo cấu hình được. Mở popover **Editor settings** (biểu tượng bánh răng trong thanh công cụ) để tìm các điều khiển này.

## Họ phông

Chọn từ một danh sách được tuyển chọn của tùy chọn web-safe và Google Fonts:

- **System** (mặc định) — sans-serif mặc định của OS bạn.
- **Serif** — serif chung dự phòng.
- **Mono** — monospace chung dự phòng.
- **Source Code Pro** — monospace, cho ghi chú nhiều mã.
- **Roboto**, **Open Sans**, **Noto Sans**, **Montserrat**, **Lato**, **Poppins**, **Roboto Condensed**, **Source Sans 3** — sans-serif hiện đại.
- **Oswald**, **Raleway** — sans-serif dạng display, hữu ích nhất cho ghi chú ngắn, nhiều tiêu đề.

Phông áp dụng cho văn bản thân. Khối mã luôn dùng phông monospace (system mono trừ khi bạn chọn Source Code Pro).

## Kích thước phông

Một slider pixel cho văn bản thân. Mặc định được hiệu chỉnh cho đọc khoảng cách laptop; tăng cho màn hình lớn hoặc giảm cho bố cục cực dày.

Tiêu đề được kích thước tương đối với thân, nên đổi kích thước thân scale cả thứ bậc.

## Line height

Một số nhân trên kích thước phông. Line-height chặt (ví dụ 1.4) đóng nhiều text trên màn hình; line-height lỏng (ví dụ 1.7) dễ đọc cho đoạn dài.

## Khoảng cách đoạn

Khoảng cách dọc giữa các đoạn, theo pixel. Giá trị lớn cho cảm giác "thoáng"; giá trị nhỏ giống một bản nháp máy chữ.

## Cái này không đổi gì

- **Markdown trên đĩa.** Phông và kích thước là CSS — không gì về ghi chú đổi.
- **Phông khối mã.** Luôn monospace.
- **Xuất PDF.** Stylesheet in dùng phông / kích thước riêng cho khả năng dự đoán qua các trình duyệt.

## Tổ hợp đáng thử

- **Soạn thảo**: Source Sans 3, ~17px, line-height 1.7, khoảng cách đoạn 16px. Dễ chịu cho phiên viết dài.
- **Đọc**: Roboto Condensed, ~16px, line-height 1.5. Gọn, mật độ thông tin cao.
- **Ghi chú nhiều mã**: Source Code Pro, ~14px, line-height 1.5. Văn bản thân và khối mã chia sẻ phông; ít đổi thị giác.

## Reset

Không có nút "reset" rõ ràng — chọn tùy chọn mặc định cho mỗi thiết lập (System cho phông, giữa của slider cho kích thước, …). Mặc định được điều chỉnh cho màn hình laptop 13–15" ở khoảng cách xem điển hình.
