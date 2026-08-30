---
id: 7c41e3b8-9d2a-4e6f-b1c0-3a8d5e7f9b2c
title: MCP servers
createdAt: 2026-05-11T00:00:00.000Z
updatedAt: 2026-05-11T00:00:00.000Z
---
# MCP servers

The **Model Context Protocol** is a standard for letting AI assistants call remote tools — search Cloudflare docs, query a GitHub repo, look up a Linear issue, fetch a Hugging Face model card. Configure an MCP server and its tools become part of the same chat surface as the built-ins (`search_vault`, `edit_note`, etc.).

The assistant doesn't gain new "skills" — it gains new tools it can decide to call. You don't have to invoke them by name; the model picks one when the request needs it.

## Adding a server

Open **Settings → MCP servers** (gear icon in the sidebar, then the MCP tab).

Click **+ Add an MCP server**. Two input modes:

- **Form** — name, endpoint URL, transport (HTTP or SSE), optional headers.
- **JSON** — paste a Claude Code / Claude Desktop config and let the app parse it. One paste can add many servers in a single step.

The JSON shape the importer accepts:

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "type": "http",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

A flat single-server object (`{"name": "...", "url": "...", ...}`) or an array of them also works. If you re-paste a config whose URL matches an existing server, the existing row is updated rather than duplicated.

## Transports

| Transport | When to use |
| --- | --- |
| **HTTP** | Modern "Streamable HTTP" servers. Default. |
| **SSE** | Legacy Server-Sent Events servers. Some hosted MCPs still require this; the server's docs will say. |

Both run entirely in your browser — no proxy server, no backend.

## Authentication

Static headers only. The most common pattern is `Authorization: Bearer <token>`, but any header the server expects can be added. Headers live in your browser's `localStorage`, in the same place as provider API keys, and are sent only to the configured URL.

**OAuth is not yet supported.** Servers that require an OAuth handshake (Linear, Notion, Atlassian, Asana, Stripe, Sentry, and many others) can't be added with this form because the browser can't complete their auth flow. PAT-style bearer tokens work fine.

## Status pills

Each configured server has a status badge next to its name:

| Pill | Meaning |
| --- | --- |
| **Connected** | The handshake succeeded. The server's tool count is shown next to the transport. |
| **Connecting** | The transport is still handshaking. Usually transient. |
| **Error** | The connection failed. The error message is shown inline next to the transport. |
| **Disabled** | The toggle is off. Flip it on to attempt a connection. |

The error message comes straight from the server or transport, so if it says "Authorization header is badly formatted", the token is bad; if it's a CORS error, the server doesn't allow browser origins.

## Per-server actions

- **Test** — opens a short-lived connection just long enough to list the tools, then closes it. The toast tells you how many tools the server advertises (or what went wrong).
- **Edit** — change the URL, headers, or transport. Saving a change tears down the live connection and reconnects with the new config.
- **Delete** — removes the server. The chat immediately loses access to its tools.
- **Enable toggle** — flip a server off without deleting. Tokens and config are preserved.

## How MCP tools surface in chat

Once a server is **Connected**, its tools join the assistant's tool list. They're namespaced as `mcp__<server>__<tool>` so they don't collide with built-ins. The model sees a short bullet for each one in the system prompt with the description the server advertised.

In a conversation, MCP tools behave like the built-in read-only tools: the chat drawer **auto-executes** them and feeds the result back to the model on the next turn, so the assistant can summarize what came back. You don't see a per-call approval card. The only exception is a tool the server explicitly flags as `destructiveHint: true` — those still go through the Apply / Discard flow.

If the model claims it has no MCP tools available, the most likely cause is that no server is in the **Connected** state. Open Settings → MCP and check the pills.

## Browser limits

- **No stdio servers.** This client speaks HTTP and SSE only — anything that runs as a local subprocess isn't reachable.
- **CORS matters.** The target server must respond with permissive CORS for your origin (e.g. `https://notes.example.com` or `http://localhost:3000`). Many hosted MCPs reject browser origins; the **Test** button is the fastest way to find out.
- **No OAuth.** See above.

## Known to work in-browser

These public MCP servers connect from the browser without OAuth:

- **DeepWiki** — `https://mcp.deepwiki.com/mcp` (HTTP). Wikipedia-style structured docs for GitHub repos.
- **Cloudflare docs** — `https://docs.mcp.cloudflare.com/sse` (SSE). Search and read Cloudflare documentation.
- **Hugging Face** — `https://huggingface.co/mcp` (HTTP) with a bearer token. Model cards, datasets, papers.
- **Context7** — `https://mcp.context7.com/mcp` (HTTP) with an API key. Library and framework docs.

Other servers may work too — pick one whose docs explicitly mention a remote HTTP/SSE endpoint.

## Privacy

- The server URL and any headers live in your browser's `localStorage`. They are never sent to the host this app is loaded from.
- Tool calls go directly from your browser to the configured MCP server.
- See [Privacy](./privacy.md) for the full picture.

## References

- [[Tools overview]]
- [[Chat drawer]]
- [[AI privacy]]
