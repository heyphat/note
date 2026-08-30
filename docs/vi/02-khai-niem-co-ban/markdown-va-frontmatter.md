---
id: e2b9ac3b-024f-42b1-abec-a276849abfdf
title: Markdown và frontmatter
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Markdown và frontmatter

Mỗi ghi chú trong Note là một tệp `.md` với một khối YAML frontmatter nhỏ ở đầu.

## Một ghi chú trông như thế nào trên đĩa

```markdown
---
id: a3b8c2d4-...
title: Sách cần đọc
createdAt: 2026-04-12T08:23:11.443Z
updatedAt: 2026-05-01T17:11:02.106Z
---

# Sách cần đọc

- [[Designing Data-Intensive Applications]]
- [[The Mythical Man-Month]]

## Mới đọc xong

- _Crafting Interpreters_ — xong 2026-04-30.
```

## Khối frontmatter

Ứng dụng duy trì bốn trường. Chúng được viết tự động; bạn thường không sửa bằng tay.

| Trường | Ý nghĩa |
| --- | --- |
| `id` | UUID ổn định. Sống sót qua đổi tên tệp nên liên kết ngược và lệnh `read_note` của AI vẫn giải được. |
| `title` | Tiêu đề hiển thị của ghi chú. Phản chiếu tên tệp. |
| `createdAt` | ISO datetime của lần lưu đầu tiên. |
| `updatedAt` | ISO datetime của lần lưu gần nhất. |

Bạn có thể thêm **bất kỳ trường YAML nào khác bạn muốn**. Vòng đọc/ghi giữ chúng — ứng dụng đọc thứ nó hiểu và để nguyên phần còn lại. Vậy nếu bạn muốn `author:`, `tags:` (dạng list), `aliases:`, metadata dự án, gì khác cũng được. Các công cụ khác chia sẻ quy ước (Obsidian, sinh trang tĩnh, script tùy chỉnh) cũng sẽ thấy các trường này.

## Phần thân

Dưới frontmatter, phần thân là **GitHub Flavored Markdown** cộng với vài quy ước trên đó:

- **Wikilink** — `[[Ghi chú khác]]`, `[[Ghi chú khác#mục]]`. Xem [Wikilink](../04-lien-ket-ghi-chu/wikilink.md).
- **Nhúng ghi chú** — `![[Ghi chú khác]]`, nhúng nội dung của ghi chú khác vào dòng. Xem [Nhúng ghi chú](../04-lien-ket-ghi-chu/nhung-ghi-chu.md).
- **Khung thông báo** — blockquote bao bọc với marker loại như `> [!NOTE]`. Xem [Khung thông báo](../03-trinh-soan-thao/khung-thong-bao.md).
- **Chú thích cuối** — tham chiếu `[^1]` và định nghĩa. Xem [Chú thích cuối](../03-trinh-soan-thao/chu-thich-cuoi.md).
- **Biểu đồ trong khối mã có rào** — `​```mermaid` và `​```excalidraw`. Xem [Biểu đồ](../05-bieu-do/index.md).

Phần còn lại là markdown chuẩn: tiêu đề, danh sách, bảng, khối mã, ảnh, liên kết, blockquote, đường ngang. Trình soạn thảo render chúng khi bạn gõ ([Viết và định dạng](../03-trinh-soan-thao/viet-va-dinh-dang.md)).

## Những gì *không* trong định dạng

- **Không có tag hoặc thuộc tính độc quyền** nung vào markdown. Wikilink và khung thông báo là văn bản; chúng giảm cấp duyên dáng trong bất kỳ trình xem markdown nào.
- **Không có marker vô hình** — không có byte nào trong tệp dựa vào những gì bạn không thấy được trong trình soạn thảo văn bản.
- **Không bước build** — tệp bạn viết là tệp ứng dụng đọc.

## Sửa ghi chú ngoài ứng dụng

Mở chúng trong bất kỳ trình soạn thảo văn bản. Lưu. Ứng dụng nhận thay đổi ở lần tải kế (hoặc ngay lập tức, nếu trình soạn thảo của bạn cho hệ thống tệp báo). Chạy [Lập lại chỉ mục kho](../01-bat-dau/lap-chi-muc-lai.md) nếu kết quả tìm kiếm chưa bắt kịp.

## Tham khảo

- [[Wikilink]]
- [[Nhúng nội dung]]
- [[Khung thông báo]]
- [[Chú thích cuối]]
- [[Biểu đồ]]
- [[Viết và định dạng]]
- [[Lập lại chỉ mục cho kho]]
