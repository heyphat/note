---
id: 5fe8bc1f-8cd1-4653-926c-b92fee2b2c11
title: Excalidraw
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Excalidraw

Excalidraw is a free-form drawing tool with a hand-drawn aesthetic. Note embeds it inside a fenced code block tagged `excalidraw`, so a drawing is a real artifact in your vault that you can edit later.

## How to insert one

- Type `/excalidraw` and the editor inserts a drawing block. The Excalidraw canvas opens for editing.
- Or write the fence directly with an existing scene file reference.

The fenced block's contents reference a scene file under `.assets/` (binary scene format). Editing the drawing updates the scene file in place.

## How editing works

- **Click into the block** to enter the canvas. The full Excalidraw toolbar is available — shapes, freehand, arrows, text, colors, layers.
- **Click outside** to commit and return to the surrounding markdown. The drawing renders as a static image while you're not editing.
- All Excalidraw shortcuts apply inside the canvas.

## What's in the file

- The fenced block in the markdown is a small reference / payload.
- The scene itself (the actual shapes, positions, and styles) lives in `.assets/<uuid>.excalidraw`. That's a JSON-shaped binary that Excalidraw understands.

You can open the same scene file in standalone Excalidraw (the website or desktop app) if you ever want to. The file format is shared.

## When Excalidraw fits

- **System sketches** that don't need exact coordinates: architectures, flows, "here's how the pieces fit."
- **Hand-illustrated explanations** of an idea where a Mermaid auto-layout would feel too rigid.
- **Annotations on top of a screenshot** — paste a screenshot into the canvas, draw on it.

## When it doesn't

- **Source-controlled diagrams** where you want a meaningful diff. Mermaid (text-based) is better for that. Excalidraw scenes are binary; diffs are unreadable.
- **Programmatic diagrams** where the structure is data. A code block + external renderer beats freehand.

## Lazy loading

Excalidraw is heavy. The library doesn't ship in the initial app bundle — it loads when you first view or edit an Excalidraw block. Pages without any drawings stay light.
