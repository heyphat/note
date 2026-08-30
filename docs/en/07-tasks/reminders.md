---
id: fd89f9cd-11a7-418e-acfb-2bd9c492c72b
title: Reminders
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Reminders

A task can carry a list of reminders that fire to nudge you. Reminders come in two flavors: **relative** (anchored to a task's due or scheduled date) and **absolute** (a specific datetime).

## Relative reminders

```yaml
reminders:
  - relative: -P1D   # 1 day before due
  - relative: -PT1H  # 1 hour before due
```

The string is an ISO 8601 duration:

- `P1D` = 1 day, `PT1H` = 1 hour, `PT15M` = 15 minutes, `P1W` = 1 week.
- A leading `-` means *before* the anchor (the usual case).
- Without `-`, it means *after* (e.g. follow-up reminders).

Relative reminders are anchored to **`due`** when present, otherwise **`scheduled`**. If neither is set, the reminder doesn't fire.

## Absolute reminders

```yaml
reminders:
  - at: 2026-05-04T09:00:00
```

A specific moment. Useful when the task isn't tied to a deadline — "remind me about this on Monday morning."

## How reminders fire

Reminders are surfaced in the app's task views (an indicator on tasks that have an upcoming reminder) and may also trigger a browser notification, depending on your browser's notification permissions.

The exact delivery mechanism is browser-dependent: a service-worker notification when the tab is open, less aggressive when it's not. Treat reminders as nudges, not as hard alarms — the OS-level alarm clock is still better for "this is the meeting."

## Why two flavors

- **Relative** is the right shape for tasks that *have* deadlines and you want a heads-up: "an hour before the due time, ping me."
- **Absolute** is the right shape for tasks that *don't* have hard deadlines but you want to be reminded at a specific point: "next Monday at 9, look at this."

You can attach both kinds to the same task. Each reminder is independent.

## What reminders aren't

- **A scheduling tool.** They don't move the task. They just nudge.
- **Cross-device.** Reminders fire in the browser they're set up in. They don't sync to your phone unless you have the same vault open in a phone browser.
- **Auto-rescheduling.** A missed reminder doesn't reschedule itself. Once the moment passes, the reminder is just a record.

## Editing reminders

The [task form modal](./creating-and-editing.md) has a reminders section where you can add and remove entries. The underlying YAML is editable directly in any text editor too, if that's faster.

## References

- [[Creating and editing tasks]]
