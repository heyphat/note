---
id: 31f57cb1-0282-444e-a288-f8d919105b3f
title: Sử dụng mẫu
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Sử dụng mẫu

Mẫu là khung đã lưu. Dùng một khi bạn sẽ phải gõ lại cùng cấu trúc lần thứ n.

## Chọn mẫu khi tạo

Khi bạn tạo ghi chú mới (`Ctrl + N` trên macOS, `Ctrl + Alt + N` trên Windows / Linux), bạn có thể:

- **Bắt đầu trống** (mặc định) — ghi chú mới trống.
- **Chọn mẫu** — ghi chú mới được điền sẵn với thân của mẫu, với [biến](./bien-mau.md) được nội suy.

Bộ chọn mẫu có thể tới được từ luồng ghi chú mới và từ mục **Mẫu** của thanh bên.

## Chọn từ thanh bên

Mục **Mẫu** trên thanh bên liệt kê mọi mẫu trong kho. Bấm một entry mẫu để sinh ghi chú mới từ nó. Đó là cùng cách chọn mẫu qua luồng ghi chú mới; danh sách thanh bên chỉ là phím tắt nhanh hơn cho mẫu bạn dùng thường.

## Lưu ghi chú có sẵn làm mẫu

Bất kỳ ghi chú nào cũng có thể là mẫu. Hai pattern:

- **Thư mục mẫu được chỉ định.** Đặt mẫu của bạn trong `Templates/` (hoặc bất kỳ thư mục bạn chọn). Mục Mẫu của thanh bên có thể được cấu hình để hiển thị thư mục đó.
- **Một cờ trong frontmatter.** Cờ như `template: true` đánh dấu một ghi chú là mẫu. Thanh bên nhận nó bất kể thư mục.

Cơ chế chính xác phụ thuộc vào cách bạn setup thanh bên. Điểm chính: một mẫu chỉ là ghi chú thường, và biến một ghi chú thành mẫu là một thay đổi một-quyết-định.

## Biến

Khi bạn sinh ghi chú mới từ mẫu, mọi placeholder `{{biến}}` trong thân mẫu được thay bằng giá trị hiện tại:

- `{{title}}` — tiêu đề bạn đặt cho ghi chú mới.
- `{{date}}`, `{{now}}` — ngày / datetime hiện tại.
- `{{uuid}}` — một ID duy nhất.
- `{{tasks.today}}` — một khối được định dạng của công việc hôm nay.

Xem [Biến mẫu](./bien-mau.md) cho danh sách đầy đủ.

## Mẫu không làm gì

- **Chúng không khóa ghi chú.** Sau khi mẫu sinh một ghi chú, ghi chú độc lập. Sửa mẫu sau không đổi ghi chú bạn đã tạo từ nó.
- **Chúng không ép cấu trúc.** Bạn có thể xóa mục, đổi tiêu đề, bỏ qua biến. Mẫu là *điểm khởi đầu*, không phải hợp đồng.

## Ý tưởng mẫu

- **Ghi chú hằng ngày.** Tiêu đề `{{date}}`, mục "Dự định", mục "Đã làm", `{{tasks.today}}` cho danh sách công việc trong ngày.
- **Ghi chú họp.** Tiêu đề `{{date}}`, danh sách người tham dự (trống), agenda, quyết định, action items.
- **Review tuần.** Tiêu đề, "cái gì tốt," "cái gì không," "cái gì kế tiếp."
- **Kickoff dự án.** Mục tiêu, phạm vi, rủi ro, liên kết tới `[[Ghi chú khác]]` liên quan.

## Tham khảo

- [[Biến mẫu]]
