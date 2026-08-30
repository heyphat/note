---
id: ba092d6f-c20c-4eba-be2e-ac9b12d8ba4f
title: Theo dõi thời gian
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Theo dõi thời gian

Công việc có thể mang một ước lượng và một danh sách entry thời gian thực tế. Hai cái cùng nhau cho phép bạn so sánh điều bạn nghĩ công việc sẽ mất với điều nó đã mất.

## `time_estimate`

Một số phút duy nhất:

```yaml
time_estimate: 90
```

Modal form phơi bày cái này như input phút / giờ đơn giản. Ước lượng là tùy chọn.

## `time_entries`

Danh sách object `{ start, end, description? }`:

```yaml
time_entries:
  - start: 2026-05-04T09:00:00
    end: 2026-05-04T09:45:00
    description: Khung outline
  - start: 2026-05-05T14:10:00
    end: 2026-05-05T15:30:00
    description: Bản nháp đầu
```

Mỗi entry là một khoảng liên tục bạn dành cho công việc. `description` tùy chọn hữu ích khi công việc trải nhiều phiên và bạn muốn nhớ mỗi phiên về cái gì.

## Cách thời gian được log

Entry thời gian được nối thêm bởi [bộ đếm Pomodoro](../11-pomodoro/index.md) khi phiên gắn với công việc — bắt đầu và kết thúc của phiên trở thành một entry `time_entries` trên công việc. Bạn cũng có thể thêm hoặc sửa entry trực tiếp qua modal form công việc.

## Đọc tổng thời gian

Tổng các khoảng của tất cả entry để có số phút thực tế đã dành. So sánh với `time_estimate` để xem dự đoán giữ thế nào.

Ứng dụng không phơi bày UI "tổng thời gian" tích hợp theo công việc trong v1; dữ liệu có ở đó, và bất kỳ công cụ ngoài đọc YAML có thể tính. Phiên bản tương lai có thể cuộn tự động.

## Vì sao theo công việc và không theo ngày

Phần lớn công cụ "theo dõi thời gian" tổ chức theo ngày — bạn đã làm gì hôm nay? Định dạng này tổ chức theo công việc — *cái này* đã mất bao lâu? Cả hai hình dáng đều hữu ích; cái này phù hợp với "tôi sẽ ước lượng thế nào lần sau?" hơn "tôi đã bill gì?"

Nếu bạn cần cuộn theo ngày, đi qua mọi tệp công việc, mở rộng `time_entries`, và nhóm theo ngày. Định dạng đủ mở cho một script nhỏ.

## Cái nó không phải

- **Một bộ đếm** chính nó. Bộ đếm là [chip Pomodoro](../11-pomodoro/index.md); theo dõi thời gian là *bản ghi* mà bộ đếm để lại.
- **Một công cụ báo cáo.** Không biểu đồ, không hóa đơn, không tóm tắt theo tuần. Dữ liệu có; view không.
- **Một sự ép buộc chính xác.** Ứng dụng tin bất cứ gì bạn viết. Entry chồng nhau, entry trên công việc sai, entry thiếu — tất cả chỉ là sửa YAML.

## Tham khảo

- [[Pomodoro / phiên tập trung]]
