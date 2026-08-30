---
id: 26ef41bf-b46c-4228-9442-8268e167b7de
title: Theme toggle
createdAt: 2026-05-09T15:00:07.508Z
updatedAt: 2026-05-09T15:00:07.508Z
---
# Theme toggle

Light, dark, or follow the system. Cycle between them with `Cmd/Ctrl + Shift + D`, or use the theme button in the [header toolbar](../13-navigation/header-toolbar.md).

## The three modes

| Mode | Behavior |
| --- | --- |
| **Light** | Always light, regardless of OS settings. |
| **Dark** | Always dark, regardless of OS settings. |
| **System** | Follow the OS's appearance setting. Switches automatically when the OS does (e.g. day / night). |

## Theme vs palette

The theme toggle and the [color palette](./color-palettes.md) are **independent**. The palette decides *which* colors; the theme toggle decides *light or dark*. Each palette has both a light and a dark variant — the toggle swaps which variant applies.

So:

- **Solarized + Light** → light Solarized.
- **Solarized + Dark** → dark Solarized.
- **Solarized + System** → light or dark Solarized depending on what the OS says right now.

## How it's applied

The toggle:

1. Reads (or computes) the resolved light/dark value.
2. Loads the corresponding variant of the active palette.
3. Sets a `data-color-scheme` attribute on `<html>` so CSS rules can branch.
4. Persists your choice to `localStorage`.

There's a small inline pre-hydrate script that runs before React mounts, so the *first paint* is in the right theme. You don't see a brief flash of the wrong colors.

## What follows the toggle

- The editor surface and chrome.
- The sidebar and right dock.
- AI chat drawer.
- Modals (task form, template picker, recovery).
- Diagrams (Mermaid re-renders to match).

What *doesn't* follow:

- **Images** in your notes — they're rendered as-is.
- **Code blocks' syntax highlighting** colors — the highlighter's palette is fixed.
- **Excalidraw scenes** — they keep the colors you drew.

## Quick toggle shortcut

`Cmd/Ctrl + Shift + D` cycles `light → dark → system → light → …`. A small toast tells you which mode you've landed in.

## When System mode is the right choice

- You use OS-level appearance scheduling (day / night automation, sunset trigger, etc.).
- You want the same app to look "right" without thinking about it across multiple machines.
- You don't have a strong preference and like the OS to decide.

When it isn't:

- You always want one mode regardless of the time of day.
- Your OS doesn't reliably emit appearance change events (some Linux setups).

## References

- [[Header toolbar]]
- [[Color palettes]]
