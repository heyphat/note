---
id: 917a50dd-c33b-4059-a104-0cc0e7905a78
title: Chat drawer
createdAt: 2026-05-09T14:52:31.430Z
updatedAt: 2026-05-09T14:52:31.430Z
---
# Chat drawer

The chat drawer is the AI's home in the app. Open it with `Cmd/Ctrl + \`. It slides in from the side and stays anchored to the **active note**.

## Anatomy

- **Conversation feed** — your messages and the assistant's responses, in order. Markdown is rendered (lists, code blocks, callouts) the same way it would be in a note.
- **Composer** — where you type your next message. Multiline supported.
- **Model picker** — switch between configured providers / models.
- **Thread list** — every saved thread for the active note is a clickable item. A new note has zero threads until you start one.

## How a conversation works

1. You ask a question.
2. The app sends the message to the configured provider, with system context that includes the active note's content and a short list of vault folders.
3. The model can either reply directly or call a **tool** (search the vault, read another note, edit the open note, create a note, manage a task, or any tool advertised by a configured [MCP server](./mcp-servers.md)). Tools surface in the conversation as cards you can review.
4. **Read-only tools** (`search_vault`, `search_tasks`, `read_note`, plus most MCP tools) auto-execute and feed their result back into the model's context. You see what was searched, but the app doesn't ask permission.
5. **Mutating tools** (`edit_note`, `rewrite_note`, `create_note`, `manage_tasks`, plus any MCP tool flagged destructive) render as **proposed-edit cards** with **Apply** and **Discard** buttons. Nothing changes on disk until you click Apply.
6. The model can take multiple turns and chain multiple tool calls before stopping.

See [Tools overview](./tools-overview.md), [Read tools](./tools-read.md), [Edit tools](./tools-edit.md), and [MCP servers](./mcp-servers.md).

## Streaming

Responses stream token-by-token. You can scroll back through a long answer while the rest is still generating; you can also stop a generation that's gone off the rails (the composer area shows a Stop button while a response is in flight).

## Threads on disk

Every thread is saved in `.assets/chats/` as a markdown file. The filename is `<note>__<timestamp>.md`:

```
.assets/chats/q1-plan__2026-04-25-1430.md
```

The contents are plain markdown — your messages, the assistant's responses, recorded tool calls. You can:

- **Search** chats with normal vault tools (the [tag cloud](../06-search/tags.md) won't help — chats live in `.assets/`, which the search index excludes — but you can grep the folder, or open the file directly).
- **Version** them in git, alongside the rest of the vault.
- **Delete** any thread you don't want; just remove the file.

## Selecting a thread

The thread list is per-note. Switching to a different note in the editor shows that note's threads. Threads from other notes are hidden until you switch back, but they aren't lost — they're files in `.assets/chats/`.

## Clearing chats

The sidebar settings popover has a **Clear all chats** action that removes every file from `.assets/chats/`. Use carefully; there's no undo.

## What the AI gets as context

By default, every conversation message includes:

- The full body of the active note.
- A list of folder names in the vault (so the model can pick a sensible folder when creating a new note).
- The conversation so far in this thread.

It does **not** automatically include other notes' contents. The model can pull other notes in via the [`read_note` tool](./tools-read.md) when it decides it needs them.

## Ending a thread

There's no explicit "end" — close the drawer or switch notes and the thread persists. Re-open it to keep going.

## References

- [[Tools overview]]
- [[Read tools]]
- [[Edit tools]]
- [[Tags]]
