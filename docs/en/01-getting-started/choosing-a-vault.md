---
id: 71ae1ba8-abac-4fe0-9292-e278131412eb
title: Choosing a vault
createdAt: 2026-05-10T01:59:03.435Z
updatedAt: 2026-05-10T01:59:03.435Z
---
# Choosing a vault

A **vault** is just a folder on your machine that holds your notes. Note doesn't care what's already in there or what else you put in there; it reads and writes its own `.md` files alongside whatever else lives in the folder.

## Pick a folder

The first time the app loads — or any time you don't yet have an active vault — you'll see a folder picker screen. Click **Choose folder…**, and your browser opens its native folder picker.

A few things to know:

- **Pick a place you'll keep around.** The vault is a regular folder. Putting it in `Documents/Note` or anywhere inside Dropbox / iCloud / Syncthing is normal; putting it in `Downloads/` is asking for trouble.
- **Empty folders are fine.** A brand-new empty folder is the simplest starting point.
- **Existing markdown is also fine.** If you already have a folder of `.md` files (e.g. an Obsidian vault), Note will read them. It writes back in the same format — plain markdown with YAML frontmatter — so existing tools keep working.

## What the browser asks you

Most Chromium browsers will prompt you twice the first time:

1. **Folder picker dialog** — choose the directory.
2. **Permission prompt** — "allow this site to read and edit files in this folder?" Pick *Allow on every visit* (or the equivalent), otherwise you'll re-grant on every reload.

## Across reloads

Once you've granted permission, the app remembers the folder for next time. The directory handle is stored in IndexedDB so you don't have to re-pick on every visit. If the browser later expires permission (some browsers do this aggressively), the app will ask you to re-confirm.

## Switching vaults

You can have more than one vault on disk and point the app at whichever one you want. Open the folder picker again from the empty state or via the sidebar's settings popover — the app drops the previous handle and adopts the new one. Notes are kept *in their folders*, so switching back is just a matter of repointing.

## What the app writes

Once you have a vault, the app may create:

- `.assets/` for images you paste into notes
- `.assets/chats/` for AI chat threads
- `.assets/tasks/` for task files
- Any folders you create yourself, of course

Nothing else. There's no opaque database, no `.note/` directory, no `.DS_Store`-style metadata file you have to keep in sync. See [Vault layout](../02-core-concepts/vault-layout.md) for the full structure.

## What about privacy

Your folder is your folder. The hosting machine (whoever serves the static site — Vercel, your own server, or `npm run dev` on your laptop) only ever delivers HTML/JS/CSS. Note content never leaves your tab. See [Local-first](../02-core-concepts/local-first.md) and [AI privacy](../08-ai/privacy.md) for the long version.

## References

- [[Vault layout]]
- [[Local-first]]
- [[AI privacy]]
