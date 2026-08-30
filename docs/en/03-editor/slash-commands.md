---
id: 796f54e8-bfd3-4a6e-afff-edc6d4c75de3
title: Slash commands
createdAt: 2026-05-09T15:09:33.805Z
updatedAt: 2026-05-09T15:09:33.805Z
---
# Slash commands

Type `/` at the start of a line (or after whitespace on an empty line) to open the slash menu. It's a quick way to insert blocks that are awkward to type as raw markdown.

## What's in the menu

| Command | Inserts |
| --- | --- |
| `/callout` | A callout block. Pick a type: NOTE, TIP, IMPORTANT, WARNING, CAUTION, INFO, SUCCESS, DANGER. See [Callouts](./callouts.md). |
| `/checklist` | A task list (`- [ ] …`). Click a box to toggle done. |
| `/code` | A fenced code block with a language picker. See [Code blocks](./code-blocks.md). |
| `/table` | An empty table you can fill in. See [Tables](./tables.md). |
| `/footnote` | A footnote reference + definition. See [Footnotes](./footnotes.md). |
| `/bookmark` | A link preview card. Paste a URL; the editor fetches title / description / favicon. See [Embeds](./embeds.md). |
| `/youtube` | A YouTube embed. Paste a video URL or ID. See [Embeds](./embeds.md). |
| `/price-chart` | An OHLC / price-chart block backed by Chart.js. See [Embeds](./embeds.md). |
| `/mermaid` | A Mermaid diagram block. See [Mermaid](../05-diagrams/mermaid.md). |
| `/excalidraw` | An Excalidraw drawing block. See [Excalidraw](../05-diagrams/excalidraw.md). |
| `/canvas` | An interactive spatial canvas (JSON Canvas spec) with draggable nodes, edges, and groups. See [Canvas](../05-diagrams/canvas.md). |

The menu also includes the standard Crepe blocks for heading levels, lists, blockquote, horizontal rule, and image. Anything not in this table is part of the underlying Milkdown / Crepe preset and behaves as that documents.

## How filtering works

After typing `/`, keep typing to narrow the menu. `/cal` matches `/callout`. The first matching item is selected; press **Enter** to insert. **↑ / ↓** move through the list, **Esc** dismisses the menu.

## Where blocks live in markdown

Each slash-inserted block is plain markdown under the hood. Examples:

- `/callout` writes a `> [!NOTE]` blockquote.
- `/mermaid` writes a `​```mermaid` fenced code block.
- `/footnote` inserts an inline `[^1]` reference and a `[^1]: …` definition at the bottom.
- `/bookmark`, `/youtube`, and `/price-chart` write fenced blocks with a small JSON-or-URL payload that the editor renders as a card / embed at view time.

You can hand-edit the result in the file. The editor will keep recognizing it.

## Why use the slash menu over typing the syntax directly

Some blocks (callouts, footnotes, bookmark cards) are easier to insert through a dialog than by getting the exact syntax right. The menu also surfaces blocks you might not remember exist — especially the embeds. If you're a power user who prefers raw markdown, none of this is required.

## References

- [[Callouts]]
- [[Code blocks]]
- [[Tables]]
- [[Footnotes]]
- [[Embeds]]
- [[Mermaid]]
- [[Excalidraw]]
- [[Canvas]]
