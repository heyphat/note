---
id: 8107a47a-864d-4c64-9058-bfe3ea8b8f5e
title: Lộ trình và những điều không làm
createdAt: 2026-05-10T03:21:43.154Z
updatedAt: 2026-05-10T03:21:43.154Z
---
# Lộ trình và những điều không làm

Một số tính năng người dùng hỏi không có trong ứng dụng. Một vài đang trên đường tới; những cái khác cố ý không có — chúng sẽ làm hỏng phần thiết kế khiến Note đáng dùng ngay từ đầu.

## Đang trên đường (có thể)

Những thứ thực tế, có giới hạn rõ, và đang được cân nhắc tích cực. Không có cam kết:

### Bản di động

Phiên bản di động qua [Capacitor](https://capacitorjs.com). Lớp lưu trữ đã là một interface (`NoteStore` trong `src/lib/storage/`); công việc còn lại chủ yếu là:

- Một adapter `NoteStore` mới cho hệ thống tệp di động.
- Tinh chỉnh thân thiện cảm ứng cho vài nơi trong trình soạn thảo.
- Xử lý quyền với các File System API trên di động.

### Chia sẻ ghi chú

Một cách công bố một ghi chú cho người không có kho. Hình dáng có thể: bạn trỏ Note vào một bucket cloud bạn kiểm soát (S3, Cloudflare R2, …), ứng dụng tải ghi chú đã render lên đó, và bạn chia sẻ URL. Bucket là của bạn; Note chỉ là người công bố. Giữ nguyên cam kết "không máy chủ".

### Thêm ngôn ngữ

Ngoài tiếng Anh và tiếng Việt. Hạ tầng i18n là tổng quát; chỉ cần thêm tệp dịch.

### Trợ giúp dọn dẹp

Những thứ như "tìm orphan" cho các tệp `.assets/` không còn ghi chú nào tham chiếu, hoặc trình phát hiện liên kết hỏng. Hữu ích cho các kho lâu dài.

## Không xảy ra

Những điều này sẽ thay đổi bản chất của Note. Không phải để tự vệ, chỉ để đặt kỳ vọng:

### Dịch vụ đồng bộ trên cloud

Note không có và sẽ không có. Đồng bộ là việc của công cụ đồng bộ tệp của bạn (Dropbox, iCloud, Syncthing, git, gì cũng được). Xây một dịch vụ đồng bộ trên cloud là kiểu công việc biến "một công cụ chạy trong tab trình duyệt" thành "một SaaS có lộ trình và hệ thống thanh toán" — một dự án khác.

### Hệ thống tài khoản

Không có tài khoản vì không có gì để đăng nhập. Mọi tính năng hoạt động không cần nó.

### Runtime plugin của bên thứ ba

Một plugin API sẽ cho phép người khác mở rộng Note. Nó cũng sẽ:

- Mở rộng đáng kể bề mặt bảo mật (một runtime plugin là rất nhiều mã cần giữ an toàn).
- Buộc nội bộ ứng dụng vào một API công khai khó thay đổi.
- Sinh ra một hàng loạt giải pháp dạng plugin cho các vấn đề được giải tốt hơn bằng cách chỉnh sửa markdown trực tiếp hoặc viết một script ngoài nhỏ.

Đánh đổi không đáng. Nếu một quy trình thực sự cần logic riêng, sự cởi mở của Note — tệp trên đĩa của bạn, các quy ước mà công cụ khác chia sẻ — nghĩa là một script ngoài thường là công cụ tốt hơn.

### Mã hóa tích hợp

Mã hóa cấp hệ điều hành (FileVault, BitLocker, LUKS, …) làm tốt việc này. Thêm một lớp mã hóa thứ hai trong ứng dụng nghĩa là quản lý khóa, mã khôi phục, và một đống UX quanh "bạn quên cụm mật khẩu" — đổi lại lợi ích biên rất nhỏ.

### Một vỏ native

Trình duyệt là runtime. Bọc Note trong Electron / Tauri / tương tự sẽ thêm trình cài, auto-updater, ký mã, và chuỗi phân phối theo OS — mà không thay đổi bất kỳ *tính năng* nào.

Vỏ Capacitor cho di động ở trên là một lập luận khác: trình duyệt di động không có File System Access API, nên một vỏ native là con đường duy nhất. Trên desktop, trình duyệt là đủ.

### Chế độ "AI agent" giàu hơn

Tính năng AI của Note có giới hạn rõ — đọc kho, đề xuất chỉnh sửa cho ghi chú đang mở, quản lý công việc. Một vòng lặp agent đầy đủ (lập kế hoạch, thực thi nhiều bước với dịch vụ ngoài, biến đổi tự động qua nhiều ghi chú) gần với "một sản phẩm khác" hơn là "một tính năng". Tạm thời không.

## Mục mở chưa thuộc danh sách nào

Vài thứ là câu hỏi thật mà dự án chưa quyết:

- **Ghi chú hằng ngày như tính năng hạng nhất.** Hôm nay ghi chú hằng ngày là sản phẩm phụ — dùng mẫu, đặt tên theo ngày. Việc có nên tích hợp sâu hơn (tự tạo, phím tắt "hôm nay", …) chưa được quyết.
- **Bảng màu tùy chỉnh qua UI.** Mười một bảng màu chọn sẵn phủ phần lớn sở thích; có nên xây giao diện chọn màu cho bảng tùy chỉnh là một câu hỏi mở.
- **Mã hóa từng ghi chú** (tách khỏi cấp đĩa). Một số người dùng muốn một ghi chú được mã hóa bằng cụm mật khẩu kể cả khi phần còn lại không. Có vẻ khả thi nhưng chưa thiết kế.

## Vì sao điều này quan trọng

Danh sách "không xảy ra" là cột sống của dự án. Nếu bạn đang chọn giữa Note và công cụ khác, đó là những đánh đổi cố ý. Nếu bạn muốn bất kỳ tính năng nào trong số đó, một công cụ khác có lẽ phù hợp hơn — và điều đó hoàn toàn ổn; có rất nhiều công cụ tốt khác.
