---
id: 36f00bd0-c8cf-442d-a1c6-fe161940328e
title: Vault layout
createdAt: 2026-05-09T14:45:50.572Z
updatedAt: 2026-05-09T14:45:50.572Z
---
# Vault layout

A vault is just a folder. Here's what Note creates inside it.

## The shape

```
my-vault/
  getting-started.md
  Reading list.md
  projects/
    q1-plan.md
    research.md
  .assets/
    abc123.png
    diagram.excalidraw
  .assets/chats/
    getting-started__2026-04-25-1430.md
  .assets/tasks/
    2026-05-04-draft-proposal.md
```

## Notes

Notes are plain `.md` files at any depth. The filename is the title (with a `.md` extension). Folders are folders — make as many as you want. The sidebar's note tree reflects exactly what's on disk.

## `.assets/`

Anything that isn't a note but belongs to the vault lives under `.assets/`. The most common case is **images you paste into a note**: the app saves them as `.assets/<uuid>.png` and inserts a relative-path image link in the note. Excalidraw's binary scene files land here too.

## `.assets/chats/`

AI chat threads are saved here as plain markdown. The filename includes the note the conversation was anchored to, plus a timestamp:

```
.assets/chats/getting-started__2026-04-25-1430.md
```

Threads are searchable, version-controllable, and editable in any text editor. If you don't want them anymore, delete the file. See [Chat threads](../08-ai/chat-drawer.md).

## `.assets/tasks/`

Tasks are stored here, one task per file, following the [TaskNotes](https://github.com/callumalpass/tasknotes) frontmatter convention. The body is regular markdown — anything you write below the frontmatter is the task's notes. See [Task fields](../07-tasks/task-fields.md).

## What the app *won't* create

- No `.git/` (you can put one in if you want; nothing knows or cares).
- No proprietary database file, no `.note/` directory, no rebuilt-elsewhere index.
- No `.DS_Store`-like sidecar that has to be kept in sync.

## What the app *won't* read

These paths are intentionally excluded from the sidebar tree, the search index, and the AI's `search_vault` / `read_note` tools:

- Anything under a folder that starts with `.` (so `.assets/`, `.git/`, etc.).
- Anything under a folder that ends in `.assets` (e.g. some setups use `<note-name>.assets/` for per-note attachments).

That's why pasting an image into your note gives you `![](.assets/abc123.png)` and not a clutter of image entries in the note tree.

## Moving the vault

The vault is a regular folder. Move it, rename it, sync it, ZIP it up — Note doesn't care. The next time you open the app, point it at the new location with the folder picker, and the wikilinks, tasks, and chats all keep working because they're relative to the vault root.

## References

- [[Chat drawer]]
- [[Task fields]]
