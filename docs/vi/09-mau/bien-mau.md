---
id: 67682a89-8127-4d04-a4a9-6c371f53916d
title: Biến mẫu
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Biến mẫu

Khi một ghi chú được sinh từ mẫu, trình soạn thảo quét thân mẫu cho placeholder `{{biến}}` và thay mỗi cái bằng giá trị hiện tại của nó. Biến được đánh giá *một lần*, tại thời điểm tạo — chúng không sống (chúng không cập nhật sau).

## Các biến

| Biến | Thay bằng |
| --- | --- |
| `{{title}}` | Tiêu đề của ghi chú mới (bất cứ gì bạn gõ khi tạo). |
| `{{date}}` | Ngày hôm nay, dạng `YYYY-MM-DD`. |
| `{{now}}` | Datetime hiện tại, dạng ISO. |
| `{{uuid}}` | Một UUID mới sinh. Hữu ích để nhúng định danh ổn định trong công việc hoặc tài nguyên con. |
| `{{tasks.today}}` | Một khối markdown được định dạng của công việc hôm nay (mọi công việc có `due` hoặc `scheduled` là hôm nay). |

## Ví dụ

Mẫu ghi chú hằng ngày:

```markdown
# {{date}}

## Dự định
-

## Công việc
{{tasks.today}}

## Ghi chú

```

Khi tạo, nó trở thành:

```markdown
# 2026-05-09

## Dự định
-

## Công việc
- [ ] Soạn kế hoạch Q2 (due 2026-05-09, !high)
- [ ] Xem tài liệu onboarding

## Ghi chú

```

Mẫu ghi chú họp:

```markdown
# {{title}}

**Ngày:** {{date}}
**ID họp:** {{uuid}}

## Người tham dự

## Agenda

## Quyết định

## Action items
```

## Cái gì được escape

Biến chỉ kích hoạt khi viết *chính xác* `{{name}}` (không khoảng trắng trong dấu ngoặc nhọn). Nếu bạn muốn `{{date}}` văn bản trong thân — để tài liệu hóa biến chính nó, ví dụ — escape một dấu ngoặc (`{ {date}}`) hoặc viết nó trong khối mã (`` `{{date}}` ``). Nội dung khối mã không được nội suy.

## Cái *không* phải biến

- **Trường tùy chỉnh theo từng ghi chú.** Không có cú pháp cho "hỏi tôi giá trị khi tạo ghi chú." Nếu bạn cần thế, dán vào sau khi ghi chú được tạo.
- **Giá trị tính từ ghi chú khác.** `{{tasks.today}}` là biến duy nhất xuất phát từ dữ liệu trong v1. Thêm cái khác (ví dụ `{{tasks.overdue}}`, `{{recent-notes}}`) là công việc tương lai có thể nhưng chưa phát hành.
- **Mẫu đệ quy.** Thân mẫu chứa `{{something}}` được nội suy; nó không mở rộng *mẫu khác*.

## Khi biến không đủ

Nếu "mẫu" của bạn thực sự muốn là một chương trình nhỏ (lặp qua dữ liệu, lấy từ API, chạy script), xây ghi chú với công cụ ngoài và dán kết quả. Mẫu của Note cố ý là lớp mỏng — chúng sẽ là plugin runtime nếu không, mà nằm trong danh sách những điều dự án cố ý không làm (xem [Lộ trình & những điều không làm](../17-lo-trinh-va-khong-lam.md)).

## Tham khảo

- [[Lộ trình và những điều không làm]]
