---
id: 58514c6e-e7a7-4623-b948-ea17044f9ad4
title: Chú thích cuối
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Chú thích cuối

Chú thích cuối cho phép bạn gắn một lời nói thêm vào một đoạn văn mà không phá luồng đoạn chính. Người đọc thấy một số nhỏ ở trên; chú thích thật sống ở cuối tài liệu.

## Cách chèn

- Gõ `/footnote` để chèn có hướng dẫn. Trình soạn thảo đặt một tham chiếu inline và một định nghĩa khớp ở cuối ghi chú.
- Hoặc gõ cú pháp trực tiếp:

```markdown
Câu này có một chú thích.[^1]

[^1]: Và đây là phần thân chú thích.
```

## Cú pháp hoạt động ra sao

- Một tham chiếu là `[^name]`. Tên có thể là số (`[^1]`) hoặc nhãn (`[^migration-note]`).
- Một định nghĩa là cùng tên theo sau bởi `:` và phần thân: `[^name]: nội dung…`.
- Định nghĩa nằm ở cuối tài liệu. Note đánh số lại các chú thích dạng số khi đọc để chúng xuất hiện theo thứ tự, nhưng các tên bạn viết vẫn ổn định trong tệp.

## Trông như thế nào trong trình soạn thảo

Tham chiếu render thành liên kết trên-cao nhỏ. Bấm để nhảy đến định nghĩa; bấm mũi tên quay lại trên định nghĩa để nhảy về. Hover hiển thị popover xem trước với phần thân, nên bạn không phải rời ngữ cảnh cho các chú thích ngắn.

## Phần thân chú thích nhiều dòng

Thụt các dòng tiếp dưới định nghĩa:

```markdown
[^long]: Đoạn đầu của chú thích.

    Đoạn thứ hai, thụt bốn khoảng trắng.

    - Danh sách cũng được.
```

## Khi nào dùng

- Lời nói thêm nhỏ sẽ làm rối đoạn văn.
- Trích nguồn.
- Con trỏ "thêm về điều này trong [[Ghi chú khác]]" khi liên kết inline quá nổi bật.

Cho bất cứ thứ gì dài hơn một-hai đoạn, cân nhắc liên kết tới ghi chú khác ([Wikilink](../04-lien-ket-ghi-chu/wikilink.md)) hoặc nhúng một mục ([Nhúng nội dung](../04-lien-ket-ghi-chu/nhung-ghi-chu.md)) thay vì.

## Tham khảo

- [[Wikilink]]
- [[Nhúng nội dung]]
