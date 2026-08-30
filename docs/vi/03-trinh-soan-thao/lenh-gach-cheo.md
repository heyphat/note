---
id: 39a9280f-4a5b-4e5e-ba67-fcf49d693c7c
title: Lệnh gạch chéo
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Lệnh gạch chéo

Gõ `/` ở đầu dòng (hoặc sau khoảng trắng trên dòng trống) để mở menu gạch chéo. Đó là cách nhanh để chèn các khối mà gõ markdown thô khá khó.

## Có gì trong menu

| Lệnh | Chèn |
| --- | --- |
| `/callout` | Một khung thông báo. Chọn loại: NOTE, TIP, IMPORTANT, WARNING, CAUTION, INFO, SUCCESS, DANGER. Xem [Khung thông báo](./khung-thong-bao.md). |
| `/checklist` | Một danh sách công việc (`- [ ] …`). Bấm ô để bật/tắt hoàn thành. |
| `/code` | Khối mã có rào với bộ chọn ngôn ngữ. Xem [Khối mã](./khoi-ma.md). |
| `/table` | Bảng trống bạn điền. Xem [Bảng](./bang.md). |
| `/footnote` | Tham chiếu chú thích cuối + định nghĩa. Xem [Chú thích cuối](./chu-thich-cuoi.md). |
| `/bookmark` | Thẻ xem trước liên kết. Dán URL; trình soạn thảo lấy tiêu đề / mô tả / favicon. Xem [Nhúng](./nhung.md). |
| `/youtube` | Nhúng YouTube. Dán URL hoặc ID video. Xem [Nhúng](./nhung.md). |
| `/price-chart` | Khối biểu đồ OHLC / giá dùng Chart.js. Xem [Nhúng](./nhung.md). |
| `/mermaid` | Khối biểu đồ Mermaid. Xem [Mermaid](../05-bieu-do/mermaid.md). |
| `/excalidraw` | Khối vẽ Excalidraw. Xem [Excalidraw](../05-bieu-do/excalidraw.md). |
| `/canvas` | Bảng không gian tương tác (đặc tả JSON Canvas) với node kéo-thả được, edge, và nhóm. Xem [Canvas](../05-bieu-do/canvas.md). |

Menu cũng có các khối Crepe chuẩn cho cấp tiêu đề, danh sách, blockquote, đường ngang, và ảnh. Bất cứ thứ gì không trong bảng này là một phần của preset Milkdown / Crepe bên dưới và hoạt động như tài liệu của nó.

## Cách lọc hoạt động

Sau khi gõ `/`, tiếp tục gõ để thu hẹp menu. `/cal` khớp `/callout`. Mục khớp đầu tiên được chọn; nhấn **Enter** để chèn. **↑ / ↓** di chuyển trong danh sách, **Esc** đóng menu.

## Các khối nằm ở đâu trong markdown

Mỗi khối được chèn bằng lệnh gạch chéo là markdown thuần dưới nắp. Ví dụ:

- `/callout` viết một blockquote `> [!NOTE]`.
- `/mermaid` viết một khối mã rào `​```mermaid`.
- `/footnote` chèn tham chiếu inline `[^1]` và định nghĩa `[^1]: …` ở dưới cùng.
- `/bookmark`, `/youtube`, và `/price-chart` viết khối rào với một payload kiểu JSON-hoặc-URL nhỏ mà trình soạn thảo render thành thẻ / nhúng khi xem.

Bạn có thể tự sửa kết quả trong tệp. Trình soạn thảo vẫn nhận ra.

## Vì sao dùng menu gạch chéo thay vì gõ cú pháp trực tiếp

Một số khối (khung thông báo, chú thích cuối, thẻ bookmark) dễ chèn qua hộp thoại hơn là viết đúng cú pháp. Menu cũng làm nổi các khối bạn có thể không nhớ là có — đặc biệt là phần nhúng. Nếu bạn là power user thích markdown thô, không bắt buộc dùng.

## Tham khảo

- [[Khung thông báo]]
- [[Khối mã]]
- [[Bảng]]
- [[Chú thích cuối]]
- [[Nhúng]]
- [[Mermaid]]
- [[Excalidraw]]
- [[Canvas]]
