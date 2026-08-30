## What this changes

<!-- What does this do, and why? Link the issue it closes, if any. -->

## How it was verified

<!--
Tests are necessary but usually not sufficient here — the editor, storage, and
AI layers have behavior jsdom doesn't capture. Say what you did in the browser.
-->

- [ ] `npm run typecheck`
- [ ] `npm run lint` (no new warnings)
- [ ] `npm test`
- [ ] Exercised in the browser

## Checklist

- [ ] UI strings added to **both** `locale/en.json` and `locale/vi.json`
- [ ] No new dependency, or the PR explains why one is warranted
- [ ] Vault content still reads/writes as plain markdown
- [ ] Nothing new is sent to the server (no telemetry, no note content, no keys)
- [ ] Docs under `docs/` updated if user-facing behavior changed
