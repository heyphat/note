---
id: 619cd258-748e-43f6-9a4a-73a2ca503602
title: Cross-tab sync
createdAt: 2026-05-09T14:45:34.338Z
updatedAt: 2026-05-09T14:45:34.338Z
---
# Cross-tab sync

You can have the same vault open in more than one browser tab. The app keeps those tabs in agreement.

## What stays in sync

When two tabs are pointed at the same vault:

- **Edits to a note** in one tab show up in the other once you switch to it. The app reads the file again, so the on-disk content wins.
- **The list of notes** stays consistent. Create a note in tab A, switch to tab B, the new note is in the sidebar.
- **UI preferences that live in `localStorage`** — theme, font size, sidebar visibility, color palette — propagate across tabs in the same browser, because `localStorage` is shared.
- **The Pomodoro timer** is shared across tabs: starting a session in one tab shows the running chip in the others.

## What doesn't sync (by design)

- **The currently active note** is per-tab. Tab A can have `Reading list` open while tab B has `Project plan` open. Each tab keeps its own URL and editor state.
- **Unsent edits across machines.** Cross-tab sync is per browser. If you have the same vault open on two laptops via a file-sync tool, the file-sync tool resolves the conflict — Note doesn't reach across the network.
- **Open chat drawer state** is per-tab.

## Conflict-style edits

If both tabs edit the same note at roughly the same time, the app uses a small detection layer to flag the conflict instead of silently overwriting. The currently-active edit wins; the other tab will reload its view to pick up what's on disk.

## In a single tab

Auto-save keeps your local edits durable second-by-second. `Cmd/Ctrl + S` flushes any in-flight saves immediately, which is useful right before you close the tab. See [Creating your first note](../01-getting-started/first-note.md).

## References

- [[Creating your first note]]
