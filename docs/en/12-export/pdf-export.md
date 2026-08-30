---
id: aa016009-6d4b-4f0f-ba44-b9e18cf697fc
title: PDF export
createdAt: 2026-05-09T14:47:47.297Z
updatedAt: 2026-05-09T14:47:47.297Z
---
# PDF export

Note can export the active note to PDF. The export is **print-driven** — there's no headless renderer running on a server, no library generating PDF bytes in JavaScript. The browser's "print to PDF" engine does the work.

## How

1. Open the note you want to export.
2. Run the **Export PDF** action (from the editor menu or the [command palette](../06-search/command-palette.md): `> export pdf`).
3. Your browser's print dialog opens, with the note rendered as the page content.
4. Pick **Save as PDF** as the destination.
5. Save the file.

## What gets rendered

The same content the editor shows you, with print-specific styling:

- Background colors are dropped (white background, black text).
- Sidebars, toolbars, panels are hidden.
- Wikilinks render as their resolved title (no special wikilink styling).
- Code blocks keep syntax highlighting if the browser respects print colors.
- Diagrams (Mermaid, Excalidraw) are rasterized in the rendered SVG and included.
- Images are included at their rendered size.

## What doesn't render well

- **Very long tables** — the browser's pagination cuts them in awkward places. Consider exporting tables as separate notes or extracting the data.
- **Excalidraw scenes that depend on dark-mode colors** — they get re-themed for print. Worth a preview.
- **Embedded YouTube videos** — they render as the placeholder card, not as a frame from the video. PDFs can't play video.

## Why no native PDF library

A bundled PDF library (jsPDF, pdf-lib, etc.) would mean:

- More bundle size.
- More edge cases to maintain (font embedding, image bytes, page break logic).
- Worse output for the most common cases — the browser's print engine has decades of polish on layout.

Letting the browser do it gives you good output, no extra bundle, and the same export from any browser. The cost is that the user has to click through the print dialog, which is a small friction.

## Print stylesheet

The print-specific CSS lives in the app's styles. If you want to customize what your PDFs look like (margins, font choices, whether sidebar callouts are visible), tweak the print rules. For most users the default is fine.

## What about HTML / DOCX export

Not a v1 feature. The vault is already HTML-friendly (every note is markdown that renders to HTML), so for HTML export the simplest path is "open the note in any markdown-to-HTML tool." For DOCX, [Pandoc](https://pandoc.org) handles the conversion well — point it at a `.md` file and you get a Word document.

## References

- [[Command palette]]
