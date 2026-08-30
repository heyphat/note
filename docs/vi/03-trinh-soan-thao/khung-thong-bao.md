---
id: 30ca520c-2814-40e4-97d8-5ced309a16aa
title: Khung thông báo
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Khung thông báo

Khung thông báo là blockquote được tô để đánh dấu một phần nội dung — một ghi chú, một cảnh báo, một lời nói thêm. Chúng trông như blockquote trong bất kỳ trình xem markdown không hiểu chúng, và như thẻ có viền màu trong Note.

## Cách chèn

- Gõ `/callout` và chọn loại, hoặc
- Gõ cú pháp trực tiếp:

```markdown
> [!NOTE]
> Đây là phần thân của khung thông báo.
> Nó có thể trải nhiều dòng.
```

Marker dòng đầu (`> [!NOTE]`) đặt loại; phần còn lại chỉ là nội dung blockquote.

## Tám loại

| Marker | Ý nghĩa |
| --- | --- |
| `[!NOTE]` | Ghi chú phụ chung |
| `[!TIP]` | Một gợi ý hữu ích |
| `[!IMPORTANT]` | Điều người đọc không nên bỏ qua |
| `[!WARNING]` | Một rủi ro cần để ý |
| `[!CAUTION]` | Một rủi ro lớn hơn; chú ý |
| `[!INFO]` | Thông tin nền trung lập |
| `[!SUCCESS]` | Một kết quả tích cực / xác nhận |
| `[!DANGER]` | Cảnh báo mạnh nhất |

Mỗi loại render với một màu nhấn riêng lấy từ [bảng màu](../14-tuy-bien/bang-mau.md) đang dùng. Lựa chọn giữa, ví dụ, WARNING và CAUTION chủ yếu là về tông; chọn cái khớp với cảm giác.

## Tiêu đề tùy chỉnh

Bạn có thể đặt tiêu đề sau marker. Dòng đầu trở thành đầu mục của khung và phần còn lại là thân:

```markdown
> [!TIP] Chạy migration vào giờ thấp tải
> Ứng dụng đi qua bộ thay đổi tuần tự, nên một bảng 50k hàng
> sẽ chặn ghi vài giây.
```

## Lồng và nội dung

Khung thông báo là blockquote, nên bất cứ gì bạn để được trong blockquote đều dùng được:

- Danh sách (bullet, đánh số, công việc)
- Tiêu đề (render nhỏ hơn, scope trong khung)
- Khối mã (rào và inline)
- Wikilink
- Khung thông báo khác (hiếm; cân nhắc xem có thực sự cần lồng không)

## Vì sao dùng cái này thay vì blockquote thường

Blockquote thường trở nên lộn xộn khi dùng cho lời nói thêm — mỗi khối trích trông giống nhau. Khung thông báo cho bạn tám tín hiệu thị giác phân biệt mà vẫn đọc được trong bất kỳ công cụ markdown. Cú pháp marker (`[!NOTE]`) là cùng cú pháp Obsidian, GitHub, và Microsoft Loop dùng, nên ghi chú đi qua các công cụ một cách sạch sẽ.

## Tham khảo

- [[Bảng màu]]
