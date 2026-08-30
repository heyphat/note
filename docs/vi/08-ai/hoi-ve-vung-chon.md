---
id: 36447129-b6b4-45cc-87f3-e43aa56a9af2
title: Hỏi về vùng chọn
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Hỏi về vùng chọn

Bạn có thể kéo văn bản từ ghi chú vào ngăn trò chuyện mà không gõ lại.

## Cách

1. **Bôi đen một đoạn văn bản** trong trình soạn thảo.
2. Một thanh công cụ vùng chọn nhỏ xuất hiện.
3. Bấm nút **Ask AI** trên thanh công cụ.
4. Ngăn trò chuyện mở (nếu chưa), với vùng chọn của bạn làm hạt giống của tin nhắn mới.

Bạn cũng có thể nhấn phím tắt trực tiếp để hỏi về bất cứ gì đang được chọn.

## Cái gì được gửi

Vùng chọn trở thành một phần của tin nhắn — thường được trích dẫn, để mô hình thấy nó như ngữ cảnh. Bạn thêm câu hỏi thực phía trên hoặc dưới: "Viết lại cái này bằng tiếng Anh đơn giản," "Cái gì khó hiểu trong đoạn này?," "Đề xuất năm tiêu đề khác cho mục này."

## Cái mô hình có ngoài vùng chọn

Cùng ngữ cảnh mặc định mỗi tin nhắn cuộc trò chuyện được:

- Phần thân đầy đủ của ghi chú đang mở (để mô hình biết cái gì xung quanh vùng chọn của bạn).
- Danh sách thư mục kho (cho đề xuất `create_note`).
- Cuộc trò chuyện cho đến giờ trong chuỗi đang mở.

Vùng chọn không *thay thế* ngữ cảnh đó — nó thêm vào.

## Khi cái này hữu ích

- **Viết lại có mục tiêu.** "Làm chặt đoạn này" → mô hình đề xuất một thẻ `edit_note` với văn bản đã viết lại.
- **Dịch thuật.** "Dịch cái này sang tiếng Việt."
- **Giải thích.** "Giải thích đoạn mã này làm gì, và cái gì có thể sai."
- **Trích cấu trúc.** "Biến cái này thành một checklist."

## Khi không

Cho câu hỏi rộng về cả ghi chú, chỉ cần mở ngăn trò chuyện và hỏi — không cần vùng chọn. Mô hình đã có thân đầy đủ trong system prompt.

## Vùng chọn trong tin nhắn chat

Cùng affordance Ask-AI hoạt động *trong* chat: làm nổi một phần phản hồi của assistant và một popover nhỏ xuất hiện với hành động sao chép / trích lại. Xem popover vùng chọn chat trong feed cuộc trò chuyện của bạn.
