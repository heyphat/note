---
id: 91c02304-b29e-4380-b3b1-e1fc8b563328
title: Recovery
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Recovery

Auto-save flushes your edits to disk continuously. The window where you can lose work is small — but it isn't zero. If the browser tab dies between saves, the **recovery dialog** offers to restore the in-flight content.

## When the dialog appears

On reload after the app detects unsaved content from a previous session that didn't flush. Triggers include:

- Browser crash.
- OS restart with the tab open.
- Tab killed by the OS for memory pressure.
- A bug or hard reload during a save burst.

If everything saved cleanly before the tab closed, the dialog doesn't appear — there's nothing to recover.

## What you see

The dialog lists the affected note(s) and shows:

- **Disk version** — what's currently saved to the vault file.
- **Recovered version** — what the app captured in flight.

You can preview each side before deciding.

## Your options

- **Use recovered** — overwrite the disk version with the recovered content. The recovered version becomes the current note; the disk-version is preserved as a [history snapshot](./browsing-history.md), so you haven't lost it.
- **Keep disk** — discard the recovered content. The disk-version stays as it was.
- **Decide per-note** — when multiple notes have recovery candidates, you can pick differently for each.

## What's actually recovered

The recovery payload is the in-memory editor state at the time of the last auto-save attempt. So:

- It's almost always *seconds* behind whatever you saw on screen when the tab died — auto-save runs frequently.
- It's full content, not just a diff. The recovered version is "what you would have had if the save had landed."
- It's per-note, not per-vault. Each affected note is recovered independently.

## After the dialog

Whichever choice you made, the app picks up where you left off — sidebar position, open note, scroll position, etc. The recovered (or discarded) content is now in the normal save / history pipeline.

## When the dialog isn't enough

- **Long-gone unsaved work.** Recovery is for *recent* unsaved content, not for "the version of this note from three weeks ago." That's [history](./browsing-history.md).
- **Vault not reachable.** If the vault folder permission was revoked or the disk is unmounted, the app surfaces a different recovery flow asking you to re-pick the folder. Once it's pointed at the right place, the dialog appears as usual.

## Reducing your blast radius

- `Cmd/Ctrl + S` flushes pending saves immediately. Reach for it before closing the tab.
- For long-form drafting, consider running the app on `localhost` (`npm run dev`) — fewer surprises than a managed host caching aggressively.
- For irreplaceable notes, sync the vault folder with a tool that preserves history (Dropbox / iCloud / Syncthing all keep recent revisions).

## References

- [[Browsing history]]
