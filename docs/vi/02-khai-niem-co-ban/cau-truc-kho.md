---
id: b14a6afb-fb9f-49df-8a6f-e4a761aa9505
title: Cấu trúc kho
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Cấu trúc kho

Kho chỉ là một thư mục. Đây là những gì Note tạo trong đó.

## Hình dáng

```
my-vault/
  getting-started.md
  Sách cần đọc.md
  projects/
    q1-plan.md
    research.md
  .assets/
    abc123.png
    diagram.excalidraw
  .assets/chats/
    getting-started__2026-04-25-1430.md
  .assets/tasks/
    2026-05-04-draft-proposal.md
```

## Ghi chú

Ghi chú là các tệp `.md` thuần ở bất kỳ độ sâu nào. Tên tệp là tiêu đề (với phần mở rộng `.md`). Thư mục là thư mục — tạo bao nhiêu tùy bạn. Cây ghi chú trên thanh bên phản ánh đúng những gì trên đĩa.

## `.assets/`

Bất cứ thứ gì không phải ghi chú nhưng thuộc về kho sống dưới `.assets/`. Trường hợp phổ biến nhất là **ảnh bạn dán vào ghi chú**: ứng dụng lưu chúng dưới dạng `.assets/<uuid>.png` và chèn một liên kết ảnh đường dẫn tương đối vào ghi chú. Tệp scene nhị phân của Excalidraw cũng nằm đây.

## `.assets/chats/`

Các chuỗi trò chuyện AI được lưu ở đây dưới dạng markdown thuần. Tên tệp gồm ghi chú mà cuộc trò chuyện được neo vào, kèm timestamp:

```
.assets/chats/getting-started__2026-04-25-1430.md
```

Chuỗi có thể tìm kiếm, version-control, và sửa trong bất kỳ trình soạn thảo văn bản. Nếu không muốn nữa, xóa tệp. Xem [Chuỗi trò chuyện](../08-ai/ngan-chat.md).

## `.assets/tasks/`

Công việc được lưu ở đây, một công việc một tệp, theo quy ước frontmatter [TaskNotes](https://github.com/callumalpass/tasknotes). Phần thân là markdown bình thường — bất cứ gì bạn viết dưới frontmatter là ghi chú của công việc. Xem [Trường công việc](../07-cong-viec/truong-cong-viec.md).

## Ứng dụng *sẽ không* tạo gì

- Không có `.git/` (bạn có thể thêm vào nếu muốn; không gì biết hay quan tâm).
- Không có tệp cơ sở dữ liệu độc quyền, không thư mục `.note/`, không chỉ mục cần xây-lại-ở-nơi-khác.
- Không có tệp sidecar kiểu `.DS_Store` cần đồng bộ.

## Ứng dụng *sẽ không* đọc gì

Các đường dẫn này cố ý bị loại khỏi cây thanh bên, chỉ mục tìm kiếm, và các công cụ `search_vault` / `read_note` của AI:

- Bất cứ gì dưới một thư mục bắt đầu bằng `.` (vậy nên `.assets/`, `.git/`, …).
- Bất cứ gì dưới một thư mục kết thúc bằng `.assets` (ví dụ một số setup dùng `<note-name>.assets/` cho đính kèm theo từng ghi chú).

Đó là lý do dán ảnh vào ghi chú cho bạn `![](.assets/abc123.png)` chứ không phải một mớ ảnh trong cây ghi chú.

## Di chuyển kho

Kho là một thư mục thường. Di chuyển, đổi tên, đồng bộ, nén ZIP — Note không quan tâm. Lần tới bạn mở ứng dụng, trỏ vào vị trí mới với bộ chọn thư mục, và wikilink, công việc, và chat đều vẫn chạy vì chúng tương đối với gốc kho.

## Tham khảo

- [[Ngăn trò chuyện]]
- [[Trường công việc]]
