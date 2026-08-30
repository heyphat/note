---
id: b4f82dbb-267c-43d0-a00f-13231e8dd35c
title: Keyboard shortcuts
createdAt: 2026-05-09T14:53:06.773Z
updatedAt: 2026-05-09T14:53:06.773Z
---
# Keyboard shortcuts

Every shortcut Note ships with, in one place. The conventional `Cmd/Ctrl` notation means **Cmd on macOS, Ctrl on Windows / Linux**. Where the modifiers actually differ between platforms, both are listed.

## Global

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + K` | Command palette |
| `Cmd/Ctrl + \` | AI chat drawer |
| `Cmd/Ctrl + S` | Flush pending saves |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `Cmd/Ctrl + .` | Zen mode (Esc to exit) |
| `Cmd/Ctrl + Shift + D` | Cycle theme (light → dark → system) |
| `Cmd/Ctrl + Shift + X` | Close active note |

## Notes and tasks

| Shortcut | Action |
| --- | --- |
| `Ctrl + N` (macOS) / `Ctrl + Alt + N` (Win/Linux) | Create new note |
| `Ctrl + T` (macOS) / `Ctrl + Alt + T` (Win/Linux) | Create new task |

(Cmd+N and Cmd+T are reserved by browsers for "new window" / "new tab" — they never reach the page on macOS, hence the Ctrl-based binding.)

## Editor modes

| Shortcut | Mode |
| --- | --- |
| `Cmd/Ctrl + Shift + F` | Focus mode |
| `Cmd/Ctrl + Shift + T` | Typewriter mode |
| `Cmd/Ctrl + Shift + M` | Narrow editor |
| `Cmd/Ctrl + Shift + L` | Lock editor (read-only) |
| `Cmd/Ctrl + .` | Zen mode |

## Panels and views

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + Shift + B` | Toggle right dock (history + backlinks + project tasks) |
| `Cmd/Ctrl + Shift + E` | File explorer |
| `Cmd/Ctrl + Shift + G` | Graph view |
| `Cmd/Ctrl + Shift + K` | Vault tasks view |
| `Cmd/Ctrl + Shift + O` | Toggle table of contents |
| `Cmd/Ctrl + Shift + Y` | Toggle word count |
| `Cmd/Ctrl + Shift + S` | Toggle spell check |
| `Cmd/Ctrl + Shift + P` | Pomodoro / focus session |

## Inside the command palette

| Shortcut | Action |
| --- | --- |
| `↑ / ↓` | Move through results |
| `Enter` | Open / run highlighted result |
| `Esc` | Close palette |
| `Tab` | Cycle filter chips (search mode) |

Mode prefixes inside the palette query:

| Prefix | Mode |
| --- | --- |
| (none) | Full-text search |
| `>` | Run an action |
| `#` | Tag filter |
| `@` | Quick-open by title |

## Inside the editor

These shortcuts are inherited from Milkdown / Crepe and behave like a standard rich editor:

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + B` (with selection) | Bold |
| `Cmd/Ctrl + I` | Italic |
| `Cmd/Ctrl + E` | Inline code |
| `Tab` (in list / table) | Indent / next cell |
| `Shift + Tab` | Outdent / previous cell |

## Inside the chat drawer

| Shortcut | Action |
| --- | --- |
| `Enter` | Send message (multi-line in composer with Shift+Enter) |
| `Shift + Enter` | New line in composer |

## Why some shortcuts are missing

A few common operations are intentionally not bound to global shortcuts:

- **Save** is not a thing — autosave handles it. `Cmd/Ctrl + S` flushes any in-flight saves but isn't required.
- **Print** falls back to the browser's `Cmd/Ctrl + P`.
- **Find in document** — the editor doesn't ship a custom find; use the browser's. (Find *across notes* is the [command palette](./06-search/command-palette.md).)

## Customizing shortcuts

Not exposed as a setting today. The bindings are baked into the app. If you have strong preferences, the source-of-truth is the `useAppKeyboardShortcuts` hook.

## References

- [[Command palette]]
