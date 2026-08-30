---
id: e78681a5-2e51-48b8-9c98-431c77d57a6a
title: Saved searches
createdAt: 2026-05-10T02:03:50.351Z
updatedAt: 2026-05-10T02:03:50.351Z
---
# Saved searches

A **saved search** is a query you've pinned for repeated use. Build a query in the command palette that finds what you want, save it, and it shows up in the sidebar. Click to re-run.

## Saving a search

1. Open the [command palette](./command-palette.md) with `Cmd/Ctrl + K`.
2. Build the query — text, tags, filters, sort. Whatever combination matches what you need.
3. Run the action `> save this search` (or use the save icon next to the query field).
4. Give the search a name. The name is what shows up in the sidebar.

## Where saved searches live

The **Saved searches** section is one of the togglable sections in the sidebar. Each entry shows the search's name and re-runs the saved query when clicked.

If the section isn't visible, open the [sidebar settings](../13-navigation/sidebar.md) and turn it on.

## Editing or deleting

Right-click (or use the context menu icon) on a saved search to rename it, edit the underlying query, or remove it.

## What's stored

A saved search is just a serialized query — text plus filter / sort settings. It's stored in `localStorage`, not in the vault, because it's per-machine. If you want a saved search to follow the vault across machines, the workaround today is to record it in a note (e.g. a "Useful searches" note that lists the queries verbatim).

## Examples worth saving

- `#status/review sort:updated` — your active review queue.
- `updated:>7d sort:updated` — what you've touched this week.
- `"team-a" -#area/personal` — work-only mentions of a team. (Negation isn't documented as part of the public syntax; this is a hint at advanced usage. Use what works.)
- `#daily updated:>30d sort:created` — the past month's daily notes, oldest first.

## Why this is useful

Building a query is fast; remembering it isn't. Saved searches turn a query you've gotten right *once* into a one-click navigation target — a much lower-friction way of using your vault than relearning your filter syntax every time.

## References

- [[Command palette]]
- [[Sidebar]]
