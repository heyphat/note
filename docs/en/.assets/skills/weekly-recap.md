---
id: 8a3f7c52-1d9e-4b6a-9c5d-2e8f4b1a7d3e
name: weekly-recap
description: Generate a structured weekly recap from notes modified in the last 7 days
---
# Weekly recap

Produce a one-page recap of the user's week, drawn from notes modified in the last 7 days.

## Procedure

1. Call `search_vault({ query: "*", limit: 50 })` to enumerate recent notes. The search index sorts by recency, so you'll get the latest activity at the top.
2. For each result whose `updatedAt` falls inside the last 7 days, call `read_note({ id })`. Skip task files (`.assets/tasks/...`) and chats (`.assets/chats/...`) — those have their own surfaces.
3. From each note's body, extract:
   - **wins** — anything phrased as completed, shipped, merged, or resolved
   - **blockers** — anything phrased as stuck, waiting on, or unable to
   - **decisions** — anything with the words decided, agreed, picked, settled
   - **next** — anything in a "next steps" / "TODO" / "follow-up" section

## Output

Create a new note in the user's current folder via `create_note`. Use this exact structure:

```markdown
# Week of {YYYY-MM-DD}

## Wins
- {one bullet per win, linking the source via [[note-id]]}

## Blockers
- {bullets, linking sources}

## Decisions
- {bullets, linking sources}

## Next week
- {bullets, linking sources}
```

The week-of date is the Monday before today (or today, if today is Monday).

## Rules

- Cite every bullet with a `[[wikilink]]` to the source note. No bullet without a source.
- If a section has no items, write `- _Nothing this week._` rather than omitting the heading. The fixed structure makes month-over-month comparison easier later.
- Don't editorialize. The recap is a structured digest, not a narrative summary. Direct quotes from the source notes are preferable to paraphrase.
- If you find fewer than three notes total in the window, stop and tell the user — there isn't enough material for a meaningful recap.
