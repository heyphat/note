---
id: a35fd33d-c272-4675-bd63-a93f9b751bf9
title: Phụ thuộc
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Phụ thuộc

Một công việc có thể được đánh dấu là **bị chặn bởi** các công việc khác. Trường `blocked_by` ghi nhận quan hệ; các view phơi bày nó nên bạn thấy được cái gì thực sự không bị chặn ngay lúc này.

## Trường hợp đơn giản

```yaml
blocked_by:
  - 2026-05-04-finalize-spec.md
```

Công việc A bị chặn bởi công việc B. Đến khi B xong, A là công việc "downstream" — nó xuất hiện trong các view với chỉ báo bị chặn và bị lọc khỏi danh sách "sẵn sàng làm".

## Loại quan hệ (`RELTYPE`)

Cho sắc thái hơn, mỗi entry có thể mang `RELTYPE`:

```yaml
blocked_by:
  - path: 2026-05-04-finalize-spec.md
    reltype: FINISHTOSTART
```

Bốn loại đến từ RFC 5545:

| `RELTYPE` | Ý nghĩa |
| --- | --- |
| `FINISHTOSTART` (mặc định) | A có thể bắt đầu chỉ sau khi B xong. Phụ thuộc kinh điển. |
| `STARTTOSTART` | A có thể bắt đầu chỉ sau khi B bắt đầu. |
| `FINISHTOFINISH` | A có thể xong chỉ sau khi B xong. |
| `STARTTOFINISH` | A có thể xong chỉ sau khi B bắt đầu. (Hiếm; phổ biến trong lập lịch nhưng không trong công việc cá nhân.) |

Phần lớn setup công việc cá nhân chỉ dùng `FINISHTOSTART`, cũng là mặc định — nên bạn không phải viết `RELTYPE` cho trường hợp phổ biến.

## Khoảng cách phụ thuộc

Mỗi entry cũng có thể mang **gap** — một ISO duration để chờ sau sự kiện liên quan của tiền điều kiện trước khi công việc này được mở khóa.

```yaml
blocked_by:
  - path: 2026-05-04-finalize-spec.md
    reltype: FINISHTOSTART
    gap: PT24H
```

`PT24H` là "24 giờ sau khi tiền điều kiện xong." Ví dụ khác:

- `P3D` — ba ngày.
- `P1W` — một tuần.
- `PT2H30M` — hai giờ ba mươi phút.

## Các view hiển thị gì

Một công việc với entry `blocked_by` đang hoạt động hiển thị chỉ báo bị chặn và bị loại khỏi bộ lọc "sẵn sàng làm" hoặc "hành động kế" trong các view công việc và công cụ AI. Khi mọi tiền điều kiện được thỏa, chỉ báo xóa.

## Cạm bẫy

- Vòng (A chặn B chặn A) không được phát hiện — đừng tạo.
- Một tiền điều kiện đã xóa để lại entry cũ trong `blocked_by`. Chỉ báo của công việc bị chặn có thể hiện là thiếu. Sửa công việc để dọn.
- Phụ thuộc không tự động kích hoạt gì. Đánh dấu tiền điều kiện xong không lên lịch lại công việc phụ thuộc; nó chỉ ngừng tính là chặn.

## Vì sao điều này trong định dạng

Phần lớn giá trị của phụ thuộc trong hệ thống cá nhân là **lọc**: "chỉ cho tôi thấy công việc thực sự làm được hôm nay." `blocked_by` làm bộ lọc đó khả thi mà không cần ứng dụng quản lý công việc riêng. Chi phí frontmatter nhỏ; lợi ích đáng kể nếu công việc của bạn phụ thuộc vào công việc khác.
