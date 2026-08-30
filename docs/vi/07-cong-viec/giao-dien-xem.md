---
id: 1aa0fe79-e3f1-49f9-8b87-1ce12e2c40a5
title: Giao diện xem công việc
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Giao diện xem công việc

Có bốn cách nhìn công việc của bạn. Mỗi cái giỏi cho một dạng câu hỏi khác.

## Vault tasks view (`Cmd/Ctrl + Shift + K`)

Giao diện toàn-kho: mọi công việc trong `.assets/tasks/`, bất kể chúng thuộc dự án nào.

- Lọc theo trạng thái, độ ưu tiên, thẻ, bối cảnh, dự án, ngày due.
- Sắp xếp theo due, scheduled, độ ưu tiên, tạo, sửa.
- Thao tác hàng loạt trên các công việc được chọn (hoàn thành, xóa, đổi độ ưu tiên).
- Bấm vào công việc để mở trong [modal form công việc](./tao-va-chinh-sua.md).

Đây là view đúng cho sàng lọc — "cái gì còn mở và quá hạn?" — và cho review cuối tuần.

## Bảng danh sách công việc

View danh sách gọn, render dưới dạng panel thanh bên / ngăn phải. Cùng khả năng lọc / sắp xếp như vault view nhưng không cần khoảng diện màn hình của một trang đầy đủ.

Hữu ích khi bạn muốn công việc nhìn được *trong khi* bạn đang sửa ghi chú.

## Bảng kanban

Một board với cột mỗi trạng thái. Kéo thẻ giữa các cột để đổi trạng thái; thẻ hiển thị tiêu đề, ngày due, và màu độ ưu tiên.

Cột trạng thái được suy ra từ các trạng thái có trong kho — nếu bạn đã dùng `open`, `in-progress`, `done`, đó là cột của bạn. Thêm trạng thái thứ tư (ví dụ `blocked`) bằng cách đặt nó trên một công việc, và một cột mới xuất hiện.

View kanban tốt cho **hình dáng-công-việc-đang-bay** — "đĩa của tôi đầy bao nhiêu, và mọi thứ ở đâu?"

## Bảng công việc dự án

Sống trong [ngăn phải](../13-dieu-huong/ngan-phai.md). Hiển thị công việc mà trường `projects` chứa wikilink đến **ghi chú đang mở**.

Vậy nếu bạn đang sửa `[[Q2 Launch]]`, panel hiển thị mọi công việc liên kết đến dự án đó. Đó là nơi tự nhiên để nhìn khi bạn làm trên một dự án — danh sách công việc và ghi chú dự án ở cạnh nhau.

## Cái chúng chia sẻ

Cả bốn view đọc từ cùng chỉ mục công việc:

- Một công việc tạo trong bất kỳ view nào xuất hiện trong các view khác.
- Một công việc hoàn thành trong view kanban cũng hoàn thành trong view danh sách.
- Bộ lọc trong một view không tràn sang view khác; mỗi cái độc lập.

## AI vừa khít vào đâu

Công cụ `search_tasks` của AI chạy trên cùng chỉ mục. Yêu cầu ngăn chat "cái gì quá hạn và độ ưu tiên cao?" cho bạn cùng tập mà bộ lọc của vault view sẽ. AI cũng có thể tạo, hoàn thành, cập nhật, và xóa công việc qua [`manage_tasks`](../08-ai/cong-cu-chinh-sua.md) — mọi thay đổi xuất hiện như thẻ bạn Apply.

## Tham khảo

- [[Tạo và chỉnh sửa công việc]]
- [[Ngăn phải]]
- [[Công cụ chỉnh sửa]]
