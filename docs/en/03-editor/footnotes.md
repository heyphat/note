---
id: fc36e15a-47fe-4b76-bf42-fd0c5f3ca67f
title: Footnotes
createdAt: 2026-05-09T15:09:21.737Z
updatedAt: 2026-05-09T15:09:21.737Z
---
# Footnotes

Footnotes let you attach an aside to a piece of text without breaking the flow of the main paragraph. The reader sees a small superscript number; the actual note lives at the bottom of the document.

## How to insert one

- Type `/footnote` for a guided insert. The editor places a reference inline and a matching definition at the end of the note.
- Or type the syntax directly:

```markdown
This sentence has a footnote.[^1]

[^1]: And here's the body of the footnote.
```

## How the syntax works

- A reference is `[^name]`. The name can be a number (`[^1]`) or a label (`[^migration-note]`).
- A definition is the same name followed by `:` and the body: `[^name]: body text…`.
- Definitions go at the bottom of the document. Note will renumber numeric footnotes on read so they appear in order, but the names you wrote stay stable in the file.

## What it looks like in the editor

The reference renders as a small superscript link. Click it to jump to the definition; click the back-arrow on the definition to jump back. Hovering shows a preview popover with the body, so you don't have to leave context for short notes.

## Multi-line footnote bodies

Indent continuation lines under the definition:

```markdown
[^long]: First paragraph of the footnote.

    Second paragraph, indented four spaces.

    - Lists work too.
```

## When to use them

- Small asides that would clutter the paragraph.
- Source citations.
- "More on this in [[Other note]]"-style pointers, when an inline link would be too prominent.

For anything longer than a paragraph or two, consider linking to another note ([Wikilinks](../04-linking-notes/wikilinks.md)) or transcluding a section ([Transclusion](../04-linking-notes/transclusion.md)) instead.

## References

- [[Wikilinks]]
- [[Transclusion]]
