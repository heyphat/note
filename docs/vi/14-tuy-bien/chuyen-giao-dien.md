---
id: 99b57172-7a2e-49cd-a846-75c12a7a5edb
title: Chuyển giao diện
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Chuyển giao diện

Sáng, tối, hoặc theo hệ thống. Đổi giữa chúng với `Cmd/Ctrl + Shift + D`, hoặc dùng nút giao diện trong [thanh công cụ header](../13-dieu-huong/thanh-cong-cu.md).

## Ba chế độ

| Chế độ | Hành vi |
| --- | --- |
| **Sáng** | Luôn sáng, bất kể thiết lập OS. |
| **Tối** | Luôn tối, bất kể thiết lập OS. |
| **Hệ thống** | Theo thiết lập hình thức của OS. Đổi tự động khi OS đổi (ví dụ ngày / đêm). |

## Giao diện so với bảng màu

Toggle giao diện và [bảng màu](./bang-mau.md) **độc lập**. Bảng màu quyết định *màu nào*; toggle giao diện quyết định *sáng hay tối*. Mỗi bảng màu có cả biến thể sáng và tối — toggle đổi biến thể nào áp dụng.

Vậy:

- **Solarized + Sáng** → Solarized sáng.
- **Solarized + Tối** → Solarized tối.
- **Solarized + Hệ thống** → Solarized sáng hoặc tối tùy OS nói gì lúc này.

## Cách áp dụng

Toggle:

1. Đọc (hoặc tính) giá trị sáng/tối được giải.
2. Tải biến thể tương ứng của bảng màu hiện tại.
3. Đặt thuộc tính `data-color-scheme` trên `<html>` để các quy tắc CSS có thể nhánh.
4. Lưu lựa chọn của bạn vào `localStorage`.

Có một script pre-hydrate inline nhỏ chạy trước khi React mount, nên *paint đầu tiên* đúng giao diện. Bạn không thấy chớp ngắn của màu sai.

## Cái theo toggle

- Bề mặt và chrome trình soạn thảo.
- Thanh bên và ngăn phải.
- Ngăn trò chuyện AI.
- Modal (form công việc, bộ chọn mẫu, khôi phục).
- Biểu đồ (Mermaid render lại để khớp).

Cái *không* theo:

- **Ảnh** trong ghi chú của bạn — chúng được render nguyên trạng.
- Màu **tô cú pháp khối mã** — bảng của highlighter cố định.
- **Scene Excalidraw** — chúng giữ màu bạn đã vẽ.

## Phím tắt đổi nhanh

`Cmd/Ctrl + Shift + D` đi vòng `sáng → tối → hệ thống → sáng → …`. Một toast nhỏ cho bạn biết bạn đã đáp vào chế độ nào.

## Khi chế độ Hệ thống là lựa chọn đúng

- Bạn dùng lập lịch hình thức cấp OS (tự động ngày / đêm, kích hoạt sunset, …).
- Bạn muốn cùng ứng dụng trông "đúng" mà không phải nghĩ qua nhiều máy.
- Bạn không có ưu tiên mạnh và thích để OS quyết định.

Khi không:

- Bạn luôn muốn một chế độ bất kể thời gian trong ngày.
- OS của bạn không emit sự kiện đổi hình thức tin cậy (một số setup Linux).

## Tham khảo

- [[Thanh công cụ header]]
- [[Bảng màu]]
