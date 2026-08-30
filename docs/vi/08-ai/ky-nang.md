---
id: 5b1e7c3d-2a4f-49b8-8e6c-7f1d0a3b9e2f
title: Kỹ năng
createdAt: 2026-05-14T00:00:00.000Z
updatedAt: 2026-05-14T00:00:00.000Z
---
# Kỹ năng

**Kỹ năng** (skill) là một tệp markdown dạy trợ lý cách làm một công việc lặp đi lặp lại trong kho của bạn — viết tóm tắt tuần, soạn mô tả pull request, chạy checklist chuẩn bị họp. Mô hình nhìn thấy danh sách các kỹ năng có sẵn theo tên + mô tả ngắn; khi có một kỹ năng phù hợp, nó kéo nội dung vào ngữ cảnh và làm theo hướng dẫn bạn viết.

Kỹ năng sống dưới dạng markdown thuần dưới `.assets/skills/`. Chúng có thể version-control được, grep được, và đi theo kho của bạn.

## Kỹ năng vs. công cụ vs. mẫu

Ba khái niệm gần nhau dễ nhầm lẫn:

| | Là gì | Ở đâu |
| --- | --- | --- |
| **Kỹ năng** | Hướng dẫn, ví dụ, tham chiếu cho một công việc mô hình nên làm theo | `.assets/skills/<tên>.md` |
| **Công cụ** | Hàm mà mô hình có thể gọi — đọc, tìm, sửa, lấy | Tích hợp sẵn hoặc qua [máy chủ MCP](./may-chu-mcp.md) |
| **Mẫu** | Nội dung khởi đầu cho ghi chú mới (không liên quan AI) | `.assets/templates/<tên>.md` |

Kỹ năng là một bổ sung cho prompt. Mô hình không thể "thực thi" kỹ năng một mình — nó tải nội dung và quyết định bước tiếp. Nếu kỹ năng mô tả quy trình nhiều bước, mô hình sẽ gọi các công cụ (`read_note`, `edit_note`, `manage_tasks`, MCP, …) để thực hiện.

## Cấu trúc

Mọi kỹ năng đều có frontmatter YAML với hai trường bắt buộc:

```markdown
---
name: weekly-recap
description: Tạo tóm tắt tuần có cấu trúc từ các ghi chú trong tuần
---
# Tóm tắt tuần

Tìm trong kho các ghi chú đã cập nhật trong 7 ngày qua. Nhóm chúng thành:
- Việc đã xong
- Trở ngại
- Quyết định
- Ưu tiên tuần sau

Xuất ra một ghi chú markdown duy nhất với một heading `## ` cho mỗi nhóm. Trích nguồn các ghi chú bằng wikilink.
```

- **`name`** — cái mô hình gọi khi triệu hồi kỹ năng. Phải duy nhất trong toàn kho.
- **`description`** — một dòng ngắn. Mô hình quyết định kỹ năng có áp dụng được không dựa trên dòng này, nên viết như một chủ đề, không phải lời quảng cáo ("Tạo tóm tắt tuần từ các ghi chú trong tuần" — không phải "Tóm tắt hay nhất trên đời!").

Các trường frontmatter bổ sung (`version`, `author`, `license`, bất kỳ thứ gì khác) sẽ round-trip nguyên vẹn qua mỗi lần lưu — tiện khi nhập gói kỹ năng từ nơi khác.

## Hai hình dạng trên đĩa

### Tệp đơn

`.assets/skills/weekly-recap.md` — toàn bộ kỹ năng, frontmatter + nội dung, trong một tệp. Phù hợp cho kỹ năng vừa trong vài trăm dòng.

### Gói thư mục

```
.assets/skills/pr-description/
├── SKILL.md
└── references/
    └── template.md
```

`SKILL.md` chứa frontmatter và hướng dẫn chính. Các tệp anh em (markdown, mã mẫu, schema) sống bên cạnh; nội dung tham chiếu đến chúng bằng đường dẫn tương đối. Mô hình có thể kéo chúng theo nhu cầu qua `read_skill_file({name, path})`, nên một tham chiếu dài không phải đi theo trong mọi lần gọi.

Dùng gói thư mục khi:

- nội dung tham chiếu các ví dụ cụ thể mà sẽ làm phình tệp hướng dẫn chính
- kỹ năng đi kèm các mẫu, JSON schema, hoặc ví dụ hoàn chỉnh
- bạn đang nhập một gói kỹ năng từ nơi khác (định dạng tương thích với các gói skill của Anthropic)

Tên thư mục là id của kỹ năng trên đĩa. Đổi tên cập nhật `name` trong frontmatter; tên thư mục giữ nguyên để đường dẫn tương đối trong nội dung không bị hỏng.

## Đặt ở đâu

| Bố cục | Dùng cho |
| --- | --- |
| `.assets/skills/<tên>.md` | Kỹ năng tệp-đơn cấp cao nhất |
| `.assets/skills/<basename>/SKILL.md` | Gói thư mục cấp cao nhất |
| `.assets/skills/<danh-mục>/<tên>.md` | Tệp-đơn lồng trong thư mục danh mục |
| `.assets/skills/<danh-mục>/<basename>/SKILL.md` | Gói thư mục lồng |

Thư mục danh mục chỉ để tổ chức — chúng không xuất hiện với mô hình, chỉ hiển thị trong thanh bên. Hai kỹ năng không thể có cùng `name` ngay cả khi chúng sống ở danh mục khác nhau.

## Kỹ năng mẫu trong kho này

Hai ví dụ sống dưới `.assets/skills/` để bạn xem cả hai hình dạng cùng lúc:

- **weekly-recap** — tệp đơn. Mẫu prompt cho bản tóm tắt tuần chiều thứ Sáu.
- **pr-description** — gói thư mục. Trình soạn mô tả PR, với một mẫu tham chiếu mà kỹ năng trỏ tới qua `read_skill_file`.

Mở chúng trong thanh bên (mục Skills dưới kho của bạn) để xem frontmatter và nội dung. Sao chép cái nào sang kho của riêng bạn để tuỳ biến.

## Mô hình dùng kỹ năng như thế nào

Ngăn trò chuyện chỉ hiển thị kỹ năng khi công cụ chỉnh sửa được bật (tức là khi mô hình có thể hành động dựa trên kết quả). Trong mỗi system prompt, mô hình thấy:

```
## Available skills
- weekly-recap: Tạo tóm tắt tuần có cấu trúc từ các ghi chú trong tuần
- pr-description: Soạn mô tả pull request rõ ràng từ một diff
```

Khi mô hình quyết định một kỹ năng phù hợp, nó gọi `load_skill({name})`. Nội dung trả về; mô hình coi đó như chỉ dẫn system-level bổ sung cho lượt đó và tiếp tục. Với gói thư mục, phản hồi cũng liệt kê các tệp phụ — mô hình có thể gọi `read_skill_file({name, path})` để kéo bất kỳ tệp nào.

Không có cổng "Apply" trên `load_skill` — nó chỉ-đọc, như công cụ tìm và đọc, nên chạy tự động.

## Mẹo viết kỹ năng

- **Bắt đầu bằng mô tả.** Đó là điều duy nhất quyết định mô hình có chọn kỹ năng hay không, nên dành nhiều sự chú ý ở đây nhất.
- **Viết nội dung như chỉ dẫn cho đồng đội, không phải cho mô hình.** "Tìm ghi chú đã cập nhật trong 7 ngày qua, rồi …" đọc hơn "Bạn sẽ bây giờ …".
- **Giới hạn mỗi kỹ năng ở một công việc.** Gom các công việc con liên quan dưới một nội dung kỹ năng duy nhất. Nếu hai kỹ năng trùng nhau hơn một câu, hợp nhất.
- **Tham chiếu tên công cụ cụ thể** (`search_vault`, `read_note`, `edit_note`, `manage_tasks`) khi kỹ năng kỳ vọng một luồng công cụ cụ thể. Mô hình biết chúng theo tên.
- **Với kỹ năng thư mục, trỏ tới tệp phụ rõ ràng.** "Xem `references/template.md` để biết cấu trúc đầu ra" cho mô hình một gợi ý rõ ràng để gọi `read_skill_file`.

## URL và sự ổn định

Thanh địa chỉ trình duyệt mang `/skills/<uuid>`, trong đó UUID là trường `id` trong frontmatter. Ứng dụng đóng dấu một UUID lần mở đầu và không bao giờ tạo lại, nên liên kết sống sót qua đổi tên, di chuyển, và tổ chức lại thư mục. Tên tệp trên đĩa có thể thay đổi tự do mà không làm hỏng bookmark.

## Điều kỹ năng không thể làm

- **Gọi công cụ mà mô hình chưa có.** Một kỹ năng nói "dùng công cụ `linear_search`" chỉ hoạt động nếu có [máy chủ MCP](./may-chu-mcp.md) tên `linear` được cấu hình.
- **Thay đổi trạng thái trực tiếp.** Kỹ năng là chỉ-đọc về phía lớp lưu trữ — `load_skill` không ghi gì. Thay đổi diễn ra qua các công cụ chỉnh sửa mà kỹ năng hướng dẫn mô hình gọi, và những công cụ đó vẫn xuất hiện dưới dạng thẻ proposed-edit bạn Apply.
- **Chạy mà không có công cụ chỉnh sửa.** Nếu chuỗi chat tắt công cụ chỉnh sửa, mô hình không thấy mục skills nào cả. Chat chỉ-đọc bỏ qua bước tải.

Xem thêm: [Tổng quan công cụ](./tong-quan-cong-cu.md), [Công cụ chỉnh sửa](./cong-cu-chinh-sua.md), [Máy chủ MCP](./may-chu-mcp.md).
