---
id: 2c7e9b1d-4f6a-48c3-8d7e-5b2a3c9f1e6d
name: pr-description
description: Draft a clear pull request description from a diff or change summary the user provides
---
# PR description

Turn a raw diff (or a free-form description of changes) into a structured, reviewable PR description that lands the reader in the right context immediately.

## Procedure

1. The user provides the change — either as a diff, a description, or a link to the active note that captures it. If they haven't included the active note, ask before guessing.
2. Read `references/template.md` via `read_skill_file({ name: "pr-description", path: "references/template.md" })` to get the exact section structure to follow.
3. Skim the change for:
   - **What** changes (one sentence — start with a verb in present tense: "Adds X", "Renames Y", "Removes Z")
   - **Why** it changes (link to incident, ticket, or design doc; or describe the user-visible problem solved)
   - **How** it changes (only when the approach is non-obvious — don't recap obvious refactors)
   - **Risk** (data migration, deploy ordering, feature flag, rollback path) — explicit when present, omitted when truly N/A
   - **Test plan** (the smoke test a reviewer should run to verify the change locally, plus the automated tests added)
4. Fill the template fields. Leave any section explicitly marked `_N/A._` rather than deleting it.

## Output

Use `rewrite_note` if the user is in an empty PR draft note; otherwise `create_note` into the current folder named `pr-{branch-or-ticket}.md`. Apply the template structure exactly — reviewers parse PR descriptions by section heading, so the consistency matters more than prose flair.

## Rules

- One line for the title. Imperative mood ("Add X", not "Added X" or "Adding X"). Under 72 characters.
- The summary is one paragraph, max three sentences. Anything longer belongs in `## Why` or `## How`.
- Every claim about a behavior change must link to evidence: a code path, a test, a screenshot, or a `[[wikilink]]` to a design note.
- Don't fabricate test plans. If the change has no automated tests, say so explicitly in `## Test plan` — reviewers can decide whether that's acceptable for this PR.
- Skip the description if the diff is a pure formatting change. Tell the user to use the auto-generated commit message instead.

See `references/template.md` for the exact section structure.
