---
id: 09fd36cf-af0b-4fb4-8442-ff129c321a8b
title: Tables
createdAt: 2026-05-09T15:09:16.842Z
updatedAt: 2026-05-09T15:09:16.842Z
---
# Tables

Tables in Note use standard GitHub Flavored Markdown syntax under the hood, with a few editor conveniences on top.

## How to insert one

- Type `/table` for a starter 3×2 table.
- Or type the syntax directly:

```markdown
| Symbol | Side | Pnl |
| --- | --- | --- |
| AAPL | Long | +120 |
| MSFT | Short | -45 |
```

The pipes don't have to line up. The editor formats them visually as a grid; the underlying file is whatever you typed.

## Editing a table

- **Tab** moves to the next cell. **Shift + Tab** moves to the previous cell.
- **Enter** in the last cell of the last row inserts a new row.
- **Drag a column edge** to resize the column. The change is visual — markdown tables don't carry width metadata, so widths reset on reload.
- **Right-click** on a cell for column / row actions: insert column before / after, insert row above / below, delete column, delete row.

## Alignment

The separator row controls alignment per column:

```markdown
| Left | Center | Right |
| :--- | :---: | ---: |
| a | b | c |
```

- `:---` left-aligned (the default)
- `:---:` centered
- `---:` right-aligned

## What tables aren't

- **Not spreadsheets.** No formulas, no cell types, no sorting. If you need that, use a separate tool.
- **Not nested.** A cell holds inline content (text, formatting, links). It can't hold a code block or another table.
- **Not paginated.** Wide or tall tables scroll inside the editor; consider whether the data really needs to be a table or could be a list.

## Round-tripping

The on-disk format is plain GFM. Other markdown tools — GitHub, Obsidian, Pandoc — read and write the same syntax. Pasting a table from Excel or Google Sheets generally works, because most spreadsheets export TSV that the editor can convert.
