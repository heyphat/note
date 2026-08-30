---
id: 5d5e8377-f850-4677-88e4-ecee85a08986
title: Xuất PDF
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Xuất PDF

Note có thể xuất ghi chú đang mở thành PDF. Việc xuất là **dựa-trên-trình-in** — không có renderer headless chạy trên server, không có thư viện sinh byte PDF trong JavaScript. Engine "in ra PDF" của trình duyệt làm việc.

## Cách

1. Mở ghi chú bạn muốn xuất.
2. Chạy hành động **Export PDF** (từ menu trình soạn thảo hoặc [bảng lệnh](../06-tim-kiem/bang-lenh.md): `> export pdf`).
3. Hộp thoại in của trình duyệt mở, với ghi chú được render làm nội dung trang.
4. Chọn **Save as PDF** làm đích.
5. Lưu tệp.

## Cái gì được render

Cùng nội dung trình soạn thảo hiển thị bạn, với styling đặc biệt cho in:

- Màu nền bị bỏ (nền trắng, chữ đen).
- Thanh bên, thanh công cụ, panel bị ẩn.
- Wikilink render thành tiêu đề được giải (không có style wikilink đặc biệt).
- Khối mã giữ tô cú pháp nếu trình duyệt tôn trọng màu in.
- Biểu đồ (Mermaid, Excalidraw) được rasterize trong SVG đã render và được kèm.
- Ảnh được kèm ở kích thước render.

## Cái gì không render tốt

- **Bảng rất dài** — phân trang của trình duyệt cắt ở chỗ kỳ. Cân nhắc xuất bảng thành ghi chú riêng hoặc trích dữ liệu ra.
- **Scene Excalidraw phụ thuộc màu chế độ tối** — chúng được re-theme cho in. Đáng xem trước.
- **Video YouTube nhúng** — chúng render thành thẻ placeholder, không phải khung từ video. PDF không phát video được.

## Vì sao không có thư viện PDF native

Một thư viện PDF đóng gói (jsPDF, pdf-lib, …) sẽ có nghĩa:

- Bundle size lớn hơn.
- Nhiều edge case hơn để duy trì (nhúng phông, byte ảnh, logic ngắt trang).
- Output tệ hơn cho trường hợp phổ biến nhất — engine in của trình duyệt có hàng thập kỷ đánh bóng về bố cục.

Để trình duyệt làm cho bạn output tốt, không có bundle thêm, và cùng xuất từ bất kỳ trình duyệt nào. Chi phí là người dùng phải bấm qua hộp thoại in, đó là một ma sát nhỏ.

## Stylesheet in

CSS đặc biệt cho in sống trong styles của ứng dụng. Nếu bạn muốn tùy chỉnh PDF của bạn trông như thế nào (lề, chọn phông, có hiện callout thanh bên không), tinh chỉnh các quy tắc in. Cho phần lớn người dùng mặc định ổn.

## Còn xuất HTML / DOCX

Không phải tính năng v1. Kho đã thân-thiện-HTML (mọi ghi chú là markdown render thành HTML), nên cho xuất HTML đường đơn giản nhất là "mở ghi chú trong bất kỳ công cụ markdown-to-HTML." Cho DOCX, [Pandoc](https://pandoc.org) xử lý chuyển đổi tốt — trỏ nó vào tệp `.md` và bạn có một tài liệu Word.

## Tham khảo

- [[Bảng lệnh]]
