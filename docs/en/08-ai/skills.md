---
id: f4d2a9c7-3e8b-4c1d-9a76-2b5e8d1f0c4a
title: Skills
createdAt: 2026-05-14T00:00:00.000Z
updatedAt: 2026-05-14T00:00:00.000Z
---
# Skills

A **skill** is a markdown file that teaches the assistant how to do a specific recurring task in your vault — write a weekly recap, draft a pull-request description, run a meeting prep checklist. The model sees a list of available skills by name + short description; when one applies, it pulls the body into context and follows the instructions you wrote.

Skills live as plain markdown under `.assets/skills/`. They're version-controllable, grep-able, and travel with your vault.

## Skill vs. tool vs. template

Three nearby concepts that are easy to conflate:

| | What it is | How it ships |
| --- | --- | --- |
| **Skill** | Instructions, examples, references for a task the model should follow | `.assets/skills/<name>.md` |
| **Tool** | A function the model can call — read, search, edit, fetch | Built-in or via [MCP server](./mcp-servers.md) |
| **Template** | A starting body for a new note (no AI involvement) | `.assets/templates/<name>.md` |

A skill is a prompt augmentation. The model can't "execute" a skill on its own — it loads the body and decides what to do next. If the skill describes a multi-step process, the model will call tools (`read_note`, `edit_note`, `manage_tasks`, MCP, …) to carry it out.

## Anatomy

Every skill has YAML frontmatter with two required fields:

```markdown
---
name: weekly-recap
description: Generate a structured weekly recap from this week's notes
---
# Weekly recap

Search the vault for notes updated in the last 7 days. Group them into:
- Wins
- Blockers
- Decisions
- Next-week priorities

Output as a single markdown note with a `## ` heading per group. Cite source notes by wikilink.
```

- **`name`** — what the model calls when invoking the skill. Must be unique across the whole vault.
- **`description`** — one short line. The model decides whether the skill applies based on this alone, so write it like a topic, not a sales pitch ("Generate a weekly recap from this week's notes", not "Best-in-class summarization!").

Extra frontmatter keys (`version`, `author`, `license`, anything else) round-trip unchanged through every save — useful when importing skill bundles from elsewhere.

## Two on-disk shapes

### Single-file

`.assets/skills/weekly-recap.md` — the whole skill, frontmatter + body, in one file. Best for skills that fit comfortably in a few hundred lines.

### Folder bundle

```
.assets/skills/pr-description/
├── SKILL.md
└── references/
    └── template.md
```

`SKILL.md` carries the frontmatter and primary instructions. Sibling files (markdown, code samples, schemas) live alongside; the body refers to them by relative path. The model can pull them on demand via `read_skill_file({name, path})`, so a long reference doesn't have to ride along in every invocation.

Use a folder bundle when:

- the body references concrete examples that would bloat the main instruction file
- the skill ships with templates, JSON schemas, or worked examples
- you're importing an upstream skill bundle from elsewhere (the format is interoperable with Anthropic skill bundles)

The folder name is the skill's id on disk. Renames update the frontmatter `name`; the folder name stays put so relative paths inside the body don't break.

## Where to put them

| Layout | What for |
| --- | --- |
| `.assets/skills/<name>.md` | Top-level single-file skill |
| `.assets/skills/<basename>/SKILL.md` | Top-level folder bundle |
| `.assets/skills/<category>/<name>.md` | Nested single-file inside a category folder |
| `.assets/skills/<category>/<basename>/SKILL.md` | Nested folder bundle |

Category folders are purely organizational — they don't show up to the model, just in the sidebar. Two skills can't share a `name` even if they live in different categories.

## Sample skills in this vault

Two examples live under `.assets/skills/` so you can see both shapes side by side:

- **weekly-recap** — single-file. A prompt template for a Friday-afternoon summary of the week's notes.
- **pr-description** — folder bundle. A PR-description drafter, with a reference template the skill points at via `read_skill_file`.

Open them in the sidebar (the Skills section under your vault) to inspect the frontmatter and body. Copy either into your own vault to adapt.

## How the model uses skills

The chat drawer surfaces skills only when edit tools are enabled (i.e. when the model could plausibly act on the result). In every system prompt the model sees:

```
## Available skills
- weekly-recap: Generate a structured weekly recap from this week's notes
- pr-description: Draft a clear pull request description from a diff
```

When the model decides a skill applies, it calls `load_skill({name})`. The body comes back; the model treats it as additional system-level instruction for that turn and proceeds. For folder bundles, the response also lists the aux files — the model can call `read_skill_file({name, path})` to pull any of them.

There's no "Apply" gate on `load_skill` — it's read-only, like search and read tools, so it runs automatically.

## Authoring tips

- **Start with the description.** It's the only thing that decides whether the model picks the skill, so spend the most attention there.
- **Write the body as instructions to a teammate, not a model.** "Find notes updated in the last 7 days, then …" reads better than "You will now …".
- **Cap each skill at one task.** Bundle related sub-tasks under a single skill body. If two skills overlap by more than a sentence, merge them.
- **Reference concrete tool names** (`search_vault`, `read_note`, `edit_note`, `manage_tasks`) when the skill expects a specific tool flow. The model knows these by name.
- **For folder skills, point at aux files explicitly.** "See `references/template.md` for the output structure" gives the model a clear cue to call `read_skill_file`.

## URLs and stability

The browser address bar carries `/skills/<uuid>`, where the UUID is the frontmatter `id` field. The app stamps one on first open and never re-rolls it, so the link survives renames, moves, and folder reorganizations. The on-disk filename can change freely without breaking bookmarks.

## What skills can't do

- **Call tools the model doesn't already have.** A skill that says "use the `linear_search` tool" only works if a [MCP server](./mcp-servers.md) named `linear` is configured.
- **Mutate state directly.** Skills are read-only as far as the storage layer is concerned — `load_skill` doesn't write anything. Mutations happen through the edit tools the skill instructs the model to call, and those still surface as proposed-edit cards you Apply.
- **Run without edit tools.** If the chat thread has edit tools disabled, the model doesn't see the skills section at all. Read-only chats skip the load.

See also: [Tools overview](./tools-overview.md), [Edit tools](./tools-edit.md), [MCP servers](./mcp-servers.md).
