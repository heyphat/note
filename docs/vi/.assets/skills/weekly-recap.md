---
id: 7d1c8b4e-3a9f-42d6-b8e5-9c4f2d8a1e7b
name: weekly-recap
description: Tạo tóm tắt tuần có cấu trúc từ các ghi chú đã sửa trong 7 ngày qua
---
# Tóm tắt tuần

Tạo một trang tóm tắt tuần của người dùng, dựa trên các ghi chú đã sửa trong 7 ngày qua.

## Quy trình

1. Gọi `search_vault({ query: "*", limit: 50 })` để liệt kê các ghi chú gần đây. Chỉ mục tìm kiếm sắp theo độ mới, nên hoạt động mới nhất sẽ ở trên cùng.
2. Với mỗi kết quả có `updatedAt` nằm trong 7 ngày qua, gọi `read_note({ id })`. Bỏ qua tệp công việc (`.assets/tasks/...`) và chat (`.assets/chats/...`) — chúng có bề mặt riêng.
3. Từ nội dung mỗi ghi chú, trích xuất:
   - **việc đã xong** — bất kỳ thứ gì được phát biểu là hoàn thành, đã ship, đã merge, hoặc đã giải quyết
   - **trở ngại** — bất kỳ thứ gì được phát biểu là đang kẹt, đang chờ, hoặc không thể
   - **quyết định** — bất kỳ thứ gì có các từ đã quyết định, đã đồng ý, đã chọn, đã chốt
   - **kế tiếp** — bất kỳ thứ gì trong mục "bước tiếp" / "TODO" / "việc cần theo dõi"

## Đầu ra

Tạo một ghi chú mới trong thư mục hiện tại của người dùng qua `create_note`. Dùng đúng cấu trúc này:

```markdown
# Tuần {YYYY-MM-DD}

## Việc đã xong
- {một bullet cho mỗi việc đã xong, liên kết nguồn qua [[note-id]]}

## Trở ngại
- {bullets, liên kết nguồn}

## Quyết định
- {bullets, liên kết nguồn}

## Tuần sau
- {bullets, liên kết nguồn}
```

Ngày của tuần là thứ Hai trước hôm nay (hoặc hôm nay, nếu hôm nay là thứ Hai).

## Quy tắc

- Trích nguồn mọi bullet bằng `[[wikilink]]` đến ghi chú nguồn. Không có bullet nào không có nguồn.
- Nếu một mục không có gì, viết `- _Không có gì tuần này._` thay vì bỏ heading. Cấu trúc cố định giúp so sánh tháng-này-với-tháng-trước dễ hơn sau này.
- Đừng bình luận. Tóm tắt là một digest có cấu trúc, không phải tóm lược tường thuật. Trích nguyên văn từ ghi chú nguồn được ưu tiên hơn diễn giải.
- Nếu bạn tìm thấy ít hơn ba ghi chú trong khoảng thời gian, dừng lại và nói với người dùng — không đủ chất liệu cho một tóm tắt có ý nghĩa.
