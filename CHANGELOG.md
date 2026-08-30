# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-08-28

First public release.

### Added

- **Editor.** Milkdown (Crepe) on ProseMirror: tables, code blocks, task lists,
  callouts, footnotes, slash commands. Focus, typewriter, narrow, zen, and lock
  modes.
- **Local-first storage.** Vaults are ordinary folders opened through the File
  System Access API; notes are plain `.md` files with YAML frontmatter. The
  directory handle is remembered across sessions via IndexedDB.
- **Wikilinks and transclusion.** `[[note]]`, `[[note#section]]`, `![[note]]`,
  `![[note#section]]`, with inline transclusion previews and a backlinks panel.
- **Diagrams as source.** Mermaid and Excalidraw blocks stay as text in the
  markdown and render to SVG at view time.
- **AI chat drawer.** Bring your own key for Anthropic, OpenAI, or Google;
  requests go from the browser straight to the provider. Streaming responses
  with `edit_note` and `rewrite_note` tool calls. Threads are saved into the
  vault under `.assets/chats/`. Optional server-side proxy routes for Amazon
  Bedrock and Google Vertex.
- **MCP support.** Connect remote Model Context Protocol servers over
  StreamableHTTP or SSE; their tools join the AI chat's tool registry. A server
  that fails to connect is skipped rather than blocking the conversation.
- **Skills.** Reusable instruction files in Anthropic's Skills format, stored
  under `.assets/skills/` and loadable by the AI on demand.
- **Templates.** Note templates in `.assets/templates/` with variable
  interpolation at insert time.
- **Price charts.** A `price-chart` fenced block containing CSV renders as an
  inline candlestick chart via lightweight-charts.
- **Search.** Client-side full-text search via MiniSearch, plus saved searches.
- **Tasks.** Task list, kanban board, recurrence, and due-date parsing.
- **Canvas and graph.** A JSON Canvas-compatible surface and a whole-vault
  graph view.
- **History.** Per-note snapshots with a diff viewer.
- **PDF export**, print-driven and fully client-side.
- **Pomodoro / focus sessions.**
- **Cross-tab consistency** so multiple open tabs agree on vault state.
- **Bilingual UI** (English and Vietnamese) via `next-intl`.
- **Bundled docs vault** shown on first launch, generated from `docs/` at build
  time.

[Unreleased]: https://github.com/heyphat/note/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/heyphat/note/releases/tag/v0.1.0
