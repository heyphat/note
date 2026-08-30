---
id: f4711066-fb47-47c4-842c-d7074976d530
title: Lặp lại
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Lặp lại

Công việc lặp lại theo lịch. Chúng được lưu thành một tệp công việc duy nhất với hai trường định nghĩa pattern, cộng với danh sách lần xảy ra đã hoàn thành và đã bỏ qua.

## Các trường

| Trường | Ý nghĩa |
| --- | --- |
| `recurrence` | Chuỗi RRULE (RFC 5545). |
| `recurrence_anchor` | `scheduled` hoặc `completion` — xem dưới. |
| `complete_instances` | Danh sách ngày `YYYY-MM-DD` của lần hoàn thành trong quá khứ. |
| `skipped_instances` | Danh sách ngày `YYYY-MM-DD` của lần đã bỏ qua. |

## RRULE cơ bản

RRULE là chuẩn iCalendar. Các preset trong [modal form công việc](./tao-va-chinh-sua.md) phủ phần lớn trường hợp:

| Preset | RRULE |
| --- | --- |
| Hằng ngày | `FREQ=DAILY` |
| Ngày làm việc | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Hằng tuần (cùng ngày mỗi tuần) | `FREQ=WEEKLY` |
| Hai tuần | `FREQ=WEEKLY;INTERVAL=2` |
| Hằng tháng | `FREQ=MONTHLY` |
| Hằng năm | `FREQ=YEARLY` |

RRULE tùy chỉnh được hỗ trợ — mở trường tùy chỉnh và viết của bạn. Vài ví dụ:

- `FREQ=WEEKLY;BYDAY=MO,WE` — mỗi thứ Hai và thứ Tư.
- `FREQ=MONTHLY;BYMONTHDAY=1` — ngày đầu của mỗi tháng.
- `FREQ=MONTHLY;BYDAY=-1FR` — thứ Sáu cuối của mỗi tháng.
- `FREQ=DAILY;COUNT=14` — một lần mỗi ngày trong hai tuần, rồi dừng.

## Anchor: `scheduled` so với `completion`

Đây là lựa chọn dễ vấp.

- **`scheduled`** — lần kế được tính từ lịch ban đầu, bất kể bạn hoàn thành lần trước khi nào. Vậy công việc `FREQ=WEEKLY` đặt lịch thứ Hai *luôn* vào thứ Hai. Nếu bạn hoàn thành thứ Hai tuần này vào thứ Tư, lần thứ Hai tuần sau vẫn vào thứ Hai.

- **`completion`** — lần kế được tính từ ngày bạn hoàn thành lần trước. Vậy công việc `FREQ=WEEKLY` bạn hoàn thành vào thứ Tư có lần kế đặt vào thứ Tư tuần sau. Nhịp là "hằng tuần," nhưng ngày thực tế dịch chuyển.

**Quy tắc thumb:** dùng `scheduled` cho nhịp cứng ("standup mỗi thứ Hai"). Dùng `completion` cho nhịp đàn hồi ("mỗi hai tuần, bất kể khi nào tôi làm").

## Lần xảy ra trên đĩa

`complete_instances: [2026-04-29, 2026-05-06, 2026-05-13]` là bản ghi rằng ba lần xảy ra đó đã xong. Lần "hiện tại" là lần kế đến hạn không có trong danh sách hoàn thành hoặc bỏ qua.

Điều này có nghĩa tệp công việc là *một* tệp, nhưng đại diện *N* lần xảy ra theo thời gian. Hữu ích: phần thân, thẻ, bối cảnh, dự án của công việc đều ở một chỗ thay vì bị clone theo tuần.

## Hoàn thành công việc lặp

Khi bạn đánh dấu công việc lặp xong, ứng dụng:

1. Thêm ngày hôm nay (hoặc ngày bạn chỉ định) vào `complete_instances`.
2. Tính lại lần kế từ anchor và RRULE.

Công việc giữ trong danh sách công việc của bạn dưới dạng *lần kế sắp tới*, không phải "đã xong."

## Bỏ qua so với xóa

Nếu bạn muốn bỏ qua một lần xảy ra (bạn đi nghỉ, standup bị hủy tuần này), dùng **bỏ qua** thay vì hoàn thành. Ngày bỏ qua đi vào `skipped_instances`. Chúng không tính vào báo cáo "đã làm công việc này tuần này" nếu bạn từng xây.

Xóa tệp công việc loại bỏ cả pattern, mọi lần xảy ra trong quá khứ và tương lai.

## Tham khảo

- [[Tạo và chỉnh sửa công việc]]
