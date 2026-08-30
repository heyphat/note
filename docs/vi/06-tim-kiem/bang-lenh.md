---
id: eb5fb2d4-1e71-4eb1-b895-57645d9074d9
title: Bảng lệnh
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Bảng lệnh

`Cmd/Ctrl + K` mở **bảng lệnh**. Đó là phím duy nhất đưa bạn đến bất cứ đâu: bất kỳ ghi chú, bất kỳ thẻ, bất kỳ hành động, bất kỳ thiết lập.

## Bốn chế độ

Bảng lệnh suy ra điều bạn muốn từ ký tự đầu của truy vấn:

| Tiền tố | Chế độ | Ví dụ |
| --- | --- | --- |
| (không) | **Tìm kiếm ghi chú** theo tiêu đề và thân | `kế hoạch q1` |
| `>` | **Chạy hành động** (lệnh, thiết lập, đổi giao diện) | `> new note` |
| `#` | **Lọc theo thẻ** | `#research` |
| `@` | **Mở nhanh ghi chú** chỉ theo tiêu đề | `@sách cần đọc` |

Mặc định (không tiền tố) là phổ biến nhất: tìm kiếm toàn văn. Nhấn Enter trên một kết quả để điều hướng đến.

## Bộ lọc và sắp xếp

Khi ở **chế độ tìm kiếm** (không tiền tố), các chip nhỏ dưới ô truy vấn cho phép thu hẹp và xếp lại:

- **Cập nhật:** hôm nay, 7 ngày qua, 30 ngày qua, mọi lúc.
- **Sắp xếp:** liên quan, cập nhật, tạo, tiêu đề.

Bạn cũng có thể gõ bộ lọc trực tiếp vào truy vấn. Xem [Cú pháp truy vấn](./cu-phap-truy-van.md).

## Chế độ hành động (`>`)

Chế độ hành động phơi bày các lệnh mà bạn sẽ phải tìm qua menu khác. Ví dụ (danh sách chính xác sống trong registry; đây là đại diện):

- `> new note`
- `> open settings`
- `> toggle zen mode`
- `> cycle theme`
- `> reindex vault`
- `> save this search` — lưu truy vấn hiện tại làm [tìm kiếm đã lưu](./tim-kiem-da-luu.md).
- `> palette: <tên>` — đổi [bảng màu](../14-tuy-bien/bang-mau.md) mà không mở thiết lập.

Gõ vài ký tự; hành động khớp được chọn; nhấn Enter.

## Chế độ thẻ (`#`)

Gõ `#research` hiển thị mọi ghi chú gắn thẻ `research`. Nhấn Enter để đặt bộ lọc vào view chính (nên thanh bên / đám mây thẻ phản ánh nó). Gõ thêm thẻ thu hẹp tiếp: `#research #q1` khớp ghi chú gắn cả hai.

## Chế độ mở nhanh (`@`)

`@` cho trường hợp bạn biết tiêu đề ghi chú và muốn mở ngay, không cần cân nhắc khớp thân. Nó nhanh hơn tìm kiếm mặc định khi bạn điều hướng giữa các tệp đã biết.

## Bàn phím trong bảng lệnh

- **↑ / ↓** — di chuyển qua danh sách kết quả.
- **Enter** — mở / chạy kết quả được làm nổi.
- **Esc** — đóng bảng lệnh.
- **Tab** — đổi qua các chip lọc (chế độ tìm kiếm).

## Cái nó không làm

- Tìm kiếm trong `.assets/` (chats, tasks, đính kèm) — chúng cố ý bị loại để bảng không chìm trong tiếng ồn. Dùng [giao diện công việc](../07-cong-viec/giao-dien-xem.md) hoặc mở chuỗi chat trực tiếp nếu cần.
- Tìm ngoài kho. Bảng chỉ biết về thư mục bạn đã chọn.

## Tham khảo

- [[Cú pháp truy vấn]]
- [[Tìm kiếm đã lưu]]
- [[Bảng màu]]
- [[Giao diện xem công việc]]
