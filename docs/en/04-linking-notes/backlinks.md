---
id: 5d0dd6f0-b2ac-4ebd-9ade-ad42a8e0dec0
title: Backlinks
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Backlinks

The **backlinks** panel shows every note that points *at* the note you're currently reading. It's the inverse of the link tree you can see by reading the current note's body.

## Where to find it

The backlinks panel lives in the **right dock**:

- Toggle the right dock with `Cmd/Ctrl + Shift + B`.
- The dock stacks three panels (backlinks, history, project tasks); the backlinks panel is one of them.
- Each panel has its own visibility toggle in the [header toolbar](../13-navigation/header-toolbar.md), so you can show backlinks alone if that's all you want.

## What it shows

For each backlinking note, the panel shows:

- The source note's title (clickable — takes you there).
- A short context snippet around the link, so you can see *how* the source note refers to the current one.
- An indication of whether the link is a wikilink or a transclusion.

Multiple links from the same source note are grouped together so the panel doesn't get visually noisy.

## What counts as a backlink

- `[[current-note]]` — yes, plain wikilink.
- `[[current-note|alias]]` — yes, alias doesn't break the relationship.
- `[[current-note#section]]` — yes; the section is recorded too.
- `![[current-note]]` — yes; transclusions are links.
- `[label](current-note.md)` — **no.** Regular markdown links by file path don't appear in backlinks. Wikilinks are the convention.

## How it stays current

The link graph rebuilds as you edit. If you open a note, write `[[Other note]]`, and switch to that other note, you'll see the new backlink show up. If the graph ever looks wrong — e.g. after a bulk on-disk rename — run [Reindex vault](../01-getting-started/reindexing.md).

## Why this matters

Wikilinks let you grow a network of notes without thinking about hierarchy. Backlinks are how you *use* that network: instead of having to remember which note referenced this one, the panel shows every entry point in. It's the difference between a folder of files and an actually-navigable knowledge base.

## References

- [[Wikilinks]]
- [[Transclusion]]
- [[Graph view]]
- [[Header toolbar]]
- [[Reindexing the vault]]
