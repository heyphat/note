---
id: c80780a1-e036-4d1e-9e30-53a91629f487
title: Tạo ghi chú đầu tiên
createdAt: 2026-05-10T03:22:30.146Z
updatedAt: 2026-05-10T03:22:30.146Z
---
# Tạo ghi chú đầu tiên

Khi bạn đã chọn kho, ứng dụng đưa bạn vào trạng thái rỗng với thanh bên ở bên trái và một gợi ý về việc tạo ghi chú đầu tiên.

## Cách tạo ghi chú

Ba cách, tương đương:

- **Phím tắt.** `Ctrl + N` trên macOS, `Ctrl + Alt + N` trên Windows / Linux. (`Cmd + N` bị trình duyệt giữ cho "cửa sổ mới", nên ứng dụng dùng `Ctrl + N` trên macOS.)
- **Nút "+"** trong thanh bên (header).
- **Bảng lệnh.** `Cmd/Ctrl + K`, gõ `> new note`, nhấn Enter.

Một ghi chú mới xuất hiện ngay lập tức, với con trỏ ở ô tiêu đề. Gõ tiêu đề, nhấn Enter hoặc Tab, bắt đầu viết.

## Cách lưu hoạt động

Bạn không nhấn Save. Ứng dụng tự động lưu liên tục:

- **Tiêu đề** được debounce — dừng một chút và ứng dụng đổi tên tệp trên đĩa cho khớp.
- **Nội dung** cũng được debounce — mỗi phím gõ ý nghĩa được lưu trong một-hai giây.
- **`Cmd/Ctrl + S`** đẩy mọi thay đổi đang chờ ngay lập tức, hữu ích ngay trước khi bạn đóng tab.

Nếu tab trình duyệt bị giết giữa lúc lưu, ứng dụng giữ một ảnh chụp khôi phục để bạn lấy lại nội dung dở dang ở lần tải kế tiếp. Xem [Khôi phục](../10-lich-su/khoi-phuc.md).

## Tệp nằm ở đâu

Ghi chú mới của bạn là một tệp `.md` bình thường trong thư mục kho. Nếu bạn đặt tiêu đề "Sách cần đọc", bạn sẽ tìm thấy nó ở `<kho-cua-ban>/Sách cần đọc.md` (hoặc trong subfolder được chọn).

Tệp có một khối YAML frontmatter nhỏ ở đầu — `id`, `title`, `createdAt`, `updatedAt` — rồi đến nội dung của bạn. Bạn có thể mở tệp trong bất kỳ trình soạn thảo văn bản nào và frontmatter vẫn nguyên qua mọi vòng đọc/ghi. Xem [Markdown và frontmatter](../02-khai-niem-co-ban/markdown-va-frontmatter.md).

## Làm gì tiếp

- Thử [wikilink](../04-lien-ket-ghi-chu/wikilink.md): gõ `[[` và bắt đầu liên kết các ghi chú với nhau.
- Thử [lệnh gạch chéo](../03-trinh-soan-thao/lenh-gach-cheo.md): gõ `/` và trình soạn thảo cung cấp khung thông báo, khối mã, bảng, biểu đồ.
- Thiết lập [AI](../08-ai/index.md) nếu bạn muốn một ngăn trò chuyện biết về các ghi chú trong kho của bạn.

## Tham khảo

- [[Khôi phục]]
- [[Markdown và frontmatter]]
- [[Wikilink]]
- [[Lệnh gạch chéo]]
- [[AI]]
