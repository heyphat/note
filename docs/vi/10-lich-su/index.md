---
id: 55d205bc-ce2d-42a9-b8bc-e5076f3c4c32
title: Lịch sử và khôi phục
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Lịch sử và khôi phục

Ứng dụng giữ lịch sử ảnh chụp theo từng ghi chú để bạn lùi qua những gì ghi chú từng trông như thế nào, xem chính xác cái gì đổi giữa hai phiên bản, và khôi phục công việc chưa lưu sau lần tải lại bất ngờ.

Nó cố ý đơn giản hơn git. Không có commit message, không nhánh, không remote. Chỉ là: thỉnh thoảng, ứng dụng chụp thân hiện tại, và bạn có thể duyệt các ảnh chụp đó sau.

## Trong mục này

- [Duyệt lịch sử](./duyet-lich-su.md) — bảng lịch sử, chọn ảnh chụp, khôi phục.
- [So sánh thay đổi](./so-sanh-thay-doi.md) — cái gì đổi giữa hai phiên bản.
- [Khôi phục](./khoi-phuc.md) — lấy lại nội dung chưa lưu sau khi tab crash.

## Khi bạn sẽ tìm tới lịch sử

- "Hôm qua tôi có một mục ở đây và giờ nó biến mất." — tìm ảnh chụp trước khi bạn xóa nó.
- "Đoạn này nói gì tuần trước?" — dùng so sánh thay đổi.
- "Trình duyệt đóng trước khi sửa của tôi lưu." — mở hộp thoại khôi phục ở lần tải kế.

## Cái nó không phải

- **Hệ thống kiểm soát phiên bản.** Không commit, không branch, không merge. Nếu bạn muốn thế, đặt kho trong git — nó chỉ là tệp.
- **Undo theo từng ký tự.** Đó là `Cmd/Ctrl + Z` khi bạn đang sửa. Lịch sử là theo từng ảnh chụp.
- **Một bản sao lưu.** Ảnh chụp sống trong cùng trình duyệt; xóa lưu trữ xóa chúng. Cho sao lưu thực, đồng bộ thư mục kho.
