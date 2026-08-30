---
id: 14d6fd8a-bffa-41eb-9c87-790ec5faef50
title: Chọn kho lưu
createdAt: 2026-05-10T03:22:29.381Z
updatedAt: 2026-05-10T03:22:29.381Z
---
# Chọn kho lưu

**Kho lưu** chỉ là một thư mục trên máy bạn để chứa ghi chú. Note không quan tâm trong đó đã có gì hoặc bạn còn để gì khác vào; nó đọc và ghi các tệp `.md` của riêng mình bên cạnh bất cứ thứ gì khác sống trong thư mục.

## Chọn một thư mục

Lần đầu tải ứng dụng — hoặc bất kỳ khi nào bạn chưa có kho đang hoạt động — bạn sẽ thấy màn hình chọn thư mục. Bấm **Choose folder…**, và trình duyệt mở bộ chọn thư mục gốc của hệ điều hành.

Vài điều cần biết:

- **Chọn nơi bạn sẽ giữ lâu dài.** Kho là một thư mục bình thường. Đặt nó trong `Documents/Note` hay bất kỳ đâu trong Dropbox / iCloud / Syncthing là chuyện thường; đặt vào `Downloads/` là chuốc rắc rối.
- **Thư mục trống cũng được.** Một thư mục mới hoàn toàn trống là điểm khởi đầu đơn giản nhất.
- **Markdown sẵn có cũng được.** Nếu bạn đã có một thư mục `.md` (ví dụ một kho Obsidian), Note sẽ đọc. Nó ghi lại cùng định dạng — markdown thuần với YAML frontmatter — nên các công cụ hiện có vẫn chạy.

## Trình duyệt sẽ hỏi gì

Hầu hết trình duyệt Chromium sẽ hỏi hai lần ở lần đầu:

1. **Hộp thoại chọn thư mục** — chọn directory.
2. **Hộp thoại quyền** — "cho phép trang này đọc và sửa tệp trong thư mục này?" Hãy chọn *Allow on every visit* (hoặc tương đương), nếu không bạn sẽ phải cấp lại mỗi lần tải lại.

## Qua nhiều lần tải lại

Khi bạn đã cấp quyền, ứng dụng nhớ thư mục cho lần sau. Handle thư mục được lưu trong IndexedDB nên bạn không phải chọn lại mỗi lần. Nếu sau này trình duyệt hết hạn quyền (một số trình duyệt làm điều này khá tích cực), ứng dụng sẽ yêu cầu bạn xác nhận lại.

## Đổi kho

Bạn có thể có nhiều kho trên đĩa và trỏ ứng dụng vào kho bạn muốn. Mở lại bộ chọn thư mục từ trạng thái rỗng hoặc qua popover thiết lập của thanh bên — ứng dụng bỏ handle cũ và nhận handle mới. Ghi chú nằm *trong thư mục của chúng*, nên đổi qua lại chỉ là chuyện trỏ lại.

## Ứng dụng ghi gì

Khi bạn đã có kho, ứng dụng có thể tạo:

- `.assets/` cho ảnh bạn dán vào ghi chú
- `.assets/chats/` cho các chuỗi trò chuyện AI
- `.assets/tasks/` cho các tệp công việc
- Bất kỳ thư mục nào bạn tự tạo, tất nhiên

Không gì khác. Không có cơ sở dữ liệu mờ, không thư mục `.note/`, không tệp metadata kiểu `.DS_Store` cần đồng bộ. Xem [Cấu trúc kho](../02-khai-niem-co-ban/cau-truc-kho.md) cho cấu trúc đầy đủ.

## Còn quyền riêng tư

Thư mục của bạn là thư mục của bạn. Máy chủ host (bất kỳ ai phục vụ trang tĩnh — Vercel, máy chủ của bạn, hoặc `npm run dev` trên laptop) chỉ giao HTML/JS/CSS. Nội dung ghi chú không bao giờ rời khỏi tab. Xem [Ưu tiên cục bộ](../02-khai-niem-co-ban/uu-tien-cuc-bo.md) và [Quyền riêng tư AI](../08-ai/rieng-tu.md) để có bản dài hơn.

## Tham khảo

- [[Cấu trúc kho]]
- [[Ưu tiên cục bộ]]
- [[Quyền riêng tư AI]]
