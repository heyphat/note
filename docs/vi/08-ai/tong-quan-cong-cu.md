---
id: 479e1ff9-00a3-424a-a52f-823c9472763d
title: Tổng quan công cụ
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Tổng quan công cụ

AI có thể gọi **công cụ** — các hành động có cấu trúc nhỏ mà tên và tham số được nói cho mô hình biết trước. Khi mô hình gọi công cụ, ngăn trò chuyện hoặc chạy nó ngay (chỉ-đọc) hoặc hiển thị nó dưới dạng thẻ để bạn duyệt (thay đổi).

## Hai loại

| Loại | Công cụ ví dụ | Hành vi |
| --- | --- | --- |
| **Chỉ-đọc** | `search_vault`, `search_tasks`, `read_note`, cộng với phần lớn công cụ MCP | Tự chạy. Kết quả được đưa trở lại cuộc trò chuyện. Bạn thấy *rằng* cuộc gọi đã xảy ra và nó tìm ra gì. |
| **Thay đổi** | `edit_note`, `rewrite_note`, `create_note`, `manage_tasks`, cộng với công cụ MCP mà máy chủ đánh dấu `destructiveHint: true` | Render thành **thẻ proposed-edit** với Apply / Discard. Không gì đổi trên đĩa đến khi bạn bấm Apply. |

Sự chia tách tồn tại vì cuộc gọi chỉ-đọc khả nghịch (tệ nhất là một vòng round-trip token tốn) trong khi cuộc gọi thay đổi có thể đổi ghi chú của bạn — và bạn muốn thấy chính xác *cái gì* trước khi điều đó xảy ra.

## Cuộc gọi công cụ trông như thế nào trong cuộc trò chuyện

- **Chỉ-đọc**: một ghi chú nội dòng nhỏ kiểu "🔍 search_vault — query: 'q1 plan', 4 hits" với đoạn trích nhìn được nếu bạn mở ra. Câu trả lời của mô hình dùng kết quả.
- **Thay đổi**: một thẻ hiển thị thay đổi đề xuất (một diff cho `edit_note`, một thân đầy đủ mới cho `rewrite_note`, ghi chú nháp cho `create_note`, một thay đổi công việc cho `manage_tasks`). Hai nút: **Apply** và **Discard**.

## "Apply" làm gì

- Cho `edit_note` — thay thế substring đã khớp trong ghi chú đang mở. Nếu substring không còn duy nhất nữa (vì bạn đã sửa từ khi mô hình đề xuất), Apply lỗi với thông báo và bạn có thể hủy hoặc yêu cầu mô hình thử lại.
- Cho `rewrite_note` — thay thế toàn bộ thân của ghi chú đang mở. Frontmatter được giữ.
- Cho `create_note` — viết một tệp mới ở đường dẫn đề xuất. Thư mục được tạo nếu thiếu.
- Cho `manage_tasks` — áp dụng thay đổi đề xuất (`create_task`, `complete_task`, `uncomplete_task`, `update_task`, `delete_task`) trên tệp phù hợp trong `.assets/tasks/`.

## "Discard" làm gì

Hủy đề xuất. Cuộc trò chuyện tiếp tục, nhưng mô hình được biết chỉnh sửa bị từ chối và có thể điều chỉnh.

## Vì sao công cụ chỉ-đọc tự chạy

Nếu mỗi tìm kiếm hoặc đọc cần phê duyệt, mô hình không thể làm gì hữu ích. Một truy vấn điển hình "tóm tắt ghi chú gần đây của tôi" liên quan đến vài cuộc gọi tìm và đọc; chặn mỗi cái sẽ làm trải nghiệm không dùng được. Công cụ chỉ-đọc có phạm vi đủ chặt (không path traversal, không `.assets/`, giới hạn cứng trên kích thước phản hồi) nên tự chạy là an toàn.

## Công cụ chỉ-đọc *không thể* đọc gì

Công cụ `read_note` được rào ở cùng đường dẫn mà thanh bên hiển thị: tệp `.md` ngoài bất kỳ thư mục có dấu chấm đầu hoặc thư mục `*.assets/`. Vì vậy:

- Chuỗi chat trong `.assets/chats/` — **không đọc được**.
- Công việc trong `.assets/tasks/` — **không đọc được** bởi `read_note` (dùng `search_tasks` cho công việc).
- Thư mục ẩn như `.git/` — **không đọc được**.

Điều này bảo vệ bạn khỏi một ghi chú bị inject lời nhắc (hoặc một mô hình bối rối) đọc lịch sử cuộc trò chuyện AI của bạn vào cuộc trò chuyện mới. Xem [Quyền riêng tư](./rieng-tu.md).

## Công cụ từ MCP

Ngoài công cụ tích hợp, bất kỳ công cụ nào được [máy chủ MCP](./may-chu-mcp.md) quảng bá đều tham gia cùng danh sách. Chúng được đặt namespace thành `mcp__<server>__<tool>` — ví dụ công cụ `search_cloudflare_documentation` từ máy chủ tên `cloudflare-docs` trở thành `mcp__cloudflare_docs__search_cloudflare_documentation`. Mô hình được thông báo về chúng trong system prompt và có thể gọi bất kỳ cái nào theo tên.

Công cụ MCP mặc định **tự chạy** — cùng hành vi với công cụ đọc tích hợp. Máy chủ có thể chọn đưa một công cụ vào luồng phê duyệt bằng cách đánh dấu `destructiveHint: true`; mọi thứ khác chạy ngay và đưa kết quả về cuộc trò chuyện.

## Xử lý lỗi công cụ

Nếu một cuộc gọi công cụ thất bại — input xấu, find-string không tìm thấy, path traversal cố gắng, máy chủ MCP không truy cập được — chat hook trả về một lỗi có cấu trúc mà mô hình thấy ở lượt kế. Mô hình có thể sửa và thử lại. Bạn cũng thấy lỗi, trong cuộc trò chuyện, để biết vì sao thay đổi đề xuất không thông qua.

## Tham khảo

- [[Máy chủ MCP]]
- [[Quyền riêng tư AI]]
