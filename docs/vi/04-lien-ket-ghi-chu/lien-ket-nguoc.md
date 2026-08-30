---
id: ba9d000b-c881-415e-8972-ffd105191b9c
title: Liên kết ngược
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Liên kết ngược

Bảng **liên kết ngược** hiển thị mọi ghi chú trỏ *đến* ghi chú bạn đang đọc. Đó là nghịch đảo của cây liên kết bạn nhìn được khi đọc nội dung ghi chú hiện tại.

## Tìm ở đâu

Bảng liên kết ngược sống trong **ngăn phải**:

- Bật/tắt ngăn phải với `Cmd/Ctrl + Shift + B`.
- Ngăn xếp ba bảng (liên kết ngược, lịch sử, công việc dự án); bảng liên kết ngược là một trong số đó.
- Mỗi bảng có toggle hiển thị riêng trên [thanh công cụ header](../13-dieu-huong/thanh-cong-cu.md), nên bạn có thể chỉ hiển thị liên kết ngược nếu chỉ cần thế.

## Bảng hiển thị gì

Cho mỗi ghi chú liên kết ngược, bảng hiển thị:

- Tiêu đề ghi chú nguồn (bấm được — đưa bạn đến đó).
- Một đoạn ngữ cảnh ngắn quanh liên kết, để bạn thấy *cách* ghi chú nguồn tham chiếu ghi chú hiện tại.
- Chỉ báo liệu liên kết là wikilink hay nhúng nội dung.

Nhiều liên kết từ cùng một ghi chú nguồn được nhóm lại để bảng không quá rối.

## Cái gì tính là liên kết ngược

- `[[ghi-chu-hien-tai]]` — có, wikilink thường.
- `[[ghi-chu-hien-tai|alias]]` — có, alias không phá quan hệ.
- `[[ghi-chu-hien-tai#muc]]` — có; mục cũng được ghi nhận.
- `![[ghi-chu-hien-tai]]` — có; nhúng là liên kết.
- `[nhãn](ghi-chu-hien-tai.md)` — **không.** Liên kết markdown thường theo đường dẫn tệp không xuất hiện trong liên kết ngược. Wikilink là quy ước.

## Cách nó luôn cập nhật

Đồ thị liên kết xây lại khi bạn sửa. Nếu bạn mở một ghi chú, viết `[[Ghi chú khác]]`, và chuyển sang ghi chú đó, bạn sẽ thấy liên kết ngược mới hiện ra. Nếu đồ thị có vẻ sai — ví dụ sau đổi tên hàng loạt trên đĩa — chạy [Lập lại chỉ mục kho](../01-bat-dau/lap-chi-muc-lai.md).

## Vì sao điều này quan trọng

Wikilink cho phép bạn nuôi một mạng các ghi chú mà không phải nghĩ về thứ bậc. Liên kết ngược là cách bạn *dùng* mạng đó: thay vì phải nhớ ghi chú nào tham chiếu cái này, bảng hiển thị mọi điểm vào. Đó là sự khác biệt giữa một thư mục tệp và một cơ sở kiến thức thực sự điều hướng được.

## Tham khảo

- [[Wikilink]]
- [[Nhúng nội dung]]
- [[Biểu đồ quan hệ]]
- [[Thanh công cụ header]]
- [[Lập lại chỉ mục cho kho]]
