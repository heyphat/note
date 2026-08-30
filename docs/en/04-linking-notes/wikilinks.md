---
id: 4bb3fc9b-bdb2-46bd-b9e4-5204621866e7
title: Wikilinks
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# Wikilinks

A **wikilink** is a link from one note to another, written by note title rather than by URL.

```markdown
See also [[Reading list]].
```

The link points to the note titled `Reading list` in your vault. If you rename that note, every wikilink in every note keeps resolving — the link is by title, not by file path.

## How to type one

Type `[[` and the editor opens an autocomplete popover with notes from your vault. Keep typing to filter; press **Enter** to insert; press **Esc** to dismiss.

If the title you type doesn't match any existing note, the wikilink is still inserted. It just renders as a **broken link** (a different color / styling). Click a broken wikilink and the app offers to create the missing note.

## Linking to a section

Add `#section-heading` to point at a specific heading inside the target note:

```markdown
See [[Onboarding#Step 3]] for the order details.
```

The section name should match a heading in the target note. The match is case-insensitive and ignores most punctuation, so `[[Onboarding#step 3]]` resolves the same way.

## Display labels

If you want the rendered text to be different from the target name, use a pipe:

```markdown
[[Onboarding|the onboarding doc]]
```

renders as **the onboarding doc** but still links to `Onboarding`.

## Autocomplete behavior

While typing inside `[[`, the popover ranks results by:

1. Title match (prefix > substring).
2. Recency of last edit.

So your most recently-edited matching notes float to the top — usually what you wanted.

## Click and navigate

A click on a wikilink navigates the editor to the target note. The URL updates to match (see [URL routing](../13-navigation/url-routing.md)), so the browser's back button takes you back to where you were.

## Why wikilinks instead of regular markdown links

- **Stable across renames.** Wikilinks resolve by title, not by relative path. Rename a note and every link to it keeps working.
- **Less typing.** You don't write the URL.
- **Round-trip safe.** Other tools that share the convention (Obsidian and similar) read the same syntax. Tools that don't see the bracketed text as visible content — degraded, not broken.

## References

- [[Transclusion]]
- [[Backlinks]]
- [[Graph view]]
- [[URL routing]]
