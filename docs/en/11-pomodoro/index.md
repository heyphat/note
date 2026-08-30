---
id: 015b32d0-842c-4e38-b76e-84d7e5a728d5
title: Pomodoro / focus session
createdAt: 2026-05-09T14:47:52.618Z
updatedAt: 2026-05-09T14:47:52.618Z
---
# Pomodoro / focus session

A built-in Pomodoro timer for focused work. Toggle a session with `Cmd/Ctrl + Shift + P`.

## What it does

The Pomodoro pattern: alternating focus periods and breaks. Default cadence is 25 minutes of focus and 5 minutes of break, but both are configurable.

## The chip

While a session is running, a small **chip** sits in the editor header showing:

- Whether you're in a focus or break interval.
- The countdown.
- The note the session is bound to (if any).
- A small popover for pausing or stopping.

The chip is non-modal — you keep working in the editor while it runs.

## Binding to a note

A session you start while editing a note is **anchored to that note**. The chip shows the note title in its breadcrumb, and:

- If the note has [time tracking](../07-tasks/time-tracking.md) (i.e. it's a task), the focus interval becomes a `time_entries` entry on the task when the session ends.
- The chip popover lets you click through to the bound note from anywhere in the app.

Sessions started without an active note are unbound — they tick down without writing anything.

## Configuring durations

Open the **sidebar settings** popover and find the Pomodoro section:

- **Focus minutes** — how long a focus interval lasts. Default 25.
- **Break minutes** — how long a break lasts. Default 5.

Both accept any positive integer. Changes apply to new sessions; an in-flight session keeps its original durations.

## Cross-tab behavior

The Pomodoro state is shared across tabs in the same browser. Start a session in one tab and the chip shows up in every other tab pointed at the same vault. Stop it from any tab and it stops everywhere.

## Audio cue

When an interval ends (focus → break, or break → focus), the app plays a short audio chime. Browsers may block audio on tabs that haven't been interacted with recently — if you don't hear the chime, click anywhere in the app to grant audio permission.

## What it isn't

- **A scheduling tool.** Pomodoro doesn't reorder your day; it just times the next interval.
- **Persistent across long absences.** If you close the tab mid-focus and come back tomorrow, the session is gone — it doesn't pick up where it left off (because the OS reclaimed the JavaScript runtime).
- **A source of truth on time spent.** That's [time tracking](../07-tasks/time-tracking.md) on the task itself. Pomodoro *feeds* time tracking when the session is bound to a task, but the data lives on the task file.

## Why it's built in

Most note-takers run a separate timer app. Bundling one — and binding it to the active note — closes the loop between *what you're working on* and *how long you've worked on it*. The data ends up in the same place as your notes.
