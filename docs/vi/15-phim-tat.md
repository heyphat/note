---
id: b07def1f-04a6-45fd-8f63-fc3bab646f5b
title: Phím tắt
createdAt: 2026-05-10T03:21:43.154Z
updatedAt: 2026-05-10T03:21:43.154Z
---
# Phím tắt

Toàn bộ phím tắt mà Note hỗ trợ, ở một nơi. Quy ước `Cmd/Ctrl` nghĩa là **Cmd trên macOS, Ctrl trên Windows / Linux**. Nơi nào modifier khác nhau giữa hai nền tảng thì cả hai đều được liệt kê.

## Toàn cục

| Phím tắt | Hành động |
| --- | --- |
| `Cmd/Ctrl + K` | Bảng lệnh |
| `Cmd/Ctrl + \` | Ngăn trò chuyện AI |
| `Cmd/Ctrl + S` | Đẩy mọi thay đổi đang chờ lưu |
| `Cmd/Ctrl + B` | Bật/tắt thanh bên |
| `Cmd/Ctrl + .` | Chế độ Zen (Esc để thoát) |
| `Cmd/Ctrl + Shift + D` | Đổi giao diện (sáng → tối → theo hệ thống) |
| `Cmd/Ctrl + Shift + X` | Đóng ghi chú đang mở |

## Ghi chú và công việc

| Phím tắt | Hành động |
| --- | --- |
| `Ctrl + N` (macOS) / `Ctrl + Alt + N` (Win/Linux) | Tạo ghi chú mới |
| `Ctrl + T` (macOS) / `Ctrl + Alt + T` (Win/Linux) | Tạo công việc mới |

(Cmd+N và Cmd+T bị trình duyệt giữ cho "cửa sổ mới" / "tab mới" — chúng không bao giờ tới được trang trên macOS, vì vậy các tổ hợp dùng Ctrl thay thế.)

## Chế độ soạn thảo

| Phím tắt | Chế độ |
| --- | --- |
| `Cmd/Ctrl + Shift + F` | Chế độ tập trung |
| `Cmd/Ctrl + Shift + T` | Chế độ máy chữ |
| `Cmd/Ctrl + Shift + M` | Trình soạn thảo hẹp |
| `Cmd/Ctrl + Shift + L` | Khóa trình soạn thảo (chỉ đọc) |
| `Cmd/Ctrl + .` | Chế độ Zen |

## Bảng và giao diện xem

| Phím tắt | Hành động |
| --- | --- |
| `Cmd/Ctrl + Shift + B` | Bật/tắt ngăn phải (lịch sử + liên kết ngược + công việc dự án) |
| `Cmd/Ctrl + Shift + E` | Trình duyệt tệp |
| `Cmd/Ctrl + Shift + G` | Biểu đồ quan hệ |
| `Cmd/Ctrl + Shift + K` | Giao diện công việc của kho |
| `Cmd/Ctrl + Shift + O` | Bật/tắt mục lục |
| `Cmd/Ctrl + Shift + Y` | Bật/tắt đếm từ |
| `Cmd/Ctrl + Shift + S` | Bật/tắt kiểm tra chính tả |
| `Cmd/Ctrl + Shift + P` | Phiên Pomodoro / tập trung |

## Bên trong bảng lệnh

| Phím tắt | Hành động |
| --- | --- |
| `↑ / ↓` | Di chuyển qua các kết quả |
| `Enter` | Mở / chạy kết quả được chọn |
| `Esc` | Đóng bảng lệnh |
| `Tab` | Đổi qua các chip lọc (chế độ tìm kiếm) |

Tiền tố chế độ trong truy vấn của bảng lệnh:

| Tiền tố | Chế độ |
| --- | --- |
| (không có) | Tìm kiếm toàn văn |
| `>` | Chạy hành động |
| `#` | Lọc theo thẻ |
| `@` | Mở nhanh theo tiêu đề |

## Bên trong trình soạn thảo

Các phím tắt sau kế thừa từ Milkdown / Crepe và hành xử như một trình soạn thảo rich-text bình thường:

| Phím tắt | Hành động |
| --- | --- |
| `Cmd/Ctrl + Z` | Hoàn tác |
| `Cmd/Ctrl + Shift + Z` | Làm lại |
| `Cmd/Ctrl + B` (với vùng chọn) | Đậm |
| `Cmd/Ctrl + I` | Nghiêng |
| `Cmd/Ctrl + E` | Mã inline |
| `Tab` (trong danh sách / bảng) | Tăng cấp / ô tiếp theo |
| `Shift + Tab` | Giảm cấp / ô trước đó |

## Bên trong ngăn trò chuyện

| Phím tắt | Hành động |
| --- | --- |
| `Enter` | Gửi tin nhắn (xuống dòng trong ô soạn dùng Shift+Enter) |
| `Shift + Enter` | Xuống dòng trong ô soạn |

## Vì sao một số phím tắt không có

Một vài thao tác thông dụng cố ý không gắn với phím tắt toàn cục:

- **Lưu** không phải một thao tác — tự động lưu lo việc đó. `Cmd/Ctrl + S` đẩy các thay đổi đang chờ nhưng không bắt buộc.
- **In** rơi vào phím `Cmd/Ctrl + P` mặc định của trình duyệt.
- **Tìm trong tài liệu** — trình soạn thảo không kèm phím tìm riêng; dùng phím tìm của trình duyệt. (Tìm *qua nhiều ghi chú* là [bảng lệnh](./06-tim-kiem/bang-lenh.md).)

## Tùy chỉnh phím tắt

Hiện chưa có như một thiết lập. Các phím tắt được mặc định trong ứng dụng. Nếu bạn có quan điểm mạnh, nguồn chân lý nằm ở hook `useAppKeyboardShortcuts`.

## Tham khảo

- [[Bảng lệnh]]
