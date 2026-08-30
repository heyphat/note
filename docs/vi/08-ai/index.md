---
id: df6813c9-8b0e-413c-b2a5-34d50fed33fc
title: AI
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# AI

Note đi kèm một ngăn trò chuyện AI biết về các ghi chú trong kho và có thể đề xuất chỉnh sửa cho chúng. Mô hình là cái bạn trỏ ứng dụng vào — Claude của Anthropic, một mô hình OpenAI, hoặc mô hình Google Vertex / Gemini. Bạn mang khóa API; ứng dụng lo việc kết nối.

Bốn điều làm tích hợp AI của Note khác với "một nút AI trong ứng dụng ghi chú":

- **Bạn mang khóa của bạn.** Không có gói thuê bao Note, không upsell, không proxy server trong đường đi. Tab của bạn nói chuyện trực tiếp với nhà cung cấp.
- **Nó có công cụ.** Mô hình có thể tìm kho, đọc ghi chú, sửa ghi chú đang mở, tạo ghi chú mới, và quản lý công việc. Công cụ thay đổi xuất hiện dưới dạng thẻ bạn Apply.
- **Nó nói MCP.** Cắm vào bất kỳ máy chủ Model Context Protocol từ xa nào — tra tài liệu, GitHub, Hugging Face — và công cụ của nó tham gia cùng bề mặt chat như công cụ tích hợp.
- **Cuộc trò chuyện được lưu thành markdown.** Mỗi chuỗi chat được lưu trong `.assets/chats/` dưới dạng tệp `.md` thường. Tìm kiếm được, version-control được, xóa được.

## Trong mục này

- [Nhà cung cấp và khóa](./nha-cung-cap-va-khoa.md) — Anthropic, OpenAI, Google. Khóa đi đâu.
- [Ngăn trò chuyện](./ngan-chat.md) — mở, theo chuỗi, cuộc trò chuyện được lưu ở đâu.
- [Tổng quan công cụ](./tong-quan-cong-cu.md) — chỉ-đọc tự chạy so với thẻ proposed-edit.
- [Công cụ đọc](./cong-cu-doc.md) — `search_vault`, `search_tasks`, `read_note`.
- [Công cụ chỉnh sửa](./cong-cu-chinh-sua.md) — `edit_note`, `rewrite_note`, `create_note`, `manage_tasks`.
- [Kỹ năng](./ky-nang.md) — dạy trợ lý cách làm một công việc lặp đi lặp lại từ một tệp markdown.
- [Máy chủ MCP](./may-chu-mcp.md) — thêm máy chủ công cụ từ xa để mở rộng trợ lý.
- [Hỏi về vùng chọn](./hoi-ve-vung-chon.md) — phím tắt hỏi nhanh từ bất kỳ văn bản nào.
- [Quyền riêng tư](./rieng-tu.md) — nhà cung cấp thấy gì, host thấy gì (không gì).

## Khởi đầu nhanh

1. Mở [thiết lập thanh bên](../13-dieu-huong/thanh-ben.md) → mục **Trợ lý AI**.
2. Chọn nhà cung cấp, dán khóa API.
3. Mở ngăn trò chuyện với `Cmd/Ctrl + \`.
4. Hỏi gì đó. Mô hình có thể tìm kho và đề xuất chỉnh sửa cho ghi chú đang mở.

Tuỳ chọn, thêm công cụ từ xa mà mô hình có thể gọi: **Thiết lập → Máy chủ MCP**. Xem [Máy chủ MCP](./may-chu-mcp.md).

Nếu bạn không muốn dùng AI, bạn không phải thiết lập gì — mọi tính năng khác trong ứng dụng chạy mà không cần khóa.
