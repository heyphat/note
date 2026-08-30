---
id: a72d079e-f6ee-4a7b-9a07-fe325ddb3e36
title: Nhắc nhở
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Nhắc nhở

Một công việc có thể mang danh sách nhắc nhở để thúc đẩy bạn. Nhắc đến trong hai dạng: **tương đối** (neo vào ngày due hoặc scheduled của công việc) và **tuyệt đối** (một datetime cụ thể).

## Nhắc tương đối

```yaml
reminders:
  - relative: -P1D   # 1 ngày trước due
  - relative: -PT1H  # 1 giờ trước due
```

Chuỗi là ISO 8601 duration:

- `P1D` = 1 ngày, `PT1H` = 1 giờ, `PT15M` = 15 phút, `P1W` = 1 tuần.
- Dấu `-` đầu nghĩa là *trước* anchor (trường hợp thông thường).
- Không có `-`, nó nghĩa *sau* (ví dụ nhắc theo dõi).

Nhắc tương đối neo vào **`due`** khi có, nếu không thì **`scheduled`**. Nếu cả hai không đặt, nhắc không kích hoạt.

## Nhắc tuyệt đối

```yaml
reminders:
  - at: 2026-05-04T09:00:00
```

Một thời điểm cụ thể. Hữu ích khi công việc không gắn với hạn — "nhắc tôi về cái này vào sáng thứ Hai."

## Cách nhắc kích hoạt

Nhắc xuất hiện trong các view công việc của ứng dụng (chỉ báo trên công việc có nhắc sắp tới) và cũng có thể kích hoạt thông báo trình duyệt, tùy quyền thông báo của trình duyệt.

Cơ chế giao chính xác phụ thuộc trình duyệt: thông báo qua service-worker khi tab mở, ít quyết liệt hơn khi không. Xem nhắc như cú thúc, không phải báo thức cứng — đồng hồ báo thức cấp OS vẫn tốt hơn cho "đây là cuộc họp."

## Vì sao hai dạng

- **Tương đối** là dạng đúng cho công việc *có* hạn và bạn muốn được biết trước: "một giờ trước thời điểm due, ping tôi."
- **Tuyệt đối** là dạng đúng cho công việc *không có* hạn cứng nhưng bạn muốn được nhắc tại điểm cụ thể: "thứ Hai sau lúc 9 giờ, xem cái này."

Bạn có thể gắn cả hai dạng cho cùng công việc. Mỗi nhắc độc lập.

## Nhắc không phải gì

- **Một công cụ lập lịch.** Chúng không di chuyển công việc. Chúng chỉ thúc.
- **Qua thiết bị.** Nhắc kích hoạt trong trình duyệt nó được setup. Chúng không đồng bộ sang điện thoại trừ khi bạn có cùng kho mở trong trình duyệt điện thoại.
- **Tự lên lịch lại.** Một nhắc bị bỏ lỡ không tự lên lịch lại. Khi thời điểm qua, nhắc chỉ là một bản ghi.

## Sửa nhắc

[Modal form công việc](./tao-va-chinh-sua.md) có mục nhắc nhở nơi bạn thêm và xóa entry. YAML bên dưới cũng sửa được trực tiếp trong bất kỳ trình soạn thảo văn bản, nếu nhanh hơn.

## Tham khảo

- [[Tạo và chỉnh sửa công việc]]
