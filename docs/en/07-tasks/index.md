---
id: 4ca620b5-187a-4abf-9b79-f96f7e7dd197
title: Tasks
createdAt: 2026-05-09T14:43:29.392Z
updatedAt: 2026-05-09T14:43:29.392Z
---
# Tasks

Tasks in Note are first-class. Each one is its own `.md` file under `.assets/tasks/`, with **YAML frontmatter** that follows the [TaskNotes specification](https://github.com/callumalpass/tasknotes). The body of the file is regular markdown — anything you want to write about the task.

That choice — one file per task, plain markdown, structured frontmatter — means every other tool you might point at the vault can read your tasks. Sync them, version them, grep them, run a script over them. The app's task views are one way to look at them, not their owner.

## In this section

- [Task fields](./task-fields.md) — every YAML field a task can carry.
- [Creating and editing](./creating-and-editing.md) — the task form modal, inline chips for tags / priority / projects.
- [Views](./views.md) — list, kanban board, project panel, vault tasks view.
- [Recurrence](./recurrence.md) — RRULE-based repeating tasks.
- [Dependencies](./dependencies.md) — `blocked_by` with relationship types.
- [Time tracking](./time-tracking.md) — estimates and time entries.
- [Reminders](./reminders.md) — relative and absolute reminders.

## Quick start

- **New task:** `Ctrl + T` (macOS) / `Ctrl + Alt + T` (Windows / Linux).
- **Vault task list:** `Cmd/Ctrl + Shift + K`.

The AI's [`manage_tasks` and `search_tasks` tools](../08-ai/tools-edit.md) speak the same vocabulary, so you can ask the chat drawer to triage your task list and it'll act on the same files.
