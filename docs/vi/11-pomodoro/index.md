---
id: 39d45de1-ac4b-414a-8ceb-402209c6dc88
title: Pomodoro / phiên tập trung
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Pomodoro / phiên tập trung

Một bộ đếm Pomodoro tích hợp cho công việc tập trung. Bật/tắt phiên với `Cmd/Ctrl + Shift + P`.

## Nó làm gì

Pattern Pomodoro: xen kẽ các giai đoạn tập trung và nghỉ. Nhịp mặc định là 25 phút tập trung và 5 phút nghỉ, nhưng cả hai cấu hình được.

## Chip

Khi một phiên đang chạy, một **chip** nhỏ ngồi trong header trình soạn thảo hiển thị:

- Bạn đang ở khoảng tập trung hay nghỉ.
- Đếm ngược.
- Ghi chú phiên gắn vào (nếu có).
- Một popover nhỏ để tạm dừng hoặc dừng.

Chip không-modal — bạn vẫn làm việc trong trình soạn thảo khi nó chạy.

## Gắn vào ghi chú

Một phiên bạn bắt đầu khi đang sửa ghi chú được **neo vào ghi chú đó**. Chip hiển thị tiêu đề ghi chú trong breadcrumb, và:

- Nếu ghi chú có [theo dõi thời gian](../07-cong-viec/theo-doi-thoi-gian.md) (tức là nó là công việc), khoảng tập trung trở thành một entry `time_entries` trên công việc khi phiên kết thúc.
- Popover chip cho phép bạn bấm qua ghi chú gắn từ bất kỳ đâu trong ứng dụng.

Phiên bắt đầu không có ghi chú đang mở là không-gắn — chúng đếm ngược mà không viết gì.

## Cấu hình thời lượng

Mở popover **thiết lập thanh bên** và tìm mục Pomodoro:

- **Phút tập trung** — một khoảng tập trung kéo dài bao lâu. Mặc định 25.
- **Phút nghỉ** — một khoảng nghỉ kéo dài bao lâu. Mặc định 5.

Cả hai chấp nhận bất kỳ số nguyên dương. Thay đổi áp dụng cho phiên mới; phiên đang bay giữ thời lượng ban đầu.

## Hành vi giữa các tab

Trạng thái Pomodoro được chia sẻ giữa các tab trong cùng trình duyệt. Bắt đầu một phiên trong một tab và chip hiển thị ở mọi tab khác trỏ vào cùng kho. Dừng từ bất kỳ tab nào và nó dừng ở mọi nơi.

## Tín hiệu âm thanh

Khi một khoảng kết thúc (tập trung → nghỉ, hoặc nghỉ → tập trung), ứng dụng phát một tiếng chime ngắn. Trình duyệt có thể chặn audio trên tab chưa được tương tác gần đây — nếu bạn không nghe chime, bấm bất cứ đâu trong ứng dụng để cấp quyền audio.

## Cái nó không phải

- **Một công cụ lập lịch.** Pomodoro không sắp xếp lại ngày của bạn; nó chỉ canh giờ khoảng kế.
- **Bền qua vắng mặt dài.** Nếu bạn đóng tab giữa lúc tập trung và quay lại ngày mai, phiên đã đi mất — nó không tiếp tục từ nơi nó dừng (vì OS đã thu hồi runtime JavaScript).
- **Một nguồn chân lý về thời gian đã dành.** Đó là [theo dõi thời gian](../07-cong-viec/theo-doi-thoi-gian.md) trên công việc chính nó. Pomodoro *cấp* theo dõi thời gian khi phiên gắn vào công việc, nhưng dữ liệu sống trên tệp công việc.

## Vì sao nó tích hợp

Phần lớn người ghi chú chạy ứng dụng đếm giờ riêng. Đóng gói một cái — và gắn nó với ghi chú đang mở — đóng vòng lặp giữa *bạn đang làm gì* và *đã làm bao lâu*. Dữ liệu kết thúc ở cùng nơi với ghi chú của bạn.
