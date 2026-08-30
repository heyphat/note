---
id: 8ab3e5f7-0dff-461c-91c6-3b97fc5d7cab
title: Header toolbar
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Header toolbar

The bar at the top of the editor frame. Holds quick access to common formatting actions and visibility toggles for the surrounding panels.

## What lives there

The toolbar is divided into three rough zones:

### Left

- The current note's **title** (editable inline).
- A breadcrumb showing the note's folder, when it's not at the vault root.

### Middle

The selection toolbar, which appears when you have text selected:

- **Bold**, **Italic**, **Underline**, **Strikethrough**, **Inline code**.
- **Link** — turn the selection into a hyperlink.
- **Ask AI** — opens the [chat drawer](../08-ai/chat-drawer.md) with the selection seeded.

### Right

Visibility toggles for the [right dock](./right-dock.md) panels:

- **Backlinks** show / hide.
- **History** show / hide.
- **Project tasks** show / hide.
- A combined **toggle all three** affordance (same effect as `Cmd/Ctrl + Shift + B`).

Plus quick-access items that don't fit elsewhere:

- **Pomodoro chip** (when a session is running) — see [Pomodoro](../11-pomodoro/index.md).
- **Word count** (when enabled) — see [Settings](../14-customization/appearance.md).
- **Theme cycle** button.

## What the toolbar doesn't have

- A "Save" button. The app autosaves; `Cmd/Ctrl + S` flushes manually if you want.
- A "New note" button. The sidebar has one; the keyboard has `Ctrl + N` (macOS) / `Ctrl + Alt + N`.
- A model picker. That lives inside the chat drawer, since it's chat-scoped.

## Hidden in zen / lock mode

When you're in [zen mode](../03-editor/editor-modes.md), the header is hidden. When you're in [lock mode](../03-editor/editor-modes.md), the formatting actions are inert (the dock toggles still work).

## On smaller screens

The toolbar collapses gracefully — actions move into a "more" menu rather than wrapping. The keyboard shortcuts work regardless of which actions are visible.

## References

- [[Chat drawer]]
- [[Right dock]]
- [[Pomodoro / focus session]]
- [[Appearance]]
- [[Editor modes]]
