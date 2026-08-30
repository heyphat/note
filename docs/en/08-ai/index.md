---
id: 3e5b2c29-011b-4974-a872-8f14a694867d
title: AI
createdAt: 2026-05-10T12:13:59.437Z
updatedAt: 2026-05-10T12:13:59.437Z
---
# AI

Note ships with an AI chat drawer that knows about the notes in your vault and can propose edits to them. The model is whichever one you point the app at — Anthropic's Claude, an OpenAI model, or a Google Vertex / Gemini model. You bring the API key; the app handles the wiring.

Four things make Note's AI integration different from "an AI button in a notes app":

- **It's bring-your-own-key.** There's no Note subscription, no upsell, no proxy server in the path. Your tab talks directly to the provider.
- **It has tools.** The model can search your vault, read notes, edit the active note, create new notes, and manage tasks. Mutating tools surface as cards you Apply.
- **It speaks MCP.** Plug in any remote Model Context Protocol server — docs lookups, GitHub, Hugging Face — and its tools join the same chat surface as the built-ins.
- **Conversations are stored as markdown.** Every chat thread is saved in `.assets/chats/` as a regular `.md` file. Searchable, version-controllable, deletable.

## In this section

- [Providers and keys](./providers-and-keys.md) — Anthropic, OpenAI, Google. Where the keys go.
- [Chat drawer](./chat-drawer.md) — opening, threading, where conversations are stored.
- [Tools overview](./tools-overview.md) — read-only auto-runs vs. proposed-edit cards.
- [Read tools](./tools-read.md) — `search_vault`, `search_tasks`, `read_note`.
- [Edit tools](./tools-edit.md) — `edit_note`, `rewrite_note`, `create_note`, `manage_tasks`.
- [Skills](./skills.md) — teach the assistant how to do a recurring task from a markdown file.
- [MCP servers](./mcp-servers.md) — add remote tool servers to extend the assistant.
- [Ask about selection](./ask-about-selection.md) — quick-question shortcut from any text.
- [Privacy](./privacy.md) — what the provider sees, what the host sees (nothing).

## Quick start

1. Open the [sidebar settings](../13-navigation/sidebar.md) → **AI assistant** section.
2. Pick a provider, paste an API key.
3. Open the chat drawer with `Cmd/Ctrl + \`.
4. Ask something. The model can search the vault and propose edits to the open note.

Optionally, add remote tools the model can call: **Settings → MCP servers**. See [MCP servers](./mcp-servers.md).

If you don't want to use the AI features, you don't have to set anything up — every other feature in the app works without a key.
