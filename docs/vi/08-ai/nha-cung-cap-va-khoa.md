---
id: f663ca6e-9058-4a61-9aae-2729a6bc2abd
title: Nhà cung cấp và khóa
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Nhà cung cấp và khóa

Note có thể nói chuyện với ba nhà cung cấp mô hình. Mỗi cái độc lập — khóa được lưu riêng, và bạn có thể đổi giữa chúng bất kỳ lúc nào.

## Nhà cung cấp được hỗ trợ

| Nhà cung cấp | Mô hình | Lấy khóa API |
| --- | --- | --- |
| **Anthropic** | Họ Claude (Opus, Sonnet, Haiku) | console.anthropic.com |
| **OpenAI** | Họ GPT (họ GPT-4, …) | platform.openai.com |
| **Google Vertex / Gemini** | Họ Gemini | console.cloud.google.com (Vertex) hoặc aistudio.google.com (khóa AI Studio) |
| **AWS Bedrock** | Anthropic Claude qua Bedrock | AWS console; cần chọn vùng |

Tên mô hình cụ thể bạn chọn được thay đổi khi nhà cung cấp ra mô hình mới. Ứng dụng nhận bất cứ gì hiện có trên endpoint mà khóa của bạn xác thực.

## Cách nhập khóa

1. Mở **thiết lập thanh bên** (biểu tượng bánh răng trong header thanh bên).
2. Cuộn đến mục **AI**.
3. Chọn nhà cung cấp bạn đang cấu hình.
4. Dán khóa API vào ô nhập.
5. (Tùy chọn) Bấm **Test connection** — ứng dụng gọi thử rất nhỏ để xác nhận khóa chạy.

Cho Bedrock, cũng chọn **vùng** mà nhà cung cấp được triển khai (ví dụ `us-east-1`).

## Khóa được lưu ở đâu

Khóa nhà cung cấp sống trong **`localStorage`**. Điều đó có nghĩa:

- Chúng theo trình duyệt. Trình duyệt khác, hoặc cùng trình duyệt trên máy khác, sẽ không có khóa của bạn đến khi bạn nhập lại.
- Chúng không nằm trong kho. Nếu bạn đồng bộ thư mục kho, khóa không đi cùng.
- Xóa lưu trữ trình duyệt sẽ xóa chúng. Nhập lại từ console của nhà cung cấp.

## Đổi nhà cung cấp

Bạn có thể giữ cả bốn nhà cung cấp được cấu hình cùng lúc. Ngăn trò chuyện có bộ chọn mô hình lật giữa chúng giữa cuộc trò chuyện nếu bạn muốn — hữu ích để so sánh câu trả lời, hoặc để định tuyến gọi rẻ tới mô hình nhanh và đắt tới mô hình chậm.

## Host thấy gì

Khi bạn thiết lập nhà cung cấp, yêu cầu từ ngăn trò chuyện đi:

```
tab của bạn → api.anthropic.com  /  api.openai.com  /  generativelanguage.googleapis.com  /  bedrock-runtime.<region>.amazonaws.com
```

Máy host (nơi bạn tải ứng dụng) không trong đường đó. Nó không thể đọc khóa, lời nhắc, hoặc phản hồi. Xem [Quyền riêng tư](./rieng-tu.md).

## Mô hình chi phí

Bạn trả nhà cung cấp trực tiếp, pay-as-you-go. Không có thuê bao Note. Phí tùy giá của nhà cung cấp và kích thước lời nhắc / phản hồi của bạn. Ngăn trò chuyện không giới hạn ngữ cảnh nhân tạo — cuộc trò chuyện dài có thể dùng token nhanh trên mô hình premium.

## Tham khảo

- [[Quyền riêng tư AI]]
