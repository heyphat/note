---
id: 0d57d6d0-ca41-44eb-90e7-1c79ee8e9342
title: Time tracking
createdAt: 2026-05-09T14:47:57.533Z
updatedAt: 2026-05-09T14:47:57.533Z
---
# Time tracking

Tasks can carry an estimate and a list of actual time entries. The two together let you compare what you thought a task would take vs. what it did.

## `time_estimate`

A single number of minutes:

```yaml
time_estimate: 90
```

The form modal exposes this as a simple minute / hour input. Estimates are optional.

## `time_entries`

A list of `{ start, end, description? }` objects:

```yaml
time_entries:
  - start: 2026-05-04T09:00:00
    end: 2026-05-04T09:45:00
    description: Outline
  - start: 2026-05-05T14:10:00
    end: 2026-05-05T15:30:00
    description: First draft
```

Each entry is a contiguous interval you spent on the task. The optional `description` is useful when a task spans multiple sessions and you want to remember what each one was about.

## How time gets logged

Time entries are appended by the [Pomodoro timer](../11-pomodoro/index.md) when a session is bound to a task — the start and end of the session become a `time_entries` entry. You can also add or edit entries directly via the task form modal.

## Reading total time

Sum the durations of all entries to get the actual minutes spent. Compare to `time_estimate` to see how the prediction held up.

The app doesn't surface a built-in "total time" UI per task in v1; the data is there, and any external tool that reads the YAML can compute it. A future version may roll this up automatically.

## Why this is per-task and not per-day

Most "time tracking" tools are organized by day — what did you do today? This format is organized by task — how much time has *this* taken? Both shapes are useful; this one is a better fit for "how do I estimate next time?" than for "what did I bill?"

If you need a per-day rollup, walk every task file, expand `time_entries`, and group by day. The format is open enough for a small script.

## What it isn't

- **A timer** in itself. The timer is the [Pomodoro chip](../11-pomodoro/index.md); time tracking is the *record* the timer leaves behind.
- **A reporting tool.** No charts, no invoicing, no per-week summaries. The data is there; the views aren't.
- **An accuracy enforcement.** The app trusts whatever you write. Overlapping entries, entries on the wrong task, missing entries — they're all just YAML edits.

## References

- [[Pomodoro / focus session]]
