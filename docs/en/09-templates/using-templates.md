---
id: fcd5a43c-2995-4342-9a96-212f27ca0d0c
title: Using templates
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Using templates

A template is a saved skeleton. Use one when you'd otherwise be retyping the same structure for the n-th time.

## Picking a template at create time

When you create a new note (`Ctrl + N` on macOS, `Ctrl + Alt + N` on Windows / Linux), you can either:

- **Start blank** (the default) — the new note is empty.
- **Pick a template** — the new note is pre-filled with the template's body, with [variables](./template-variables.md) interpolated.

The template picker is reachable from the new-note flow and from the **Templates** section of the sidebar.

## Picking from the sidebar

The sidebar's **Templates** section lists every template in your vault. Click a template entry to spawn a new note from it. This is the same as picking the template via the new-note flow; the sidebar list is just a faster shortcut for templates you use often.

## Saving an existing note as a template

Any note can be a template. The two patterns:

- **Designated templates folder.** Put your templates in `Templates/` (or any folder you pick). The sidebar Templates section can be configured to surface that folder.
- **A flag in the frontmatter.** A flag like `template: true` marks a note as a template. The sidebar picks it up regardless of folder.

The exact mechanism depends on how you've set up the sidebar. The point is: a template is just a regular note, and turning a note into a template is a one-decision change.

## Variables

When you spawn a new note from a template, any `{{variable}}` placeholders in the template body get replaced by their current value:

- `{{title}}` — the title you give the new note.
- `{{date}}`, `{{now}}` — current date / datetime.
- `{{uuid}}` — a unique ID.
- `{{tasks.today}}` — a formatted block of today's tasks.

See [Template variables](./template-variables.md) for the full list.

## What templates don't do

- **They don't lock the note.** After a template spawns a note, the note is independent. Editing the template later doesn't change notes you already created from it.
- **They don't enforce structure.** You can delete sections, change headings, ignore the variables. The template was a *starting point*, not a contract.

## Template ideas

- **Daily note.** `{{date}}` heading, an "Intentions" section, a "Done" section, `{{tasks.today}}` for the day's task list.
- **Meeting note.** `{{date}}` heading, attendees list (empty), agenda, decisions, action items.
- **Weekly review.** Heading, "what went well," "what didn't," "what's next."
- **Project kickoff.** Goals, scope, risks, links to relevant `[[Other notes]]`.

## References

- [[Template variables]]
