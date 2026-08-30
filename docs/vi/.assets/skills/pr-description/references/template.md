# {Tiêu đề ở thể mệnh lệnh, dưới 72 ký tự}

## Tóm tắt

{Một đoạn, tối đa ba câu. Nêu PR thay đổi gì và hiệu ứng người dùng nhìn thấy. Không chi tiết triển khai ở đây — chi tiết đó thuộc về `## Như thế nào` bên dưới.}

## Tại sao

{Liên kết tới sự cố, ticket, tài liệu thiết kế, hoặc báo cáo người dùng đã thúc đẩy thay đổi. Nếu đây là dọn tech-debt không có yếu tố thúc đẩy bên ngoài, nói "tech debt" và đặt tên cho mùi ("logic phân tích lặp lại", "nhánh config không dùng", v.v.).}

## Như thế nào

{Chỉ điền khi cách tiếp cận không hiển nhiên. Với refactor thẳng hoặc fix bug một dòng, viết `_Cách tiếp cận tự rõ từ diff._` và đi tiếp. Với thay đổi không tầm thường, mô tả:
- Hình dạng giải pháp
- Các phương án đã cân nhắc và lý do bị loại
- Bất kỳ abstraction mới nào được giới thiệu

Giữ dưới 5 bullet. Nếu cần nhiều hơn, liên kết ra tài liệu thiết kế.}

## Rủi ro

{Nói rõ bất cứ điều gì reviewer nên biết trước khi merge:
- Di trú dữ liệu hoặc thay đổi schema
- Thứ tự deploy hoặc phối hợp với dịch vụ khác
- Trạng thái feature flag tại thời điểm merge
- Đường rollback nếu có gì hỏng

Viết `_N/A._` nếu thật sự không có. Để trống mời gọi sự nghi ngờ.}

## Kế hoạch test

{Hai phần:

**Tự động:** test hiện có nào bao phủ phần này, cộng với test mới thêm. Đặt tên theo file:line.

**Thủ công:** smoke test reviewer nên chạy cục bộ. Bước cụ thể, không phải "test nó đi". Ví dụ:
1. `pnpm dev`
2. Mở `/inbox`
3. Kéo một ghi chú từ thư mục unsorted vào một ngày trống
4. Xác nhận pill ngày cập nhật và chỉ báo save nháy lên

Nếu không có test thủ công (vì thay đổi hoàn toàn nội bộ và bộ test tự động là đủ), nói rõ.}

## Screenshot / video

{Chỉ cho thay đổi UI. Một screenshot cho mỗi trạng thái thay đổi rời rạc. Với video, dùng liên kết Loom thay vì nhúng — giữ mô tả PR dễ lướt.}
