---
id: b02e69b5-4014-49e2-b8c9-5a736b76f8f1
title: Sidebar
createdAt: 2026-05-10T02:04:00.776Z
updatedAt: 2026-05-10T02:04:00.776Z
---
# Sidebar

The left-side panel. Toggle with `Cmd/Ctrl + B`. It's the home of every navigation surface that doesn't fit in the header.

## Sections

The sidebar stacks several optional sections, each independently togglable in the [sidebar settings](#settings) popover:

| Section | What it shows |
| --- | --- |
| **Note tree** | Every note in the vault, organized by folder. Always visible; this is the sidebar's core. |
| **Calendar strip** | A compact date picker. Click a date to jump to (or create) the daily note for that date. |
| **Tag cloud** | Every tag in the vault, sized by frequency. Click a tag to filter the note tree. |
| **Recent notes** | Notes you've recently opened or edited. |
| **Templates** | Templates available in the vault. Click one to spawn a new note from it. |
| **Saved searches** | Pinned queries — click to re-run. |

## The note tree

- **Folders** expand and collapse.
- **Right-click** any note or folder for actions: rename, delete, move, new note in this folder.
- **Drag-and-drop** to move notes between folders.
- **Inline rename** by clicking a selected entry and editing.
- **Updated-at timestamps** can be toggled on for a denser timeline view.

The tree stays in sync with what's on disk. Edit a folder structure outside the app and the tree updates on next reindex.

## Display modes

The note tree supports a **dense** mode that hides timestamps and tightens spacing. Toggle it from the sidebar settings popover. Useful on smaller screens or when you have a lot of notes and want to see more at a glance.

## Settings

The sidebar header has a **gear icon** that opens a settings popover. The popover has four sections, navigated from a left rail:

- **General** — sidebar visibility (calendar, tags, recent, templates, saved searches), dense / expanded note-tree mode, language, theme, Pomodoro durations, vault reindexing.
- **AI assistant** — provider selection, API keys, model picker ([Providers and keys](../08-ai/providers-and-keys.md)).
- **MCP servers** — add, edit, test, and toggle remote tool servers the assistant can call ([MCP servers](../08-ai/mcp-servers.md)).
- **Danger zone** — clear all chats, forget the current vault folder.

## What the sidebar doesn't show

- Anything under `.assets/` (chats, tasks, attachments). Those have their own surfaces ([Chat drawer](../08-ai/chat-drawer.md), [Task views](../07-tasks/views.md)).
- Hidden directories like `.git/`. The sidebar walks the same allowlist as the search index.

## References

- [[Providers and keys]]
- [[Chat drawer]]
- [[Task views]]
