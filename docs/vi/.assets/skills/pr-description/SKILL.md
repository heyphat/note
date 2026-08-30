---
id: 9e4b2a7c-6d1f-4938-a2c5-8f3e9b1d4a6c
name: pr-description
description: Soạn mô tả pull request rõ ràng từ một diff hoặc tóm tắt thay đổi người dùng cung cấp
---
# Mô tả PR

Biến một diff thô (hoặc mô tả tự do về thay đổi) thành một mô tả PR có cấu trúc, dễ review, đưa người đọc vào đúng ngữ cảnh ngay lập tức.

## Quy trình

1. Người dùng cung cấp thay đổi — dạng diff, dạng mô tả, hoặc liên kết tới ghi chú đang mở chứa thay đổi. Nếu họ chưa đưa ghi chú đang mở, hỏi trước khi đoán.
2. Đọc `references/template.md` qua `read_skill_file({ name: "pr-description", path: "references/template.md" })` để có đúng cấu trúc mục cần làm theo.
3. Lướt qua thay đổi để tìm:
   - **Cái gì** thay đổi (một câu — bắt đầu bằng động từ thì hiện tại: "Thêm X", "Đổi tên Y", "Xoá Z")
   - **Tại sao** thay đổi (liên kết đến sự cố, ticket, hoặc tài liệu thiết kế; hoặc mô tả vấn đề người dùng nhìn thấy được giải quyết)
   - **Như thế nào** thay đổi (chỉ khi cách tiếp cận không hiển nhiên — đừng nhắc lại các refactor hiển nhiên)
   - **Rủi ro** (di trú dữ liệu, thứ tự deploy, feature flag, đường rollback) — rõ ràng khi có, bỏ khi thật sự N/A
   - **Kế hoạch test** (smoke test reviewer nên chạy để xác minh thay đổi cục bộ, cộng với các test tự động đã thêm)
4. Điền các trường của template. Để bất kỳ mục nào đánh dấu rõ `_N/A._` thay vì xoá.

## Đầu ra

Dùng `rewrite_note` nếu người dùng đang ở ghi chú PR trống; nếu không, `create_note` vào thư mục hiện tại với tên `pr-{nhánh-hoặc-ticket}.md`. Áp dụng cấu trúc template chính xác — reviewer phân tích mô tả PR theo heading mục, nên sự nhất quán quan trọng hơn lời văn hoa.

## Quy tắc

- Một dòng cho tiêu đề. Mệnh lệnh ("Thêm X", không phải "Đã thêm X" hay "Đang thêm X"). Dưới 72 ký tự.
- Tóm tắt là một đoạn, tối đa ba câu. Bất kỳ thứ gì dài hơn thuộc về `## Tại sao` hoặc `## Như thế nào`.
- Mọi tuyên bố về thay đổi hành vi phải liên kết đến bằng chứng: một đường dẫn mã, một test, một screenshot, hoặc một `[[wikilink]]` đến tài liệu thiết kế.
- Đừng bịa kế hoạch test. Nếu thay đổi không có test tự động, nói rõ trong `## Kế hoạch test` — reviewer có thể quyết định điều đó có chấp nhận được cho PR này hay không.
- Bỏ qua mô tả nếu diff là thay đổi format thuần. Bảo người dùng dùng thông điệp commit tự sinh thay thế.

Xem `references/template.md` để biết cấu trúc mục chính xác.
