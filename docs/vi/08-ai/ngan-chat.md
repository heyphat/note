---
id: 1e920d03-287f-4ea0-bc48-868d7df24650
title: Ngăn trò chuyện
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Ngăn trò chuyện

Ngăn trò chuyện là nhà của AI trong ứng dụng. Mở với `Cmd/Ctrl + \`. Nó trượt vào từ bên cạnh và neo vào **ghi chú đang mở**.

## Giải phẫu

- **Feed cuộc trò chuyện** — tin nhắn của bạn và phản hồi của assistant, theo thứ tự. Markdown được render (danh sách, khối mã, khung thông báo) cùng cách như trong ghi chú.
- **Ô soạn** — nơi bạn gõ tin nhắn kế. Nhiều dòng được hỗ trợ.
- **Bộ chọn mô hình** — đổi giữa nhà cung cấp / mô hình đã cấu hình.
- **Danh sách chuỗi** — mỗi chuỗi đã lưu cho ghi chú đang mở là một mục bấm được. Một ghi chú mới có không chuỗi đến khi bạn bắt đầu một cái.

## Cách cuộc trò chuyện hoạt động

1. Bạn hỏi một câu hỏi.
2. Ứng dụng gửi tin nhắn đến nhà cung cấp đã cấu hình, với ngữ cảnh hệ thống bao gồm nội dung ghi chú đang mở và một danh sách ngắn các thư mục kho.
3. Mô hình có thể trả lời trực tiếp hoặc gọi một **công cụ** (tìm kho, đọc ghi chú khác, sửa ghi chú đang mở, tạo ghi chú, quản lý công việc, hoặc bất kỳ công cụ nào được [máy chủ MCP](./may-chu-mcp.md) quảng bá). Công cụ xuất hiện trong cuộc trò chuyện dưới dạng thẻ bạn có thể xem xét.
4. **Công cụ chỉ-đọc** (`search_vault`, `search_tasks`, `read_note`, cộng với phần lớn công cụ MCP) tự chạy và đưa kết quả trở lại ngữ cảnh mô hình. Bạn thấy cái gì được tìm, nhưng ứng dụng không hỏi quyền.
5. **Công cụ thay đổi** (`edit_note`, `rewrite_note`, `create_note`, `manage_tasks`, cộng với công cụ MCP được đánh dấu phá hủy) render thành **thẻ proposed-edit** với nút **Apply** và **Discard**. Không gì đổi trên đĩa đến khi bạn bấm Apply.
6. Mô hình có thể đi nhiều lượt và xâu nhiều cuộc gọi công cụ trước khi dừng.

Xem [Tổng quan công cụ](./tong-quan-cong-cu.md), [Công cụ đọc](./cong-cu-doc.md), [Công cụ chỉnh sửa](./cong-cu-chinh-sua.md), và [Máy chủ MCP](./may-chu-mcp.md).

## Streaming

Phản hồi stream từng token. Bạn có thể cuộn lại qua câu trả lời dài khi phần còn lại vẫn đang sinh; bạn cũng có thể dừng việc sinh đã đi sai (khu vực soạn hiển thị nút Stop khi phản hồi đang trong air).

## Chuỗi trên đĩa

Mỗi chuỗi được lưu trong `.assets/chats/` dưới dạng tệp markdown. Tên tệp là `<note>__<timestamp>.md`:

```
.assets/chats/q1-plan__2026-04-25-1430.md
```

Nội dung là markdown thuần — tin nhắn của bạn, phản hồi của assistant, lệnh gọi công cụ được ghi nhận. Bạn có thể:

- **Tìm** chat với công cụ kho thông thường (đám mây thẻ sẽ không giúp được — chat sống trong `.assets/`, mà chỉ mục tìm kiếm loại trừ — nhưng bạn có thể grep thư mục, hoặc mở tệp trực tiếp).
- **Version** chúng trong git, cùng với phần còn lại của kho.
- **Xóa** bất kỳ chuỗi nào bạn không muốn; chỉ cần xóa tệp.

## Chọn chuỗi

Danh sách chuỗi là theo từng ghi chú. Chuyển sang ghi chú khác trong trình soạn thảo hiển thị các chuỗi của ghi chú đó. Chuỗi từ ghi chú khác được ẩn đến khi bạn chuyển lại, nhưng chúng không bị mất — chúng là tệp trong `.assets/chats/`.

## Xóa chats

Popover thiết lập thanh bên có hành động **Clear all chats** loại bỏ mọi tệp khỏi `.assets/chats/`. Dùng cẩn thận; không có undo.

## AI nhận gì làm ngữ cảnh

Theo mặc định, mỗi tin nhắn cuộc trò chuyện kèm:

- Phần thân đầy đủ của ghi chú đang mở.
- Danh sách tên thư mục trong kho (để mô hình chọn thư mục hợp lý khi tạo ghi chú mới).
- Cuộc trò chuyện cho đến giờ trong chuỗi này.

Nó **không** tự động kèm nội dung của các ghi chú khác. Mô hình có thể kéo các ghi chú khác qua [công cụ `read_note`](./cong-cu-doc.md) khi nó quyết định cần.

## Kết thúc chuỗi

Không có "kết thúc" rõ ràng — đóng ngăn hoặc đổi ghi chú và chuỗi vẫn còn. Mở lại để tiếp tục.

## Tham khảo

- [[Tổng quan công cụ]]
- [[Công cụ đọc]]
- [[Công cụ chỉnh sửa]]
