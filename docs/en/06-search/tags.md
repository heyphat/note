---
id: 1504bbe2-9cc5-45a1-bd08-b1f15a1090d0
title: Tags
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Tags

Tags are a lightweight, decentralized way to mark notes as belonging to a topic. Note recognizes two places tags can live:

1. **Inline in the body** — anywhere you write `#tagname`, the tag is detected.
2. **In the YAML frontmatter** — a list-form `tags: [research, q1]` field is recognized too.

Both are indexed; both show up in the [tag cloud](#the-tag-cloud) and in tag filters.

## Tag syntax

- Inline: `#research`, `#q1-2026`, `#deep_work`. Letters, digits, hyphens, and underscores are allowed in a tag name.
- Frontmatter: `tags: [research, q1]` or the multi-line form:

  ```yaml
  tags:
    - research
    - q1
  ```

A tag is canonicalized lowercase, so `#Research` and `#research` are the same tag.

## Filtering by tag

Three ways:

- **In the command palette**, prefix the query with `#` to enter tag mode: `#research`. Add more tags to AND-combine: `#research #q1`.
- **In a search query**, mix tags with text: `risks #q1`.
- **Click a tag** in the tag cloud or in a note where it's rendered.

## The tag cloud

The sidebar can show a **tag cloud** — every tag in the vault, with relative size based on frequency. Click a tag to filter the note list by it. Toggle the tag cloud's visibility from the [sidebar settings](../13-navigation/sidebar.md).

## How AI sees tags

The `search_vault` and `search_tasks` tools both accept a `tags` filter. When you ask the AI "what's in my research notes?", a typical model call is `search_vault({ query: "research", tags: ["research"] })`.

## What tags aren't

- **Folders.** Tags are flat and many-per-note; folders are hierarchical and one-per-note. Use both for what each is good at.
- **Free-text.** Two slightly different spellings (`#deep_work` vs `#deepwork`) make two distinct tags. The tag cloud helps you spot drift.
- **Auto-discovered.** The app indexes tags it finds; it doesn't suggest new ones.

## Tag conventions worth borrowing

- `#area/research`, `#area/personal` — slashes are allowed and let you create a *visible* hierarchy without the system enforcing one.
- `#status/draft`, `#status/review`, `#status/done` — workflow stages.
- `#year/2026`, `#q/q1` — useful when you skim by date filter doesn't fit.

The app doesn't impose any of this; you can throw tags at notes ad-hoc and clean up later.

## References

- [[Sidebar]]
