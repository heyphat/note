---
id: 6b713019-c73c-4399-9005-2996f985965f
title: Browsing history
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Browsing history

The **history panel** lists snapshots of the active note. Each entry is a point-in-time copy of the body.

## Where to find it

The history panel is one of the three panels in the [right dock](../13-navigation/right-dock.md). Toggle the dock with `Cmd/Ctrl + Shift + B`. If the dock is open but the history panel is hidden, toggle it from the [header toolbar](../13-navigation/header-toolbar.md).

## What you see

Each snapshot in the panel shows:

- A timestamp (when the snapshot was taken).
- A short preview / first-line summary of the snapshot's content.

The list is ordered newest-to-oldest. The current state of the note (what's in the editor right now) is implicit — it's the diff baseline you compare snapshots against.

## Selecting a snapshot

Click an entry to **preview** it. The preview is read-only — you're looking at the body the way it was, with no risk of accidentally editing it. Click between snapshots to see the note evolve over time.

Once a snapshot is selected, the panel exposes:

- **Restore** — replace the current note body with this snapshot. The current body becomes a new snapshot, so this is reversible.
- **Diff** — open the [diff viewer](./diff-viewer.md) between this snapshot and the current body, or between two snapshots.

## When snapshots are taken

Snapshots are written:

- On significant edits (after a debounce, so a flurry of keystrokes produces one snapshot, not a hundred).
- Periodically, while you're editing a note.

You don't manually trigger snapshots. The cadence is invisible by design — the panel should *have* the version you wanted when you go looking for it.

## Where snapshots live

Snapshots are kept per-browser, in IndexedDB, scoped to the current vault. Implications:

- They're per-machine. The history doesn't follow the vault to another laptop.
- Clearing browser storage clears them.
- The on-disk file is *unchanged* by snapshotting — snapshots are a record on top of the file system, not modifications to it.

If you need history that survives a browser-storage clear or that follows the vault across machines, put the vault in git and let git track changes alongside whatever Note's history offers. The two coexist.

## Pruning

The number of snapshots per note is bounded — old snapshots get pruned to keep IndexedDB usage reasonable. Recent history is dense; older history is sparser. If you need a snapshot from a year ago, snapshots may not be the right tool — git is.

## References

- [[Right dock]]
- [[Header toolbar]]
- [[Diff viewer]]
