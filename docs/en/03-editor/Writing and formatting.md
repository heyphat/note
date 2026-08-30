---
id: 7550f69d-09e2-44e8-8833-cb127daf3997
title: Writing and formatting
createdAt: 2026-05-09T15:09:55.421Z
updatedAt: 2026-05-09T15:10:09.318Z
---
# Writing and formatting

The editor accepts the same markdown syntax you'd write by hand, and renders most of it as you type.

## Inline formatting

| Markdown                 | Renders as   | Shortcut                        |
| ------------------------ | ------------ | ------------------------------- |
| `**bold**`               | **bold**     | `Cmd/Ctrl + B` (in selection)   |
| `*italic*` or `_italic_` | *italic*     | `Cmd/Ctrl + I`                  |
| `~~strike~~`             | ~~strike~~   | —                               |
| `` `code` ``             | `code`       | `Cmd/Ctrl + E`                  |
| `[label](url)`           | [label](url) | `Cmd/Ctrl + K` (with selection) |
| `[[note]]`               | wikilink     | type `[[` or `@` then pick      |

Type the syntax directly and the editor turns it into the rendered form. You can also select text and apply formatting through the selection toolbar that appears.

## Block-level structure

| Markdown              | Block                                            |                                   |
| --------------------- | ------------------------------------------------ | --------------------------------- |
| `# `, `## `, `### ` … | Heading levels 1–6                               |                                   |
| `- ` or `* `          | Bullet list                                      |                                   |
| `1. `                 | Numbered list                                    |                                   |
| `- [ ] `              | Task list (clickable checkbox)                   |                                   |
| `> `                  | Blockquote                                       |                                   |
| `> [!NOTE]`           | Callout (see [Callouts](./callouts.md))          |                                   |
| ` ``` `               | Code block (see [Code blocks](./code-blocks.md)) |                                   |
| `---`                 | Horizontal rule                                  |                                   |
| \`                    | \`                                               | Table (see [Tables](./tables.md)) |

Pressing **Enter** at the end of a list item creates the next item. Pressing **Enter** on an empty list item exits the list. Pressing **Tab** / **Shift + Tab** indents and outdents list items.

## Slash menu

Typing `/` at the start of a line (or after whitespace) opens the slash menu, where you can insert blocks that aren't easy to express with raw markdown — callouts, code blocks with language, footnotes, embeds, diagrams. See [Slash commands](./slash-commands.md).

## Links

* **Web link** — paste a URL while text is selected; the selection becomes the link label. Or type `[label](url)` directly.

* **Wikilink** — type `[[`, autocomplete from existing notes, hit Enter. Wikilinks don't need URLs; they resolve by note title. See [Wikilinks](../04-linking-notes/wikilinks.md).

* **Transclusion** — `![[Note]]` inlines another note's content. See [Transclusion](../04-linking-notes/transclusion.md).

## Images

Paste an image (from clipboard, drag-and-drop, or the editor's image insert action). The app saves it to `.assets/<uuid>.png` and inserts an image link in the note. See [Images and attachments](./images-and-attachments.md).

## Selection toolbar

Highlight a span of text and a small toolbar appears with the most common formatting actions and an "Ask AI" button. The AI button opens the [chat drawer](../08-ai/chat-drawer.md) pre-filled with your selection.

## Undo and redo

Standard editor shortcuts: `Cmd/Ctrl + Z` to undo, `Cmd/Ctrl + Shift + Z` to redo. Undo history is per-note and per-session; for going back further than that, use [History snapshots](../10-history/index.md).
