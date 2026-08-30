# Contributing to Note

Thanks for taking the time. This document covers how to get the project
running, what the codebase looks like, and what a reviewable pull request
looks like here.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

Note has a small number of design commitments that shape what gets merged.
They are described at length in the [README](README.md#philosophy); the short
version:

- **No server.** The host serves static files. Vault content, note titles, and
  search indexes never reach it. A feature that needs a backend should be
  proposed as an opt-in adapter behind an interface, not a hard dependency.
- **No accounts, no telemetry.** Nothing phones home. There is no analytics
  hook to add "just one" event to.
- **Bring your own key.** AI requests go from the browser straight to the
  provider the user chose. Nothing proxies them by default.
- **Open formats.** Diagrams stay as Mermaid or Excalidraw source inside the
  markdown. Wikilinks are `[[like-this]]`. If a plain text editor can't make
  sense of what we wrote to disk, we wrote the wrong thing.
- **Lean dependencies.** Every package added shows up in someone's bundle. A PR
  that adds a dependency should say why the alternative — writing the ~50 lines
  ourselves — is worse.

Features that conflict with these are not rejected because they're bad ideas;
they're rejected because they'd make this a different project.

## Getting set up

**Requirements:** Node.js >= 22 (`.nvmrc` pins 24) and a Chromium-based
browser. Firefox and Safari do not implement the
[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API#browser_compatibility),
which is how the vault works, so the app cannot run there.

```bash
npm install
npm run dev     # http://localhost:3000
```

On first launch the app mounts a bundled read-only docs vault. Click
**Choose folder…** to point it at a real folder instead.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 (regenerates the docs bundle first) |
| `npm run build` | Production build (regenerates the docs bundle first) |
| `npm start` | Serve the production build |
| `npm test` | Vitest suite |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `next lint` |
| `npm run build:docs` | Rebuild `public/docs-bundle/` from `docs/` by hand |

## Layout

```
src/
  app/          Next.js App Router. `[locale]/page.tsx` is the application
                shell; `api/ai/` holds the only server code in the project
                (optional Bedrock and Vertex proxies).
  components/   React components. Colocated `*.test.tsx` next to each.
  hooks/        Plain React hooks. State lives here, not in a store library.
  lib/          Framework-free logic: storage, search, wikilinks, tasks,
                markdown, AI streaming and tools. Most of the test suite
                lives here too.
  i18n/         next-intl routing and request config.
docs/           The bundled first-launch vault, per locale (en, vi).
locale/         UI strings, one JSON per locale.
scripts/        Build-time scripts. `build-docs-bundle.mjs` turns docs/ into
                the JSON payload the app fetches on first launch.
```

Two things that surprise people:

- **`public/` is generated, not source.** `scripts/build-docs-bundle.mjs`
  rebuilds it from `docs/` on every `predev`/`prebuild`, and it is gitignored.
  Never hand-edit anything under `public/` — edit `docs/` instead.
- **Storage goes through an interface.** `src/lib/storage/types.ts` defines
  `NoteStore`; `BrowserFsStore` is the real implementation and
  `BundledDocsStore` serves the read-only first-launch vault. Code outside
  `src/lib/storage/` should talk to the interface, not the File System Access
  API directly.

## Making a change

1. **Branch off `main`.**
2. **Write a test.** Logic in `src/lib/` is straightforward to test and nearly
   all of it is. Use `src/utils/test/fake-store.ts` when you need a `NoteStore`.
3. **Update both locales.** UI strings live in `locale/en.json` and
   `locale/vi.json`. A key added to one and not the other will render as a raw
   key at runtime. If you don't write Vietnamese, add the English string to
   both and say so in the PR — a native speaker can correct it.
4. **Run the checks:**

   ```bash
   npm run typecheck && npm run lint && npm test
   ```

   CI runs all three plus a production build, on Node 22 and 24. Lint currently
   emits some pre-existing `react-hooks/exhaustive-deps` warnings; please don't
   add new ones, and don't silence existing ones with a blanket disable.

5. **Open the PR.** Describe what changed and why. If it's user-visible, say
   how you verified it in the browser — the editor, storage, and AI layers have
   behavior that tests don't fully capture.

## Testing notes

The suite is [Vitest](https://vitest.dev/) with jsdom and Testing Library.
Tests are colocated (`foo.ts` → `foo.test.ts`).

One test file (`src/lib/wikilink/wikilink-plugin.test.tsx`) mounts the real
Milkdown editor and is gated behind `RUN_FULL_EDITOR=1`. Crepe doesn't hydrate
cleanly under jsdom — a schema timer race surfaces as `Timer 'SchemaReady' not
found` during plugin registration — so those assertions are skipped by default.
A skipped file in the summary is expected, not a broken suite. The pure-parser
path it guards is covered exhaustively in `src/lib/links/link-parser.test.ts`.

For AI work, `chatStream` and the tool executors are tested by mocking `fetch`
and the `ai` SDK rather than by calling providers. Please keep it that way —
the suite must run offline with no keys.

## Reporting bugs

Open an issue with the browser and OS, what you expected, and what happened.
Since the vault is plain files, a minimal `.md` file that reproduces the
problem is the single most useful thing you can attach.

Security problems go through [SECURITY.md](SECURITY.md) instead — please don't
open a public issue for those.
