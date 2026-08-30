---
id: 32602b23-e6b9-4c43-96ab-bc8fc7644290
title: Biểu đồ quan hệ
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Biểu đồ quan hệ

Biểu đồ quan hệ vẽ kho của bạn thành mạng: mỗi ghi chú là một nút, mỗi wikilink là một cạnh. Mở với `Cmd/Ctrl + Shift + G`.

## Bạn thấy gì

- **Nút** — một cho mỗi ghi chú. Ghi chú đang mở (nếu có) được làm nổi.
- **Cạnh** — một cho mỗi wikilink. Nhúng cũng tính. Hướng không được vẽ (ở v1) — một cạnh có nghĩa "hai ghi chú này có liên kết theo ít nhất một chiều."
- **Bố cục force-directed** — các cụm ghi chú liên kết dày đặc kéo lại với nhau; ghi chú cô lập trôi ra rìa.

## Tương tác

- **Pan** với click-and-drag trên không gian trống.
- **Zoom** với bánh xe chuột hoặc cử chỉ pinch.
- **Kéo nút** để sắp xếp lại. Bố cục lắng quanh các thay đổi của bạn.
- **Bấm vào nút** để điều hướng trình soạn thảo đến ghi chú đó (biểu đồ vẫn mở).
- **Hover trên nút** để làm nổi các láng giềng trực tiếp.

## Lọc

Biểu đồ hỗ trợ bộ lọc thẻ: chọn một thẻ và view mờ mọi thứ không gắn thẻ đó. Hữu ích để thấy cấu trúc của một dự án mỗi lần mà không mất bố cục tổng thể.

## Khi biểu đồ hữu ích

- **Tìm orphan** — ghi chú không có liên kết vào hoặc ra trôi ở rìa. Thường là ghi chú bạn quên, hoặc ghi chú nên hợp nhất vào cái khác.
- **Phát hiện cụm** — các nhóm liên kết dày đặc nhìn được một cái thường tương ứng với một dự án, chủ đề, hoặc lĩnh vực bạn đang nghĩ nhiều.
- **Kiểm tra trực quan** — sau một phiên sửa lớn, một cái nhìn nhanh xác nhận cấu trúc bạn dự định là cấu trúc bạn có.

## Khi không

- **Cho điều hướng hằng ngày.** [Thanh bên](../13-dieu-huong/thanh-ben.md), [bảng lệnh](../06-tim-kiem/bang-lenh.md), và [bảng liên kết ngược](./lien-ket-nguoc.md) thường nhanh hơn.
- **Cho kho rất lớn.** Bố cục force-directed bắt đầu nặng vượt vài nghìn ghi chú. View vẫn dùng được, nhưng tương tác có thể chậm.

## Lấy dữ liệu từ đâu

Biểu đồ được xây từ cùng đồ thị wikilink chạy liên kết ngược. Nếu bạn vừa thay đổi kho ngoài ứng dụng, chạy [Lập lại chỉ mục kho](../01-bat-dau/lap-chi-muc-lai.md) trước khi tin biểu đồ.

## Tham khảo

- [[Wikilink]]
- [[Liên kết ngược]]
- [[Thanh bên]]
- [[Bảng lệnh]]
- [[Lập lại chỉ mục cho kho]]
