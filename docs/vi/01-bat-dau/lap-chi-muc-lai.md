---
id: 311f737a-1cb5-49be-994b-e781857d1c7e
title: Lập lại chỉ mục cho kho
createdAt: 2026-05-10T03:22:30.609Z
updatedAt: 2026-05-10T03:22:30.609Z
---
# Lập lại chỉ mục cho kho

Note giữ một chỉ mục tìm kiếm trong bộ nhớ của các ghi chú (tiêu đề, nội dung, thẻ) và một chỉ mục công việc riêng cho `.assets/tasks/`. Cả hai được dựng khi kho được tải và cập nhật khi bạn chỉnh sửa. Phần lớn thời gian bạn không bao giờ phải nghĩ đến.

## Khi nào nên lập lại chỉ mục

Tìm tới nút **Reindex vault** trong popover thiết lập thanh bên khi:

- Bạn **chỉnh sửa ghi chú bên ngoài Note** (trong trình soạn thảo markdown khác, qua công cụ đồng bộ, qua script). Nội dung trên đĩa đúng, nhưng chỉ mục trong bộ nhớ đã cũ.
- Bạn **đổi tên hoặc di chuyển nhiều tệp cùng lúc** trong trình quản lý tệp. Các thao tác hàng loạt vượt qua đường watch.
- **Kết quả tìm kiếm không phản ánh điều bạn biết là có trong kho.** Ghi chú mới tạo bị thiếu, ghi chú đã xóa vẫn xuất hiện, thẻ trông sai.
- **Công việc không xuất hiện** trong các giao diện công việc dù tệp tồn tại trong `.assets/tasks/`.

## Nó làm gì

Lập lại chỉ mục đi qua kho từ đầu, đọc lại mọi tệp `.md`, phân tích frontmatter và thẻ, rồi xây dựng lại:

- Chỉ mục toàn văn MiniSearch (dùng bởi bảng lệnh và công cụ `search_vault` của AI).
- Chỉ mục công việc (dùng bởi các giao diện công việc và công cụ `search_tasks` của AI).
- Đồ thị wikilink (dùng bởi liên kết ngược và biểu đồ quan hệ).

Nó **không** sửa đổi tệp nào trên đĩa. Nó là thao tác chỉ-đọc trên đĩa; chỉ xây lại những gì trong bộ nhớ.

## Mất bao lâu

Một kho vài trăm ghi chú lập lại chỉ mục trong một phần nhỏ của giây. Một kho hàng chục nghìn ghi chú có thể mất vài giây. Ứng dụng hiển thị thanh tiến trình khi đang chạy và vẫn dùng được — bạn vẫn gõ được.

## Tìm nút ở đâu

Mở popover **thiết lập thanh bên** (biểu tượng bánh răng trong header thanh bên). Hành động **Reindex vault** ở đó, cùng với các điều khiển khác phạm vi kho (như xóa toàn bộ chuỗi chat).
