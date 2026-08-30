---
id: 28919f13-958f-418f-a962-10c0d815daad
title: Ảnh và tệp đính kèm
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Ảnh và tệp đính kèm

Bạn có thể đưa ảnh vào ghi chú theo ba cách:

1. **Dán** — sao chép ảnh vào clipboard, focus trình soạn thảo, dán.
2. **Kéo và thả** — kéo tệp từ trình quản lý tệp vào trình soạn thảo.
3. **Hành động chèn** — menu lệnh gạch chéo và thanh công cụ đều có tùy chọn chèn ảnh.

Cả ba đều kết thúc ở cùng một chỗ.

## Chuyện gì xảy ra trên đĩa

Khi bạn thêm ảnh, ứng dụng:

1. Sinh tên tệp UUID (ví dụ `8b1c4d12-…`).
2. Ghi byte vào `.assets/<uuid>.<ext>` trong kho.
3. Chèn liên kết ảnh đường dẫn tương đối vào ghi chú: `![](.assets/8b1c4d12-….png)`.

Phần cuối quan trọng — liên kết là **tương đối**, nên ảnh sống sót khi di chuyển kho, đồng bộ qua Dropbox / iCloud / Syncthing, hoặc mở từ công cụ markdown khác.

## Loại được hỗ trợ

PNG, JPEG, GIF, WebP, và SVG là các trường hợp chuẩn. Loại khác có thể chạy nhưng không được kiểm thử tích cực. Trình soạn thảo render bất cứ gì trình duyệt biết hiển thị.

## Đặt tên và tái sử dụng

Mỗi lần chèn tạo tệp mới với UUID mới, kể cả khi bạn dán cùng ảnh hai lần. Nếu bạn muốn một ảnh được tham chiếu từ nhiều ghi chú, giữ đường dẫn tệp ổn định (đừng di chuyển hoặc đổi tên) và tái sử dụng liên kết markdown.

## Alt text và chú thích

Bấm vào ảnh để có handle thay đổi kích thước và một thanh công cụ nhỏ nơi bạn sửa được alt text. Alt text là văn bản trong dấu ngoặc vuông trong markdown: `![alt text ở đây](.assets/...)`.

Cho chú thích hiển thị trong view đã render, viết nó như một đoạn văn ngay dưới ảnh — markdown không có cú pháp chú thích hạng nhất.

## Scene Excalidraw

Vẽ Excalidraw chèn qua `/excalidraw` (xem [Excalidraw](../05-bieu-do/excalidraw.md)) cũng lưu tệp scene dưới `.assets/`. Ghi chú giữ một khối rào `​```excalidraw` mà nội dung tham chiếu tệp theo tên.

## Đính kèm khác

Note hôm nay không có quy trình "đính kèm tệp bất kỳ" tích hợp — nó chủ yếu là công cụ ảnh / vẽ. Nếu bạn muốn một tệp không-phải-ảnh sống cạnh ghi chú, tự thả vào kho và tham chiếu bằng liên kết markdown thường: `[manual](manual.pdf)`. Liên kết sẽ chạy trong bất kỳ trình xem markdown nào xử lý đường dẫn tương đối.

## Dọn dẹp

Nếu bạn xóa ghi chú, ảnh được tham chiếu của nó vẫn ở trên đĩa — không có garbage collector cho `.assets/`. Định kỳ bạn có thể tìm kho cho các tham chiếu `.assets/` so với tệp trên đĩa và xóa orphan thủ công. (Phiên bản tương lai của ứng dụng có thể tự động hóa; hôm nay thì chưa.)

## Tham khảo

- [[Excalidraw]]
