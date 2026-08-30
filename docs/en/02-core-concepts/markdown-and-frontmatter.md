---
id: 1a48cc61-c286-45ab-8461-20cba370cdb1
title: Markdown and frontmatter
createdAt: 2026-05-09T14:45:41.726Z
updatedAt: 2026-05-09T14:45:41.726Z
---
# Markdown and frontmatter

Every note in Note is a `.md` file with a small YAML frontmatter block at the top.

## What a note looks like on disk

```markdown
---
id: a3b8c2d4-...
title: Reading list
createdAt: 2026-04-12T08:23:11.443Z
updatedAt: 2026-05-01T17:11:02.106Z
---

# Reading list

- [[Designing Data-Intensive Applications]]
- [[The Mythical Man-Month]]

## Recently finished

- _Crafting Interpreters_ — finished 2026-04-30.
```

## The frontmatter block

The app maintains four fields. They're written automatically; you don't normally edit them by hand.

| Field | Meaning |
| --- | --- |
| `id` | Stable UUID. Survives file renames so backlinks and the AI's `read_note` calls keep resolving. |
| `title` | The note's display title. Mirrors the filename. |
| `createdAt` | ISO datetime of first save. |
| `updatedAt` | ISO datetime of most recent save. |

You can add **any other YAML fields you want**. Round-trips preserve them — the app reads what it understands and leaves the rest alone. So if you want `author:`, `tags:` (list-form), `aliases:`, project metadata, anything else, write it. Other tools that share the conventions (Obsidian, static-site generators, custom scripts) will see the fields too.

## The body

Below the frontmatter, the body is **GitHub Flavored Markdown** plus a few conventions on top:

- **Wikilinks** — `[[Other note]]`, `[[Other note#section]]`. See [Wikilinks](../04-linking-notes/wikilinks.md).
- **Transclusion** — `![[Other note]]`, embeds the contents of another note inline. See [Transclusion](../04-linking-notes/transclusion.md).
- **Callouts** — fenced blockquotes with a type marker like `> [!NOTE]`. See [Callouts](../03-editor/callouts.md).
- **Footnotes** — `[^1]` references and definitions. See [Footnotes](../03-editor/footnotes.md).
- **Diagrams in fenced code blocks** — `​```mermaid` and `​```excalidraw`. See [Diagrams](../05-diagrams/index.md).

Everything else is standard markdown: headings, lists, tables, code blocks, images, links, blockquotes, horizontal rules. The editor renders them as you type ([Writing and formatting](../03-editor/writing-and-formatting.md)).

## What's *not* in the format

- **No proprietary tags or attributes** baked into the markdown. Wikilinks and callouts are textual; they degrade gracefully in any markdown viewer.
- **No invisible markers** — nothing in the file relies on bytes you can't see in a text editor.
- **No build step** — the file you write is the file the app reads.

## Editing notes outside the app

Open them in any text editor. Save. The app picks up the change the next time it loads (or right away, if your editor lets the file system signal it). Run [Reindex vault](../01-getting-started/reindexing.md) if search results haven't caught up.

## References

- [[Wikilinks]]
- [[Transclusion]]
- [[Callouts]]
- [[Footnotes]]
- [[Diagrams]]
- [[Writing and formatting]]
- [[Reindexing the vault]]
