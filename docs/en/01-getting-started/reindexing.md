---
id: 96db5b4c-7620-478b-841e-293cbaf6c890
title: Reindexing the vault
createdAt: 2026-05-09T14:49:52.499Z
updatedAt: 2026-05-09T14:49:52.499Z
---
# Reindexing the vault

Note keeps an in-memory search index of your notes (titles, bodies, tags) and a separate task index for `.assets/tasks/`. Both are built when the vault loads and updated as you edit. Most of the time you never think about them.

## When you'd reindex

Reach for the **Reindex vault** button in the sidebar settings popover when:

- You **edited notes outside Note** (in another markdown editor, via a sync tool, by a script). The on-disk content is correct, but the in-memory index is stale.
- You **renamed or moved a lot of files at once** in your file manager. Bulk operations bypass the watch path.
- **Search results don't reflect what you know is in the vault.** Newly-created notes are missing, deleted notes still show up, tags look wrong.
- **Tasks aren't showing up** in the task views even though the file exists in `.assets/tasks/`.

## What it does

Reindexing walks the vault from scratch, re-reads every `.md` file, parses frontmatter and tags, and rebuilds:

- The MiniSearch full-text index (used by the command palette and the AI's `search_vault` tool).
- The task index (used by the task views and the AI's `search_tasks` tool).
- The wikilink graph (used by backlinks and the graph view).

It does **not** modify any files on disk. It's a read-only operation on disk; it just rebuilds what's in memory.

## How long it takes

A vault of a few hundred notes reindexes in a fraction of a second. A vault of tens of thousands of notes can take several seconds. The app shows a progress indicator while it runs and stays usable — you can keep typing.

## Where to find the button

Open the **sidebar settings** popover (gear icon in the sidebar header). The **Reindex vault** action is there, alongside other vault-scoped controls (like clearing all chats).
