---
id: 09c7bb49-7159-4dac-a5b0-91f9377f92d7
title: Trình so sánh thay đổi
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Trình so sánh thay đổi

Trình so sánh so sánh hai phiên bản của một ghi chú và làm nổi cái gì đã đổi. Đó là công cụ đúng khi "duyệt ảnh chụp từng cái một" không hiển thị sự khác biệt rõ.

## Mở trình so sánh

Từ [bảng lịch sử](./duyet-lich-su.md):

- Chọn một ảnh chụp, rồi bấm **Diff** — so sánh ảnh chụp đó với ghi chú hiện tại.
- Chọn hai ảnh chụp — so sánh chúng với nhau.

## Bạn thấy gì

Một diff cấp dòng:

- Dòng **xanh** là thêm vào (có trong phiên bản mới hơn, vắng trong cũ hơn).
- Dòng **đỏ** là xóa (có trong phiên bản cũ hơn, bỏ trong mới hơn).
- Dòng không đổi render trong văn bản mờ để thay đổi nổi bật.

Bạn có thể đổi giữa bố cục **side-by-side** và **unified** tùy cái nào dễ đọc cho diff hiện tại. Side-by-side tốt cho viết lại lớn nơi cả đoạn di chuyển; unified tốt cho chỉnh sửa nhỏ có mục tiêu.

## Trình so sánh xem cái gì là "dòng"

Trình so sánh là diff dòng nhận biết markdown: nó tách trên dòng mới thực, không trên ngắt đoạn đã render. Vậy một tiêu đề là một dòng, một mục danh sách là một dòng, một rào khối mã là một dòng. Hai đoạn cách nhau bởi một dòng trống là ba dòng.

Cái này thường hữu ích hơn diff cấp ký tự cho prose, vì bạn quét được.

## Khôi phục từ view diff

Nếu diff đang hiển thị chính xác thay đổi bạn muốn hủy, trình xem cung cấp một hành động **Khôi phục** kéo phiên bản cũ vào. Tương tự hành động Khôi phục trong bảng lịch sử.

Bạn cũng có thể sao chép các mục đã đổi riêng lẻ ra khỏi diff (dán dòng của phiên bản cũ trở lại vào trình soạn thảo) nếu bạn chỉ muốn hủy một phần thay đổi.

## Khi diff khó đọc

- **Viết lại lớn** — khi phần lớn dòng đổi, diff chủ yếu là đỏ và xanh và không thông tin lắm. So sánh ảnh chụp từng cái thay vì.
- **Reformat** — nếu bạn chạy formatter hoặc đổi quy ước line-wrap, mọi dòng hiện như đã đổi. Sửa đổi ngữ nghĩa có thể nhỏ; diff không biết điều đó. Quan sát bằng mắt.
- **Nội dung sinh ra** — cho ghi chú chứa nhiều nội dung sinh (ví dụ một khối `{{tasks.today}}` trong mẫu hằng ngày, sinh lại mỗi lần tạo), mục sinh chiếm ưu thế trong diff. Chỉ cần bỏ qua bằng mắt.

## Tham khảo

- [[Duyệt lịch sử]]
- [[Khôi phục]]
