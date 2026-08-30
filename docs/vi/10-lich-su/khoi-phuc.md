---
id: f1e9433a-3c65-4fed-abad-11416a3032ca
title: Khôi phục
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Khôi phục

Tự động lưu đẩy sửa đổi của bạn ra đĩa liên tục. Cửa sổ bạn có thể mất công việc nhỏ — nhưng không phải bằng không. Nếu tab trình duyệt chết giữa các lần lưu, **hộp thoại khôi phục** đề nghị khôi phục nội dung đang bay.

## Khi nào hộp thoại xuất hiện

Khi tải lại sau khi ứng dụng phát hiện nội dung chưa lưu từ phiên trước không đẩy hết. Tác nhân kích hoạt:

- Trình duyệt crash.
- OS khởi động lại với tab đang mở.
- Tab bị OS giết do áp lực bộ nhớ.
- Một bug hoặc tải lại cứng trong khi đang lưu.

Nếu mọi thứ đã lưu sạch trước khi tab đóng, hộp thoại không xuất hiện — không có gì để khôi phục.

## Bạn thấy gì

Hộp thoại liệt kê các ghi chú bị ảnh hưởng và hiển thị:

- **Phiên bản đĩa** — cái hiện đang được lưu vào tệp kho.
- **Phiên bản khôi phục** — cái ứng dụng chụp được trong khi đang bay.

Bạn có thể xem trước mỗi bên trước khi quyết định.

## Lựa chọn của bạn

- **Dùng bản khôi phục** — ghi đè phiên bản đĩa với nội dung khôi phục. Phiên bản khôi phục trở thành ghi chú hiện tại; phiên bản đĩa được giữ lại làm [ảnh chụp lịch sử](./duyet-lich-su.md), nên bạn không mất.
- **Giữ bản đĩa** — hủy nội dung khôi phục. Phiên bản đĩa giữ nguyên.
- **Quyết định theo từng ghi chú** — khi nhiều ghi chú có ứng viên khôi phục, bạn có thể chọn khác cho mỗi cái.

## Cái thực sự được khôi phục

Payload khôi phục là trạng thái trình soạn thảo trong bộ nhớ tại thời điểm lần thử tự lưu cuối. Vậy nên:

- Nó hầu như luôn sau *vài giây* so với những gì bạn thấy trên màn hình khi tab chết — tự lưu chạy thường xuyên.
- Nó là nội dung đầy đủ, không chỉ diff. Phiên bản khôi phục là "cái bạn sẽ có nếu lần lưu thành công."
- Nó là theo từng ghi chú, không theo từng kho. Mỗi ghi chú bị ảnh hưởng được khôi phục độc lập.

## Sau hộp thoại

Lựa chọn nào bạn đã làm, ứng dụng tiếp tục từ nơi bạn đã dừng — vị trí thanh bên, ghi chú đang mở, vị trí cuộn, … Nội dung khôi phục (hoặc bị hủy) giờ trong pipeline lưu / lịch sử bình thường.

## Khi hộp thoại không đủ

- **Công việc chưa lưu lâu rồi.** Khôi phục là cho nội dung *gần đây* chưa lưu, không cho "phiên bản của ghi chú này từ ba tuần trước." Đó là [lịch sử](./duyet-lich-su.md).
- **Kho không tới được.** Nếu quyền thư mục kho bị thu hồi hoặc đĩa bị tháo, ứng dụng hiển thị luồng khôi phục khác yêu cầu bạn chọn lại thư mục. Khi nó được trỏ đúng nơi, hộp thoại xuất hiện như bình thường.

## Giảm bán kính ảnh hưởng

- `Cmd/Ctrl + S` đẩy lưu chờ ngay lập tức. Tìm tới nó trước khi đóng tab.
- Cho viết dài, cân nhắc chạy ứng dụng trên `localhost` (`npm run dev`) — ít bất ngờ hơn host được quản lý cache tích cực.
- Cho ghi chú không thể thay thế, đồng bộ thư mục kho với công cụ giữ lịch sử (Dropbox / iCloud / Syncthing đều giữ phiên bản gần đây).

## Tham khảo

- [[Duyệt lịch sử]]
