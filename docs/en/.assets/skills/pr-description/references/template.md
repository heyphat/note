# {Title in imperative mood, under 72 chars}

## Summary

{One paragraph, max three sentences. State what the PR changes and the user-visible effect. No implementation detail here — that belongs in `## How` below.}

## Why

{Link to the incident, ticket, design doc, or user report that motivated the change. If this is a tech-debt cleanup with no external driver, say "tech debt" and name the smell ("repeated parsing logic", "unused config branch", etc.).}

## How

{Only fill this in when the approach is non-obvious. For a straight refactor or a single-line bug fix, write `_Approach is self-evident from the diff._` and move on. For a non-trivial change, describe:
- The shape of the solution
- Alternatives considered and why they were rejected
- Any new abstractions introduced

Keep it under 5 bullets. If you need more, link out to a design doc.}

## Risk

{Spell out anything a reviewer should know before merging:
- Data migrations or schema changes
- Deploy ordering or coordination with another service
- Feature flag state at merge time
- Rollback path if something breaks

Write `_N/A._` if there genuinely isn't one. Leaving it blank invites suspicion.}

## Test plan

{Two parts:

**Automated:** which existing tests cover this, plus any new tests added. Name them by file:line.

**Manual:** the smoke test a reviewer should run locally. Specific steps, not "test it". Example:
1. `pnpm dev`
2. Open `/inbox`
3. Drag a note from the unsorted folder onto an empty day
4. Confirm the date pill updates and a save indicator flashes

If there is no manual test (because the change is purely internal and the automated suite is sufficient), say so explicitly.}

## Screenshots / videos

{For UI changes only. One screenshot per discrete state change. For a video, use a Loom link rather than embedding — keeps the PR description scannable.}
