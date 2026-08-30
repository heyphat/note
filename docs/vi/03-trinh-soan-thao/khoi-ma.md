---
id: 3ae2fd96-5315-42df-a8b8-34492933b8b9
title: Khối mã
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Khối mã

Khối mã được rào bằng ba dấu backtick (`​````) và một thẻ ngôn ngữ tùy chọn.

## Cách chèn

- Gõ `/code` và chọn ngôn ngữ, hoặc
- Gõ rào trực tiếp:

````markdown
```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```
````

Một thẻ ngôn ngữ bật tô cú pháp. Bỏ trống cho bạn một khối monospace trơn.

## Thẻ ngôn ngữ

Các thẻ thông dụng chạy như mong đợi: `python`, `javascript`, `typescript`, `tsx`, `bash`, `sh`, `json`, `yaml`, `markdown`, `html`, `css`, `sql`, `go`, `rust`, `java`, `c`, `cpp`, `ruby`, `php`, `swift`, `kotlin`, `lua`, `r`, `scala`, `haskell`, `elixir`, `clojure`, `dockerfile`, `nginx`, `toml`, `xml`, `diff`, …

Bộ chọn ngôn ngữ của trình soạn thảo (góc trên-phải khối) phủ những cái thông dụng nhất; bạn cũng có thể gõ một thẻ mà bộ chọn không liệt kê và highlighter sẽ thử render.

## Mã inline

Bao văn bản trong dấu backtick đơn: `` `như thế này` ``. Mã inline dùng cùng phông monospace với khối mã, nhưng không qua bước tô cú pháp.

## Khối có mục đích đặc biệt

Một vài thẻ ngôn ngữ được dành cho các khối render thay vì văn bản tô cú pháp:

- `​```mermaid` — biểu đồ Mermaid. Xem [Mermaid](../05-bieu-do/mermaid.md).
- `​```excalidraw` — vẽ Excalidraw. Xem [Excalidraw](../05-bieu-do/excalidraw.md).

Chúng render thành sản phẩm thị giác khi xem; nguồn vẫn ở trong markdown.

## Khối mã dài

Khối dài cuộn trong khung trình soạn thảo thay vì đẩy trang rộng ra. Nếu bạn muốn word wrap, highlighter tôn trọng wrap của `pre`, nên bạn có thể chỉnh qua [thiết lập giao diện](../14-tuy-bien/giao-dien-hien-thi.md) nếu màn hình của bạn hẹp.

## Sao chép

Hover trên khối và một nút **copy** nhỏ xuất hiện ở góc. Bấm để sao chép nội dung ra clipboard.

## Trong chat AI

Khối mã render cùng cách trong ngăn trò chuyện AI. Khi mô hình phát ra khối có rào, bạn có thể sao chép từ chat mà không mất thẻ ngôn ngữ.

## Tham khảo

- [[Mermaid]]
- [[Excalidraw]]
- [[Giao diện hiển thị]]
