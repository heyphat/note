---
id: f9125fd0-7e04-4e06-867d-25fc49bbd216
title: Embeds
createdAt: 2026-05-09T14:41:19.461Z
updatedAt: 2026-05-09T14:41:19.461Z
---
# Embeds

Note has three embed block types beyond images and diagrams: bookmarks, YouTube videos, and price/OHLC charts. Each is inserted from the slash menu and stored as a fenced code block in the markdown.

## Bookmark

A **bookmark** is a richer link preview — title, description, favicon — for an external URL.

- Insert with `/bookmark` and paste a URL.
- The block renders as a card in the editor. The underlying markdown is a fenced block with a small payload.
- Use bookmarks when you want the link to be visually prominent (e.g. a list of references at the bottom of an article). For inline references, plain `[label](url)` is usually better.

## YouTube embed

- Insert with `/youtube` and paste a video URL or ID.
- Renders as a responsive iframe in the editor and at view time.
- The fenced block stores just the video ID; the iframe is not loaded until the embed becomes visible (lazy-load).

## Price / OHLC chart

A built-in chart block useful for trading or financial notes.

- Insert with `/price-chart`.
- Backed by Chart.js. Edit the underlying JSON payload (in the fenced block) to change the data, axes, and styling.
- Renders inline at view time.

## Why these are fenced blocks

Each embed lives as a fenced code block (`​```bookmark`, `​```youtube`, `​```price-chart`) with a small JSON payload as its body. That has two upsides:

- **Plain markdown round-trips.** Open the file in another tool and you'll see the source — nothing's hidden.
- **Lazy-loaded.** The expensive part (fetching link metadata, mounting an iframe, drawing a chart) only runs when the block scrolls into view.

## When *not* to use an embed

- For a one-line hyperlink, a plain `[label](url)` is less visual noise than a bookmark card.
- For embedded video that has to be playable offline, an embed isn't going to help — you need the file in the vault.
- For richer charts than `price-chart` covers, write your own fenced block with raw data and a tool that consumes it (Pandoc + a filter, a static-site generator, etc.). Note's renderer won't draw it, but the source survives.
