---
id: 5000a043-1992-468e-8841-deffed0bb591
title: File explorer
createdAt: 2026-05-09T14:55:27.034Z
updatedAt: 2026-05-09T14:55:27.034Z
---
# File explorer

A folder-focused view of the vault. Open with `Cmd/Ctrl + Shift + E`.

## What it is

Where the [sidebar](./sidebar.md) note tree is optimized for *picking a note*, the file explorer is optimized for *folder operations*: creating folders, renaming, moving, bulk reorganizing.

Picture an old-school file browser, but scoped to your vault and aware of the conventions Note expects (`.md` files, `.assets/`, etc.).

## What you can do

- **Create a folder** anywhere in the tree.
- **Rename** notes and folders inline.
- **Move** notes by drag-and-drop, or via a right-click → "Move to…" picker that takes a destination path.
- **Delete** with confirmation. Deleting a folder removes its contents; deleting a note removes that file.
- **Preview** a note's first few lines without opening it (helpful when you're hunting for the right one to operate on).

## What it doesn't do

- It doesn't show `.assets/` or other hidden folders. Those are handled by their dedicated surfaces ([Chat drawer](../08-ai/chat-drawer.md), [Task views](../07-tasks/views.md)) — exposing them in a generic file browser would just invite confusion.
- It doesn't open files outside the vault. Permissions are scoped to the folder you picked.

## Wikilinks and renames

Renaming a note via the file explorer keeps wikilinks pointing at it. The link graph is rebuilt on rename so backlinks stay accurate. If you do a bulk rename on disk (outside the app) and links don't update, run [Reindex vault](../01-getting-started/reindexing.md).

## Keyboard inside the explorer

- **↑ / ↓** — move through entries.
- **Enter** — open a note, expand a folder.
- **Esc** — close the explorer.
- **F2** (or click a selected name) — rename inline.
- **Delete** — delete with confirmation.

## When to use the explorer vs. the sidebar

- **Sidebar** — when you're picking a note to read or edit. Most of the time.
- **Explorer** — when you're reorganizing. Folder ops, bulk moves, cleanup.

## References

- [[Sidebar]]
- [[Chat drawer]]
- [[Task views]]
- [[Reindexing the vault]]
