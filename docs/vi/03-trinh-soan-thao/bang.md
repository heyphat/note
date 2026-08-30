---
id: 787a786e-d621-4ba9-86d1-851bdf403d7c
title: Bảng
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Bảng

Bảng trong Note dùng cú pháp GitHub Flavored Markdown chuẩn dưới nắp, với vài tiện ích trình soạn thảo trên đó.

## Cách chèn

- Gõ `/table` để có bảng khởi đầu 3×2.
- Hoặc gõ cú pháp trực tiếp:

```markdown
| Symbol | Side | Pnl |
| --- | --- | --- |
| AAPL | Long | +120 |
| MSFT | Short | -45 |
```

Các thanh dọc không cần thẳng hàng. Trình soạn thảo bố trí chúng thành lưới về mặt thị giác; tệp bên dưới là những gì bạn gõ.

## Sửa một bảng

- **Tab** chuyển đến ô tiếp theo. **Shift + Tab** chuyển đến ô trước.
- **Enter** trong ô cuối của hàng cuối chèn hàng mới.
- **Kéo cạnh cột** để đổi kích thước cột. Thay đổi là thị giác — bảng markdown không mang metadata độ rộng, nên độ rộng reset khi tải lại.
- **Bấm phải** trên ô để có hành động cột / hàng: chèn cột trước / sau, chèn hàng trên / dưới, xóa cột, xóa hàng.

## Căn chỉnh

Hàng ngăn cách điều khiển căn chỉnh theo cột:

```markdown
| Trái | Giữa | Phải |
| :--- | :---: | ---: |
| a | b | c |
```

- `:---` căn trái (mặc định)
- `:---:` giữa
- `---:` phải

## Bảng không phải là gì

- **Không phải bảng tính.** Không công thức, không kiểu ô, không sắp xếp. Nếu cần thế, dùng công cụ riêng.
- **Không lồng.** Một ô giữ nội dung inline (văn bản, định dạng, liên kết). Nó không giữ được khối mã hoặc bảng khác.
- **Không phân trang.** Bảng rộng hoặc cao cuộn trong trình soạn thảo; cân nhắc dữ liệu có thực sự cần là bảng hay có thể là danh sách.

## Vòng đọc/ghi

Định dạng trên đĩa là GFM thuần. Các công cụ markdown khác — GitHub, Obsidian, Pandoc — đọc và ghi cùng cú pháp. Dán bảng từ Excel hoặc Google Sheets thường chạy, vì hầu hết bảng tính xuất TSV mà trình soạn thảo có thể chuyển đổi.
