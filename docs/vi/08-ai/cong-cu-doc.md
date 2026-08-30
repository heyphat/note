---
id: 68f2f11d-122d-4c58-97af-c9f7c2811301
title: Công cụ đọc
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Công cụ đọc

Ba công cụ AI có thể gọi mà không cần phê duyệt của bạn. Mỗi cái chỉ-đọc và có giới hạn nên cuộc gọi chạy tràn không thể làm hỏng ngữ cảnh cuộc trò chuyện.

## `search_vault`

Tìm kiếm toàn văn của kho. Cùng chỉ mục MiniSearch mà [bảng lệnh](../06-tim-kiem/bang-lenh.md) dùng.

| Tham số | Ghi chú |
| --- | --- |
| `query` (bắt buộc) | Truy vấn chữ thuần. Nhiều từ AND-kết hợp. Cụm có ngoặc kép khớp nguyên văn. |
| `limit` | Mặc định 10, kẹp về [1, 25]. |
| `tags` | Danh sách tùy chọn. Mọi thẻ liệt kê phải có. |

**Trả về:** mảng các hit, mỗi cái có `path`, `title`, `snippet`, `score`, `updatedAt`. Cộng số `total` và `truncated`.

Mô hình dùng cái này như mắt nhìn vào kho. Pattern phổ biến: `search_vault("kế hoạch dự án")` để tìm ứng viên, rồi `read_note` để kéo phần thân đầy đủ của cái có vẻ hứa hẹn nhất.

## `search_tasks`

Lọc chỉ mục công việc. Công việc sống trong `.assets/tasks/` và *không* được phủ bởi `search_vault` — đó là lý do công cụ này tồn tại.

| Tham số | Ghi chú |
| --- | --- |
| `text` | Bộ lọc substring với title + body. Không phân biệt hoa thường. |
| `status` | Khớp chính xác (ví dụ `"open"`). |
| `priority` | Một trong `highest`, `high`, `normal`, `low`, `lowest`. |
| `tags` | Mọi thẻ liệt kê phải có. |
| `contexts` | Mọi bối cảnh liệt kê phải có. |
| `projects` | Mọi dự án liệt kê phải có. Wikilink như `[[Q2 Launch]]`. |
| `due_after`, `due_before` | Giới hạn `YYYY-MM-DD` bao gồm. |
| `scheduled_after`, `scheduled_before` | Cùng thế, trên `scheduled`. |
| `limit` | Mặc định 25, kẹp về [1, 100]. |

**Trả về:** mảng các hit, mỗi cái có `path`, `title`, `status`, `priority`, `due`, `scheduled`, `tags`, `contexts`, `projects`, `bodyExcerpt`, `updatedAt`. Cộng `total`, `truncated`, và các `filters` đã parse echo lại.

Bộ lọc AND-kết hợp. Một công việc không có trường `priority` sẽ *không* khớp bộ lọc `priority: "normal"` trừ khi đặt rõ ràng — trừ `priority: "normal"` mà spec xử lý là khớp unset-or-`normal` vì đó là mặc định quy ước.

## `read_note`

Lấy phần thân đầy đủ của một hoặc nhiều ghi chú theo đường dẫn kho.

| Tham số | Ghi chú |
| --- | --- |
| `paths` (bắt buộc) | Mảng các đường dẫn kho (tương đối, kèm phần mở rộng `.md`). Kẹp ở **5 mỗi cuộc gọi**. |

**Trả về:** mảng các hit, mỗi cái có `path`, `title`, `body`, `updatedAt`, và cờ `truncated` (true khi thân vượt **giới hạn 8000 ký tự** mỗi ghi chú). Cộng mảng `errors` cho bất kỳ đường dẫn nào không đọc được.

Mô hình dùng cái này khi `search_vault` trả về một đoạn trích không đủ — "cho tôi văn bản đầy đủ của `Daily/2026-05-04.md`," hoặc "so sánh ba ghi chú này."

## Cái gì được rào

`read_note` sẽ từ chối đường dẫn dưới thư mục ẩn (`.assets/`, `.git/`, …) và thư mục `*.assets/`. Điều này dừng một ghi chú bị inject lời nhắc khỏi thuyết phục mô hình đọc các chuỗi chat AI của bạn vào cuộc trò chuyện mới. Xem [Quyền riêng tư](./rieng-tu.md).

## Khi mô hình gọi cái nào

Một mô hình tinh thần hữu ích: các công cụ đọc tạo thành đường ống tìm-rồi-đọc. `search_vault` và `search_tasks` là *tìm*; `read_note` là *zoom in*.

Một truy vấn như *"tóm tắt ghi chú từ tuần trước của tôi"* có thể gây ra:

1. `search_vault({ query: "", limit: 25 })` với sort theo updated — tìm ghi chú gần đây.
2. `read_note({ paths: ["Daily/2026-05-01.md", "Daily/2026-05-02.md", ...] })` — kéo phần thân đầy đủ.
3. Mô hình viết tóm tắt dùng phần thân làm ngữ cảnh.

## Tham khảo

- [[Bảng lệnh]]
- [[Quyền riêng tư AI]]
