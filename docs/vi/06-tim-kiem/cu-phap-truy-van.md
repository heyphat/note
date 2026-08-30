---
id: 07e29e4f-72d2-482b-bb57-265112de8da8
title: Cú pháp truy vấn
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Cú pháp truy vấn

Chế độ tìm kiếm mặc định trong [bảng lệnh](./bang-lenh.md) hiểu một cú pháp truy vấn nhỏ ngoài chữ thuần.

## Từ thuần

Nhiều từ AND-kết hợp. `q1 plan revenue` khớp ghi chú chứa `q1` *và* `plan` *và* `revenue` đâu đó — tiêu đề hoặc thân.

Từ được khớp với dung sai prefix (nên `plann` khớp `planned`, `planning`). Hoa thường không quan trọng.

## Cụm có ngoặc kép

Bao văn bản trong dấu ngoặc kép cho khớp cụm chính xác:

```
"q1 plan"
```

Đó khớp chuỗi nguyên văn `q1 plan`, không phải hai từ riêng lẻ.

## Bộ lọc ngày

Lọc theo timestamp `updatedAt` của ghi chú:

| Bộ lọc | Ý nghĩa |
| --- | --- |
| `updated:>today` | Ghi chú cập nhật hôm nay |
| `updated:>7d` | Ghi chú cập nhật trong 7 ngày qua |
| `updated:>30d` | Ghi chú cập nhật trong 30 ngày qua |
| (không bộ lọc) | Mọi ghi chú |

Cùng các bộ lọc được phơi bày dưới dạng chip một-bấm dưới ô truy vấn, nên bạn không phải gõ. Chip và dạng gõ tương đương nhau.

## Sắp xếp

Mặc định, kết quả xếp theo **mức độ liên quan** với truy vấn của bạn. Để đổi:

| Bộ lọc | Sắp xếp |
| --- | --- |
| `sort:relevance` | Khớp tốt nhất trước (mặc định) |
| `sort:updated` | Cập nhật gần nhất trước |
| `sort:created` | Tạo gần nhất trước |
| `sort:title` | Theo bảng chữ cái |

## Lọc thẻ trong tìm kiếm

Kết hợp chữ thuần và bộ lọc thẻ bằng cách gõ cả hai:

```
risks #q1 #research
```

Cái này khớp ghi chú chứa `risks` và gắn thẻ `q1` và `research`.

Bạn cũng có thể vào chế độ thẻ bằng cách bắt đầu truy vấn với `#` (xem [Bảng lệnh](./bang-lenh.md)).

## AI thấy gì

Khi công cụ `search_vault` của AI chạy, nó parse cùng cú pháp. Mô hình có thể phát truy vấn với cụm có ngoặc kép, bộ lọc thẻ, và bộ lọc ngày; chat hook chuẩn hóa và chạy chúng trên cùng chỉ mục MiniSearch.

## Giới hạn

- Giới hạn mặc định cho số kết quả trả về là **10**. AI có thể yêu cầu tới **25**.
- Đoạn trích trong kết quả ngắn (một-hai câu ngữ cảnh). Cho thân đầy đủ, bấm qua, hoặc — cho AI — gọi `read_note` (xem [Công cụ đọc](../08-ai/cong-cu-doc.md)).

## Tham khảo

- [[Bảng lệnh]]
- [[Công cụ đọc]]
