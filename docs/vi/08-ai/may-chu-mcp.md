---
id: a3f8b1d4-6c5e-4a9b-9f2d-8e1c4b7a3d6f
title: Máy chủ MCP
createdAt: 2026-05-11T00:00:00.000Z
updatedAt: 2026-05-11T00:00:00.000Z
---
# Máy chủ MCP

**Model Context Protocol** là chuẩn cho phép trợ lý AI gọi công cụ từ xa — tra tài liệu Cloudflare, truy vấn repo GitHub, tìm issue Linear, lấy model card Hugging Face. Cấu hình một máy chủ MCP và các công cụ của nó trở thành một phần của cùng bề mặt chat như các công cụ tích hợp (`search_vault`, `edit_note`, v.v.).

Trợ lý không có "kỹ năng" mới — nó có thêm công cụ có thể chọn gọi. Bạn không cần gọi tên cụ thể; mô hình tự chọn khi yêu cầu cần.

## Thêm máy chủ

Mở **Thiết lập → Máy chủ MCP** (biểu tượng bánh răng trên thanh bên, rồi chọn tab MCP).

Bấm **+ Thêm máy chủ MCP**. Hai chế độ nhập:

- **Biểu mẫu** — tên, URL điểm cuối, giao vận (HTTP hoặc SSE), header tuỳ chọn.
- **JSON** — dán cấu hình kiểu Claude Code / Claude Desktop và để ứng dụng phân tích. Một lần dán có thể thêm nhiều máy chủ trong một bước.

Cấu trúc JSON mà bộ nhập chấp nhận:

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "type": "http",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

Một đối tượng máy chủ phẳng (`{"name": "...", "url": "...", ...}`) hoặc một mảng các đối tượng cũng được. Nếu bạn dán lại cấu hình có URL trùng với máy chủ đã tồn tại, dòng đó được cập nhật thay vì tạo bản sao.

## Giao vận

| Giao vận | Khi nào dùng |
| --- | --- |
| **HTTP** | Các máy chủ "Streamable HTTP" hiện đại. Mặc định. |
| **SSE** | Các máy chủ Server-Sent Events kiểu cũ. Một số MCP host vẫn yêu cầu loại này; tài liệu máy chủ sẽ nói rõ. |

Cả hai đều chạy hoàn toàn trong trình duyệt — không proxy, không backend.

## Xác thực

Chỉ header tĩnh. Mẫu phổ biến nhất là `Authorization: Bearer <token>`, nhưng bạn có thể thêm bất kỳ header nào máy chủ yêu cầu. Header lưu trong `localStorage` của trình duyệt, cùng nơi với khoá API nhà cung cấp, và chỉ được gửi cho URL đã cấu hình.

**Chưa hỗ trợ OAuth.** Các máy chủ yêu cầu OAuth (Linear, Notion, Atlassian, Asana, Stripe, Sentry, và nhiều dịch vụ khác) chưa thể thêm qua biểu mẫu này vì trình duyệt không thể hoàn tất luồng OAuth. Token kiểu PAT vẫn hoạt động bình thường.

## Trạng thái

Mỗi máy chủ đã cấu hình có một huy hiệu trạng thái bên cạnh tên:

| Trạng thái | Ý nghĩa |
| --- | --- |
| **Đã kết nối** | Bắt tay thành công. Số lượng công cụ hiển thị bên cạnh giao vận. |
| **Đang kết nối** | Giao vận vẫn đang bắt tay. Thường là trạng thái tạm thời. |
| **Lỗi** | Kết nối thất bại. Thông điệp lỗi hiển thị nội dòng bên cạnh giao vận. |
| **Đã tắt** | Toggle đang tắt. Bật lên để thử kết nối. |

Thông điệp lỗi đến trực tiếp từ máy chủ hoặc giao vận, nên nếu nói "Authorization header is badly formatted" thì token sai; nếu là lỗi CORS thì máy chủ không cho phép origin từ trình duyệt.

## Hành động cho mỗi máy chủ

- **Thử** — mở kết nối ngắn vừa đủ để liệt kê công cụ, rồi đóng. Toast cho biết máy chủ quảng bá bao nhiêu công cụ (hoặc lỗi gì xảy ra).
- **Sửa** — thay đổi URL, header, hoặc giao vận. Lưu thay đổi sẽ tháo kết nối đang có và kết nối lại với cấu hình mới.
- **Xoá** — gỡ máy chủ. Cuộc trò chuyện mất ngay quyền truy cập công cụ của nó.
- **Toggle Bật** — tắt máy chủ mà không xoá. Token và cấu hình được giữ lại.

## Công cụ MCP xuất hiện trong chat thế nào

Khi máy chủ ở trạng thái **Đã kết nối**, công cụ của nó tham gia danh sách công cụ của trợ lý. Chúng được đặt namespace thành `mcp__<server>__<tool>` để không trùng với công cụ tích hợp. Mô hình thấy mô tả ngắn cho mỗi cái trong system prompt cùng mô tả mà máy chủ quảng bá.

Trong cuộc trò chuyện, công cụ MCP cư xử như công cụ chỉ-đọc tích hợp: ngăn trò chuyện **tự chạy** chúng và đưa kết quả trở lại cho mô hình ở lượt kế, để trợ lý có thể tóm tắt cái trở về. Bạn không thấy thẻ phê duyệt từng cuộc gọi. Ngoại lệ duy nhất là công cụ mà máy chủ đánh dấu `destructiveHint: true` — chúng vẫn đi qua luồng Apply / Discard.

Nếu mô hình nói nó không có công cụ MCP nào, nguyên nhân phổ biến nhất là không có máy chủ nào ở trạng thái **Đã kết nối**. Mở Thiết lập → Máy chủ MCP và kiểm tra huy hiệu trạng thái.

## Giới hạn trình duyệt

- **Không có máy chủ stdio.** Client này chỉ nói HTTP và SSE — bất cứ gì chạy như tiến trình con cục bộ đều không truy cập được.
- **CORS quan trọng.** Máy chủ đích phải phản hồi CORS cho phép cho origin của bạn (ví dụ `https://notes.example.com` hoặc `http://localhost:3000`). Nhiều MCP host từ chối origin trình duyệt; nút **Thử** là cách nhanh nhất để biết.
- **Không OAuth.** Xem ở trên.

## Đã xác nhận hoạt động trong trình duyệt

Các máy chủ MCP công khai sau kết nối từ trình duyệt không cần OAuth:

- **DeepWiki** — `https://mcp.deepwiki.com/mcp` (HTTP). Tài liệu kiểu wiki cho repo GitHub.
- **Cloudflare docs** — `https://docs.mcp.cloudflare.com/sse` (SSE). Tìm và đọc tài liệu Cloudflare.
- **Hugging Face** — `https://huggingface.co/mcp` (HTTP) với bearer token. Model card, dataset, paper.
- **Context7** — `https://mcp.context7.com/mcp` (HTTP) với API key. Tài liệu thư viện và framework.

Các máy chủ khác cũng có thể hoạt động — chọn cái mà tài liệu nói rõ về điểm cuối HTTP/SSE từ xa.

## Quyền riêng tư

- URL máy chủ và header sống trong `localStorage` của trình duyệt. Chúng không bao giờ được gửi đến máy chủ mà ứng dụng được tải từ đó.
- Cuộc gọi công cụ đi thẳng từ trình duyệt đến máy chủ MCP đã cấu hình.
- Xem [Quyền riêng tư](./rieng-tu.md) để có bức tranh đầy đủ.

## Tham khảo

- [[Tổng quan công cụ]]
- [[Ngăn trò chuyện]]
- [[Quyền riêng tư AI]]
