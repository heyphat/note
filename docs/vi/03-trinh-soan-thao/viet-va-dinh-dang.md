---
id: 814f9bbf-e9a7-4d8c-8b5c-2f14fe4873e3
title: Viết và định dạng
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Viết và định dạng

Trình soạn thảo nhận cùng cú pháp markdown bạn sẽ tự gõ, và render phần lớn nó khi bạn gõ.

## Định dạng inline

| Markdown | Hiển thị | Phím tắt |
| --- | --- | --- |
| `**đậm**` | **đậm** | `Cmd/Ctrl + B` (với vùng chọn) |
| `*nghiêng*` hoặc `_nghiêng_` | *nghiêng* | `Cmd/Ctrl + I` |
| `~~gạch~~` | ~~gạch~~ | — |
| `` `mã` `` | `mã` | `Cmd/Ctrl + E` |
| `[nhãn](url)` | [nhãn](url) | `Cmd/Ctrl + K` (với vùng chọn) |
| `[[ghi-chu]]` | wikilink | gõ `[[` rồi chọn |

Gõ cú pháp trực tiếp và trình soạn thảo biến nó thành dạng đã render. Bạn cũng có thể chọn văn bản và áp dụng định dạng qua thanh công cụ vùng chọn xuất hiện.

## Cấu trúc cấp khối

| Markdown | Khối |
| --- | --- |
| `# `, `## `, `### ` … | Tiêu đề cấp 1–6 |
| `- ` hoặc `* ` | Danh sách bullet |
| `1. ` | Danh sách đánh số |
| `- [ ] ` | Danh sách công việc (ô tích bấm được) |
| `> ` | Blockquote |
| `> [!NOTE]` | Khung thông báo (xem [Khung thông báo](./khung-thong-bao.md)) |
| ` ``` ` | Khối mã (xem [Khối mã](./khoi-ma.md)) |
| `---` | Đường ngang |
| `|` | Bảng (xem [Bảng](./bang.md)) |

Nhấn **Enter** ở cuối một mục danh sách tạo mục tiếp theo. Nhấn **Enter** trên một mục danh sách trống thoát ra khỏi danh sách. Nhấn **Tab** / **Shift + Tab** thụt vào và thụt ra cho mục danh sách.

## Menu gạch chéo

Gõ `/` ở đầu dòng (hoặc sau khoảng trắng) mở menu lệnh gạch chéo, nơi bạn chèn các khối khó diễn đạt bằng markdown thô — khung thông báo, khối mã có ngôn ngữ, chú thích cuối, nhúng, biểu đồ. Xem [Lệnh gạch chéo](./lenh-gach-cheo.md).

## Liên kết

- **Liên kết web** — dán URL khi văn bản đang được chọn; vùng chọn trở thành nhãn liên kết. Hoặc gõ `[nhãn](url)` trực tiếp.
- **Wikilink** — gõ `[[`, gợi ý từ ghi chú có sẵn, nhấn Enter. Wikilink không cần URL; chúng giải bằng tiêu đề ghi chú. Xem [Wikilink](../04-lien-ket-ghi-chu/wikilink.md).
- **Nhúng nội dung** — `![[Ghi chú]]` chèn nội dung của ghi chú khác. Xem [Nhúng nội dung](../04-lien-ket-ghi-chu/nhung-ghi-chu.md).

## Ảnh

Dán ảnh (từ clipboard, kéo-thả, hoặc hành động chèn ảnh của trình soạn thảo). Ứng dụng lưu nó vào `.assets/<uuid>.png` và chèn liên kết ảnh vào ghi chú. Xem [Ảnh và tệp đính kèm](./anh-va-tep-dinh-kem.md).

## Thanh công cụ vùng chọn

Bôi đen một đoạn văn bản và một thanh công cụ nhỏ xuất hiện với những hành động định dạng phổ biến nhất và một nút "Hỏi AI". Nút AI mở [ngăn trò chuyện](../08-ai/ngan-chat.md) với vùng chọn được nạp sẵn.

## Hoàn tác và làm lại

Phím tắt trình soạn thảo chuẩn: `Cmd/Ctrl + Z` để hoàn tác, `Cmd/Ctrl + Shift + Z` để làm lại. Lịch sử hoàn tác là theo từng ghi chú và theo từng phiên; để lùi xa hơn, dùng [Ảnh chụp lịch sử](../10-lich-su/index.md).

## Tham khảo

- [[Khung thông báo]]
- [[Khối mã]]
- [[Bảng]]
- [[Lệnh gạch chéo]]
- [[Wikilink]]
- [[Nhúng nội dung]]
- [[Ảnh và tệp đính kèm]]
- [[Ngăn trò chuyện]]
- [[Lịch sử và khôi phục]]
