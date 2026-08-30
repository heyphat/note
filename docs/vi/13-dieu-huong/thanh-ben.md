---
id: c8f66ebc-5ca7-48d0-b757-294c9bd0d03f
title: Thanh bên
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Thanh bên

Bảng phía bên trái. Bật/tắt với `Cmd/Ctrl + B`. Đó là nhà của mọi bề mặt điều hướng không vừa trong header.

## Các mục

Thanh bên xếp chồng vài mục tùy chọn, mỗi cái bật/tắt độc lập trong popover [thiết lập thanh bên](#thiet-lap):

| Mục | Hiển thị gì |
| --- | --- |
| **Cây ghi chú** | Mọi ghi chú trong kho, được tổ chức theo thư mục. Luôn nhìn được; đây là lõi của thanh bên. |
| **Lịch dải** | Một bộ chọn ngày gọn. Bấm vào ngày để nhảy đến (hoặc tạo) ghi chú hằng ngày cho ngày đó. |
| **Đám mây thẻ** | Mọi thẻ trong kho, kích thước theo tần suất. Bấm vào thẻ để lọc cây ghi chú. |
| **Ghi chú gần đây** | Ghi chú bạn đã mở hoặc sửa gần đây. |
| **Mẫu** | Mẫu có sẵn trong kho. Bấm vào một cái để sinh ghi chú mới từ nó. |
| **Tìm kiếm đã lưu** | Truy vấn được ghim — bấm để chạy lại. |

## Cây ghi chú

- **Thư mục** mở rộng và thu gọn.
- **Bấm phải** bất kỳ ghi chú hoặc thư mục để có hành động: đổi tên, xóa, di chuyển, ghi chú mới trong thư mục này.
- **Kéo và thả** để di chuyển ghi chú giữa thư mục.
- **Đổi tên inline** bằng cách bấm một entry được chọn và sửa.
- **Timestamp cập nhật** có thể bật cho view dòng thời gian dày hơn.

Cây giữ đồng bộ với những gì trên đĩa. Sửa cấu trúc thư mục ngoài ứng dụng và cây cập nhật ở lần lập lại chỉ mục kế.

## Chế độ hiển thị

Cây ghi chú hỗ trợ chế độ **dày** ẩn timestamp và thắt chặt khoảng cách. Bật/tắt từ popover thiết lập thanh bên. Hữu ích trên màn hình nhỏ hoặc khi bạn có nhiều ghi chú và muốn thấy nhiều hơn.

## Thiết lập

Header thanh bên có **biểu tượng bánh răng** mở popover thiết lập. Popover có bốn mục, điều hướng từ thanh trái:

- **General** — hiển thị thanh bên (lịch, thẻ, gần đây, mẫu, tìm kiếm đã lưu), chế độ cây ghi chú dày / thưa, ngôn ngữ, giao diện, thời lượng Pomodoro, lập lại chỉ mục kho.
- **Trợ lý AI** — chọn nhà cung cấp, khoá API, bộ chọn mô hình ([Nhà cung cấp và khóa](../08-ai/nha-cung-cap-va-khoa.md)).
- **Máy chủ MCP** — thêm, sửa, thử, và bật/tắt máy chủ công cụ từ xa mà trợ lý có thể gọi ([Máy chủ MCP](../08-ai/may-chu-mcp.md)).
- **Khu vực nguy hiểm** — xoá toàn bộ chat, quên thư mục kho hiện tại.

## Cái thanh bên không hiển thị

- Bất cứ gì dưới `.assets/` (chats, công việc, đính kèm). Chúng có bề mặt riêng ([Ngăn trò chuyện](../08-ai/ngan-chat.md), [Giao diện công việc](../07-cong-viec/giao-dien-xem.md)).
- Thư mục ẩn như `.git/`. Thanh bên đi cùng allowlist với chỉ mục tìm kiếm.

## Tham khảo

- [[Nhà cung cấp và khóa]]
- [[Ngăn trò chuyện]]
- [[Giao diện xem công việc]]
