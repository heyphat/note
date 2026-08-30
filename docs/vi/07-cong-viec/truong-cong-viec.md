---
id: 05848159-6a46-43f6-b1b4-2dad3c053102
title: Trường công việc
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Trường công việc

Mỗi công việc là một tệp `.md` dưới `.assets/tasks/` với YAML frontmatter ở đầu. Phần lớn thời gian bạn không sửa YAML bằng tay — [modal form công việc](./tao-va-chinh-sua.md) lo việc đó — nhưng đáng biết mỗi trường làm gì.

## Trường bắt buộc

| Trường | Lưu gì |
| --- | --- |
| `title` | Tên người-đọc-được ngắn. Hiện trong mọi giao diện công việc. |
| `status` | Vòng đời. Giá trị phổ biến: `open`, `in-progress`, `done`, `cancelled`. Tập có thể mở rộng — bất kỳ chuỗi nào được phép. |
| `date_created` | ISO datetime khi công việc được viết lần đầu. |
| `date_modified` | ISO datetime của lần sửa cuối. |

## Trường tùy chọn phổ biến

| Trường | Lưu gì |
| --- | --- |
| `id` | Định danh ổn định cho công việc. Sống sót qua đổi tên. |
| `priority` | Một trong `highest`, `high`, `normal`, `low`, `lowest`. Công việc không có priority được xem như `normal` cho mục đích lọc. |
| `due` | `YYYY-MM-DD`. Hạn chót. |
| `scheduled` | `YYYY-MM-DD`. Khi bạn dự định *làm việc trên* công việc (so với khi nó đến hạn). |
| `tags` | Danh sách chuỗi. `[research, q1]`. |
| `contexts` | Bối cảnh kiểu GTD `@`. `[@laptop, @errands]`. |
| `projects` | Wikilink như `[[Q2 Launch]]`. Đa-dự án được phép. |

## Trường thời gian

| Trường | Lưu gì |
| --- | --- |
| `time_estimate` | Số phút ước lượng. `30`, `120`, … |
| `time_entries` | Danh sách entry `{ start, end, description? }`. Tích lũy khi bạn log thời gian. Xem [Theo dõi thời gian](./theo-doi-thoi-gian.md). |

## Trường lặp lại

| Trường | Lưu gì |
| --- | --- |
| `recurrence` | Một chuỗi RRULE (RFC 5545). Ví dụ `FREQ=WEEKLY;BYDAY=MO`. Xem [Lặp lại](./lap-lai.md). |
| `recurrence_anchor` | `scheduled` hoặc `completion` — kiểm soát cách tính lần kế. |
| `complete_instances` | Danh sách ngày `YYYY-MM-DD` đánh dấu lần xảy ra trong quá khứ đã xong. |
| `skipped_instances` | Danh sách ngày `YYYY-MM-DD` đánh dấu lần đã bỏ qua. |

## Phụ thuộc

| Trường | Lưu gì |
| --- | --- |
| `blocked_by` | Danh sách tham chiếu công việc với `RELTYPE` tùy chọn. Xem [Phụ thuộc](./phu-thuoc.md). |

## Nhắc nhở

| Trường | Lưu gì |
| --- | --- |
| `reminders` | Danh sách object nhắc tương đối hoặc tuyệt đối. Xem [Nhắc nhở](./nhac-nho.md). |

## Phần thân

Dưới frontmatter, thân tệp là **markdown tự do**. Dùng nó cho bất cứ gì không vừa trong trường có cấu trúc: ghi chú về công việc, một checklist các bước con, dán ngữ cảnh từ nơi khác.

Phần thân được kèm trong truy vấn `text` của `search_tasks` (tham số `text` là bộ lọc substring với title + body).

## Những gì *không* trong schema

- **Subtask như trường.** Một công việc không phải cây các subtask có cấu trúc; bước con đặt trong thân dưới dạng checklist.
- **Người được giao.** Note là ứng dụng một-người-dùng; công việc thuộc về bạn.
- **Trường `done_at`.** Ngày hoàn thành được theo dõi qua `complete_instances` (cho công việc lặp) hoặc ngầm qua `date_modified` (cho công việc một-lần).

## Tham khảo

- [[Tạo và chỉnh sửa công việc]]
- [[Theo dõi thời gian]]
- [[Lặp lại]]
- [[Phụ thuộc]]
- [[Nhắc nhở]]
