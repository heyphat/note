---
id: a14ddf15-9a57-44d2-9d48-f85a02b2b2be
title: Callouts
createdAt: 2026-05-09T15:09:25.429Z
updatedAt: 2026-05-09T15:09:25.429Z
---
# Callouts

Callouts are styled blockquotes used to flag a piece of content — a note, a warning, an aside. They look like blockquotes in any markdown viewer that doesn't understand them, and like color-bordered cards in Note.

## How to insert one

- Type `/callout` and pick a type, or
- Type the syntax directly:

```markdown
> [!NOTE]
> This is the body of the callout.
> It can span multiple lines.
```

The first-line marker (`> [!NOTE]`) sets the type; everything else is just blockquote content.

## The eight types

| Marker | Intent |
| --- | --- |
| `[!NOTE]` | Generic side note |
| `[!TIP]` | A useful suggestion |
| `[!IMPORTANT]` | Something the reader shouldn't skip |
| `[!WARNING]` | A risk to be aware of |
| `[!CAUTION]` | A bigger risk; pay attention |
| `[!INFO]` | Neutral background information |
| `[!SUCCESS]` | A positive outcome / confirmation |
| `[!DANGER]` | The strongest warning |

Each type renders with a distinct accent color drawn from the active [color palette](../14-customization/color-palettes.md). The choice between, say, WARNING and CAUTION is mostly tonal; pick whichever signal fits.

## Custom titles

You can put a title after the marker. The first line becomes the heading of the callout and the rest is the body:

```markdown
> [!TIP] Run the migration during off-hours
> The app works through the change set serially, so a 50k-row table
> will block writes for several seconds.
```

## Nesting and content

A callout is a blockquote, so anything you can put in a blockquote works:

- Lists (bullet, numbered, task)
- Headings (rendered smaller, scoped to the callout)
- Code blocks (fenced and inline)
- Wikilinks
- Other callouts (rare; consider whether you really want them nested)

## Why these instead of plain blockquotes

Plain blockquotes get noisy when used for asides — every quoted block looks the same. Callouts give you eight distinct visual signals while staying readable in any markdown tool. The marker syntax (`[!NOTE]`) is the same one Obsidian, GitHub, and Microsoft Loop use, so notes round-trip cleanly between tools.

## References

- [[Color palettes]]
