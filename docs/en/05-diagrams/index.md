---
id: 1bf5d4e6-9c70-4932-aa3d-d81cb04aac56
title: Diagrams
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Diagrams

Note can render three kinds of visual content inline:

- [Mermaid](./mermaid.md) — text-based diagrams (flowcharts, sequence diagrams, ER diagrams, gantt, pie, etc.). The source is plain text inside a fenced code block.
- [Excalidraw](./excalidraw.md) — hand-drawn-feel diagrams. The source is the Excalidraw scene format, also inside a fenced code block.
- [Canvas](./canvas.md) — an infinite spatial board with draggable nodes (text cards, note embeds, link bookmarks, groups) connected by edges. The source is JSON in the JSON Canvas spec — the same format Obsidian uses.

All three follow the same principle: **the picture you see is regenerated from source at view time**. The source lives in the markdown file (or in `.assets/` for Excalidraw scenes), so the diagram or canvas is a real, editable artifact — not an opaque image.

## Why source-as-truth

- **Diffs are meaningful.** Change a Mermaid sequence diagram, and a `git diff` shows exactly what changed.
- **Round-trip safe.** Tools that don't render diagrams just see the source code in a code block.
- **No "where did the .png go?"** problem. The image isn't a separate file; it's regenerated.

The trade-off is that you can't fine-tune position-by-pixel layouts the way you can in a vector editor. For most note-taking diagrams, that's the right trade.
