---
id: 35361779-88ab-4c3d-be5f-e27be1ea315f
title: Ưu tiên cục bộ
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Ưu tiên cục bộ

Note không có máy chủ. Không đăng ký, không tài khoản, không dịch vụ đồng bộ, không telemetry. Trang bạn tải là tĩnh; mọi thứ khác xảy ra trong tab trình duyệt của bạn.

## Điều đó nghĩa là gì trên thực tế

- **Ghi chú của bạn sống trên đĩa của bạn**, trong thư mục bạn đã chọn. Chúng là tệp `.md` thuần. Bạn có thể mở chúng trong bất kỳ trình soạn thảo văn bản nào, đồng bộ qua Dropbox / iCloud / Syncthing, hoặc sao lưu cùng với phần còn lại của thư mục home.
- **Máy chủ host không bao giờ thấy nội dung ghi chú.** Việc của máy chủ là giao HTML, JS, CSS đến trình duyệt. Sau đó, nó không còn trong vòng lặp.
- **Đóng tab không mất dữ liệu.** Ghi chú đã là tệp. Tab chỉ là trình xem / trình soạn thảo.
- **Đổi trình duyệt, máy, hoặc nhà cung cấp host là miễn phí.** Di chuyển thư mục, trỏ trình duyệt mới vào, xong.
- **Không có gì để chuyển sang hay rời bỏ.** Định dạng là markdown. Các quy ước trên nó (`[[wikilink]]`, `.assets/`, YAML frontmatter) là quy ước mà các công cụ khác cũng theo.

## Những gì lưu trong trình duyệt

Một số thứ được giữ trong trình duyệt của bạn, không phải trong kho, vì chúng là tùy chọn theo máy chứ không phải nội dung:

- **Handle thư mục kho** (IndexedDB) — để bạn không phải chọn lại mỗi lần tải.
- **Tùy chọn UI** (`localStorage`) — hiển thị thanh bên, kích thước phông, bảng màu, giao diện, …
- **Khóa nhà cung cấp AI** (`localStorage`) — xem [Nhà cung cấp và khóa](../08-ai/nha-cung-cap-va-khoa.md).

Xóa lưu trữ trình duyệt sẽ xóa những thứ này. Nó **không** xóa ghi chú — đó là tệp trên đĩa, không bị động đến.

## Những gì không có trong mô hình này

Vài thứ cố ý không có trong ứng dụng *vì* cam kết ưu tiên cục bộ. Danh sách đầy đủ ở [Lộ trình & những điều không làm](../17-lo-trinh-va-khong-lam.md), nhưng những cái nổi bật:

- Không có dịch vụ đồng bộ host. (Dùng công cụ đồng bộ tệp.)
- Không có hệ thống tài khoản. (Không có gì để đăng nhập.)
- Không có runtime plugin của bên thứ ba. (Ứng dụng là ứng dụng.)
- Không có mã hóa tích hợp. (Dùng mã hóa cấp đĩa của hệ điều hành nếu bạn muốn.)

## AI vừa khít vào đâu

Khi bạn bật AI, Note không proxy lời nhắc của bạn qua bất kỳ ai. Tab của bạn nói chuyện trực tiếp với nhà cung cấp bạn chọn (Anthropic, OpenAI, hoặc Google), dùng khóa bạn dán vào. Máy chủ host không thấy khóa lẫn lời nhắc. Xem [Khóa đi như thế nào](../08-ai/rieng-tu.md).

## Tham khảo

- [[Nhà cung cấp và khóa]]
- [[Lộ trình và những điều không làm]]
- [[Quyền riêng tư AI]]
