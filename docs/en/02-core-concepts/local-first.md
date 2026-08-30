---
id: 399164c8-9acb-482e-9fa4-5ae284246cdb
title: Local-first
createdAt: 2026-05-09T14:46:02.756Z
updatedAt: 2026-05-09T14:46:02.756Z
---
# Local-first

Note has no server. There is no signup, no account, no sync service, no telemetry. The page you load is static; everything else happens inside your browser tab.

## What that means in practice

- **Your notes live on your disk**, in a folder you picked. They are plain `.md` files. You can open them in any text editor, sync them through Dropbox / iCloud / Syncthing, or back them up the way you back up the rest of your home directory.
- **The hosting machine never sees note content.** The server's job is to deliver HTML, JS, and CSS to your browser. After that, it's not in the loop.
- **Closing the tab doesn't lose data.** The notes are already files. The tab is just a viewer / editor.
- **Switching browsers, machines, or hosting providers is free.** Move the folder, point the new browser at it, you're done.
- **There's nothing to migrate to or away from.** The format is markdown. The conventions on top of it (`[[wikilinks]]`, `.assets/`, YAML frontmatter) are conventions other tools follow too.

## What stays in browser storage

Some things are kept in your browser, not in the vault, because they're per-machine preferences rather than content:

- **Vault folder handle** (IndexedDB) — so you don't re-pick the folder on every load.
- **UI preferences** (`localStorage`) — sidebar visibility, font size, color palette, theme, etc.
- **AI provider keys** (`localStorage`) — see [Providers and keys](../08-ai/providers-and-keys.md).

Clearing your browser storage clears these. It does **not** clear your notes — those are files on disk, untouched.

## What's not in this model

A few things are deliberately not in the app *because* of the local-first commitment. The full list is in [Roadmap & non-goals](../17-roadmap-and-non-goals.md), but the headline ones:

- No hosted sync service. (Use a file-syncing tool.)
- No account system. (There's nothing to log into.)
- No third-party plugin runtime. (The app is the app.)
- No built-in encryption. (Use OS-level disk encryption if you want it.)

## How AI fits in

When you turn on AI, Note doesn't proxy your prompts through anyone. Your tab talks directly to the provider you picked (Anthropic, OpenAI, or Google), using a key you paste in. The hosting machine sees neither the key nor the prompt. See [How keys flow](../08-ai/privacy.md).

## References

- [[Providers and keys]]
- [[Roadmap and non-goals]]
- [[AI privacy]]
