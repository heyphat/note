---
id: 44b91f1d-a9e7-444b-a1c2-db916468bfa8
title: Bắt đầu
createdAt: 2026-05-10T03:19:45.204Z
updatedAt: 2026-05-11T05:33:12.742Z
---
# Bắt đầu

Lần đầu bạn mở Note, ứng dụng không biết bạn để ghi chú ở đâu. Nó không thể biết — không có máy chủ nào giữ tệp của bạn. Vì vậy "bắt đầu" chủ yếu là trỏ Note vào một thư mục trên máy của bạn và viết ghi chú đầu tiên trong đó.

Bốn trang ngắn phủ toàn bộ hành trình onboarding:

1. [Hỗ trợ trình duyệt](./ho-tro-trinh-duyet.md) — Note phụ thuộc vào File System Access API. Điều đó thu hẹp danh sách trình duyệt được hỗ trợ.
2. [Chọn kho lưu](./chon-kho-luu.md) — chọn (hoặc tạo) thư mục sẽ giữ ghi chú của bạn.
3. [Tạo ghi chú đầu tiên](./ghi-chu-dau-tien.md) — phím tắt, tự động lưu, tệp nằm ở đâu trên đĩa.
4. [Lập lại chỉ mục](./lap-chi-muc-lai.md) — khi kết quả tìm kiếm trông cũ hoặc công việc không hiện ra, đây là cách sửa.

## Tham quan nhanh

Khi bạn đã chọn kho, cách nhanh nhất để học ứng dụng là thử vài phím tắt. Đọc từng bước, làm thử, và bạn sẽ nhìn được phần lớn bề mặt của ứng dụng trong chưa đầy một phút.

> \[!TIP]
>
> Trong tài liệu, `Cmd/Ctrl + K` nghĩa là **Cmd trên macOS, Ctrl trên Windows / Linux**. \
> Hãy thử cái phù hợp với máy của bạn.

### 1. Mở bảng lệnh

Nhấn **`Cmd/Ctrl + K`**.

Một ô tìm kiếm hiện ra giữa màn hình. Đây là cách một-phím để tìm bất kỳ ghi chú, chạy bất kỳ hành động, nhảy đến bất kỳ thẻ. Gõ vài chữ cái của bất kỳ tiêu đề ghi chú nào — kết quả lọc khi bạn gõ. Nhấn **Esc** để đóng.

### 2. Đổi giao diện

Nhấn **`Cmd/Ctrl + Shift + D`**.

Cả ứng dụng đổi giữa sáng và tối. Nhấn lại để qua chế độ theo hệ thống. Một thông báo nhỏ cho bạn biết bạn đang ở chế độ nào. (Cho màu sắc ngoài sáng/tối, xem [Bảng màu](../14-tuy-bien/bang-mau.md).)

### 3. Bật/tắt thanh bên

Nhấn **`Cmd/Ctrl + B`**.

Cây ghi chú bên trái biến mất. Nhấn lại để hiện lại. Dùng phím này khi bạn muốn trình soạn thảo rộng hơn mà không vào hẳn chế độ tập trung.

### 4. Mở trình duyệt tệp

Nhấn **`Cmd/Ctrl + Shift + E`**.

Một trình duyệt theo thư mục mở ra. Nếu thanh bên dành để chọn một ghi chú, trình duyệt tệp dành cho *thao tác cấp thư mục* — tạo, đổi tên, di chuyển, xóa. **↑ / ↓** để di chuyển, **Enter** để mở, **Esc** để đóng. Xem [Trình duyệt tệp](../13-dieu-huong/trinh-duyet-tep.md).

![1.00](.assets/images/8f1a1bff-3e4d-4735-a452-e70605b2cbf1.png)

<br />

### 5. Tạo ghi chú mới

Nhấn **`Ctrl + N`** (macOS) hoặc **`Ctrl + Alt + N`** (Windows / Linux).

Một ghi chú trống xuất hiện với con trỏ ở ô tiêu đề. Gõ tiêu đề, nhấn Enter, bắt đầu viết. Đừng lo về lưu — ứng dụng tự động lưu liên tục. (`Cmd + N` bị trình duyệt giữ, nên phím này dùng `Ctrl`.)

### 6. Thử wikilink

Gõ **`[[`** hoặc `@` ở bất kỳ đâu trong nội dung trình soạn thảo.

Một popover liệt kê ghi chú từ kho. Gõ vài chữ cái để lọc, nhấn Enter để chèn. Bạn vừa tạo một liên kết từ ghi chú này tới ghi chú khác. Bấm vào sau, trình soạn thảo sẽ nhảy qua. Xem [Wikilink](../04-lien-ket-ghi-chu/wikilink.md) để biết toàn bộ.

### 7. Mở giao diện công việc của kho

Nhấn **`Cmd/Ctrl + Shift + K`**.

Mọi công việc trong `.assets/tasks/` xuất hiện trong một danh sách có thể lọc. Lọc theo trạng thái, độ ưu tiên, ngày đến hạn; bấm vào bất kỳ công việc để chỉnh sửa. Để tạo công việc mới mà không rời bàn phím: **`Ctrl + T`** (macOS) hoặc **`Ctrl + Alt + T`** (Windows / Linux). Xem [Giao diện công việc](../07-cong-viec/giao-dien-xem.md).

![1.00](.assets/images/2198a92c-a8e6-4a1e-bc4a-c9e03c480bcc.png)

### 8. Mở ngăn trò chuyện AI

Nhấn **`Cmd/Ctrl + \`**.

Một ngăn chat trượt ra từ bên cạnh. Nếu bạn đã cấu hình nhà cung cấp AI ([Nhà cung cấp và khóa](../08-ai/nha-cung-cap-va-khoa.md)), hỏi nó điều gì đó — nó có thể tìm kho và đề xuất chỉnh sửa cho ghi chú đang mở. Nếu chưa, ngăn chat sẽ chỉ bạn cách thiết lập.

![1.00](.assets/images/f20278c9-b81e-440b-bc5a-d3c468486991.png)

### 9. Mở biểu đồ quan hệ

Nhấn **`Cmd/Ctrl + Shift + G`**.

Một bản đồ kho theo cơ chế lực xuất hiện — mỗi ghi chú là một nút, mỗi wikilink là một cạnh. Bấm vào nút để trình soạn thảo nhảy tới ghi chú đó. Tiện để nhận ra ghi chú nào kết nối tốt và ghi chú nào bị lạc loài. Xem [Biểu đồ quan hệ](../04-lien-ket-ghi-chu/bieu-do-quan-he.md).

![1.00](.assets/images/44a13dfc-febd-454d-bfab-17fb49d39d20.png)

### 10. Chế độ Zen

Nhấn **`Cmd/Ctrl + .`**.

Mọi thứ ngoài trình soạn thảo biến mất. Hữu ích khi viết không phân tâm. Nhấn **Esc** để thoát.

Đó là phần lõi. Danh sách đầy đủ ở [Phím tắt](../15-phim-tat.md).

***

Nếu có gì ở đây không hoạt động đúng như nó nghe, nhảy đến [Xử lý sự cố](../16-xu-ly-su-co.md).
