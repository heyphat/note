---
id: 60e0e6cf-be5f-497f-91d1-087254977ae9
title: Biểu đồ
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Biểu đồ

Note có thể render ba loại nội dung trực quan inline:

- [Mermaid](./mermaid.md) — biểu đồ dựa trên văn bản (sơ đồ luồng, biểu đồ tuần tự, ER, gantt, pie, …). Nguồn là văn bản thuần trong khối mã có rào.
- [Excalidraw](./excalidraw.md) — biểu đồ cảm giác vẽ tay. Nguồn là định dạng scene Excalidraw, cũng trong khối mã có rào.
- [Canvas](./canvas.md) — bảng không gian vô tận với các node kéo-thả được (thẻ văn bản, nhúng ghi chú, bookmark liên kết, nhóm) nối bằng các đường edge. Nguồn là JSON theo đặc tả JSON Canvas — cùng định dạng Obsidian dùng.

Cả ba theo cùng nguyên tắc: **hình bạn thấy được render lại từ nguồn khi xem**. Nguồn sống trong tệp markdown (hoặc trong `.assets/` cho scene Excalidraw), nên biểu đồ hoặc canvas là một sản phẩm thật, sửa được — không phải ảnh mờ.

## Vì sao nguồn-là-chân-lý

- **Diff có ý nghĩa.** Đổi một biểu đồ tuần tự Mermaid, và `git diff` cho thấy chính xác cái gì đổi.
- **An toàn vòng đọc/ghi.** Công cụ không render biểu đồ chỉ thấy mã nguồn trong khối.
- **Không có vấn đề "tệp .png đâu rồi?"** Hình không phải tệp riêng; nó được render lại.

Đánh đổi là bạn không thể tinh chỉnh bố cục từng-pixel theo cách bạn làm trong trình soạn vector. Cho phần lớn biểu đồ trong ghi chú, đó là đánh đổi đúng.
