---
id: 78608553-d2a6-49dc-baef-6d3671c24646
title: Note — Documentation
createdAt: 2026-05-09T14:43:30.515Z
updatedAt: 2026-05-09T14:43:30.515Z
---
# Note — Documentation

Note is a local-first markdown notebook that runs in a browser tab, writes plain `.md` files to a folder you choose, and brings AI to your notes without sending them through a server you don't control.

This documentation walks you through every feature the app exposes today: the editor, the way notes link to each other, the AI chat, tasks, search, history, and the small choices you can make about how it looks. It is organized as a tree of short pages — each page answers one question, so you can read straight through or jump in anywhere.

## How these docs are organized

| Section | What's in it |
| --- | --- |
| [Getting started](./01-getting-started/index.md) | First-run walkthrough: pick a vault, create a note, what your browser needs |
| [Core concepts](./02-core-concepts/index.md) | The local-first model, how notes are stored, what's in your vault folder |
| [Editor](./03-editor/index.md) | Writing, formatting, slash commands, callouts, tables, embeds, editing modes |
| [Linking notes](./04-linking-notes/index.md) | Wikilinks, transclusion, backlinks, the graph view |
| [Diagrams](./05-diagrams/index.md) | Mermaid, Excalidraw, and interactive Canvas blocks |
| [Search](./06-search/index.md) | Command palette, query syntax, tags, saved searches |
| [Tasks](./07-tasks/index.md) | Creating tasks, views, recurrence, dependencies, time tracking, reminders |
| [AI](./08-ai/index.md) | Providers, the chat drawer, the tools the model can call, privacy |
| [Templates](./09-templates/index.md) | Reusable note skeletons with variables |
| [History](./10-history/index.md) | Per-note snapshots, diffs, recovery |
| [Pomodoro](./11-pomodoro/index.md) | Focus / break timer attached to a note |
| [Export](./12-export/pdf-export.md) | Print-driven PDF export |
| [Navigation](./13-navigation/index.md) | Map of the UI: sidebar, right dock, file explorer, URLs |
| [Customization](./14-customization/index.md) | Fonts, color palettes, theme, language |
| [Keyboard shortcuts](./15-keyboard-shortcuts.md) | One-page reference |
| [Troubleshooting](./16-troubleshooting.md) | Common stuck-points and how to recover |
| [Roadmap & non-goals](./17-roadmap-and-non-goals.md) | What's deliberately not in the app |

## Reading order if you're new

If you've never opened the app before:

1. [Browser support](./01-getting-started/browser-support.md) — make sure you're in a Chromium browser.
2. [Choosing a vault](./01-getting-started/choosing-a-vault.md) — pick the folder your notes will live in.
3. [Creating your first note](./01-getting-started/first-note.md) — write something, save something.
4. [Vault layout](./02-core-concepts/vault-layout.md) — see what the app puts on disk.
5. [Editor basics](./03-editor/writing-and-formatting.md) — start writing.

From there, follow the section that matches what you want to do next.

## Conventions

- Keyboard shortcuts are written `Cmd/Ctrl + K`. Cmd is the macOS modifier; Ctrl is the Windows / Linux modifier.
- Paths like `.assets/chats/` are relative to the vault root you picked.
- "The active note" means the note currently open in the editor.
- "The vault" means the folder you handed to the app via the folder picker.

You can also read the project's [README](../README.md) for a higher-level pitch and the philosophy behind the design choices these docs describe.
