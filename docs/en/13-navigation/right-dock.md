---
id: 0d3f506b-f38c-493c-a027-bd66f4959d6f
title: Right dock
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Right dock

The right-side panel stack. Toggle the whole dock with `Cmd/Ctrl + Shift + B`. It holds three panels of per-note metadata.

## The three panels

| Panel | What it shows |
| --- | --- |
| **Backlinks** | Every note that links to the active note. See [Backlinks](../04-linking-notes/backlinks.md). |
| **History** | Snapshot list for the active note. See [Browsing history](../10-history/browsing-history.md). |
| **Project tasks** | Tasks whose `projects` field links to the active note. See [Task views](../07-tasks/views.md). |

Each panel has its own visibility toggle in the [header toolbar](./header-toolbar.md), so you can show one panel alone if that's all you want — backlinks while reading, history while reviewing, project tasks while planning.

## Why these are grouped

All three panels show *information about the active note*. They update when the active note changes (switching notes refreshes all three). Bundling them in one dock means flipping focus between them is one keystroke, not several.

## The dock's behavior

- **Toggle the whole dock** with `Cmd/Ctrl + Shift + B` — when any of the three panels is visible, the dock is shown; when none are, it's hidden.
- The dock remembers which combination of panels was visible. Hiding the dock and re-showing it brings back the same set.

## When the dock isn't useful

- **Empty state** (no active note) — the panels have nothing to show. Hide the dock to reclaim screen real estate.
- **Long-form drafting** — the dock pulls focus. Combine [zen mode](../03-editor/editor-modes.md) with the dock hidden for the most distraction-free setup.

## Cross-panel interactions

Clicking a backlink navigates the editor; the dock immediately re-renders for the new active note. Clicking a project-tasks entry opens the task in the [task form modal](../07-tasks/creating-and-editing.md). Restoring a history snapshot updates the editor and refreshes backlinks (since the link graph may have changed).

## References

- [[Backlinks]]
- [[Browsing history]]
- [[Task views]]
- [[Header toolbar]]
- [[Creating and editing tasks]]
- [[Editor modes]]
