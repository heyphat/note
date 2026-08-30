---
id: 7a4f1c2e-c8b3-4d5a-9b8c-1e2f3c4d5e6f
title: Canvas
createdAt: 2026-05-12T00:00:00.000Z
updatedAt: 2026-05-12T09:52:24.151Z
---
# Canvas

A **canvas** is an infinite, pannable, zoomable surface where you arrange nodes — text cards, embedded notes, URL bookmarks, and labeled groups — and connect them with edges. Like Mermaid and Excalidraw, the source-of-truth lives inside the markdown file: a canvas is a fenced code block whose body is JSON in the [JSON Canvas spec](https://jsoncanvas.org/), the same format Obsidian uses for `.canvas` files.

You can drag-and-drop nodes, draw connections, edit text inline, and the JSON updates as you go. Round-tripping the same file through Obsidian works without conversion.

## How to insert one

* Type `/canvas` and the editor inserts an empty canvas block.

* The block renders a small JSON header (collapsed to two rows) followed by the interactive surface beneath.

```canvas
{
  "nodes": [
    {
      "id": "n-mp2gb5a6h9xt",
      "type": "group",
      "x": -69.71510280163719,
      "y": -111.7912714064539,
      "width": 866,
      "height": 884,
      "color": "4",
      "label": "Group"
    },
    {
      "id": "n-mp2gac14lbwx",
      "type": "text",
      "x": 23,
      "y": -7.5,
      "width": 250,
      "height": 80,
      "color": "1",
      "text": "This is a text block\n"
    },
    {
      "id": "n-mp2gar3d2jl9",
      "type": "file",
      "x": 21.23553461917237,
      "y": 108.3695647473009,
      "width": 673,
      "height": 446,
      "file": "AI privacy"
    }
  ],
  "edges": []
}
```

## The toolbar

| Action              | What it does                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `+ Text`            | Adds a markdown text card. Double-click to edit, blur to save.                                  |
| `+ Note`            | Adds a card that embeds another note (or an image — see below). Double-click to set the target. |
| `+ Link`            | Adds a URL bookmark card. Double-click to paste a URL.                                          |
| `+ Group`           | Adds a labeled rectangle that visually groups other nodes. Double-click the label to rename.    |
| `Delete`            | Removes whatever's selected (nodes + their connected edges, or just edges).                     |
| Color presets (1–6) | Set the JSON Canvas preset color on the selected node(s).                                       |
| Color wheel         | Open the OS color picker and set a custom `#rrggbb` on the selected node(s).                    |
| `×`                 | Clear the color.                                                                                |
| Expand icon         | Open the canvas in a fullscreen lightbox.                                                       |

The color row and the expand icon only appear when there's something selected to color, or when you're not already in lightbox mode.

## Node types

### Text

A markdown card. Double-click to edit; blur (or press Esc) to leave editing mode. The content is plain markdown — headings, links, code blocks, even fenced `mermaid` or `excalidraw` will render. Embedded image references resolve the same way they do in the editor body (through the asset path).

### Note (file)

A reference to another note. Double-click the title bar to open a picker — start typing and it suggests existing notes from your vault (the same matcher that powers the `[[…]]` autocomplete). Click a suggestion or press Enter to confirm.

Once set, the card:

* Renders the target note's body as a markdown preview (frontmatter stripped, truncated to \~1200 chars).

* Shows an **↗ open-in-new-tab** icon at the right end of the header. Click it (or middle-click / ⌘-click) to open the linked note in a new browser tab.

* A single-click on the title text navigates to the note in the same tab.

* For broken / non-existent targets, the title turns red and the open-icon hides — double-click to retarget.

**Image-aware:** if the target's extension is an image (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.avif`, `.bmp`, `.ico`), the card renders the image directly instead of a markdown preview. Useful for moodboards, screenshots, or pinning a saved diagram. Both vault-relative paths (`.assets/images/foo.png`, `./{noteKey}.assets/bar.jpg`) and absolute `https://…` URLs work.

### Link

A URL bookmark card — favicon-style letter, hostname, and full URL. Double-click to edit the URL; click to open the link in a new tab (with the same 250ms-delay-then-open pattern, so double-click reliably wins for editing).

### Group

A labeled, dashed-border rectangle that sits behind other nodes. Drop text / note / link nodes inside it to visually associate them. Double-click the label to rename. Groups don't have connection handles — they're decorative containers, not edge endpoints.

## Drawing edges

Hover over a node and small dots appear at its edges (top / right / bottom / left). Drag from one dot to another node to create a connection. The edge follows JSON Canvas semantics:

* `fromSide` and `toSide` are recorded so the curve always leaves and enters the right side of each node.

* Arrowheads inherit the theme color so they stay visible in both light and dark modes.

* Drag an edge to select it; press Delete to remove.

## Color

Every node has an optional `color` field per the JSON Canvas spec:

* **Presets** "1" through "6" — theme-aware (slightly different hex in light vs. dark mode for contrast).

* **Custom hex** `#rgb`, `#rrggbb`, `#rrggbbaa` — set via the color wheel.

The picker writes one of these into the JSON. Open the same canvas in Obsidian and the colors render the same way.

## Lightbox mode

The inline canvas is limited in height to keep the rest of the note readable. Click the expand icon (top-right of the toolbar) to open the canvas in a fullscreen overlay. Edits made in the lightbox flow back to the same JSON; closing the lightbox (Esc / click outside / × button) re-mounts the inline canvas with the latest state.

While the lightbox is open, the inline canvas is unmounted so the two instances never compete to write the same source.

## What gets stored

The fenced block looks like:

````markdown
```canvas
{
  "nodes": [
    {"id": "n-abc", "type": "text", "x": 0, "y": 0, "width": 250, "height": 80, "text": "Hello"},
    {"id": "n-def", "type": "file", "x": 300, "y": 0, "width": 320, "height": 220, "file": "Daily standup"}
  ],
  "edges": [
    {"id": "e-001", "fromNode": "n-abc", "fromSide": "right", "toNode": "n-def", "toSide": "left"}
  ]
}
```
````

The JSON is pretty-printed with stable key order so diffs stay clean. Unknown fields seen at parse time (anything outside the JSON Canvas spec — Obsidian extensions, future spec additions, app-specific metadata) round-trip verbatim through every edit, so a file authored elsewhere keeps its full data even after you move a node here.

## Interop with Obsidian

The on-disk format is identical to Obsidian's `.canvas` files. Two practical implications:

* You can copy the body of a `​```canvas` block in Note, paste it into a fresh `.canvas` file in an Obsidian vault, and it'll render the same canvas.

* A canvas authored in Obsidian (including any extension fields it adds) can be pasted into a Note canvas block and edited without losing data.

The differences are purely UX (where the canvas lives in the document, how the toolbar looks). The data is the same.

## When canvas fits

* **Visual layout of related notes** — a project plan with cards for each phase, an architecture sketch with notes for each component, a research board.

* **Mind maps / concept maps** — text cards plus arrows is the classic shape.

* **Moodboards / reference walls** — image cards arranged spatially.

## When it doesn't

* **Step-by-step flow you want diffable** — Mermaid is better. A `flowchart LR` text source diffs meaningfully; a canvas diff shows position deltas that aren't always informative.

* **Hand-illustrated explanations** — [Excalidraw](./excalidraw.md) gives you freehand drawing tools. Canvas is structural; Excalidraw is artistic.

* **Quantitative diagrams** — for charts, see [Embeds](../03-editor/embeds.md) (`/price-chart`).

## Lazy loading

The React Flow library that powers the canvas surface (\~150kb minified) doesn't ship in the initial bundle. It's loaded on demand the first time a canvas block enters the DOM, so notes without any canvases stay light.

## References

* [[Mermaid]]

* [[Excalidraw]]

* [[Embeds]]

* [JSON Canvas spec (jsoncanvas.org)](https://jsoncanvas.org/)

