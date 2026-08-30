---
id: b497b6a4-89c3-4c9b-9926-169a5e0b1fad
title: Getting started
createdAt: 2026-05-09T14:54:14.451Z
updatedAt: 2026-05-11T06:11:36.294Z
---
# Getting started

The first time you open Note, the app doesn't know where you keep your notes. It can't — there's no server with your files on it. So getting started is mostly about pointing Note at a folder on your machine and writing your first note inside it.

Four short pages cover the whole onboarding path:

1. [Browser support](./browser-support.md) — Note depends on the File System Access API. That narrows the supported browsers.
2. [Choosing a vault](./choosing-a-vault.md) — pick (or create) the folder that will hold your notes.
3. [Creating your first note](./first-note.md) — keyboard shortcut, autosave, where the file lands on disk.
4. [Reindexing](./reindexing.md) — when search results look stale or tasks aren't showing up, this is the fix.

<br />

## Take a quick tour

Once you've picked a vault, the fastest way to learn the app is to try a handful of shortcuts. Read each step, do the thing, and you'll have seen most of the surface area in under a minute.

> \[!TIP]
> 
> Throughout the docs, `Cmd/Ctrl + K` means **Cmd on macOS, Ctrl on Windows / Linux**. Try the one that matches your machine.

### 1. Open the command palette

Press **`Cmd/Ctrl + K`**.

A search box appears in the middle of the screen. This is your one-keystroke way to find any note, run any action, jump to a tag. Type a few letters of any note title — results filter as you type. Press **Esc** to close it.

### 2. Cycle the theme

Press **`Cmd/Ctrl + Shift + D`**.

The whole app flips between light and dark. Hit it again to land on system-follow mode. A small toast tells you which mode you're in. (For colors beyond light/dark, see [Color palettes](../14-customization/color-palettes.md).)

### 3. Toggle the sidebar

Press **`Cmd/Ctrl + B`**.

The note tree on the left disappears. Press it again to bring it back. Reach for this whenever you want a wider editor without entering a full-on focus mode.

### 4. Open the file explorer

Press **`Cmd/Ctrl + Shift + E`**.

A folder-focused browser opens. Where the sidebar is built for picking a single note, the file explorer is built for *folder operations* — create, rename, move, delete. **↑ / ↓** to navigate, **Enter** to open, **Esc** to close. See [File explorer](../13-navigation/file-explorer.md).

![1.00](.assets/images/8f1a1bff-3e4d-4735-a452-e70605b2cbf1.png)

<br />

### 5. Create a new note

Press **`Ctrl + N`** (macOS) or **`Ctrl + Alt + N`** (Windows / Linux).

A blank note appears with the cursor in the title field. Type a title, press Enter, start writing. Don't worry about saving — the app autosaves continuously. (`Cmd + N` is reserved by browsers, which is why this one uses `Ctrl`.)

### 6. Try a wikilink

Type **`[[`** or `@` anywhere in the editor body.

A popover lists notes from your vault. Type a few letters to filter, press Enter to insert. You've just made a link from this note to another. Click it later and the editor jumps over. See [Wikilinks](../04-linking-notes/wikilinks.md) for the full story.

### 7. Open the vault tasks view

Press **`Cmd/Ctrl + Shift + K`**.

Every task in `.assets/tasks/` shows up in one filterable list. Filter by status, priority, due date; click any task to edit. To create a new one without leaving the keyboard: **`Ctrl + T`** (macOS) or **`Ctrl + Alt + T`** (Windows / Linux). See [Task views](../07-tasks/views.md).

![1.00](.assets/images/2198a92c-a8e6-4a1e-bc4a-c9e03c480bcc.png)

### 8. Open the AI chat drawer

Press **`Cmd/Ctrl + \`**.

A chat panel slides in from the side. If you've configured an AI provider ([Providers and keys](../08-ai/providers-and-keys.md)), ask it something — it can search your vault and propose edits to the open note. If you haven't, the drawer tells you what to set up.

![1.00](.assets/images/f20278c9-b81e-440b-bc5a-d3c468486991.png)

### 9. Open the graph view

Press **`Cmd/Ctrl + Shift + G`**.

A force-directed map of your vault appears — each note is a node, each wikilink is an edge. Click a node to jump the editor there. Handy for spotting which notes are well-connected and which are stranded. See [Graph view](../04-linking-notes/graph-view.md).

![1.00](.assets/images/44a13dfc-febd-454d-bfab-17fb49d39d20.png)

### 10. Zen mode

Press **`Cmd/Ctrl + .`**.

Everything except the editor disappears. Useful for distraction-free writing. Press **Esc** to exit.

That's the core. The full list lives in [Keyboard shortcuts](../15-keyboard-shortcuts.md).

***

If anything in here doesn't work the way it sounds like it should, jump to [Troubleshooting](../16-troubleshooting.md).

