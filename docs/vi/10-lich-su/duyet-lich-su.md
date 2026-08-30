---
id: 984fa246-3273-43e5-b713-458c70a9840f
title: Duyệt lịch sử
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Duyệt lịch sử

**Bảng lịch sử** liệt kê các ảnh chụp của ghi chú đang mở. Mỗi entry là một bản sao điểm-trong-thời-gian của thân.

## Tìm ở đâu

Bảng lịch sử là một trong ba bảng trong [ngăn phải](../13-dieu-huong/ngan-phai.md). Bật/tắt ngăn với `Cmd/Ctrl + Shift + B`. Nếu ngăn mở nhưng bảng lịch sử bị ẩn, bật/tắt từ [thanh công cụ header](../13-dieu-huong/thanh-cong-cu.md).

## Bạn thấy gì

Mỗi ảnh chụp trong bảng hiển thị:

- Một timestamp (khi ảnh chụp được lấy).
- Một xem trước / tóm tắt dòng-đầu ngắn của nội dung ảnh chụp.

Danh sách được sắp xếp mới-nhất-trước-cũ-nhất. Trạng thái hiện tại của ghi chú (cái đang trong trình soạn thảo lúc này) là ngầm — đó là baseline diff bạn so sánh các ảnh chụp với.

## Chọn một ảnh chụp

Bấm vào một entry để **xem trước** nó. Xem trước là chỉ-đọc — bạn đang nhìn thân theo cách nó từng, không có nguy cơ vô tình sửa. Bấm giữa các ảnh chụp để xem ghi chú tiến hóa qua thời gian.

Khi một ảnh chụp được chọn, bảng phơi bày:

- **Khôi phục** — thay thế thân ghi chú hiện tại bằng ảnh chụp này. Thân hiện tại trở thành ảnh chụp mới, nên cái này khả nghịch.
- **Diff** — mở [trình so sánh thay đổi](./so-sanh-thay-doi.md) giữa ảnh chụp này và thân hiện tại, hoặc giữa hai ảnh chụp.

## Khi nào ảnh chụp được lấy

Ảnh chụp được viết:

- Khi sửa đổi đáng kể (sau debounce, nên một loạt phím gõ tạo ra một ảnh chụp, không phải một trăm).
- Định kỳ, khi bạn đang sửa ghi chú.

Bạn không kích hoạt ảnh chụp thủ công. Nhịp cố ý vô hình — bảng nên *có* phiên bản bạn muốn khi bạn đi tìm.

## Ảnh chụp sống ở đâu

Ảnh chụp được giữ theo trình duyệt, trong IndexedDB, scope ở kho hiện tại. Hệ quả:

- Chúng theo máy. Lịch sử không đi theo kho sang laptop khác.
- Xóa lưu trữ trình duyệt xóa chúng.
- Tệp trên đĩa *không bị đổi* bởi việc chụp — ảnh chụp là bản ghi trên top hệ thống tệp, không phải sửa đổi với nó.

Nếu bạn cần lịch sử sống sót qua việc xóa lưu trữ trình duyệt hoặc đi theo kho qua nhiều máy, đặt kho trong git và để git theo dõi thay đổi cùng với những gì lịch sử của Note cung cấp. Hai cái cùng tồn tại.

## Cắt bớt

Số ảnh chụp theo từng ghi chú có giới hạn — ảnh chụp cũ bị cắt để giữ việc dùng IndexedDB hợp lý. Lịch sử gần đây dày; lịch sử cũ thưa hơn. Nếu bạn cần ảnh chụp từ một năm trước, ảnh chụp có thể không phải công cụ đúng — git là.

## Tham khảo

- [[Ngăn phải]]
- [[Thanh công cụ header]]
- [[Trình so sánh thay đổi]]
