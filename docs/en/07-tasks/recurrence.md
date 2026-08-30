---
id: 50c2181a-f359-4f7e-b36c-dc96c136c1a6
title: Recurrence
createdAt: 2026-05-09T14:43:03.126Z
updatedAt: 2026-05-09T14:43:03.126Z
---
# Recurrence

Recurring tasks repeat on a schedule. They're stored as a single task file with two fields that define the pattern, plus lists of completed and skipped occurrences.

## The fields

| Field | Meaning |
| --- | --- |
| `recurrence` | An RRULE string (RFC 5545). |
| `recurrence_anchor` | `scheduled` or `completion` — see below. |
| `complete_instances` | List of `YYYY-MM-DD` dates of past completions. |
| `skipped_instances` | List of `YYYY-MM-DD` dates of skipped occurrences. |

## RRULE basics

RRULE is the iCalendar standard. The presets in the [task form modal](./creating-and-editing.md) cover most cases:

| Preset | RRULE |
| --- | --- |
| Daily | `FREQ=DAILY` |
| Weekdays | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Weekly (same day each week) | `FREQ=WEEKLY` |
| Biweekly | `FREQ=WEEKLY;INTERVAL=2` |
| Monthly | `FREQ=MONTHLY` |
| Yearly | `FREQ=YEARLY` |

Custom RRULEs are supported — pop the custom field and write your own. Some examples:

- `FREQ=WEEKLY;BYDAY=MO,WE` — every Monday and Wednesday.
- `FREQ=MONTHLY;BYMONTHDAY=1` — first of every month.
- `FREQ=MONTHLY;BYDAY=-1FR` — last Friday of every month.
- `FREQ=DAILY;COUNT=14` — once a day for two weeks, then stop.

## Anchor: `scheduled` vs `completion`

This is the choice that trips people up.

- **`scheduled`** — the next occurrence is computed from the original schedule, regardless of when you completed the previous one. So a `FREQ=WEEKLY` task scheduled for Monday is *always* on Mondays. If you complete this Monday's instance on Wednesday, next week's instance is still on Monday.

- **`completion`** — the next occurrence is computed from the day you completed the previous one. So a `FREQ=WEEKLY` task you complete on Wednesday gets its next instance scheduled for the following Wednesday. The cadence is "weekly," but the actual day shifts.

**Rule of thumb:** use `scheduled` for hard cadences ("every Monday standup"). Use `completion` for elastic ones ("every two weeks, no matter when I do it").

## Instances on disk

`complete_instances: [2026-04-29, 2026-05-06, 2026-05-13]` is a record that those three occurrences are done. The "current" instance is the next one due that's not in the completed or skipped list.

This means the task file is *one* file, but represents *N* occurrences over time. Useful: the task's body, tags, contexts, projects all stay in one place rather than getting cloned per-week.

## Completing a recurring task

When you mark a recurring task done, the app:

1. Adds today's date (or the day you specify) to `complete_instances`.
2. Recomputes the next occurrence from the anchor and RRULE.

The task stays in your task list as the *next* upcoming instance, not as "done."

## Skipping vs deleting

If you want to skip an occurrence (you're on vacation, the standup is cancelled this week), use **skip** rather than complete. Skipped dates go into `skipped_instances`. They don't count toward "did this task this week" reports if you ever build them.

Deleting the task file removes the whole pattern, all past instances and future ones.

## References

- [[Creating and editing tasks]]
