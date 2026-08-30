---
id: 95a4d272-8d7d-4bfb-bc9c-9d4e2e87bf74
title: Excalidraw
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Excalidraw

Excalidraw là công cụ vẽ tự do với cảm giác vẽ tay. Note nhúng nó trong khối mã có rào gắn thẻ `excalidraw`, nên một bản vẽ là một sản phẩm thật trong kho mà bạn có thể sửa sau.

## Cách chèn

- Gõ `/excalidraw` và trình soạn thảo chèn khối vẽ. Canvas Excalidraw mở để chỉnh sửa.
- Hoặc viết rào trực tiếp với tham chiếu tệp scene có sẵn.

Nội dung khối có rào tham chiếu tệp scene dưới `.assets/` (định dạng scene nhị phân). Chỉnh sửa bản vẽ cập nhật tệp scene tại chỗ.

## Cách chỉnh sửa

- **Bấm vào khối** để vào canvas. Thanh công cụ Excalidraw đầy đủ có sẵn — hình, vẽ tay, mũi tên, văn bản, màu, layer.
- **Bấm ngoài** để commit và quay lại markdown xung quanh. Bản vẽ render thành ảnh tĩnh khi bạn không sửa.
- Mọi phím tắt Excalidraw áp dụng trong canvas.

## Có gì trong tệp

- Khối có rào trong markdown là một tham chiếu / payload nhỏ.
- Scene chính nó (các hình thực tế, vị trí, và styling) sống trong `.assets/<uuid>.excalidraw`. Đó là JSON-shaped binary mà Excalidraw hiểu.

Bạn có thể mở cùng tệp scene trong Excalidraw độc lập (trang web hoặc ứng dụng desktop) nếu muốn. Định dạng tệp được chia sẻ.

## Khi Excalidraw vừa

- **Phác thảo hệ thống** không cần tọa độ chính xác: kiến trúc, luồng, "đây là cách các phần khớp với nhau."
- **Giải thích vẽ-tay** một ý mà bố cục tự động Mermaid sẽ cảm thấy quá cứng.
- **Chú thích trên screenshot** — dán screenshot vào canvas, vẽ lên.

## Khi không

- **Biểu đồ kiểm soát phiên bản** mà bạn muốn diff có ý nghĩa. Mermaid (dựa trên văn bản) tốt hơn cho điều đó. Scene Excalidraw là nhị phân; diff không đọc được.
- **Biểu đồ lập trình được** mà cấu trúc là dữ liệu. Khối mã + renderer ngoài thắng vẽ tay.

## Lazy loading

Excalidraw nặng. Thư viện không có trong bundle ban đầu — nó tải khi bạn lần đầu xem hoặc sửa khối Excalidraw. Trang không có bản vẽ vẫn nhẹ.
