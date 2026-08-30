# Note

[![CI](https://github.com/heyphat/note/actions/workflows/ci.yml/badge.svg)](https://github.com/heyphat/note/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A local-first markdown notebook that runs entirely in your browser, writes plain `.md` files to a folder you choose, and brings AI to your notes without sending them through anyone's server.

**[Try it →](https://notes.phat.vn)** · [Getting started](#getting-started) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

<!-- screenshot or short demo GIF goes here -->

> **Requires a Chromium-based browser.** The vault is built on the File System
> Access API, which Firefox and Safari do not implement.

## Why another note app?

Most note apps want to host your data — they sync to a service, lock you into a proprietary format, and ship a native app for every platform. The ones that don't tend to live on the desktop and feel disconnected from the modern web.

Note picks a different point in the design space: a serious editor that lives in a browser tab, writes ordinary markdown files to a folder you control, and treats AI as a tool you bring rather than a service you subscribe to. There is no signup, no cloud, no telemetry, and nothing to migrate to or away from. Your notes are already files in a folder. The app is just one way to read and write them.

## Philosophy

The rules the project tries not to break:

- **Your data is your data.** Notes are plain `.md` files with YAML frontmatter, in a folder *you* pick. No database, no opaque blob, no proprietary index that has to be rebuilt elsewhere.
- **No server, no account.** There is no signup screen, no sync service, no telemetry. The page you load is static; everything happens in your tab.
- **Open formats over clever ones.** Diagrams stay as Mermaid or Excalidraw source inside fenced code blocks. Wikilinks are written `[[like-this]]`. Anything Note understands is also understood by a plain text editor and by other tools that follow the same conventions.
- **AI is a tool you bring, not a service we sell.** When you turn on AI features, you paste your own API key. Requests go directly from your browser to the provider you chose. The hosting machine sees neither the key nor the prompt.
- **Boring tech where it counts.** Next.js, Tailwind, plain React hooks. No state-management framework, no plugin runtime, no abstraction layers waiting to be replaced.

## What makes Note different

Plain claims, in no particular order:

- Lives in a folder you own, not a service you sign into.
- Plain markdown files, with portable conventions: wikilinks, transclusion, and a `.assets/` folder for embedded files. Open the same vault in any text editor.
- WYSIWYG markdown editing — a real document surface, not a textarea with a side-by-side preview.
- Diagrams as source. Mermaid and Excalidraw both live inside the markdown; the picture you see is regenerated at view time.
- AI you bring. Anthropic, OpenAI, or Google, with your own key, called directly from the browser. Conversations are saved into the vault as markdown so they're searchable and version-controllable alongside everything else.
- Full-text search and saved searches, all client-side.
- Cross-tab consistency: the app keeps multiple open tabs in agreement on the current vault state.
- Per-note history snapshots so you can go back without setting up git.
- Bilingual UI out of the box (English, Vietnamese), powered by `next-intl`.
- Runs in a browser tab. No installer, no auto-updater, no native shell to keep alive.
- No accounts, no telemetry, no plugin marketplace, no upgrade path that involves a credit card.

Things Note deliberately does *not* do today: ship a mobile app, host a sync service, expose a third-party plugin API, or encrypt your files (your filesystem already does that, if you want it to).

## Feature highlights

- **Editor.** Milkdown (Crepe) on ProseMirror — tables, code blocks, task lists, callouts, footnotes, slash commands. Focus mode, typewriter mode, narrow editor, zen mode, lock mode.
- **Wikilinks and transclusion.** `[[note]]`, `[[note#section]]`, `![[note]]`, `![[note#section]]`. The transclusion preview is rendered inline in the editor.
- **Diagrams.** Mermaid (`​```mermaid`) and Excalidraw (`​```excalidraw`) blocks, lazy-loaded and rendered to SVG on view.
- **AI chat drawer.** Bound to a note via `Cmd/Ctrl + \`. Streaming responses. Tool calls: `edit_note` for find-and-replace edits, `rewrite_note` for full rewrites. Threads are saved in the vault under `.assets/chats/`.
- **MCP servers.** Connect remote Model Context Protocol servers over StreamableHTTP or SSE; their tools show up alongside the built-in ones in chat.
- **Skills.** Reusable instruction files in Anthropic's Skills format, kept in `.assets/skills/` and loaded by the model on demand.
- **Templates.** Note templates in `.assets/templates/`, with variables interpolated when you insert one.
- **Tasks.** A vault-wide task list with kanban board, recurrence, due-date parsing, and filtering.
- **Canvas.** A [JSON Canvas](https://jsoncanvas.org)-compatible spatial surface for arranging notes and files.
- **Price charts.** A `price-chart` fenced block containing CSV renders as an inline candlestick chart.
- **Search.** Client-side full-text search via MiniSearch, with saved searches.
- **Backlinks and graph.** Side panel of incoming wikilinks; graph view for the whole vault.
- **PDF export.** Print-driven, fully client-side.
- **Pomodoro / focus session.** Quick chip in the toolbar.
- **History snapshots** kept per-note so you can step back through revisions.
- **i18n.** English and Vietnamese.

## How it works (architecture in five bullets)

- Next.js 15 App Router serves the static UI. There is no backend; the host only delivers HTML, JS, and CSS.
- Storage is the **File System Access API**: when you open a vault, the browser hands the app a `FileSystemDirectoryHandle` for the folder you picked, and reads/writes happen against that handle. The app remembers the handle across sessions via IndexedDB so you don't repick every time.
- A `NoteStore` interface (`src/lib/storage/types.ts`) abstracts the file operations the rest of the app needs. The only implementation today is `BrowserFsStore`.
- State is plain React hooks; UI prefs are persisted to `localStorage`, notes themselves to the vault folder.
- The editor is Milkdown; diagrams, wikilinks, transclusion, and AI tools are layered on as plugins around it.

## Getting started

**Requirements:** Node.js >= 22 (`.nvmrc` pins 24, the version CI builds against) and a Chromium-based browser — the vault relies on the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API#browser_compatibility), which Firefox and Safari do not implement.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>:

1. Click **Choose folder…** and pick a folder on your machine. That folder is your vault — Note will read and write directly inside it.
2. (Optional) Open **Settings → AI**, pick a provider (Anthropic, OpenAI, or Google), and paste an API key. The key is stored in this browser only.
3. Press `Cmd/Ctrl + N` (or the menu) to create your first note.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 (regenerates the docs bundle first) |
| `npm run build` | Production build (regenerates the docs bundle first) |
| `npm start` | Serve the production build |
| `npm test` | Vitest suite (1037 tests) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `next lint` |
| `npm run build:docs` | Rebuild `public/docs-bundle/` from `docs/` by hand |

`public/` is generated, not source — `scripts/build-docs-bundle.mjs` rebuilds it from `docs/` on every `predev`/`prebuild`, and it is gitignored.

## Deploying

Note has no database and no state to provision. Whatever you deploy only serves
the UI — vault content and API keys never reach it.

**Vercel** — import the repository; the defaults work. `prebuild` regenerates
the bundled docs vault during the build.

**Docker** — a multi-stage `Dockerfile` is included:

```bash
docker build -t note .
docker run --rm -p 3000:3000 note
```

**Any Node host** —

```bash
npm ci && npm run build && npm start
```

Serve it over **HTTPS**. The File System Access API is a secure-context feature,
so on plain HTTP the vault picker will not work anywhere except `localhost`.

A fully static export (`output: 'export'`) is not currently possible: the app
uses next-intl middleware for locale routing, plus optional API routes for the
Bedrock and Vertex proxies. Both need a running server, however thin.

## Where your notes live

Notes are written directly to a folder *you* pick on your own machine, via the browser's File System Access API. There is no server-side storage. The hosting machine — Vercel, your VPS, or `npm run dev` on your laptop — only serves the static UI; it never sees note content.

**Browser support**: Chrome, Edge, Brave, Arc, Opera, and other Chromium browsers ship the File System Access API today. Firefox and Safari do not, and the app will tell you so when you try to open a vault.

Self-hosting isn't required for privacy reasons (the host can't read your notes regardless), but the app is small enough that putting it on your own domain is a one-command deploy if you prefer.

## Vault layout on disk

```
my-vault/
  getting-started.md
  projects/
    q1-plan.md
  .assets/
    abc123.png
    diagram.excalidraw
  .assets/chats/
    getting-started__2026-04-25-1430.md
```

- **Notes** are markdown files with YAML frontmatter. The frontmatter holds `id`, `title`, `createdAt`, `updatedAt`. Anything else you add survives round-trips.
- **`.assets/`** is the global asset folder for the vault. Images you paste into a note land here with a UUID name; the markdown references them with a relative path like `.assets/abc123.png`.
- **`.assets/chats/`** holds AI conversation threads, anchored to the note that started them. They're plain markdown — you can grep them, version them, or delete them.

You can move the entire folder, sync it through Dropbox / iCloud / Syncthing, or open it in another editor. Note is one way of reading the vault, not its owner.

## AI: how the keys flow

When AI is enabled, requests go in a straight line:

```
your tab  →  api.anthropic.com  /  api.openai.com  /  generativelanguage.googleapis.com
```

The hosting machine is not in that path. It can't read your key, your prompt, or the model's response.

- **Cost.** You pay your provider directly, pay-as-you-go. There is no subscription on Note's side because there is no Note's side.
- **Privacy.** Your privacy with respect to the model is whatever your chosen provider's terms say it is.
- **Switching providers.** Each provider's key is stored independently, so you can keep all three configured and flip between them without re-pasting.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + K` | Command palette |
| `Cmd/Ctrl + \` | AI chat drawer |
| `Cmd/Ctrl + S` | Flush pending saves |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `Cmd/Ctrl + .` | Zen mode (Esc to exit) |
| `Cmd/Ctrl + N` (macOS) / `Ctrl + Alt + N` | New note |
| `Cmd/Ctrl + Shift + F` | Focus mode |
| `Cmd/Ctrl + Shift + E` | File explorer |
| `Cmd/Ctrl + Shift + T` | Typewriter mode |
| `Cmd/Ctrl + Shift + M` | Narrow editor |
| `Cmd/Ctrl + Shift + O` | Table of contents |
| `Cmd/Ctrl + Shift + Y` | Word count |
| `Cmd/Ctrl + Shift + S` | Spell check |
| `Cmd/Ctrl + Shift + H` | History panel |
| `Cmd/Ctrl + Shift + L` | Lock editor |
| `Cmd/Ctrl + Shift + B` | Backlinks panel |
| `Cmd/Ctrl + Shift + G` | Graph view |
| `Cmd/Ctrl + Shift + P` | Pomodoro / focus session |
| `Cmd/Ctrl + Shift + D` | Cycle theme |
| `Cmd/Ctrl + Shift + X` | Close active note |

## Roadmap

Short and honest. Things being looked at but not committed:

- A mobile build via Capacitor (the storage layer is already an interface, so the work is mostly a new adapter and touch-friendly polish).
- A "share a note" feature backed by a user-configured cloud bucket — keeps the no-server promise intact.

Things that aren't planned:

- A third-party plugin API.
- A hosted sync service.
- Built-in encryption (your filesystem already covers this if you need it).

## Acknowledgements

Built on the shoulders of [Milkdown](https://milkdown.dev/), [Excalidraw](https://excalidraw.com/), [Mermaid](https://mermaid.js.org/), [MiniSearch](https://lucaong.github.io/minisearch/), [next-intl](https://next-intl-docs.vercel.app/), and the [Vercel AI SDK](https://sdk.vercel.ai/).

## Contributing

Issues and pull requests are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)**
for setup, project layout, and what a reviewable PR looks like. Participation is
governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security problem? Please report it privately — see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Phat Huynh

Note bundles a number of open source projects, all under permissive licenses
(MIT, Apache-2.0, BSD, ISC). See the [Acknowledgements](#acknowledgements) above
and each package's own license for details.
