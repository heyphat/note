---
id: a818f9f7-d7f8-48ae-8ba6-3f8aa3415655
title: Tìm kiếm
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Tìm kiếm

Tìm kiếm trong Note là **phía-client và toàn văn**. Không có máy chủ làm việc — ứng dụng đánh chỉ mục kho khi tải và truy vấn chỉ mục đó với mỗi phím gõ. Cùng chỉ mục chạy bảng lệnh, lọc thẻ, tìm kiếm đã lưu, và công cụ `search_vault` của AI.

- [Bảng lệnh](./bang-lenh.md) — bề mặt tìm kiếm chính, mở với `Cmd/Ctrl + K`.
- [Cú pháp truy vấn](./cu-phap-truy-van.md) — cụm từ, bộ lọc (`updated:>7d`), chế độ sắp xếp.
- [Thẻ](./the.md) — cách `#tag` hoạt động trong thân và frontmatter, đám mây thẻ.
- [Tìm kiếm đã lưu](./tim-kiem-da-luu.md) — ghim một truy vấn để dùng lại.

Đằng sau, chỉ mục được xây dựng với [MiniSearch](https://github.com/lucaong/minisearch) chạy trong worker, nên gõ vẫn nhanh ngay cả trên kho hàng nghìn ghi chú. Nếu kết quả từng cảm thấy cũ, xem [Lập lại chỉ mục](../01-bat-dau/lap-chi-muc-lai.md).
