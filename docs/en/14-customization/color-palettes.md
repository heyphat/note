---
id: 13404f35-44b9-48a9-9202-563e9d4fe884
title: Color palettes
createdAt: 2026-05-09T15:00:37.395Z
updatedAt: 2026-05-09T15:00:37.395Z
---
# Color palettes

A **color palette** is a coordinated set of colors for everything in the UI: background, panels, text, borders, accent, success / warning / error. The app ships with eleven palettes, and each defines both a dark and a light variant.

Picking a palette is **independent** of the [light/dark toggle](./theme-toggle.md). The toggle decides which variant of the current palette to apply.

## The palettes

| Palette | Vibe |
| --- | --- |
| **Default** | Cool blue accents on a deep navy. The app's identity palette. |
| **Solarized** | The classic Solarized scheme — warm backgrounds, restrained accents. |
| **Dracula** | High-contrast purple / pink on dark grey. |
| **Nord** | Muted blues and greys; "polar night" feel. |
| **Gruvbox** | Warm oranges and yellows; retro-terminal feel. |
| **Monokai** | Lime / pink accents on near-black. The classic editor palette. |
| **One** | The Atom One Dark / Light scheme. |
| **Tokyo Night** | Saturated blues and purples on midnight. |
| **Catppuccin** | Pastel "soothing" palette; balanced contrast. |
| **GitHub** | The GitHub web app's palette. Conservative, familiar. |
| **Rosé Pine** | Mauve / rose tones with warm accents. |

## How to switch

Three ways:

- **Sidebar settings popover** → palette swatches. Click a swatch to apply.
- **Command palette** → `> palette: <name>`.
- **Editor settings popover** → palette section.

The change is instant; no reload.

## What changes when you switch

- Backgrounds, panels, borders, text colors.
- Accent color (links, focused elements, buttons).
- Success / warning / error tints (used for callouts and AI tool cards).
- Pill colors (used for some chips and indicators).

What *doesn't* change: layout, typography, spacing. Palettes are color-only — pick the one that's easiest on your eyes; the rest of the UI behaves the same.

## Light vs dark variants

Every palette has both. When you flip the [theme toggle](./theme-toggle.md), the same palette is re-applied in the other variant. So "Solarized + Light" and "Solarized + Dark" are both options; the toggle swaps between them.

## Persistence

The chosen palette is stored in `localStorage`. It survives reloads and follows you to other tabs in the same browser. It does **not** travel with the vault — different browsers / machines pick up the default until you switch.

## Why eleven and not "any color you want"

A custom-color picker would mean every UI element needs to look good against any combination — and most combinations don't. The curated set is small enough to keep tested and large enough to fit most aesthetic preferences. If none of them work for you, the CSS variables are exposed (the inline pre-hydrate script in the layout reads from a single source), so a custom palette is achievable with a small amount of code — but not via the UI.

## References

- [[Theme toggle]]
