---
id: 2f3ccf65-46ce-4834-b21b-d3abf4e7e463
title: Query syntax
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Query syntax

The default search mode in the [command palette](./command-palette.md) understands a small query syntax beyond plain words.

## Plain words

Multiple words are AND-combined. `q1 plan revenue` matches notes that contain `q1` *and* `plan` *and* `revenue` somewhere — title or body.

Words are matched with prefix tolerance (so `plann` matches `planned`, `planning`). Casing doesn't matter.

## Quoted phrases

Wrap text in double quotes for an exact phrase match:

```
"q1 plan"
```

That matches the literal string `q1 plan`, not the two words separately.

## Date filters

Filter by the note's `updatedAt` timestamp:

| Filter | Meaning |
| --- | --- |
| `updated:>today` | Notes updated today |
| `updated:>7d` | Notes updated in the last 7 days |
| `updated:>30d` | Notes updated in the last 30 days |
| (no filter) | All notes |

The same filters are exposed as one-click chips below the query field, so you don't have to type them. The chips and the typed-in form are equivalent.

## Sort

By default, results are ranked by **relevance** to your query. To change the ranking:

| Filter | Sort |
| --- | --- |
| `sort:relevance` | Best-match first (default) |
| `sort:updated` | Most recently updated first |
| `sort:created` | Most recently created first |
| `sort:title` | Alphabetical |

## Tag filtering inside a search

Combine free-text and tag filters by typing both:

```
risks #q1 #research
```

This matches notes that contain `risks` and are tagged `q1` and `research`.

You can also enter tag mode by starting the query with `#` (see [Command palette](./command-palette.md)).

## What the AI sees

When the AI's `search_vault` tool runs, it parses the same syntax. The model can issue queries with quoted phrases, tag filters, and date filters; the chat hook normalizes them and runs them against the same MiniSearch index.

## Limits

- The default cap on returned hits is **10**. The AI can request up to **25**.
- Snippet excerpts in results are short (a sentence or two of context). For full bodies, click through, or — for the AI — call `read_note` (see [Read tools](../08-ai/tools-read.md)).

## References

- [[Command palette]]
- [[Read tools]]
