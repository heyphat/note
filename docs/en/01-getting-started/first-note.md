---
id: 065c260b-ad97-49b7-adf5-02e50d9916d2
title: Creating your first note
createdAt: 2026-05-10T01:59:02.195Z
updatedAt: 2026-05-10T01:59:02.195Z
---
# Creating your first note

Once you've picked a vault, the app drops you into an empty state with the sidebar on the left and a hint about creating your first note.

## How to create a note

Three ways, all equivalent:

- **Keyboard shortcut.** `Ctrl + N` on macOS, `Ctrl + Alt + N` on Windows / Linux. (`Cmd + N` is reserved by browsers for "new window," so the app uses `Ctrl + N` on macOS instead.)
- **The "+" button** in the sidebar header.
- **The command palette.** `Cmd/Ctrl + K`, type `> new note`, hit Enter.

A new note appears immediately, with the cursor in the title field. Type the title, press Enter or Tab, and start writing.

## How saving works

You don't press Save. The app autosaves continuously:

- The **title** is debounced — pause for a moment and the app renames the file on disk to match.
- The **body** is debounced too — every meaningful keystroke gets persisted within a second or two.
- A **`Cmd/Ctrl + S`** flushes any in-flight saves immediately, useful right before you close the tab.

If the browser tab is killed mid-save, the app keeps a recovery snapshot so you can get the in-flight content back on next load. See [Recovery](../10-history/recovery.md).

## Where the file lives

Your new note is a regular `.md` file in your vault folder. If you titled it "Reading list," you'll find it at `<your-vault>/Reading list.md` (or in whichever subfolder is selected).

The file has a small YAML frontmatter block at the top — `id`, `title`, `createdAt`, `updatedAt` — followed by your content. You can open the file in any text editor and the frontmatter survives any round-trip. See [Markdown and frontmatter](../02-core-concepts/markdown-and-frontmatter.md).

## What to do next

- Try [wikilinks](../04-linking-notes/wikilinks.md): type `[[` and start linking notes to each other.
- Try [slash commands](../03-editor/slash-commands.md): type `/` and the editor offers callouts, code blocks, tables, diagrams.
- Set up [AI](../08-ai/index.md) if you want a chat drawer that knows about the notes in your vault.

## References

- [[Recovery]]
- [[Markdown and frontmatter]]
- [[Wikilinks]]
- [[Slash commands]]
- [[AI]]
