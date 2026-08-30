---
id: 204f15cd-b46c-40ad-ab9f-fc0dcb53f4fb
title: Ngăn phải
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Ngăn phải

Bảng xếp chồng phía phải. Bật/tắt cả ngăn với `Cmd/Ctrl + Shift + B`. Nó giữ ba bảng metadata theo từng ghi chú.

## Ba bảng

| Bảng | Hiển thị gì |
| --- | --- |
| **Liên kết ngược** | Mọi ghi chú liên kết đến ghi chú đang mở. Xem [Liên kết ngược](../04-lien-ket-ghi-chu/lien-ket-nguoc.md). |
| **Lịch sử** | Danh sách ảnh chụp cho ghi chú đang mở. Xem [Duyệt lịch sử](../10-lich-su/duyet-lich-su.md). |
| **Công việc dự án** | Công việc có trường `projects` liên kết đến ghi chú đang mở. Xem [Giao diện xem công việc](../07-cong-viec/giao-dien-xem.md). |

Mỗi bảng có toggle hiển thị riêng trong [thanh công cụ header](./thanh-cong-cu.md), nên bạn có thể chỉ hiển thị một bảng nếu chỉ cần thế — liên kết ngược khi đọc, lịch sử khi review, công việc dự án khi lập kế hoạch.

## Vì sao chúng được nhóm

Cả ba bảng hiển thị *thông tin về ghi chú đang mở*. Chúng cập nhật khi ghi chú đang mở đổi (chuyển ghi chú làm mới cả ba). Đóng gói chúng trong một ngăn nghĩa là lật focus giữa chúng là một phím, không phải vài.

## Hành vi của ngăn

- **Bật/tắt cả ngăn** với `Cmd/Ctrl + Shift + B` — khi bất kỳ một trong ba bảng nhìn được, ngăn được hiển thị; khi không cái nào, nó bị ẩn.
- Ngăn nhớ tổ hợp bảng nào đã nhìn được. Ẩn ngăn và hiển thị lại đưa lại cùng tập.

## Khi ngăn không hữu ích

- **Trạng thái rỗng** (không ghi chú đang mở) — các bảng không có gì để hiển thị. Ẩn ngăn để giành lại diện tích màn hình.
- **Viết dài** — ngăn kéo focus. Kết hợp [chế độ zen](../03-trinh-soan-thao/che-do-soan-thao.md) với ngăn ẩn cho setup ít phân tâm nhất.

## Tương tác giữa các bảng

Bấm vào liên kết ngược điều hướng trình soạn thảo; ngăn lập tức render lại cho ghi chú đang mở mới. Bấm vào entry công việc dự án mở công việc trong [modal form công việc](../07-cong-viec/tao-va-chinh-sua.md). Khôi phục một ảnh chụp lịch sử cập nhật trình soạn thảo và làm mới liên kết ngược (vì đồ thị liên kết có thể đã đổi).

## Tham khảo

- [[Liên kết ngược]]
- [[Duyệt lịch sử]]
- [[Giao diện xem công việc]]
- [[Thanh công cụ header]]
- [[Tạo và chỉnh sửa công việc]]
- [[Chế độ soạn thảo]]
