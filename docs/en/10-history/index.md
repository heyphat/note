---
id: e222c3f1-a4ae-4aae-9485-ff897f7c931c
title: History and recovery
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# History and recovery

The app keeps a per-note history of snapshots so you can step back through what a note used to look like, see exactly what changed between two versions, and recover unsaved work after an unexpected reload.

It's deliberately simpler than git. There's no commit message, no branch, no remote. Just: every so often, the app snapshots the current body, and you can browse those snapshots later.

## In this section

- [Browsing history](./browsing-history.md) — the history panel, picking a snapshot, restoring.
- [Diff viewer](./diff-viewer.md) — what changed between two versions.
- [Recovery](./recovery.md) — getting unsaved content back after a tab crash.

## When you'd reach for history

- "I had a section here yesterday and now it's gone." — find the snapshot before you deleted it.
- "What did this paragraph say last week?" — use the diff viewer.
- "The browser closed before my edits saved." — open the recovery dialog on next load.

## What it isn't

- **A version control system.** No commits, no branching, no merging. If you want that, put your vault in git — it's just files.
- **Per-character undo.** That's `Cmd/Ctrl + Z` while you're editing. History is per-snapshot.
- **A backup.** Snapshots live in the same browser; clearing storage clears them. For real backups, sync the vault folder.
