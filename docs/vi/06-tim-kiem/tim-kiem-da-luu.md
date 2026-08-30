---
id: 6a85d37c-bd71-4dcf-ace4-c283dd90a8da
title: Tìm kiếm đã lưu
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Tìm kiếm đã lưu

**Tìm kiếm đã lưu** là truy vấn bạn đã ghim cho dùng lại. Xây một truy vấn trong bảng lệnh tìm cái bạn muốn, lưu nó, và nó xuất hiện trong thanh bên. Bấm để chạy lại.

## Lưu một tìm kiếm

1. Mở [bảng lệnh](./bang-lenh.md) với `Cmd/Ctrl + K`.
2. Xây truy vấn — chữ, thẻ, bộ lọc, sắp xếp. Bất kỳ kết hợp nào khớp điều bạn cần.
3. Chạy hành động `> save this search` (hoặc dùng biểu tượng lưu cạnh ô truy vấn).
4. Đặt tên cho tìm kiếm. Tên là cái xuất hiện trong thanh bên.

## Tìm kiếm đã lưu sống ở đâu

Mục **Tìm kiếm đã lưu** là một trong các mục có thể bật/tắt trong thanh bên. Mỗi entry hiển thị tên tìm kiếm và chạy lại truy vấn đã lưu khi bấm.

Nếu mục không nhìn thấy, mở [thiết lập thanh bên](../13-dieu-huong/thanh-ben.md) và bật nó.

## Sửa hoặc xóa

Bấm phải (hoặc dùng biểu tượng menu ngữ cảnh) trên một tìm kiếm đã lưu để đổi tên, sửa truy vấn bên dưới, hoặc xóa nó.

## Cái gì được lưu

Một tìm kiếm đã lưu chỉ là truy vấn được tuần tự hóa — chữ cộng với thiết lập bộ lọc / sắp xếp. Nó được lưu trong `localStorage`, không trong kho, vì nó là theo-máy. Nếu bạn muốn một tìm kiếm đã lưu đi theo kho qua nhiều máy, cách giải quyết hôm nay là ghi nó trong một ghi chú (ví dụ một ghi chú "Truy vấn hữu ích" liệt kê các truy vấn nguyên văn).

## Ví dụ đáng lưu

- `#status/review sort:updated` — hàng đợi review đang hoạt động.
- `updated:>7d sort:updated` — những gì bạn đã chạm tuần này.
- `"team-a" -#area/personal` — đề cập về work-only của một team. (Phủ định không được tài liệu hóa như cú pháp công khai; đây là gợi ý về dùng nâng cao. Dùng cái nào hoạt động.)
- `#daily updated:>30d sort:created` — ghi chú hằng ngày trong tháng qua, cũ nhất trước.

## Vì sao điều này hữu ích

Xây truy vấn nhanh; nhớ nó thì không. Tìm kiếm đã lưu biến truy vấn bạn đã đúng *một* lần thành một mục tiêu điều hướng một-bấm — cách dùng kho ít cản trở hơn nhiều so với học lại cú pháp bộ lọc mỗi lần.

## Tham khảo

- [[Bảng lệnh]]
- [[Thanh bên]]
