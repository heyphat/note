---
id: 5867a6b9-a681-45bb-b5e3-ddbdff58e0ad
title: Ngôn ngữ
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Ngôn ngữ

UI ứng dụng song ngữ: **Tiếng Anh** và **Tiếng Việt**. Cả hai đều là hạng nhất — mọi nhãn, tooltip, thông báo lỗi, và toast được dịch.

## Cách đổi

Ngôn ngữ được đặt theo trình duyệt trong popover thiết lập thanh bên. Chọn **English** hoặc **Tiếng Việt** và UI render lại theo ngôn ngữ đã chọn.

Locale cũng phản ánh trong tiền tố URL:

```
http://localhost:3000/en/...   ← Tiếng Anh
http://localhost:3000/vi/...   ← Tiếng Việt
```

Bạn cũng có thể đổi bằng cách sửa URL, nhưng popover thiết lập là đường thông thường.

## Cái gì được dịch

- Tiêu đề mục thanh bên và tooltip.
- Chrome trình soạn thảo (nút thanh công cụ, nhãn thiết lập).
- Nhãn modal (form công việc, bộ chọn mẫu, hộp thoại khôi phục).
- Tin nhắn toast (đã lưu, đã sao chép, đổi giao diện, bắt đầu / dừng phiên tập trung).
- Thông báo lỗi.

## Cái gì không được dịch

- **Nội dung ghi chú của bạn.** Ghi chú là *của bạn*; ứng dụng không động đến. Một ghi chú tiếng Việt trong UI ngôn ngữ tiếng Anh trông như một ghi chú tiếng Việt. Cùng đúng theo chiều ngược.
- **Nội dung cuộc trò chuyện AI.** AI trả lời bằng ngôn ngữ bạn viết cho nó. *Chrome* của ngăn trò chuyện được dịch; tin nhắn không.
- **Tên nhà cung cấp.** "Anthropic," "OpenAI," "Google" không dịch.
- **Cú pháp markdown.** Wikilink là wikilink bất kể locale.

## Thêm ngôn ngữ

Bản dịch sống trong `locale/<lang>.json`. Thêm ngôn ngữ thứ ba là chuyện viết một tệp JSON mới và đăng ký với `next-intl`. Ngoài tiếng Anh và tiếng Việt, không có ngôn ngữ nào được phát hành hôm nay.

## Vì sao hai cái này

Người đóng góp và người dùng chính của Note là người nói tiếng Anh và tiếng Việt, và i18n được xây ngay từ đầu để không nghẽn cổ chai vào việc retrofit sau. Hạ tầng là tổng quát; thêm ngôn ngữ là thực tế nếu có nhu cầu.

## Đặc điểm liên quan đến locale

- **Định dạng ngày** trong những thứ như lịch dải tôn trọng locale.
- **Thứ tự sắp xếp** cho tiêu đề ghi chú dùng so sánh nhận biết locale.
- **Script phải-sang-trái** không được kiểm thử cụ thể — không tiếng Anh lẫn tiếng Việt là RTL. Hỗ trợ RTL sẽ cần công việc UI thêm.
