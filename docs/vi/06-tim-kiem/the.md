---
id: 5bb88fc3-be47-4d89-ab68-1f14fec1c515
title: Thẻ
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Thẻ

Thẻ là cách nhẹ, phi tập trung để đánh dấu ghi chú thuộc về một chủ đề. Note nhận hai nơi thẻ có thể sống:

1. **Inline trong thân** — ở bất kỳ đâu bạn viết `#tagname`, thẻ được phát hiện.
2. **Trong YAML frontmatter** — trường `tags: [research, q1]` dạng list cũng được nhận.

Cả hai được đánh chỉ mục; cả hai xuất hiện trong [đám mây thẻ](#dam-may-the) và bộ lọc thẻ.

## Cú pháp thẻ

- Inline: `#research`, `#q1-2026`, `#deep_work`. Chữ cái, chữ số, dấu nối, và gạch dưới được phép trong tên thẻ.
- Frontmatter: `tags: [research, q1]` hoặc dạng nhiều dòng:

  ```yaml
  tags:
    - research
    - q1
  ```

Một thẻ được chuẩn hóa thường, nên `#Research` và `#research` là cùng thẻ.

## Lọc theo thẻ

Ba cách:

- **Trong bảng lệnh**, thêm tiền tố `#` cho truy vấn để vào chế độ thẻ: `#research`. Thêm thẻ để AND-kết hợp: `#research #q1`.
- **Trong truy vấn tìm kiếm**, trộn thẻ với chữ: `risks #q1`.
- **Bấm vào thẻ** trong đám mây thẻ hoặc trong ghi chú nơi nó được render.

## Đám mây thẻ

Thanh bên có thể hiển thị **đám mây thẻ** — mọi thẻ trong kho, với kích thước tương đối dựa vào tần suất. Bấm vào thẻ để lọc danh sách ghi chú theo nó. Bật/tắt hiển thị đám mây thẻ từ [thiết lập thanh bên](../13-dieu-huong/thanh-ben.md).

## AI thấy thẻ ra sao

Cả `search_vault` và `search_tasks` đều nhận bộ lọc `tags`. Khi bạn hỏi AI "có gì trong ghi chú research của tôi?", một lệnh gọi mô hình điển hình là `search_vault({ query: "research", tags: ["research"] })`.

## Thẻ không phải là gì

- **Thư mục.** Thẻ là phẳng và nhiều-trên-một-ghi-chú; thư mục là thứ bậc và một-trên-một-ghi-chú. Dùng cả hai cho điều mỗi cái giỏi.
- **Văn bản tự do.** Hai cách viết hơi khác nhau (`#deep_work` so với `#deepwork`) tạo hai thẻ khác nhau. Đám mây thẻ giúp bạn phát hiện trượt.
- **Tự khám phá.** Ứng dụng chỉ đánh chỉ mục thẻ nó tìm thấy; không gợi ý cái mới.

## Quy ước thẻ đáng mượn

- `#area/research`, `#area/personal` — gạch chéo được phép và cho phép tạo thứ bậc *thị giác* mà không bắt hệ thống ép.
- `#status/draft`, `#status/review`, `#status/done` — giai đoạn quy trình.
- `#year/2026`, `#q/q1` — hữu ích khi bộ lọc ngày không vừa.

Ứng dụng không áp đặt gì trong số đó; bạn có thể vứt thẻ vào ghi chú ad-hoc và dọn sau.

## Tham khảo

- [[Thanh bên]]
