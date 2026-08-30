---
id: d1c5ef2b-de5f-4f91-9c9d-ccdbbe20fb4c
title: Editor modes
createdAt: 2026-05-09T14:41:20.103Z
updatedAt: 2026-05-09T14:41:20.103Z
---
# Editor modes

Beyond the default editing view, the editor has five modes you can toggle to change how distracting (or how locked-down) it feels. They're all on / off toggles, so you can stack them.

| Mode | Shortcut | What it does |
| --- | --- | --- |
| **Focus** | `Cmd/Ctrl + Shift + F` | Dims everything except the block your cursor is in. The current paragraph / heading / list item stays at full opacity; everything around it fades back. |
| **Typewriter** | `Cmd/Ctrl + Shift + T` | Keeps the caret centered vertically. As you type, the document scrolls so your current line stays in the middle of the editor. |
| **Narrow** | `Cmd/Ctrl + Shift + M` | Constrains the editor to a comfortable reading width, even on a wide monitor. Useful for prose; less useful for tables and code. |
| **Zen** | `Cmd/Ctrl + .` | Hides the sidebar, header, and surrounding UI. Just the editor. Press `Esc` to exit. |
| **Lock** | `Cmd/Ctrl + Shift + L` | Read-only. Swallows all input, so a stray paste or keystroke can't change anything. |

## Combining modes

The modes are independent. The most common stacks:

- **Focus + Typewriter + Narrow** — for long-form drafting; eliminates most visual chrome and keeps your eyes in the middle of the screen.
- **Zen alone** — for presenting or reading a note without distractions.
- **Lock + Zen** — for "I'm referring to this note while I work in another window and I don't want a stray keystroke to mutate it."

## Persistence

The mode toggles you set are remembered per browser. The next time you open the app, you come back to the same configuration.

## Why not one "minimal" toggle

Each mode answers a different need. Focus and typewriter help you *write*; narrow helps you *read*; zen hides the *chrome*; lock prevents *editing*. Bundling them into a single switch would mean fewer combinations than people actually want.

## What modes don't change

- The on-disk format. None of these write anything different to the file.
- The shortcuts that work everywhere else (palette, chat drawer, save). Those stay live.
- Cross-tab state. Modes are per-tab; the same vault open in another tab uses its own settings.
