---
id: ab306f6f-5b94-4b54-9882-99836cb33c78
title: Transclusion
createdAt: 2026-05-09T14:44:15.833Z
updatedAt: 2026-05-09T14:44:15.833Z
---
# Transclusion

Transclusion is **embedding the contents of one note inside another**. Where a wikilink says "see this other note," a transclusion says "render this other note's content right here."

```markdown
![[Q1 plan]]
```

That single line, in the editor, expands to the body of `Q1 plan` rendered inline. The target note still lives in its own file; you're just looking at it through another note's window.

## How to write one

The syntax is `![[note-title]]` — wikilink syntax with a leading `!`, the same way image markdown adds `!` to a regular link.

To transclude only part of the target, point at a heading:

```markdown
![[Q1 plan#Risks]]
```

That embeds the `Risks` section (everything from that heading to the next same-or-higher-level heading) instead of the whole note.

## What it looks like in the editor

The transclusion appears inline, visually distinct from the surrounding note (slight inset / different border). It's **read-only at the embed site** — to edit the embedded content you click through to the source note. That keeps the source-of-truth model honest: every byte of the target note lives in one file.

## Update behavior

Transclusion is a live view. When you edit the target note, every embed of it across the vault reflects the change the next time those notes are opened or reloaded.

## Pitfalls

- **Don't transclude a note into itself.** The app will refuse to render a self-embed (it would loop forever).
- **Long transclusions** can make the parent note feel heavy. If you find yourself transcluding entire notes everywhere, consider whether a wikilink would communicate the same thing.
- **Heading targets are case-insensitive but exact-text** otherwise. Renaming a heading in the target note breaks every section-level transclusion that pointed at the old name.

## When to use which

- Use a **wikilink** (`[[…]]`) when you want the reader to know there's a related note and follow it.
- Use a **transclusion** (`![[…]]`) when the *content* of the other note belongs in this note — you'd otherwise copy-paste it, and want the embed to keep up with the source.

## References

- [[Wikilinks]]
- [[Backlinks]]
