---
id: 50c3c4ab-92a7-416f-a86c-dadf5d95c4f5
title: Nhúng
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Nhúng

Note có ba loại khối nhúng ngoài ảnh và biểu đồ: bookmark, video YouTube, và biểu đồ giá / OHLC. Mỗi cái được chèn từ menu gạch chéo và lưu thành khối mã có rào trong markdown.

## Bookmark

**Bookmark** là xem trước liên kết phong phú hơn — tiêu đề, mô tả, favicon — cho một URL bên ngoài.

- Chèn với `/bookmark` và dán URL.
- Khối render thành thẻ trong trình soạn thảo. Markdown bên dưới là khối có rào với một payload nhỏ.
- Dùng bookmark khi bạn muốn liên kết nổi bật về thị giác (ví dụ danh sách tham khảo cuối bài). Cho tham chiếu inline, `[nhãn](url)` thường tốt hơn.

## Nhúng YouTube

- Chèn với `/youtube` và dán URL hoặc ID video.
- Render thành iframe responsive trong trình soạn thảo và khi xem.
- Khối có rào chỉ lưu ID video; iframe không tải đến khi nhúng nhìn thấy được (lazy-load).

## Biểu đồ giá / OHLC

Một khối biểu đồ tích hợp hữu ích cho ghi chú giao dịch hoặc tài chính.

- Chèn với `/price-chart`.
- Dùng Chart.js. Sửa payload JSON bên dưới (trong khối có rào) để đổi dữ liệu, trục, và styling.
- Render inline khi xem.

## Vì sao chúng là khối có rào

Mỗi nhúng sống dưới dạng khối mã có rào (`​```bookmark`, `​```youtube`, `​```price-chart`) với một payload JSON nhỏ làm thân. Có hai lợi:

- **Markdown thuần đi vòng được.** Mở tệp trong công cụ khác và bạn thấy nguồn — không có gì ẩn.
- **Lazy-loaded.** Phần đắt tiền (lấy metadata liên kết, mount iframe, vẽ biểu đồ) chỉ chạy khi khối cuộn vào tầm nhìn.

## Khi *không* nên dùng nhúng

- Cho một liên kết một dòng, `[nhãn](url)` ít rối thị giác hơn thẻ bookmark.
- Cho video nhúng cần phát được offline, nhúng không giúp được — bạn cần tệp trong kho.
- Cho biểu đồ phong phú hơn `price-chart` phủ, viết khối có rào tự định với dữ liệu thô và một công cụ tiêu thụ nó (Pandoc + filter, sinh trang tĩnh, …). Renderer của Note sẽ không vẽ, nhưng nguồn vẫn còn.
