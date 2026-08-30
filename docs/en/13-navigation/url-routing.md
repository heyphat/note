---
id: e4855e5f-19b4-4c91-afb5-4934c84bce54
title: URL routing
createdAt: 2026-05-09T14:55:21.060Z
updatedAt: 2026-05-09T14:55:21.060Z
---
# URL routing

The active note is reflected in the page URL. The browser's back / forward buttons navigate through your note history.

## What the URL looks like

When you're editing a note at `Projects/Q2 plan.md`, the URL slug looks something like:

```
http://localhost:3000/en/projects/q2-plan
```

Pieces:

- **Locale prefix** (`/en/`, `/vi/`) — set by the app's i18n layer. See [Language](../14-customization/language.md).
- **Path slug** — derived from the note's path inside the vault. Spaces become hyphens; special characters are stripped or escaped.

The slug is **resolved against the active vault**. Two different vaults can have notes with the same path; the URL is meaningful only in the context of your currently-open vault.

## Browser navigation

- **Back** — return to the previously-active note (or to the empty state).
- **Forward** — re-open the note you backed out of.
- **Reload** — re-opens the same note. The vault handle is fetched from IndexedDB; the note is re-read from disk.

## Sharing URLs

A URL containing a note slug is **only meaningful if the recipient has the same vault**. The URL doesn't include note content — there's no server with that note's bytes — so a shared URL is more like a "see also" pointer than a true link.

For sharing actual content with someone who doesn't have the vault, copy the note's body and paste. A "share a note via cloud bucket" feature is on the roadmap (see [Roadmap & non-goals](../17-roadmap-and-non-goals.md)) but not shipped.

## Empty state URL

When no note is active (you're on the welcome / empty state), the URL is the locale root:

```
http://localhost:3000/en/
```

The empty state looks the same whether you arrived from a fresh load or by closing the active note (`Cmd/Ctrl + Shift + X`).

## What's *not* in the URL

- **Editor mode toggles** (focus, typewriter, narrow, zen, lock). Those are per-tab UI state, persisted to `localStorage`, not to the URL.
- **Sidebar / right-dock visibility**. Same.
- **Search queries** from the command palette. The palette is transient; opening it doesn't change the URL.

## When the URL gets out of sync

If you rename a note, the URL updates to match the new slug. If you move the note to a different folder, same. If a wikilink target resolves to a note at a different path than the URL says, the URL wins for the next navigation.

If the URL ever points at a note that no longer exists (e.g. you opened a stale URL after deleting the note), the app falls back to the empty state and shows a small "couldn't find that note" indicator.

## References

- [[Language]]
- [[Roadmap and non-goals]]
