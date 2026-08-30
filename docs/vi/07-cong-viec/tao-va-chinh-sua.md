---
id: 265680f3-12af-43ef-b3d5-8309de5def7d
title: Tạo và chỉnh sửa công việc
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Tạo và chỉnh sửa công việc

Công việc được tạo và sửa qua **modal form công việc**, không phải bằng cách tự viết YAML. Modal biến trường công việc phổ biến thành các entry chip một-dòng nên ghi nhận giữ nhanh.

## Mở modal

- **Công việc mới:** `Ctrl + T` (macOS) / `Ctrl + Alt + T` (Windows / Linux). Cùng họ phím tắt với ghi chú mới — Cmd+T bị trình duyệt giữ cho "tab mới", nên modifier là Ctrl.
- **Sửa công việc có sẵn:** bấm vào nó trong bất kỳ giao diện công việc (danh sách, kanban, bảng dự án, vault view).
- **Từ AI:** yêu cầu ngăn chat tạo công việc và mô hình dùng [`manage_tasks`](../08-ai/cong-cu-chinh-sua.md), nó hiển thị một thẻ proposed-edit bạn bấm Apply.

## Cú pháp chip inline

Trong ô tiêu đề hoặc mô tả, bạn có thể thả chip inline khi gõ:

| Chip | Nghĩa |
| --- | --- |
| `#tag` | Thêm thẻ |
| `!high` (hoặc `!highest` / `!low` / `!lowest`) | Đặt độ ưu tiên |
| `@context` | Thêm bối cảnh GTD |
| `[[Tên dự án]]` | Thêm liên kết dự án |

Gõ một trong những cái này và modal chuyển nó thành trường có cấu trúc bên phải. Vậy `Soạn kế hoạch Q2 #q2 !high @laptop [[Q2 Launch]]` trở thành công việc với mọi trường đó được đặt, và tiêu đề còn lại là `Soạn kế hoạch Q2`.

## Trường ngày

Bộ chọn ngày **due** và **scheduled** chấp nhận gợi ý ngôn ngữ tự nhiên:

- `today`, `tomorrow`, `hôm nay`, `ngày mai`
- `next monday`, `next friday`
- `+3d`, `+1w`, `+2w`
- `2026-05-20` (hoặc bất kỳ ngày ISO)

Bộ chọn chuẩn hóa thành `YYYY-MM-DD` để lưu.

## Trạng thái và độ ưu tiên

Cả hai là dropdown trong modal. Trạng thái mặc định `open`; độ ưu tiên mặc định bỏ trống (xử lý như `normal`).

## Mô tả / phần thân

Dưới các trường có cấu trúc, modal nhúng [trình soạn thảo Milkdown](../03-trinh-soan-thao/index.md) cho phần thân của công việc — markdown đầy đủ, lazy-load nên modal mở nhanh. Dùng cho bước con, ngữ cảnh, liên kết, gì cũng được.

## Lặp lại

Bộ chọn lặp lại phơi các preset (Hằng ngày, Hằng tuần, Hai tuần, Hằng tháng, Tùy chỉnh) và cho phép bạn viết RRULE tùy chỉnh cho trường hợp power-user. Xem [Lặp lại](./lap-lai.md).

## Lưu

Modal tự động lưu khi bạn gõ, giống phần còn lại của ứng dụng. Đóng modal đẩy mọi ghi chờ. Tệp trên đĩa đi vào `.assets/tasks/<filename>.md`; tên tệp được sinh từ tiêu đề + dấu thời gian để các tệp không đụng nhau.

## Sửa công việc bạn không tạo ở đây

Bất kỳ tệp `.md` tuân TaskNotes trong `.assets/tasks/` đều được nhận. Nếu bạn viết hoặc dán tệp vào đó trực tiếp (ví dụ từ công cụ khác), ứng dụng nhận nó là công việc khi đánh chỉ mục lần kế. Modal form sẽ sửa nó cùng cách.

## Tham khảo

- [[Công cụ chỉnh sửa]]
- [[Trình soạn thảo]]
- [[Lặp lại]]
