---
id: 4a150d22-c5a6-439f-b66a-5d0ec11b1202
title: Appearance
createdAt: 2026-05-09T15:00:41.119Z
updatedAt: 2026-05-09T15:00:41.119Z
---
# Appearance

The editor's typography is configurable. Open the **Editor settings** popover (gear icon in the toolbar) to find these controls.

## Font family

Pick from a curated list of web-safe and Google Fonts options:

- **System** (default) — your OS's default sans-serif.
- **Serif** — a generic serif fallback.
- **Mono** — a generic monospace fallback.
- **Source Code Pro** — monospace, for code-heavy notes.
- **Roboto**, **Open Sans**, **Noto Sans**, **Montserrat**, **Lato**, **Poppins**, **Roboto Condensed**, **Source Sans 3** — modern sans-serifs.
- **Oswald**, **Raleway** — display-style sans-serifs, most useful for short, headline-heavy notes.

The font applies to body text. Code blocks always use a monospace font (the system mono unless you've picked Source Code Pro).

## Font size

A pixel slider for body text. The default is calibrated for laptop-distance reading; bump it up for larger displays or smaller for ultra-dense layouts.

Headings are sized relative to body, so changing body size scales the whole hierarchy.

## Line height

A multiplier on the font size. Tighter line height (e.g. 1.4) packs more text on screen; looser line height (e.g. 1.7) is easier to read for long passages.

## Paragraph spacing

The vertical gap between paragraphs, in pixels. Larger values give a "breathing room" feel; smaller values are more like a typewriter draft.

## What these don't change

- **The on-disk markdown.** Font and size are CSS — nothing about your notes changes.
- **Code block font.** Always monospace.
- **PDF export.** The print stylesheet uses its own font / size for predictability across browsers.

## Combinations worth trying

- **Drafting**: Source Sans 3, ~17px, line-height 1.7, paragraph spacing 16px. Easy on the eyes for long writing sessions.
- **Reading**: Roboto Condensed, ~16px, line-height 1.5. Compact, high information density.
- **Code-heavy notes**: Source Code Pro, ~14px, line-height 1.5. Body text and code blocks share a font; less visual switching.

## Resetting

There's no explicit "reset" button — pick the default option for each setting (System for font, the slider's middle for size, etc.). The defaults are tuned for a 13–15" laptop screen at typical viewing distance.
