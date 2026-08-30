---
id: 8b5e2d3f-d9c4-4e6b-ac9d-2f3a4b5c6d7e
title: Canvas
createdAt: 2026-05-12T00:00:00.000Z
updatedAt: 2026-05-12T09:52:24.151Z
---
# Canvas

**Canvas** là một bề mặt vô tận có thể pan và zoom, nơi bạn sắp xếp các node — thẻ văn bản, ghi chú nhúng, bookmark URL, và nhóm có nhãn — và nối chúng bằng các đường edge. Giống Mermaid và Excalidraw, nguồn chân lý nằm trong tệp markdown: một canvas là khối mã có rào mà thân là JSON theo [đặc tả JSON Canvas](https://jsoncanvas.org/), cùng định dạng Obsidian dùng cho tệp `.canvas`.

Bạn có thể kéo-thả node, vẽ đường nối, sửa văn bản inline, và JSON cập nhật theo thời gian thực. Cùng tệp đó round-trip qua Obsidian hoạt động không cần chuyển đổi.

## Cách chèn một canvas

* Gõ `/canvas` và trình soạn thảo chèn một khối canvas trống.

* Khối hiển thị một header JSON nhỏ (thu gọn còn hai dòng) và bên dưới là bề mặt tương tác.

```canvas
{
  "nodes": [
    {
      "id": "n-mp2gb5a6h9xt",
      "type": "group",
      "x": -69.71510280163719,
      "y": -111.7912714064539,
      "width": 866,
      "height": 884,
      "color": "4",
      "label": "Group"
    },
    {
      "id": "n-mp2gac14lbwx",
      "type": "text",
      "x": 23,
      "y": -7.5,
      "width": 250,
      "height": 80,
      "color": "1",
      "text": "This is a text block\n"
    },
    {
      "id": "n-mp2gar3d2jl9",
      "type": "file",
      "x": 21.23553461917237,
      "y": 108.3695647473009,
      "width": 673,
      "height": 446,
      "file": "AI privacy"
    }
  ],
  "edges": []
}
```

## Thanh công cụ

| Hành động           | Tác dụng                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `+ Text`            | Thêm thẻ markdown. Double-click để sửa, blur để lưu.                                              |
| `+ Note`            | Thêm thẻ nhúng một ghi chú khác (hoặc ảnh — xem bên dưới). Double-click để đặt mục tiêu.          |
| `+ Link`            | Thêm thẻ bookmark URL. Double-click để dán URL.                                                   |
| `+ Group`           | Thêm hình chữ nhật có nhãn để gom nhóm các node khác. Double-click vào nhãn để đổi tên.           |
| `Delete`            | Xoá những gì đang chọn (node + các edge liên kết, hoặc chỉ edge).                                 |
| Màu preset (1–6)    | Đặt màu preset JSON Canvas lên các node đang chọn.                                                |
| Bánh xe màu         | Mở bộ chọn màu của hệ điều hành và đặt mã `#rrggbb` tuỳ ý lên các node đang chọn.                 |
| `×`                 | Xoá màu.                                                                                          |
| Biểu tượng mở rộng  | Mở canvas trong chế độ lightbox toàn màn hình.                                                    |

Hàng màu và biểu tượng mở rộng chỉ xuất hiện khi có thứ đang chọn để tô màu, hoặc khi bạn chưa ở chế độ lightbox.

## Các loại node

### Text

Một thẻ markdown. Double-click để sửa; blur (hoặc nhấn Esc) để thoát chế độ sửa. Nội dung là markdown thuần — tiêu đề, liên kết, khối mã, thậm chí khối có rào `mermaid` hay `excalidraw` cũng được render. Các tham chiếu ảnh nhúng được giải quyết theo cùng cách như trong thân editor (qua đường dẫn asset).

### Note (file)

Tham chiếu tới một ghi chú khác. Double-click vào thanh tiêu đề để mở picker — bắt đầu gõ và nó gợi ý các ghi chú có sẵn trong vault (cùng matcher với autocomplete `[[…]]`). Click một gợi ý hoặc nhấn Enter để xác nhận.

Sau khi đặt, thẻ:

* Render thân của ghi chú đích như xem trước markdown (frontmatter bị bỏ, cắt còn \~1200 ký tự).

* Hiển thị biểu tượng **↗ mở trong tab mới** ở đầu phải của header. Click vào (hoặc middle-click / ⌘-click) để mở ghi chú liên kết trong tab trình duyệt mới.

* Single-click vào tiêu đề điều hướng tới ghi chú trong cùng tab.

* Với mục tiêu hỏng / không tồn tại, tiêu đề chuyển đỏ và biểu tượng mở ẩn đi — double-click để đặt lại mục tiêu.

**Nhận diện ảnh:** nếu phần mở rộng của mục tiêu là ảnh (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.avif`, `.bmp`, `.ico`), thẻ render ảnh trực tiếp thay vì xem trước markdown. Hữu ích cho moodboard, ảnh chụp màn hình, hoặc ghim một biểu đồ đã lưu. Cả đường dẫn tương đối-vault (`.assets/images/foo.png`, `./{noteKey}.assets/bar.jpg`) và URL `https://…` tuyệt đối đều hoạt động.

### Link

Thẻ bookmark URL — chữ cái đầu kiểu favicon, hostname, và URL đầy đủ. Double-click để sửa URL; click để mở liên kết trong tab mới (với cùng mẫu trễ-250ms-rồi-mở, nên double-click chắc chắn thắng để sửa).

### Group

Hình chữ nhật có nhãn, viền đứt, nằm phía sau các node khác. Thả các node text / note / link vào để gom nhóm trực quan. Double-click vào nhãn để đổi tên. Group không có handle kết nối — chúng là container trang trí, không phải endpoint của edge.

## Vẽ edge

Hover qua một node và các chấm nhỏ xuất hiện ở các cạnh (trên / phải / dưới / trái). Kéo từ một chấm sang node khác để tạo kết nối. Edge tuân thủ ngữ nghĩa JSON Canvas:

* `fromSide` và `toSide` được ghi lại để đường cong luôn rời và đi vào đúng cạnh của mỗi node.

* Đầu mũi tên kế thừa màu chủ đề nên luôn thấy được ở cả chế độ sáng và tối.

* Kéo một edge để chọn; nhấn Delete để xoá.

## Màu

Mỗi node có một trường `color` tuỳ chọn theo đặc tả JSON Canvas:

* **Preset** "1" tới "6" — nhận-biết-chủ-đề (mã hex hơi khác giữa chế độ sáng và tối để đảm bảo độ tương phản).

* **Hex tuỳ ý** `#rgb`, `#rrggbb`, `#rrggbbaa` — đặt qua bánh xe màu.

Picker ghi một trong các giá trị này vào JSON. Mở cùng canvas trong Obsidian thì màu hiển thị giống nhau.

## Chế độ lightbox

Canvas inline bị giới hạn chiều cao để phần còn lại của ghi chú vẫn dễ đọc. Click biểu tượng mở rộng (trên-phải của thanh công cụ) để mở canvas trong overlay toàn màn hình. Các sửa đổi trong lightbox chảy ngược về cùng JSON; đóng lightbox (Esc / click ra ngoài / nút ×) gắn lại canvas inline với trạng thái mới nhất.

Khi lightbox mở, canvas inline bị tháo gỡ để hai instance không bao giờ tranh nhau ghi cùng nguồn.

## Lưu trữ ra sao

Khối có rào trông như:

````markdown
```canvas
{
  "nodes": [
    {"id": "n-abc", "type": "text", "x": 0, "y": 0, "width": 250, "height": 80, "text": "Hello"},
    {"id": "n-def", "type": "file", "x": 300, "y": 0, "width": 320, "height": 220, "file": "Họp đầu ngày"}
  ],
  "edges": [
    {"id": "e-001", "fromNode": "n-abc", "fromSide": "right", "toNode": "n-def", "toSide": "left"}
  ]
}
```
````

JSON được pretty-print với thứ tự key ổn định nên diff sạch. Các trường lạ thấy lúc parse (mọi thứ ngoài đặc tả JSON Canvas — phần mở rộng của Obsidian, các bổ sung tương lai của đặc tả, metadata riêng của ứng dụng) round-trip nguyên văn qua mỗi lần sửa, nên một tệp viết ở nơi khác giữ đầy đủ dữ liệu kể cả sau khi bạn di chuyển một node ở đây.

## Tương tác với Obsidian

Định dạng trên đĩa giống hệt tệp `.canvas` của Obsidian. Hai hệ quả thực tế:

* Bạn có thể copy thân khối `​```canvas` trong Note, dán vào một tệp `.canvas` mới trong vault Obsidian, và nó sẽ render cùng canvas.

* Một canvas viết trong Obsidian (kể cả các trường mở rộng nó thêm) có thể được dán vào khối canvas của Note và chỉnh sửa mà không mất dữ liệu.

Khác biệt chỉ thuần UX (canvas nằm ở đâu trong tài liệu, thanh công cụ trông ra sao). Dữ liệu giống nhau.

## Khi canvas phù hợp

* **Bố cục trực quan các ghi chú liên quan** — kế hoạch dự án với thẻ cho từng pha, sketch kiến trúc với ghi chú cho từng component, board nghiên cứu.

* **Mind map / concept map** — thẻ văn bản cộng mũi tên là hình dáng kinh điển.

* **Moodboard / bức tường tham khảo** — thẻ ảnh sắp xếp không gian.

## Khi không phù hợp

* **Luồng từng-bước muốn diff được** — Mermaid tốt hơn. Một `flowchart LR` nguồn văn bản diff có nghĩa; diff canvas hiện delta vị trí không phải lúc nào cũng cung cấp thông tin.

* **Giải thích vẽ tay** — [Excalidraw](./excalidraw.md) cho bạn công cụ vẽ tự do. Canvas là cấu trúc; Excalidraw là nghệ thuật.

* **Biểu đồ định lượng** — về biểu đồ, xem [Nhúng](../03-trinh-soan-thao/nhung.md) (`/price-chart`).

## Tải lười

Thư viện React Flow chạy bề mặt canvas (\~150kb đã minify) không có trong bundle ban đầu. Nó được tải theo nhu cầu lần đầu tiên một khối canvas vào DOM, nên các ghi chú không có canvas vẫn nhẹ.

## Tham khảo

* [[Mermaid]]

* [[Excalidraw]]

* [[Nhúng]]

* [Đặc tả JSON Canvas (jsoncanvas.org)](https://jsoncanvas.org/)
