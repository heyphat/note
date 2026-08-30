---
id: f7d3b293-af6f-4378-ba8d-20104346e858
title: Search
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Search

Search in Note is **client-side and full-text**. There's no server doing the work — the app indexes your vault on load and queries that index on every keystroke. The same index powers the command palette, tag filtering, saved searches, and the AI's `search_vault` tool.

- [Command palette](./command-palette.md) — the main search surface, opened with `Cmd/Ctrl + K`.
- [Query syntax](./query-syntax.md) — phrases, filters (`updated:>7d`), sort modes.
- [Tags](./tags.md) — how `#tag` works in the body and frontmatter, the tag cloud.
- [Saved searches](./saved-searches.md) — pin a query for repeated use.

Behind the scenes the index is built with [MiniSearch](https://github.com/lucaong/minisearch) running in a worker, so typing stays fast even on a vault of thousands of notes. If results ever feel stale, see [Reindexing](../01-getting-started/reindexing.md).
