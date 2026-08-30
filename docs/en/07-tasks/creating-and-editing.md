---
id: 18dbabba-51e4-458f-a479-0b2aeb305383
title: Creating and editing tasks
createdAt: 2026-05-09T14:43:28.321Z
updatedAt: 2026-05-09T14:43:28.321Z
---
# Creating and editing tasks

Tasks are created and edited through the **task form modal**, not by hand-writing YAML. The modal turns common task fields into one-line chip entries so capture stays fast.

## Opening the modal

- **New task:** `Ctrl + T` (macOS) / `Ctrl + Alt + T` (Windows / Linux). The same family of shortcut as new note — Cmd+T is reserved by browsers for "new tab," so the modifier is Ctrl.
- **Edit an existing task:** click it in any task view (list, kanban, project panel, vault view).
- **From the AI:** ask the chat drawer to create a task and the model uses [`manage_tasks`](../08-ai/tools-edit.md), which surfaces a proposed-edit card you click Apply on.

## Inline chip syntax

In the title or description field, you can drop chips inline as you type:

| Chip | Means |
| --- | --- |
| `#tag` | Adds a tag |
| `!high` (or `!highest` / `!low` / `!lowest`) | Sets priority |
| `@context` | Adds a GTD context |
| `[[Project name]]` | Adds a project link |

Type one of these and the modal converts it to the structured field on the right side. So `Draft Q2 plan #q2 !high @laptop [[Q2 Launch]]` becomes a task with all those fields set, with the title left as `Draft Q2 plan`.

## Date fields

The **due** and **scheduled** date pickers accept natural-language hints:

- `today`, `tomorrow`
- `next monday`, `next friday`
- `+3d`, `+1w`, `+2w`
- `2026-05-20` (or any ISO date)

The picker normalizes to `YYYY-MM-DD` for storage.

## Status and priority

Both are dropdowns in the modal. Status defaults to `open`; priority defaults to unset (treated as `normal`).

## Description / body

Below the structured fields, the modal embeds a [Milkdown editor](../03-editor/index.md) for the task's body — full markdown, lazy-loaded so the modal opens fast. Use it for sub-steps, context, links, anything.

## Recurrence

A recurrence picker exposes presets (Daily, Weekly, Biweekly, Monthly, Custom) and lets you write a custom RRULE for power-user cases. See [Recurrence](./recurrence.md).

## Saving

The modal autosaves as you type, like the rest of the app. Closing the modal flushes any pending writes. The on-disk file goes into `.assets/tasks/<filename>.md`; the filename is generated from the title + a date stamp so files don't collide.

## Editing a task you didn't create here

Any TaskNotes-conformant `.md` file in `.assets/tasks/` is recognized. If you write or paste a file in there directly (e.g. from another tool), the app picks it up as a task on next index. The form modal will edit it the same way.

## References

- [[Edit tools]]
- [[The editor]]
- [[Recurrence]]
