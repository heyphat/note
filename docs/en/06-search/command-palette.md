---
id: d44e392f-f4d6-45bb-af75-04fce433398c
title: Command palette
createdAt: 2026-05-10T01:59:40.482Z
updatedAt: 2026-05-10T01:59:40.482Z
---
# Command palette

`Cmd/Ctrl + K` opens the **command palette**. It's the single keystroke that gets you anywhere: any note, any tag, any action, any setting.

## The four modes

The palette infers what you want from the first character of your query:

| Prefix | Mode | Example |
| --- | --- | --- |
| (none) | **Search notes** by title and body | `q1 plan` |
| `>` | **Run an action** (commands, settings, theme switches) | `> new note` |
| `#` | **Filter by tag** | `#research` |
| `@` | **Quick-open a note** by title only | `@reading list` |

The default (no prefix) is the most common: full-text search. Hit Enter on a result to navigate.

## Filters and sorting

While in **search mode** (no prefix), small chips below the query field let you narrow and re-rank:

- **Updated:** today, last 7 days, last 30 days, all-time.
- **Sort:** relevance, updated, created, title.

You can also type filters into the query directly. See [Query syntax](./query-syntax.md).

## Action mode (`>`)

Action mode exposes commands you'd otherwise hunt through menus for. Examples (the exact list lives in the registry; this is representative):

- `> new note`
- `> open settings`
- `> toggle zen mode`
- `> cycle theme`
- `> reindex vault`
- `> save this search` — captures the current query as a [saved search](./saved-searches.md).
- `> palette: <name>` — switch [color palette](../14-customization/color-palettes.md) without opening settings.

Type a few characters; the matching action is selected; press Enter.

## Tag mode (`#`)

Typing `#research` shows every note tagged `research`. Hit Enter to drop the filter into the main view (so the sidebar / tag cloud reflect it). Typing more tags refines further: `#research #q1` matches notes tagged with both.

## Quick-open mode (`@`)

`@` is for the case where you know the note's title and want to open it immediately, without weighing body matches. It's faster than the default search when you're navigating between known files.

## Keyboard inside the palette

- **↑ / ↓** — move through the result list.
- **Enter** — open / run the highlighted result.
- **Esc** — close the palette.
- **Tab** — cycle through filter chips (in search mode).

## What it doesn't do

- Search inside `.assets/` (chats, tasks, attachments) — those are explicitly excluded so the palette doesn't drown in noise. Use the [task views](../07-tasks/views.md) or open a chat thread directly if you need them.
- Search outside your vault. The palette only knows about the folder you picked.

## References

- [[Query syntax]]
- [[Saved searches]]
- [[Color palettes]]
- [[Task views]]
