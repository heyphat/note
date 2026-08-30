---
id: da90357f-6aea-49f7-9305-c08133732ade
title: Xử lý sự cố
createdAt: 2026-05-10T03:21:43.154Z
updatedAt: 2026-05-10T03:21:43.154Z
---
# Xử lý sự cố

Một vài tình huống thường gặp đến mức đáng có một danh sách kiểm tra. Nếu bạn không tìm thấy vấn đề của mình ở đây, README và các issue trên GitHub là điểm tới tiếp theo.

## "Ứng dụng không mở thư mục của tôi."

Nhiều khả năng bạn đang ở trên trình duyệt không được hỗ trợ. Xem [Hỗ trợ trình duyệt](./01-bat-dau/ho-tro-trinh-duyet.md). Note phụ thuộc vào File System Access API; Firefox và Safari không có. Hãy dùng Chrome, Edge, Brave, Arc, Opera, hoặc trình duyệt nền Chromium khác.

## "Tôi đã chọn thư mục, nhưng ứng dụng cứ hỏi lại."

Hai khả năng:

1. **Trình duyệt đã hết hạn quyền truy cập.** Một số trình duyệt cắt quyền truy cập thư mục khá tích cực. Hãy chọn lại và bật *Cho phép mỗi lần truy cập* nếu trình duyệt có tùy chọn đó.
2. **Bạn đã xóa dữ liệu trang.** Handle kho sống trong IndexedDB; xóa lưu trữ trang sẽ xóa luôn nó. Bạn sẽ phải chọn lại một lần.

## "Các sửa đổi gần đây không xuất hiện trong tìm kiếm."

Chỉ mục tìm kiếm sống trong bộ nhớ và cập nhật khi bạn chỉnh sửa. Nếu kết quả trông cũ:

- Chạy **Lập lại chỉ mục kho** từ popover thiết lập thanh bên. Xem [Lập lại chỉ mục](./01-bat-dau/lap-chi-muc-lai.md).
- Kiểm tra rằng tệp *thực sự* đã được lưu bằng cách xem nó trong trình quản lý tệp. Tự động lưu nhanh nhưng không tức thì; `Cmd/Ctrl + S` đảm bảo việc đẩy.

## "Tôi đã xóa một ghi chú và nó vẫn còn trong thanh bên."

Thanh bên làm mới trong lần tải tiếp theo. Nếu tệp đã biến mất nhưng entry trên thanh bên vẫn còn, chạy **Lập lại chỉ mục kho**.

## "Wikilink chuyển đỏ sau khi tôi đổi tên một thứ."

Đồ thị liên kết tự xây dựng lại khi đổi tên trong ứng dụng. Nếu bạn đổi tên ghi chú *bên ngoài* ứng dụng (qua trình quản lý tệp, qua script), chạy **Lập lại chỉ mục kho**.

## "Trò chuyện AI báo khóa của tôi không hoạt động."

Vài thứ cần kiểm tra:

- Bạn có sao chép khóa kèm khoảng trắng đầu/cuối không? Hãy cắt sạch.
- Khóa có đúng nhà cung cấp không? Khóa Anthropic không chạy được trong ô của OpenAI.
- Với AWS Bedrock, **vùng (region)** đã đúng chưa? Vùng sai đụng phải endpoint khác.
- Bấm **Kiểm tra kết nối** trong popover thiết lập thanh bên — nó gọi thử rất nhỏ và hiển thị lỗi trả về từ nhà cung cấp.

## "AI nói nó không có công cụ MCP nào."

- Mở **Thiết lập → Máy chủ MCP**. Mỗi máy chủ có huy hiệu trạng thái — chỉ máy chủ hiển thị **Đã kết nối** mới quảng bá công cụ cho mô hình.
- Huy hiệu kẹt ở **Đã tắt** trong khi toggle đang bật nghĩa là kết nối chưa thử; tắt rồi bật lại toggle.
- **Lỗi** với "Authorization header is badly formatted" — token sai. Sửa máy chủ và thay token.
- **Lỗi** với thông điệp kiểu CORS — máy chủ không cho phép origin trình duyệt. Không có cách vòng; chọn máy chủ MCP khác.
- Xem [Máy chủ MCP](./08-ai/may-chu-mcp.md).

## "AI đề xuất chỉnh sửa nhưng Apply báo lỗi."

Mô hình đề xuất `edit_note` với một chuỗi `find` cụ thể. Nếu bạn đã chỉnh sửa ghi chú đang mở từ lúc đề xuất — kể cả thêm một dấu cách — chuỗi đó có thể không còn duy nhất, và Apply sẽ báo lỗi với "không tìm thấy chuỗi find" hoặc "khớp nhiều hơn một lần".

Hai cách sửa:

- Hủy thẻ và yêu cầu mô hình đề xuất lại. Nó sẽ thấy nội dung ghi chú hiện tại và đề xuất theo đó.
- Áp dụng thay đổi thủ công nếu diff nhỏ.

## "Phiên bản phục hồi đã ghi đè bản trên đĩa khi tôi bấm nhầm nút."

Hộp thoại phục hồi giữ phiên bản trên đĩa làm [ảnh chụp lịch sử](./10-lich-su/duyet-lich-su.md). Mở bảng lịch sử và khôi phục.

## "Xuất PDF trông kỳ lạ."

Output PDF chính là kết quả in của trình duyệt. Nếu một phần trông hỏng:

- Thử trình duyệt khác (engine in khác nhau bố cục khác nhau).
- Xem trước in — đôi khi một quy tắc CSS tùy chỉnh xung đột.
- Với bảng rất dài hoặc nội dung rộng, trình duyệt cắt ở những điểm bất ngờ; cân nhắc tách phần đó ra ghi chú riêng.

## "Ứng dụng chậm trên kho lớn của tôi."

Mức hiệu năng mà ứng dụng được điều chỉnh:

- Tới vài nghìn ghi chú, chỉ mục build trong dưới một giây.
- Vượt hàng chục nghìn, build chỉ mục mất vài giây đáng kể. Việc gõ vẫn nhanh (worker giữ nó tách khỏi luồng chính).

Nếu bạn vượt quá những con số đó:

- Dùng trình duyệt tệp để tổ chức lại hàng loạt, không phải thanh bên.
- Tránh các bộ lọc lan ra mọi ghi chú (biểu đồ toàn cục với 50,000 nút là rất nặng).
- Cân nhắc chia thành nhiều kho nếu nội dung tự nhiên nhóm lại được.

## "Không có gì trên trang này nói về vấn đề của tôi."

- Xem [README](../../README.md) để có ghi chú lý do thiết kế đôi khi giải thích hành vi lạ.
- Mở issue trên repo dự án kèm một bản tái hiện.

## Tham khảo

- [[Hỗ trợ trình duyệt]]
- [[Lập lại chỉ mục cho kho]]
- [[Duyệt lịch sử]]
