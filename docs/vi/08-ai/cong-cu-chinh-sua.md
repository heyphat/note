---
id: 81520fa8-4ef1-440d-b7b8-cb6f97d58586
title: Công cụ chỉnh sửa
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Công cụ chỉnh sửa

Bốn công cụ AI có thể gọi để đổi nội dung. Mỗi cái xuất hiện trong ngăn trò chuyện dưới dạng **thẻ proposed-edit** với nút **Apply** và **Discard**. Không gì đổi trên đĩa đến khi bạn bấm Apply.

## `edit_note`

Tìm-và-thay-thế một substring của ghi chú đang mở.

| Tham số | Ghi chú |
| --- | --- |
| `find` (bắt buộc) | Văn bản chính xác để thay. Phải xuất hiện *đúng một lần* trong ghi chú. |
| `replace` (bắt buộc) | Văn bản thay thế. |

**Trên thẻ:** một diff hiển thị thay đổi.

**Hành vi Apply:** nếu chuỗi `find` vẫn khớp duy nhất, substring được thay và ghi chú được lưu. Nếu chuỗi không còn khớp duy nhất (bạn đã sửa từ khi mô hình đề xuất), Apply báo lỗi và bạn có thể yêu cầu mô hình thử lại.

Đây là "dao mổ" của mô hình — thay đổi nhỏ, phẫu thuật. Mô hình được hướng dẫn kèm đủ ngữ cảnh xung quanh trong `find` để làm nó duy nhất.

## `rewrite_note`

Thay thế toàn bộ thân của ghi chú đang mở.

| Tham số | Ghi chú |
| --- | --- |
| `new_content` (bắt buộc) | Phần thân markdown mới đầy đủ. Frontmatter *không* phải một phần — ứng dụng giữ frontmatter có sẵn. |

**Trên thẻ:** một diff side-by-side hoặc unified giữa nội dung cũ và mới.

**Hành vi Apply:** thân được ghi đè trong một lần. Thân trước đó có thể khôi phục qua [ảnh chụp lịch sử](../10-lich-su/index.md).

Dùng cho tái cấu trúc lớn nơi một trăm cuộc gọi `edit_note` nhỏ sẽ tệ hơn một lần viết lại.

## `create_note`

Tạo ghi chú mới hoàn toàn, khác với ghi chú đang mở.

| Tham số | Ghi chú |
| --- | --- |
| `title` (bắt buộc) | Tiêu đề ngắn. Trở thành tên tệp. |
| `content` (bắt buộc) | Markdown ban đầu. Không có frontmatter — ứng dụng viết. |
| `folder` | Tùy chọn. Đường dẫn tương đối kho (ví dụ `Projects/2025`). Trống = gốc. |

**Trên thẻ:** tiêu đề đề xuất, thư mục, và xem trước thân.

**Hành vi Apply:** viết tệp mới ở `<folder>/<title>.md`. Nếu thư mục không tồn tại, nó được tạo. Nếu một ghi chú có tên đó đã tồn tại, ứng dụng nối hậu tố làm-duy-nhất.

Mô hình dùng cái này cho "tách chuỗi này thành ghi chú mới" hoặc "tạo ghi chú họp cho ngày mai."

## `manage_tasks`

Một họ nhỏ các thay đổi trên tệp công việc trong `.assets/tasks/`. Bề mặt một-công-cụ duy nhất phái sinh trên một bộ phân biệt `kind`.

| `kind` | Tham số khác | Tác dụng |
| --- | --- | --- |
| `create_task` | `title` (bắt buộc), `status`, `priority`, `due`, `scheduled`, `tags`, `contexts`, `projects`, `body` | Tạo tệp công việc mới. |
| `complete_task` | `path` (bắt buộc), `completion_day` (mặc định hôm nay) | Đánh dấu công việc xong (hoặc thêm hôm nay vào `complete_instances` cho công việc lặp). |
| `uncomplete_task` | `path` (bắt buộc) | Đảo ngược một việc hoàn thành. |
| `update_task` | `path` (bắt buộc), `patch` (bắt buộc) | Vá frontmatter. Chỉ các khóa trong `patch` được đổi. |
| `delete_task` | `path` (bắt buộc) | Xóa tệp công việc. |

Ngày là `YYYY-MM-DD`. Tham chiếu dự án là wikilink như `[[Q2 Launch]]`. Đối số `path` là tên tệp trong `.assets/tasks/` — mô hình lấy từ một hit `search_tasks` trước, không phải đoán.

**Trên thẻ:** loại thao tác cộng tóm tắt ngắn của thay đổi ("Create task: Soạn kế hoạch Q2, due 2026-05-20, priority high"). Cho `update_task`, các khóa patch được liệt kê.

**Hành vi Apply:** chat hook định tuyến thao tác qua task store, lo việc đặt tên tệp, gộp frontmatter, và side-effect lặp.

## Vì sao thiết kế này

Công cụ chỉ-đọc tự chạy vì tệ nhất là một round-trip token tốn. Công cụ chỉnh sửa có thể *đổi ghi chú của bạn*, nên chúng đi qua mắt bạn trước. Thẻ làm thay đổi đề xuất *cụ thể* — không phải "mô hình nói nó sẽ làm X," mà "đây là diff sẽ được áp dụng."

Bạn cũng có thể hủy thẻ mà không bình luận. Mô hình được biết nó bị từ chối và có thể điều chỉnh ở lượt kế.

## Tham khảo

- [[Lịch sử và khôi phục]]
