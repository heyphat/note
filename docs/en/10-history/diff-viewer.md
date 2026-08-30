---
id: 9f82dc67-48f2-4721-b8c0-97498945a9b4
title: Diff viewer
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Diff viewer

The diff viewer compares two versions of a note and highlights what changed. It's the right tool when "browsing snapshots one at a time" doesn't surface the difference clearly enough.

## Opening the diff viewer

From the [history panel](./browsing-history.md):

- Pick a snapshot, then click **Diff** — compares that snapshot to the current note.
- Pick two snapshots — compares them against each other.

## What you see

A line-level diff:

- **Green** lines are additions (present in the newer version, absent in the older).
- **Red** lines are deletions (present in the older version, removed in the newer).
- Unchanged lines render in muted text so the changes stand out.

You can switch between **side-by-side** and **unified** layouts depending on which is easier to read for the diff at hand. Side-by-side is good for big rewrites where a whole paragraph moved; unified is good for small targeted edits.

## What the diff treats as a "line"

The viewer is a markdown-aware line diff: it splits on actual newlines, not on rendered paragraph breaks. So a heading is one line, a list item is one line, a code-block fence is one line. Two paragraphs separated by a blank line are three lines.

This is generally more useful than a character-level diff for prose, because you can scan it.

## Restoring from the diff view

If the diff is showing you exactly the change you want to undo, the viewer offers a **Restore** action that pulls in the older version. Same as the Restore action in the history panel.

You can also copy individual changed sections out of the diff (paste the older version's lines back into the editor) if you only want to revert part of the change.

## When the diff is hard to read

- **Large rewrites** — when most lines changed, the diff is mostly red and green and not very informative. Compare snapshots one at a time instead.
- **Reformatting** — if you ran a formatter or changed line-wrapping conventions, every line shows as changed. The semantic edit might be small; the diff doesn't know that. Eyeball it.
- **Generated content** — for a note that contains a lot of generated content (e.g. a `{{tasks.today}}` block in a daily template, regenerated on each create), the generated section dominates the diff. Just visually skip past it.

## References

- [[Browsing history]]
- [[Recovery]]
