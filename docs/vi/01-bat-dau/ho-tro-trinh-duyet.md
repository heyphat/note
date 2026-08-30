---
id: dba1478b-bc96-4ecc-8a0d-aaa32207f0dd
title: Hỗ trợ trình duyệt
createdAt: 2026-05-10T03:20:11.046Z
updatedAt: 2026-05-10T03:20:11.046Z
---
# Hỗ trợ trình duyệt

Note chạy hoàn toàn trong trình duyệt, và nó ghi ghi chú vào một thư mục trên đĩa của bạn qua một API web tiêu chuẩn: **File System Access API**. Trình duyệt nào chưa có API đó thì không chạy được ứng dụng.

## Hoạt động hôm nay

| Trình duyệt | Trạng thái |
| --- | --- |
| Chrome | Hoạt động |
| Edge | Hoạt động |
| Brave | Hoạt động |
| Arc | Hoạt động |
| Opera | Hoạt động |
| Trình duyệt nền Chromium khác | Hoạt động |
| **Firefox** | Không hỗ trợ (không có File System Access API) |
| **Safari** | Không hỗ trợ (không có File System Access API) |

## Bạn sẽ thấy gì trên trình duyệt không hỗ trợ

Khi bạn mở ứng dụng và thử chọn thư mục, ứng dụng phát hiện thiếu API và báo cho bạn biết trực tiếp. Nó không lặng lẽ rơi về lưu trữ trong bộ nhớ — điều đó sẽ khiến bạn làm việc cả tiếng rồi mất hết khi đóng tab.

## Vì sao điều này quan trọng

Mô hình bảo mật của Note tựa lên cùng API. Với File System Access:

- Trình duyệt yêu cầu bạn chọn một thư mục.
- Ứng dụng nhận được một handle giới hạn ở thư mục đó.
- Đọc và ghi đi thẳng từ tab của bạn vào đĩa. Không có gì đi qua máy chủ.

Không có cách nào dùng polyfill để cung cấp điều đó, nên đến khi Firefox và Safari có API này, các trình duyệt đó không thể chạy ứng dụng.

## Di động

Hôm nay không có bản di động. Một wrapper dựa trên Capacitor có trong lộ trình (xem [Lộ trình & những điều không làm](../17-lo-trinh-va-khong-lam.md)) nhưng chưa phát hành. Trên trình duyệt Chromium desktop, ứng dụng dùng được hoàn toàn; trên điện thoại, không.

## Tham khảo

- [[Lộ trình và những điều không làm]]
