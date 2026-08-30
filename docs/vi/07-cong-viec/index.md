---
id: ab1cefc8-f4b3-40cf-9f62-79f27f2a3fd7
title: Công việc
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Công việc

Công việc trong Note là đối tượng hạng nhất. Mỗi cái là một tệp `.md` riêng dưới `.assets/tasks/`, với **YAML frontmatter** theo [đặc tả TaskNotes](https://github.com/callumalpass/tasknotes). Phần thân tệp là markdown bình thường — bất cứ gì bạn muốn viết về công việc.

Lựa chọn đó — một tệp một công việc, markdown thuần, frontmatter có cấu trúc — nghĩa là mọi công cụ khác bạn có thể trỏ vào kho có thể đọc công việc của bạn. Đồng bộ chúng, version, grep, chạy script trên chúng. Các giao diện công việc của ứng dụng là một cách nhìn chúng, không phải chủ sở hữu của chúng.

## Trong mục này

- [Trường công việc](./truong-cong-viec.md) — mọi trường YAML một công việc có thể mang.
- [Tạo và chỉnh sửa](./tao-va-chinh-sua.md) — modal form công việc, chip inline cho thẻ / ưu tiên / dự án.
- [Giao diện xem](./giao-dien-xem.md) — danh sách, kanban board, bảng dự án, vault tasks view.
- [Lặp lại](./lap-lai.md) — công việc lặp dùng RRULE.
- [Phụ thuộc](./phu-thuoc.md) — `blocked_by` với loại quan hệ.
- [Theo dõi thời gian](./theo-doi-thoi-gian.md) — ước lượng và log thời gian.
- [Nhắc nhở](./nhac-nho.md) — nhắc tương đối và tuyệt đối.

## Khởi đầu nhanh

- **Công việc mới:** `Ctrl + T` (macOS) / `Ctrl + Alt + T` (Windows / Linux).
- **Danh sách công việc kho:** `Cmd/Ctrl + Shift + K`.

Các công cụ [`manage_tasks` và `search_tasks` của AI](../08-ai/cong-cu-chinh-sua.md) nói cùng vốn từ vựng, nên bạn có thể yêu cầu ngăn chat sàng lọc danh sách công việc và nó sẽ hành động trên cùng các tệp.
