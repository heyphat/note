---
id: f2ac7a90-d6c0-45fa-80a0-64ef672076b0
title: Bảng màu
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Bảng màu

**Bảng màu** là tập màu sắc được phối hợp cho mọi thứ trong UI: nền, panel, văn bản, viền, accent, thành công / cảnh báo / lỗi. Ứng dụng đi kèm mười một bảng màu, và mỗi cái định nghĩa cả biến thể tối và sáng.

Chọn bảng màu **độc lập** với [chuyển sáng/tối](./chuyen-giao-dien.md). Toggle quyết định biến thể nào của bảng màu hiện tại được áp dụng.

## Các bảng màu

| Bảng màu | Cảm giác |
| --- | --- |
| **Default** | Accent xanh lạnh trên xanh navy đậm. Bảng nhận diện của ứng dụng. |
| **Solarized** | Scheme Solarized cổ điển — nền ấm, accent kiềm chế. |
| **Dracula** | Tím / hồng tương phản cao trên xám tối. |
| **Nord** | Xanh và xám trầm; cảm giác "polar night". |
| **Gruvbox** | Cam và vàng ấm; cảm giác retro-terminal. |
| **Monokai** | Accent xanh chanh / hồng trên gần-đen. Bảng trình soạn thảo cổ điển. |
| **One** | Scheme Atom One Dark / Light. |
| **Tokyo Night** | Xanh và tím bão hòa trên midnight. |
| **Catppuccin** | Bảng pastel "êm dịu"; tương phản cân bằng. |
| **GitHub** | Bảng của ứng dụng web GitHub. Bảo thủ, quen thuộc. |
| **Rosé Pine** | Tone mauve / hồng với accent ấm. |

## Cách đổi

Ba cách:

- **Popover thiết lập thanh bên** → swatch bảng màu. Bấm swatch để áp dụng.
- **Bảng lệnh** → `> palette: <tên>`.
- **Popover thiết lập trình soạn thảo** → mục bảng màu.

Thay đổi tức thì; không tải lại.

## Cái gì đổi khi bạn chuyển

- Nền, panel, viền, màu chữ.
- Màu accent (liên kết, phần tử focus, nút).
- Tone thành công / cảnh báo / lỗi (dùng cho khung thông báo và thẻ công cụ AI).
- Màu pill (dùng cho một số chip và chỉ báo).

Cái *không* đổi: bố cục, typography, khoảng cách. Bảng màu chỉ về màu — chọn cái dễ chịu nhất cho mắt; phần còn lại của UI hành xử cùng cách.

## Biến thể sáng so với tối

Mọi bảng màu có cả hai. Khi bạn lật [toggle giao diện](./chuyen-giao-dien.md), cùng bảng màu được áp dụng lại trong biến thể khác. Vậy "Solarized + Sáng" và "Solarized + Tối" đều là tùy chọn; toggle đổi giữa chúng.

## Lưu giữ

Bảng màu đã chọn được lưu trong `localStorage`. Nó sống sót qua tải lại và đi theo bạn sang các tab khác trong cùng trình duyệt. Nó **không** đi với kho — trình duyệt / máy khác nhận mặc định đến khi bạn chuyển.

## Vì sao mười một, không phải "bất kỳ màu nào bạn muốn"

Một bộ chọn màu tùy chỉnh sẽ có nghĩa mọi phần tử UI cần trông tốt với mọi tổ hợp — và phần lớn tổ hợp không. Tập được tuyển chọn nhỏ đủ để giữ được kiểm thử và lớn đủ để vừa hầu hết sở thích thẩm mỹ. Nếu không cái nào hoạt động cho bạn, biến CSS được phơi bày (script pre-hydrate inline trong layout đọc từ một nguồn duy nhất), nên bảng tùy chỉnh đạt được với một lượng mã nhỏ — nhưng không qua UI.

## Tham khảo

- [[Chuyển giao diện]]
