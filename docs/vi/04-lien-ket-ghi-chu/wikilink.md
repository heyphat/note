---
id: 5eb1d960-1c30-4af1-989b-5bf675ccf941
title: Wikilink
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Wikilink

**Wikilink** là liên kết từ một ghi chú đến ghi chú khác, viết theo tiêu đề ghi chú thay vì theo URL.

```markdown
Xem thêm [[Sách cần đọc]].
```

Liên kết trỏ đến ghi chú có tiêu đề `Sách cần đọc` trong kho. Nếu bạn đổi tên ghi chú đó, mọi wikilink trong mọi ghi chú vẫn giải được — liên kết theo tiêu đề, không theo đường dẫn tệp.

## Cách gõ một cái

Gõ `[[` và trình soạn thảo mở popover gợi ý với các ghi chú từ kho. Tiếp tục gõ để lọc; nhấn **Enter** để chèn; nhấn **Esc** để hủy.

Nếu tiêu đề bạn gõ không khớp ghi chú nào có sẵn, wikilink vẫn được chèn. Nó chỉ render thành **liên kết hỏng** (màu / kiểu khác). Bấm vào wikilink hỏng và ứng dụng đề nghị tạo ghi chú thiếu.

## Liên kết đến mục

Thêm `#tên-mục` để trỏ vào một tiêu đề cụ thể trong ghi chú đích:

```markdown
Xem [[Onboarding#Bước 3]] để biết chi tiết đặt hàng.
```

Tên mục nên khớp với tiêu đề trong ghi chú đích. Khớp không phân biệt hoa thường và bỏ qua phần lớn dấu câu, nên `[[Onboarding#bước 3]]` giải cùng cách.

## Nhãn hiển thị

Nếu bạn muốn văn bản render khác với tên đích, dùng dấu `|`:

```markdown
[[Onboarding|tài liệu onboarding]]
```

render thành **tài liệu onboarding** nhưng vẫn liên kết đến `Onboarding`.

## Hành vi gợi ý

Khi gõ trong `[[`, popover xếp hạng kết quả theo:

1. Khớp tiêu đề (prefix > substring).
2. Mức độ gần đây của lần sửa cuối.

Nên các ghi chú khớp được sửa gần nhất nổi lên đầu — thường là điều bạn muốn.

## Bấm và điều hướng

Bấm vào wikilink điều hướng trình soạn thảo đến ghi chú đích. URL cập nhật cho khớp (xem [Định tuyến URL](../13-dieu-huong/dinh-tuyen-url.md)), nên nút Back của trình duyệt đưa bạn về nơi bạn từng ở.

## Vì sao wikilink thay vì liên kết markdown thường

- **Ổn định qua đổi tên.** Wikilink giải theo tiêu đề, không theo đường dẫn tương đối. Đổi tên một ghi chú và mọi liên kết tới nó vẫn chạy.
- **Gõ ít hơn.** Bạn không phải viết URL.
- **An toàn vòng đọc/ghi.** Các công cụ khác chia sẻ quy ước (Obsidian và tương tự) đọc cùng cú pháp. Công cụ không hiểu nó vẫn thấy văn bản trong ngoặc — giảm cấp, không hỏng.

## Tham khảo

- [[Nhúng nội dung]]
- [[Liên kết ngược]]
- [[Biểu đồ quan hệ]]
- [[Định tuyến URL]]
