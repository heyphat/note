---
id: 15a63007-3adc-40a8-8956-7a5c27ebd659
title: Tools overview
createdAt: 2026-05-09T14:52:30.642Z
updatedAt: 2026-05-09T14:52:30.642Z
---
# Tools overview

The AI can call **tools** — small structured actions whose names and parameters the model is told about up front. When the model calls a tool, the chat drawer either runs it immediately (read-only) or surfaces it as a card for you to approve (mutating).

## The two kinds

| Kind | Example tools | Behavior |
| --- | --- | --- |
| **Read-only** | `search_vault`, `search_tasks`, `read_note`, plus most MCP tools | Auto-executed. The result is fed back into the conversation. You see *that* the call happened and what it found. |
| **Mutating** | `edit_note`, `rewrite_note`, `create_note`, `manage_tasks`, plus MCP tools the server flags `destructiveHint: true` | Rendered as a **proposed-edit card** with Apply / Discard. Nothing changes on disk until you click Apply. |

This split exists because read-only calls are reversible (the worst case is a wasted token round-trip) while mutating calls can change your notes — and you want to see exactly *what* before that happens.

## What a tool call looks like in the conversation

- **Read-only**: a small inline note like "🔍 search_vault — query: 'q1 plan', 4 hits" with the snippets visible if you expand. The model's reply uses the result.
- **Mutating**: a card showing the proposed change (a diff for `edit_note`, a new full body for `rewrite_note`, a draft note for `create_note`, a task mutation for `manage_tasks`). Two buttons: **Apply** and **Discard**.

## What "Apply" does

- For `edit_note` — replaces the matched substring in the active note. If the substring isn't unique anymore (because you've edited since the model proposed), Apply fails with a message and you can discard or ask the model to retry.
- For `rewrite_note` — replaces the entire body of the active note. Frontmatter is preserved.
- For `create_note` — writes a new file at the proposed path. Folder is created if missing.
- For `manage_tasks` — applies the proposed mutation (`create_task`, `complete_task`, `uncomplete_task`, `update_task`, `delete_task`) against the appropriate file in `.assets/tasks/`.

## What "Discard" does

Discards the proposal. The conversation continues, but the model is told the edit was rejected and can adjust.

## Why read-only tools auto-execute

If every search or read needed approval, the model couldn't do anything useful. A typical "summarize my recent notes" query involves several search and read calls; gating each one would make the experience unusable. Read-only tools are scoped tightly enough (no path traversal, no `.assets/`, hard caps on response size) that auto-execution is safe.

## What read-only tools *can't* read

The `read_note` tool is gated to the same paths the sidebar shows: `.md` files outside any dot-prefixed directory or `*.assets/` folder. So:

- Chat threads in `.assets/chats/` — **not readable**.
- Tasks in `.assets/tasks/` — **not readable** by `read_note` (use `search_tasks` for tasks).
- Hidden directories like `.git/` — **not readable**.

This protects you against a prompt-injected note (or a confused model) reading your AI conversation history back into a new conversation. See [Privacy](./privacy.md).

## MCP-sourced tools

Beyond the built-ins, any tool advertised by a configured [MCP server](./mcp-servers.md) joins the same list. They're namespaced as `mcp__<server>__<tool>` so a `search_cloudflare_documentation` tool from a server named `cloudflare-docs` becomes `mcp__cloudflare_docs__search_cloudflare_documentation`. The model is told about them in the system prompt and can call any of them by name.

MCP tools default to **auto-execute** — same behavior as the built-in read tools. A server can opt a specific tool into the approval flow by annotating it with `destructiveHint: true`; everything else runs immediately and feeds its result back to the conversation.

## Tool error handling

If a tool call fails — bad input, find-string not found, path traversal attempted, MCP server unreachable — the chat hook returns a structured error that the model sees on its next turn. The model can correct and retry. You see the error too, in the conversation, so you know why a proposed change didn't go through.

## References

- [[MCP servers]]
- [[AI privacy]]
