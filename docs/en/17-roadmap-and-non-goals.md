---
id: 5886232a-8486-4bc4-8ba0-49b762fc0529
title: Roadmap and non-goals
createdAt: 2026-05-09T14:56:34.212Z
updatedAt: 2026-05-09T14:56:34.212Z
---
# Roadmap and non-goals

Some features people ask for aren't in the app. A few are on the way; others are deliberately not — they'd compromise the parts of the design that make Note worth using in the first place.

## On the way (probably)

These are realistic, scoped, and actively considered. None are committed:

### Mobile build

A mobile version via [Capacitor](https://capacitorjs.com). The storage layer is already an interface (`NoteStore` in `src/lib/storage/`); the work is mostly:

- A new `NoteStore` adapter for the mobile filesystem.
- Touch-friendly polish on a few editor surfaces.
- Permission handling for the mobile File System APIs.

### Share-a-note

A way to publish a single note for someone who doesn't have the vault. The likely shape: you point Note at a cloud bucket you control (S3, Cloudflare R2, etc.), the app uploads the rendered note there, and you share the URL. The bucket is yours; Note is just a publisher. Keeps the no-server promise intact.

### More languages

Beyond English and Vietnamese. The i18n infrastructure is general; it just needs translation files.

### Cleanup helpers

Things like an "orphan finder" for `.assets/` files no longer referenced by any note, or a stale-link detector. Useful for long-lived vaults.

## Not happening

These would change what Note is. They're listed not to be defensive, just to set expectations:

### Hosted sync service

Note doesn't have one and won't. Sync is what your file-sync tool (Dropbox, iCloud, Syncthing, git, you-name-it) is for. Building a hosted sync service is the kind of thing that turns "a tool that runs in your browser tab" into "a SaaS with a roadmap and a billing system" — different project.

### Account system

There is no account because there is no thing to log into. Every feature works without one.

### Third-party plugin runtime

A plugin API would let other people extend Note. It would also:

- Expand the security surface considerably (a plugin runtime is a lot of code to keep safe).
- Tie the app's internals to a public API that resists change.
- Spawn a long tail of plugin-shaped solutions to problems better solved by editing markdown directly or by writing a small external script.

The trade-off isn't worth it. If a workflow really needs custom logic, Note's openness — files on your disk, conventions other tools share — means an external script is usually a better tool.

### Built-in encryption

OS-level disk encryption (FileVault, BitLocker, LUKS, etc.) does this well. Adding a second encryption layer in the app would mean managing keys, recovery codes, and a pile of UX around "you forgot your passphrase" — for marginal gain.

### A native shell

The browser is the runtime. Wrapping Note in Electron / Tauri / similar would add an installer, an auto-updater, code-signing, and a per-OS distribution chain — without changing any of the *features*.

The mobile Capacitor wrapper above is a different argument: mobile browsers don't ship the File System Access API, so a native wrapper is the only path. On desktop, the browser is enough.

### A richer "AI agent" mode

Note's AI features are deliberately scoped — read your vault, propose edits to the active note, manage tasks. A full agent loop (plan, multi-step execution against external services, autonomous mutation across many notes) is closer to "another product" than to "a feature." Stays out for now.

## Open items not on either list

A few things are real questions the project hasn't decided on:

- **Daily notes as a first-class feature.** Today daily notes are emergent — use a template, name them by date. Whether they should be more deeply built-in (auto-create, "today" navigation shortcut, etc.) is undecided.
- **Custom palettes via UI.** The eleven curated palettes cover most preferences; whether to build a color-picker UI for custom palettes is an open call.
- **Per-note encryption** (separate from disk-level). Some users want one note encrypted with a passphrase even if the rest of the vault isn't. Plausible but not designed.

## Why this matters

The "not happening" list is the project's spine. If you're choosing between Note and another tool, those are the deliberate trade-offs. If you wanted any of those features, a different tool is probably a better fit, and that's fine — many good ones exist.
