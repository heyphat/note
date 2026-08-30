---
id: 35b78646-97f2-4860-a989-1b11e6131a74
title: Browser support
createdAt: 2026-05-10T01:59:04.025Z
updatedAt: 2026-05-10T01:59:04.025Z
---
# Browser support

Note runs entirely in the browser, and it writes your notes to a folder on your disk through a standard web API: the **File System Access API**. Browsers that don't ship that API can't run the app.

## What works today

| Browser | Status |
| --- | --- |
| Chrome | Works |
| Edge | Works |
| Brave | Works |
| Arc | Works |
| Opera | Works |
| Other Chromium-based browsers | Works |
| **Firefox** | Not supported (no File System Access API) |
| **Safari** | Not supported (no File System Access API) |

## What you'll see in an unsupported browser

When you open the app and try to pick a folder, the app detects the missing API and tells you so directly. It does not silently fall back to in-memory storage — that would let you work for an hour and then lose everything when the tab closes.

## Why this matters

Note's privacy model rests on the same API. With File System Access:

- The browser asks you to pick a folder.
- The app gets a handle that's scoped to that folder only.
- Reads and writes go straight from your tab to disk. Nothing transits a server.

There's no way to deliver that with a polyfill, so until Firefox and Safari ship the API, those browsers can't host the app.

## Mobile

There is no mobile build today. A Capacitor-based wrapper is on the roadmap (see [Roadmap & non-goals](../17-roadmap-and-non-goals.md)) but not shipped. On a desktop Chromium browser the app is fully usable; on a phone, it isn't.

## References

- [[Roadmap and non-goals]]
