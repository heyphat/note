---
id: f324518e-b9ba-4f27-8d39-7f078070780b
title: Template variables
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Template variables

When a note is spawned from a template, the editor scans the template body for `{{variable}}` placeholders and replaces each one with its current value. Variables are evaluated *once*, at the moment of creation — they're not live (they don't update later).

## The variables

| Variable | Replaced with |
| --- | --- |
| `{{title}}` | The title of the new note (whatever you typed when creating it). |
| `{{date}}` | Today's date, in `YYYY-MM-DD` form. |
| `{{now}}` | Current datetime, in ISO form. |
| `{{uuid}}` | A freshly-generated UUID. Useful for embedding stable identifiers in tasks or sub-resources. |
| `{{tasks.today}}` | A formatted markdown block of today's tasks (every task whose `due` or `scheduled` is today). |

## Examples

A daily note template:

```markdown
# {{date}}

## Intentions
-

## Tasks
{{tasks.today}}

## Notes

```

When created, that becomes:

```markdown
# 2026-05-09

## Intentions
-

## Tasks
- [ ] Draft Q2 plan (due 2026-05-09, !high)
- [ ] Review onboarding doc

## Notes

```

A meeting note template:

```markdown
# {{title}}

**Date:** {{date}}
**Meeting ID:** {{uuid}}

## Attendees

## Agenda

## Decisions

## Action items
```

## What gets escaped

Variables only fire when written *exactly* as `{{name}}` (no spaces inside the braces). If you want literal `{{date}}` in the body — to document the variables themselves, for instance — escape one of the braces (`{ {date}}`) or write it inside a code block (`` `{{date}}` ``). Code-block contents are not interpolated.

## What's *not* a variable

- **Per-note custom fields.** There's no syntax for "ask me for a value when creating the note." If you need that, paste it in after the note is created.
- **Computed values from other notes.** `{{tasks.today}}` is the only data-derived variable in v1. Adding more (e.g. `{{tasks.overdue}}`, `{{recent-notes}}`) is plausible future work but isn't shipped.
- **Recursive templates.** A template body containing `{{something}}` gets interpolated; it doesn't expand a *different* template.

## When variables aren't enough

If your "template" really wants to be a small program (loops over some data, fetches from an API, runs a script), build the note with an external tool and paste the result. Note's templates are deliberately a thin layer — they'd otherwise be a plugin runtime, which is on the list of things the project deliberately doesn't do (see [Roadmap & non-goals](../17-roadmap-and-non-goals.md)).

## References

- [[Roadmap and non-goals]]
