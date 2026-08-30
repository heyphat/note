---
id: 99304832-ba72-4064-9ac8-43f26248cd56
title: Graph view
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Graph view

The graph view draws your vault as a network: each note is a node, each wikilink is an edge. Open it with `Cmd/Ctrl + Shift + G`.

## What you see

- **Nodes** — one per note. The active note (if any) is highlighted.
- **Edges** — one per wikilink. Transclusions count too. Direction isn't drawn (in v1) — an edge means "these two notes link in at least one direction."
- **Force-directed layout** — clusters of densely-linked notes pull together; isolated notes drift to the edges.

## Interactions

- **Pan** with click-and-drag on empty space.
- **Zoom** with the scroll wheel or pinch gesture.
- **Drag nodes** to reposition them. The layout settles around your moves.
- **Click a node** to navigate the editor to that note (the graph view itself stays open).
- **Hover a node** to highlight its direct neighbors.

## Filtering

The graph supports a tag filter: pick a tag and the view dims everything not tagged that way. Useful for seeing the structure of one project at a time without losing the overall layout.

## When the graph is useful

- **Finding orphans** — notes with no inbound or outbound links float at the edges. Often they're notes you forgot about, or notes that should be merged into something else.
- **Spotting clusters** — densely-connected groups visible at a glance often correspond to a project, theme, or area you've been thinking about a lot.
- **Visual sanity check** — after a big editing session, a quick look confirms the structure you intended is the structure you got.

## When it isn't

- **For day-to-day navigation.** The [sidebar](../13-navigation/sidebar.md), [command palette](../06-search/command-palette.md), and [backlinks panel](./backlinks.md) are usually faster.
- **For very large vaults.** The force-directed layout starts to get heavy past several thousand notes. The view stays usable, but interactions can lag.

## What it draws from

The graph is built from the same wikilink graph that drives backlinks. If you've recently changed the vault outside the app, run [Reindex vault](../01-getting-started/reindexing.md) before relying on the graph view.

## References

- [[Wikilinks]]
- [[Backlinks]]
- [[Sidebar]]
- [[Command palette]]
- [[Reindexing the vault]]
