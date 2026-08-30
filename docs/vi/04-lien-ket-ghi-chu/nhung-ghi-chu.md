---
id: 591ac6c8-f722-469a-b7e2-62a813622597
title: Nhúng nội dung
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Nhúng nội dung

Nhúng nội dung là **nhúng nội dung của một ghi chú vào ghi chú khác**. Trong khi wikilink nói "xem ghi chú khác này," một nhúng nội dung nói "render nội dung của ghi chú khác này ngay tại đây."

```markdown
![[Kế hoạch Q1]]
```

Một dòng đó, trong trình soạn thảo, mở rộng thành phần thân của `Kế hoạch Q1` được render inline. Ghi chú đích vẫn sống trong tệp riêng; bạn chỉ đang nhìn nó qua cửa sổ của một ghi chú khác.

## Cách viết

Cú pháp là `![[tên-ghi-chú]]` — cú pháp wikilink với `!` ở đầu, giống như markdown ảnh thêm `!` vào liên kết thường.

Để chỉ nhúng một phần của đích, trỏ vào một tiêu đề:

```markdown
![[Kế hoạch Q1#Rủi ro]]
```

Nó nhúng mục `Rủi ro` (mọi thứ từ tiêu đề đó đến tiêu đề tiếp theo cùng-hoặc-cao-cấp) thay vì cả ghi chú.

## Trông như thế nào trong trình soạn thảo

Nhúng xuất hiện inline, phân biệt thị giác với ghi chú xung quanh (thụt nhẹ / viền khác). Nó **chỉ-đọc tại nơi nhúng** — để sửa nội dung được nhúng, bạn bấm qua ghi chú nguồn. Điều đó giữ cho mô hình nguồn-chân-lý trung thực: mỗi byte của ghi chú đích sống trong một tệp.

## Hành vi cập nhật

Nhúng là view sống. Khi bạn sửa ghi chú đích, mọi nhúng của nó qua kho phản ánh thay đổi vào lần các ghi chú đó được mở hoặc tải lại.

## Cạm bẫy

- **Đừng nhúng một ghi chú vào chính nó.** Ứng dụng từ chối render nhúng tự thân (sẽ vòng vô hạn).
- **Nhúng dài** có thể làm ghi chú cha cảm giác nặng. Nếu bạn thấy mình nhúng cả ghi chú khắp nơi, cân nhắc xem wikilink có truyền đạt cùng điều không.
- **Đích kiểu mục không phân biệt hoa thường nhưng văn-bản-chính-xác** ngoài ra. Đổi tên một tiêu đề trong ghi chú đích phá mọi nhúng cấp-mục từng trỏ vào tên cũ.

## Khi dùng cái nào

- Dùng **wikilink** (`[[…]]`) khi bạn muốn người đọc biết có một ghi chú liên quan và đi theo.
- Dùng **nhúng nội dung** (`![[…]]`) khi *nội dung* của ghi chú khác thuộc về ghi chú này — bạn sẽ phải copy-paste nó, và muốn nhúng theo kịp nguồn.

## Tham khảo

- [[Wikilink]]
- [[Liên kết ngược]]
