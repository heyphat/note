---
id: c7cc6116-bd81-420a-bf2a-bc2f0f394ab5
title: Task views
createdAt: 2026-05-09T14:43:27.716Z
updatedAt: 2026-05-09T14:43:27.716Z
---
# Task views

There are four ways to look at your tasks. Each is good at a different shape of question.

## Vault tasks view (`Cmd/Ctrl + Shift + K`)

The full-vault view: every task in `.assets/tasks/`, regardless of which project they belong to.

- Filter by status, priority, tags, contexts, projects, due date.
- Sort by due, scheduled, priority, created, modified.
- Bulk actions on selected tasks (complete, delete, change priority).
- Click a task to open it in the [task form modal](./creating-and-editing.md).

This is the right view for triage — "what's open and overdue?" — and for end-of-week review.

## Tasks list panel

A compact list view, rendered as a sidebar / right-dock panel. Same filter / sort capabilities as the vault view but without the screen real estate of a full page.

Useful when you want tasks visible *while* you're editing a note.

## Kanban board

A column-per-status board. Drag cards between columns to change status; cards show title, due date, and priority color.

Status columns are derived from the statuses present in your vault — if you've used `open`, `in-progress`, `done`, those are your columns. Add a fourth status (e.g. `blocked`) by setting it on a task, and a new column appears.

The kanban view is good for **shape-of-work-in-flight** — "how full is my plate, and where is everything?"

## Project tasks panel

Lives in the [right dock](../13-navigation/right-dock.md). Shows tasks whose `projects` field contains a wikilink to the **active note**.

So if you're editing `[[Q2 Launch]]`, the panel shows every task linked to that project. It's the natural place to look while you're working on a project — your task list and your project notes stay side-by-side.

## What they share

All four views read from the same task index:

- A task created in any view shows up in all the others.
- A task completed in the kanban view is completed in the list view too.
- Filters in one view don't leak to other views; each is independent.

## Where the AI fits

The AI's `search_tasks` tool runs against the same index. Asking the chat drawer "what's overdue and high-priority?" gets you the same set the vault view's filters would. The AI can also create, complete, update, and delete tasks via [`manage_tasks`](../08-ai/tools-edit.md) — every change surfaces as a card you Apply.

## References

- [[Creating and editing tasks]]
- [[Right dock]]
- [[Edit tools]]
