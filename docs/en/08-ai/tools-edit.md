---
id: 5267123f-b873-47de-aef3-71f48198e711
title: Edit tools
createdAt: 2026-05-09T14:49:10.860Z
updatedAt: 2026-05-09T14:49:10.860Z
---
# Edit tools

Four tools the AI can call to change content. Each one surfaces in the chat drawer as a **proposed-edit card** with **Apply** and **Discard** buttons. Nothing changes on disk until you click Apply.

## `edit_note`

Find-and-replace a substring of the active note.

| Parameter | Notes |
| --- | --- |
| `find` (required) | The exact text to replace. Must appear *exactly once* in the note. |
| `replace` (required) | The text to replace it with. |

**On the card:** a diff showing the change.

**Apply behavior:** if the `find` string still matches uniquely, the substring is replaced and the note saves. If the string no longer matches uniquely (you've edited since the model proposed), Apply errors out and you can ask the model to retry.

This is the model's "scalpel" — small, surgical changes. The model is instructed to include enough surrounding context in `find` to make it unique.

## `rewrite_note`

Replace the entire body of the active note.

| Parameter | Notes |
| --- | --- |
| `new_content` (required) | The full new markdown body. Frontmatter is *not* part of this — the app keeps the existing frontmatter. |

**On the card:** a side-by-side or unified diff between old and new content.

**Apply behavior:** the body is overwritten in one shot. The previous body is recoverable through [history snapshots](../10-history/index.md).

Used for major restructuring where a hundred small `edit_note` calls would be worse than one rewrite.

## `create_note`

Create a brand-new note, distinct from the active one.

| Parameter | Notes |
| --- | --- |
| `title` (required) | Short title. Becomes the filename. |
| `content` (required) | Initial markdown. No frontmatter — the app writes it. |
| `folder` | Optional. Vault-relative path (e.g. `Projects/2025`). Empty = root. |

**On the card:** the proposed title, folder, and body preview.

**Apply behavior:** writes a new file at `<folder>/<title>.md`. If the folder doesn't exist, it's created. If a note with that name already exists, the app appends a uniqueness suffix.

The model uses this for "spin off this thread into a new note" or "create a meeting note for tomorrow."

## `manage_tasks`

A small family of mutations against task files in `.assets/tasks/`. The single tool surface dispatches on a `kind` discriminator.

| `kind` | Other params | Effect |
| --- | --- | --- |
| `create_task` | `title` (req), `status`, `priority`, `due`, `scheduled`, `tags`, `contexts`, `projects`, `body` | Creates a new task file. |
| `complete_task` | `path` (req), `completion_day` (defaults to today) | Marks the task complete (or adds today to `complete_instances` for recurring tasks). |
| `uncomplete_task` | `path` (req) | Reverses a completion. |
| `update_task` | `path` (req), `patch` (req) | Patches frontmatter. Only the keys in `patch` are changed. |
| `delete_task` | `path` (req) | Removes the task file. |

Dates are `YYYY-MM-DD`. Project references are wikilinks like `[[Q2 Launch]]`. The `path` argument is the filename inside `.assets/tasks/` — the model gets it from a previous `search_tasks` hit, not from a guess.

**On the card:** the operation kind plus a short summary of the change ("Create task: Draft Q2 plan, due 2026-05-20, priority high"). For `update_task`, the patch keys are listed.

**Apply behavior:** the chat hook routes the operation through the task store, which handles file naming, frontmatter merging, and recurrence side-effects.

## Why this design

Read-only tools auto-run because their worst case is a wasted token round-trip. Edit tools can *change your notes*, so they go through your eyes first. The card makes the proposed change *concrete* — not "the model said it would do X," but "here is the diff that will be applied."

You can also discard a card without commentary. The model is told it was rejected and can adjust on the next turn.

## References

- [[History and recovery]]
