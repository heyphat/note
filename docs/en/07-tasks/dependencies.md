---
id: 5f270753-df30-4106-ba0b-60bf4b9ada1c
title: Dependencies
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Dependencies

A task can be marked as **blocked by** other tasks. The `blocked_by` field captures the relationship; views surface it so you can see what's actually unblocked right now.

## The simple case

```yaml
blocked_by:
  - 2026-05-04-finalize-spec.md
```

Task A is blocked by Task B. Until B is done, A is a "downstream" task — it shows up in views with a blocked indicator and is filtered out of "ready to start" lists.

## Relationship type (`RELTYPE`)

For more nuance, each entry can carry a `RELTYPE`:

```yaml
blocked_by:
  - path: 2026-05-04-finalize-spec.md
    reltype: FINISHTOSTART
```

The four types come from RFC 5545:

| `RELTYPE` | Meaning |
| --- | --- |
| `FINISHTOSTART` (default) | A can start only after B finishes. The classic dependency. |
| `STARTTOSTART` | A can start only after B starts. |
| `FINISHTOFINISH` | A can finish only after B finishes. |
| `STARTTOFINISH` | A can finish only after B starts. (Rare; common in scheduling but not in personal tasks.) |

Most personal task setups only use `FINISHTOSTART`, which is also the default — so you don't have to write `RELTYPE` at all in the common case.

## Dependency gap

Each entry can also carry a **gap** — an ISO duration to wait after the predecessor's relevant event before this task is unblocked.

```yaml
blocked_by:
  - path: 2026-05-04-finalize-spec.md
    reltype: FINISHTOSTART
    gap: PT24H
```

`PT24H` is "24 hours after the predecessor finishes." Other examples:

- `P3D` — three days.
- `P1W` — one week.
- `PT2H30M` — two hours, thirty minutes.

## What the views show

A task with active `blocked_by` entries shows a blocked indicator and is excluded from "ready to start" or "next actions" filters in the task views and AI tools. Once all predecessors are satisfied, the indicator clears.

## Gotchas

- Cycles (A blocks B blocks A) aren't detected — don't make them.
- A predecessor task that's been deleted leaves a stale entry in `blocked_by`. The blocked task's indicator may show as missing. Edit the task to clean up.
- Dependencies don't auto-trigger anything. Marking a predecessor done doesn't reschedule the dependent task; it just stops counting as a block.

## Why this is in the format

Most of the value of dependencies in a personal system is **filtering**: "show me only tasks that are actually doable today." `blocked_by` makes that filter possible without a separate task management app. The frontmatter cost is small; the upside is significant if your work is gated on other work.
