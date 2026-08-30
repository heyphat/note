---
id: a13c23db-fadb-401b-b36d-93a61e3a24d0
title: Định tuyến URL
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Định tuyến URL

Ghi chú đang mở được phản ánh trong URL trang. Nút back / forward của trình duyệt điều hướng qua lịch sử ghi chú của bạn.

## URL trông như thế nào

Khi bạn đang sửa ghi chú ở `Projects/Q2 plan.md`, slug URL trông kiểu:

```
http://localhost:3000/en/projects/q2-plan
```

Các phần:

- **Tiền tố ngôn ngữ** (`/en/`, `/vi/`) — đặt bởi lớp i18n của ứng dụng. Xem [Ngôn ngữ](../14-tuy-bien/ngon-ngu.md).
- **Slug đường dẫn** — sinh từ đường dẫn ghi chú trong kho. Khoảng trắng thành dấu nối; ký tự đặc biệt bị bỏ hoặc escape.

Slug được **giải so với kho đang hoạt động**. Hai kho khác nhau có thể có ghi chú cùng đường dẫn; URL chỉ có nghĩa trong ngữ cảnh kho hiện tại của bạn.

## Điều hướng trình duyệt

- **Back** — quay lại ghi chú đang-mở-trước (hoặc trạng thái rỗng).
- **Forward** — mở lại ghi chú bạn đã back ra.
- **Tải lại** — mở lại cùng ghi chú. Handle kho được lấy từ IndexedDB; ghi chú được đọc lại từ đĩa.

## Chia sẻ URL

URL chứa slug ghi chú **chỉ có nghĩa nếu người nhận có cùng kho**. URL không bao gồm nội dung ghi chú — không có server nào với byte ghi chú đó — nên URL được chia sẻ giống một con trỏ "xem thêm" hơn là liên kết thực.

Cho chia sẻ nội dung thực với ai đó không có kho, sao chép thân ghi chú và dán. Tính năng "chia sẻ ghi chú qua bucket cloud" trong lộ trình (xem [Lộ trình & những điều không làm](../17-lo-trinh-va-khong-lam.md)) nhưng chưa phát hành.

## URL trạng thái rỗng

Khi không có ghi chú đang mở (bạn ở welcome / trạng thái rỗng), URL là gốc locale:

```
http://localhost:3000/vi/
```

Trạng thái rỗng trông giống nhau dù bạn đến từ tải mới hay bằng cách đóng ghi chú đang mở (`Cmd/Ctrl + Shift + X`).

## Cái *không* trong URL

- **Toggle chế độ soạn thảo** (focus, typewriter, narrow, zen, lock). Đó là trạng thái UI theo từng tab, lưu vào `localStorage`, không vào URL.
- **Hiển thị thanh bên / ngăn phải.** Cùng thế.
- **Truy vấn tìm kiếm** từ bảng lệnh. Bảng là tạm thời; mở nó không đổi URL.

## Khi URL không khớp

Nếu bạn đổi tên ghi chú, URL cập nhật để khớp slug mới. Nếu bạn di chuyển ghi chú đến thư mục khác, cùng. Nếu mục tiêu wikilink giải thành ghi chú ở đường dẫn khác URL nói, URL thắng cho điều hướng kế.

Nếu URL từng trỏ vào ghi chú không còn tồn tại (ví dụ bạn mở URL cũ sau khi xóa ghi chú), ứng dụng rơi về trạng thái rỗng và hiển thị chỉ báo nhỏ "không tìm thấy ghi chú đó".

## Tham khảo

- [[Ngôn ngữ]]
- [[Lộ trình và những điều không làm]]
