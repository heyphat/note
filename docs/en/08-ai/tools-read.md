---
id: 628de8ac-3fed-4fec-a8f5-05048b3e36a5
title: Read tools
createdAt: 2026-05-09T14:52:30.005Z
updatedAt: 2026-05-09T14:52:30.005Z
---
# Read tools

Three tools the AI can call without your approval. Each is read-only and bounded so a runaway call can't blow up the conversation context.

## `search_vault`

Full-text search of your vault. Same MiniSearch index the [command palette](../06-search/command-palette.md) uses.

| Parameter | Notes |
| --- | --- |
| `query` (required) | Free-text query. Multiple words AND-combine. Quoted phrases match verbatim. |
| `limit` | Default 10, clamped to [1, 25]. |
| `tags` | Optional list. All listed tags must be present. |

**Returns:** array of hits, each with `path`, `title`, `snippet`, `score`, `updatedAt`. Plus `total` and `truncated` counts.

The model uses this as its eyes on the vault. A common pattern: `search_vault("project plan")` to find candidates, then `read_note` to pull the full body of the one that looked most promising.

## `search_tasks`

Filter the task index. Tasks live in `.assets/tasks/` and are *not* covered by `search_vault` — that's why this tool exists.

| Parameter | Notes |
| --- | --- |
| `text` | Substring filter against title + body. Case-insensitive. |
| `status` | Exact match (e.g. `"open"`). |
| `priority` | One of `highest`, `high`, `normal`, `low`, `lowest`. |
| `tags` | All listed tags must be present. |
| `contexts` | All listed contexts must be present. |
| `projects` | All listed projects must be present. Wikilinks like `[[Q2 Launch]]`. |
| `due_after`, `due_before` | Inclusive `YYYY-MM-DD` bounds. |
| `scheduled_after`, `scheduled_before` | Same, on `scheduled`. |
| `limit` | Default 25, clamped to [1, 100]. |

**Returns:** array of hits, each with `path`, `title`, `status`, `priority`, `due`, `scheduled`, `tags`, `contexts`, `projects`, `bodyExcerpt`, `updatedAt`. Plus `total`, `truncated`, and the parsed `filters` echoed back.

Filters are AND-combined. A task with no `priority` field will *not* match a `priority: "normal"` filter unless explicitly set — except for `priority: "normal"` which the spec treats as matching unset-or-`normal` because that's the conventional default.

## `read_note`

Fetch the full bodies of one or more notes by vault path.

| Parameter | Notes |
| --- | --- |
| `paths` (required) | Array of vault paths (relative, including `.md` extension). Capped at **5 per call**. |

**Returns:** array of hits, each with `path`, `title`, `body`, `updatedAt`, and a `truncated` flag (true when the body exceeded the per-note **8000-character cap**). Plus an `errors` array for any paths that couldn't be read.

The model uses this when `search_vault` returned a snippet that wasn't enough — "show me the full text of `Daily/2026-05-04.md`," or "compare these three notes."

## What's gated

`read_note` will refuse paths under hidden directories (`.assets/`, `.git/`, etc.) and `*.assets/` folders. This stops a prompt-injected note from convincing the model to read your AI chat threads back into a new conversation. See [Privacy](./privacy.md).

## When the model calls each

A useful mental model: the read tools form a search-then-read pipeline. `search_vault` and `search_tasks` are the *find*; `read_note` is the *zoom in*.

A query like *"summarize my notes from last week"* might cause:

1. `search_vault({ query: "", limit: 25 })` with sort by updated — find recent notes.
2. `read_note({ paths: ["Daily/2026-05-01.md", "Daily/2026-05-02.md", ...] })` — pull the full bodies.
3. The model writes a summary using the bodies as context.

## References

- [[Command palette]]
- [[AI privacy]]
