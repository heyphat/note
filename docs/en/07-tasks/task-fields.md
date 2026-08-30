---
id: e7c8a6a9-69f6-45b8-9a94-47638a6d9d2a
title: Task fields
createdAt: 2026-05-09T14:43:28.855Z
updatedAt: 2026-05-09T14:43:28.855Z
---
# Task fields

Every task is a `.md` file under `.assets/tasks/` with YAML frontmatter at the top. Most of the time you won't edit the YAML by hand — the [task form modal](./creating-and-editing.md) handles it — but it's worth knowing what each field does.

## Required fields

| Field | What it stores |
| --- | --- |
| `title` | Short human-readable name. Shows in every task view. |
| `status` | Lifecycle. Common values: `open`, `in-progress`, `done`, `cancelled`. The set is extensible — any string is allowed. |
| `date_created` | ISO datetime when the task was first written. |
| `date_modified` | ISO datetime of last edit. |

## Common optional fields

| Field | What it stores |
| --- | --- |
| `id` | Stable identifier for the task. Survives renames. |
| `priority` | One of `highest`, `high`, `normal`, `low`, `lowest`. Tasks with no priority are treated as `normal` for filtering purposes. |
| `due` | `YYYY-MM-DD`. The hard deadline. |
| `scheduled` | `YYYY-MM-DD`. When you plan to *work on* the task (vs. when it's due). |
| `tags` | List of strings. `[research, q1]`. |
| `contexts` | GTD-style `@`-contexts. `[@laptop, @errands]`. |
| `projects` | Wikilinks like `[[Q2 Launch]]`. Multi-project is allowed. |

## Time fields

| Field | What it stores |
| --- | --- |
| `time_estimate` | Estimated minutes. `30`, `120`, etc. |
| `time_entries` | List of `{ start, end, description? }` entries. Built up as you log time against the task. See [Time tracking](./time-tracking.md). |

## Recurrence fields

| Field | What it stores |
| --- | --- |
| `recurrence` | An RRULE string (RFC 5545). E.g. `FREQ=WEEKLY;BYDAY=MO`. See [Recurrence](./recurrence.md). |
| `recurrence_anchor` | `scheduled` or `completion` — controls how the next occurrence is computed. |
| `complete_instances` | List of `YYYY-MM-DD` dates marking which past occurrences are done. |
| `skipped_instances` | List of `YYYY-MM-DD` dates marking skipped occurrences. |

## Dependencies

| Field | What it stores |
| --- | --- |
| `blocked_by` | List of task references with optional `RELTYPE`. See [Dependencies](./dependencies.md). |

## Reminders

| Field | What it stores |
| --- | --- |
| `reminders` | List of relative or absolute reminder objects. See [Reminders](./reminders.md). |

## The body

Below the frontmatter, the file body is **free-form markdown**. Use it for anything that doesn't fit a structured field: notes about the task, a checklist of sub-steps, a paste of context from elsewhere.

The body is included in `search_tasks` text queries (the `text` parameter is a substring filter against title + body).

## What's *not* in the schema

- **Subtasks as fields.** A task isn't a tree of structured sub-tasks; nested steps go in the body as a checklist.
- **Assignees.** Note is a single-user app; tasks belong to you.
- **A `done_at` field.** Completion dates are tracked via `complete_instances` (for recurring tasks) or implicitly via `date_modified` (for one-shot tasks).

## References

- [[Creating and editing tasks]]
- [[Time tracking]]
- [[Recurrence]]
- [[Dependencies]]
- [[Reminders]]
