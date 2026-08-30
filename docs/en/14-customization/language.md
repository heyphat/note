---
id: 22a04894-1f6a-4756-9324-b6828b141aab
title: Language
createdAt: 2026-05-09T15:00:00.809Z
updatedAt: 2026-05-09T15:00:00.809Z
---
# Language

The app's UI is bilingual: **English** and **Vietnamese**. Both are first-class — every label, tooltip, error message, and toast is translated.

## How to switch

Language is set per-browser in the sidebar settings popover. Pick **English** or **Vietnamese** and the UI re-renders in the chosen language.

The locale is also reflected in the URL prefix:

```
http://localhost:3000/en/...   ← English
http://localhost:3000/vi/...   ← Vietnamese
```

You can switch by editing the URL too, but the settings popover is the normal path.

## What's translated

- Sidebar section titles and tooltips.
- Editor chrome (toolbar buttons, settings labels).
- Modal labels (task form, template picker, recovery dialog).
- Toast messages (saved, copied, theme switch, focus session start / stop).
- Error messages.

## What's not translated

- **Your note content.** Notes are *yours*; the app doesn't touch them. A Vietnamese-language note in an English-locale UI looks like a Vietnamese-language note. The same is true the other way around.
- **AI conversation content.** The AI replies in whatever language you write to it in. The chat drawer's *chrome* is translated; the messages aren't.
- **Provider names.** "Anthropic," "OpenAI," "Google" don't translate.
- **Markdown syntax.** Wikilinks are wikilinks regardless of locale.

## Adding a language

The translations live in `locale/<lang>.json`. Adding a third language is a matter of writing a new JSON file and registering it with `next-intl`. Beyond English and Vietnamese, no language is shipped today.

## Why these two

Note's primary contributors and users have been English- and Vietnamese-speakers, and i18n was built in from the start so it wouldn't bottleneck on retrofits later. The infrastructure is general; more languages are realistic if there's demand.

## Locale-related quirks

- **Date formats** in things like the calendar strip respect the locale.
- **Sort orders** for note titles use locale-aware comparison.
- **Right-to-left scripts** are not specifically tested — neither English nor Vietnamese is RTL. RTL support would need additional UI work.
