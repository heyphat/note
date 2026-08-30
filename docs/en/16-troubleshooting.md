---
id: fb826aa1-23d2-4641-a8ca-bd3cbac3f3c5
title: Troubleshooting
createdAt: 2026-05-09T15:01:08.053Z
updatedAt: 2026-05-09T15:01:08.053Z
---
# Troubleshooting

A few stuck-points come up often enough to be worth a checklist. If you don't find your problem here, the README and the GitHub issues are the next stops.

## "The app doesn't open my folder."

You're probably in an unsupported browser. See [Browser support](./01-getting-started/browser-support.md). Note depends on the File System Access API; Firefox and Safari don't ship it. Use Chrome, Edge, Brave, Arc, Opera, or any other Chromium-based browser.

## "I picked a folder, but the app keeps asking again."

Two possibilities:

1. **The browser expired the permission.** Some browsers prune permissions to folders aggressively. Re-pick and choose *Allow on every visit* if your browser exposes that option.
2. **You cleared site data.** The vault handle lives in IndexedDB; clearing site storage clears it. You'll have to re-pick once.

## "My recent edits don't show up in search."

The search index is in-memory and updates as you edit. If results look stale:

- Run **Reindex vault** from the sidebar settings popover. See [Reindexing](./01-getting-started/reindexing.md).
- Check that the file is *actually* saved by looking at it in your file manager. Auto-save is fast but not instant; a `Cmd/Ctrl + S` ensures a flush.

## "I deleted a note and now it's still in the sidebar."

The sidebar refreshes on next load. If the file is gone but the sidebar entry remains, run **Reindex vault**.

## "Wikilinks turned red after I renamed something."

The link graph rebuilds automatically on rename inside the app. If you renamed the note *outside* the app (in your file manager, via a script), run **Reindex vault**.

## "AI chat says my key doesn't work."

A few things to check:

- Did you copy the key with surrounding whitespace? Trim it.
- Is the key from the right provider? Anthropic keys don't work in OpenAI's slot.
- For AWS Bedrock, did you set the **region** correctly? A wrong region hits a different endpoint.
- Click **Test connection** in the sidebar settings popover — it makes a minimal probe call and surfaces the provider's error.

## "The AI says it has no MCP tools."

- Open **Settings → MCP servers**. Each server has a status pill — only servers showing **Connected** advertise tools to the model.
- A pill stuck on **DISABLED** with the toggle on means the connection didn't even attempt; flip the toggle off and on again.
- **Error** with "Authorization header is badly formatted" — the token is wrong. Edit the server and replace it.
- **Error** with a CORS-style message — the server doesn't allow browser origins. There's no workaround; pick a different MCP server.
- See [MCP servers](./08-ai/mcp-servers.md).

## "AI suggested an edit but Apply errors out."

The model proposes `edit_note` with a specific `find` substring. If you've edited the active note since the proposal — even to add a space — the substring may no longer match uniquely, and Apply errors out with a "find string not found" or "matches more than once" message.

Two fixes:

- Discard the card and ask the model to retry. It'll see the current note and propose against the latest content.
- Apply the change manually if the diff is small.

## "My recovered content overwrote the disk version when I clicked the wrong button."

The recovery dialog preserves the disk version as a [history snapshot](./10-history/browsing-history.md). Open the history panel and restore.

## "PDF export looks weird."

The PDF output is the browser's print rendering. If a section looks broken:

- Try a different browser (different print engines lay out differently).
- Check the print preview — sometimes a custom CSS rule conflicts.
- For very long tables or wide content, the browser cuts at unexpected points; consider extracting that content to a separate note.

## "The app is slow on my big vault."

Performance budgets the app is tuned to:

- Up to several thousand notes, the index builds in well under a second.
- Past tens of thousands, the index build takes a noticeable few seconds. Typing stays fast (the worker keeps it off the main thread).

If you're past those scales:

- Use the file explorer for bulk reorganization, not the sidebar.
- Avoid filters that fan out to every note (a global graph view of 50,000 nodes is heavy).
- Consider splitting into multiple vaults if the content is naturally grouped.

## "Nothing on this page covers my issue."

- Check the [README](../README.md) for design-rationale notes that sometimes explain odd behavior.
- File an issue on the project's repo with a reproduction.

## References

- [[Browser support]]
- [[Reindexing the vault]]
- [[Browsing history]]
