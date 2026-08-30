---
id: 4a42ba7f-b7e7-47a5-aed9-4ea61da26805
title: Trình duyệt tệp
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Trình duyệt tệp

View tập trung vào thư mục của kho. Mở với `Cmd/Ctrl + Shift + E`.

## Nó là gì

Nơi cây ghi chú [thanh bên](./thanh-ben.md) được tối ưu cho *chọn một ghi chú*, trình duyệt tệp được tối ưu cho *thao tác cấp thư mục*: tạo thư mục, đổi tên, di chuyển, tổ chức lại hàng loạt.

Hình dung một trình duyệt tệp kiểu cũ, nhưng scope ở kho và nhận biết các quy ước Note kỳ vọng (tệp `.md`, `.assets/`, …).

## Bạn làm được gì

- **Tạo thư mục** ở bất kỳ đâu trong cây.
- **Đổi tên** ghi chú và thư mục inline.
- **Di chuyển** ghi chú bằng kéo-thả, hoặc qua bộ chọn bấm-phải → "Move to…" nhận đường dẫn đích.
- **Xóa** với xác nhận. Xóa thư mục loại bỏ nội dung; xóa ghi chú loại tệp đó.
- **Xem trước** vài dòng đầu của ghi chú mà không mở (hữu ích khi bạn đang săn cái đúng để thao tác).

## Cái nó không làm

- Không hiển thị `.assets/` hoặc thư mục ẩn khác. Chúng được xử lý bởi bề mặt chuyên dụng ([Ngăn trò chuyện](../08-ai/ngan-chat.md), [Giao diện công việc](../07-cong-viec/giao-dien-xem.md)) — phơi bày chúng trong một file browser tổng quát chỉ mời bối rối.
- Không mở tệp ngoài kho. Quyền có scope ở thư mục bạn đã chọn.

## Wikilink và đổi tên

Đổi tên ghi chú qua trình duyệt tệp giữ wikilink trỏ vào nó. Đồ thị liên kết được xây lại khi đổi tên nên liên kết ngược chính xác. Nếu bạn đổi tên hàng loạt trên đĩa (ngoài ứng dụng) và liên kết không cập nhật, chạy [Lập lại chỉ mục kho](../01-bat-dau/lap-chi-muc-lai.md).

## Bàn phím trong trình duyệt

- **↑ / ↓** — di chuyển qua các entry.
- **Enter** — mở ghi chú, mở rộng thư mục.
- **Esc** — đóng trình duyệt.
- **F2** (hoặc bấm tên đã chọn) — đổi tên inline.
- **Delete** — xóa với xác nhận.

## Khi dùng trình duyệt so với thanh bên

- **Thanh bên** — khi bạn đang chọn ghi chú để đọc hoặc sửa. Phần lớn thời gian.
- **Trình duyệt** — khi bạn đang tổ chức lại. Thao tác thư mục, di chuyển hàng loạt, dọn dẹp.

## Tham khảo

- [[Thanh bên]]
- [[Ngăn trò chuyện]]
- [[Giao diện xem công việc]]
- [[Lập lại chỉ mục cho kho]]
