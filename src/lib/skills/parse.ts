// Skill frontmatter validation. A "skill" follows the Anthropic Skills
// format:
//
//   ---
//   name: <unique identifier>
//   description: <one-line summary the model reads to decide if it applies>
//   ---
//
//   <body — instructions / examples>
//
// Only `name` + `description` are required (this matches Anthropic's
// published skills; they don't carry a `type` discriminator). Skills live
// under `.assets/skills/`, so the path is the discriminator — no need for a
// frontmatter flag.

import { parseFrontmatter } from '@/lib/frontmatter';

export interface ParsedSkill {
  name: string;
  description: string;
  /** Body of SKILL.md without the frontmatter delimiters. */
  content: string;
  /** Full frontmatter map (every key seen in the YAML, including custom ones
   *  like `version`, `author`, `license`). Storage preserves these on save —
   *  carrying them through the import path keeps that promise for skills
   *  pulled from disk / URL / GitHub instead of dropping everything except
   *  name + description. */
  frontmatter: Record<string, string>;
}

export interface SkillParseError {
  ok: false;
  reason: string;
}

export type SkillParseResult =
  | { ok: true; skill: ParsedSkill }
  | SkillParseError;

const MAX_NAME = 80;
const MAX_DESCRIPTION = 1024;

/** Parse a SKILL.md blob and validate its frontmatter. Returns the canonical
 *  parsed shape on success, or a structured error the import dialog can show. */
export function parseSkillMarkdown(raw: string): SkillParseResult {
  if (!raw || !raw.trim()) {
    return { ok: false, reason: 'The file is empty.' };
  }
  const { meta, content } = parseFrontmatter(raw);
  const name = (meta.name || '').trim();
  if (!name) {
    return { ok: false, reason: 'Missing `name` in the YAML frontmatter.' };
  }
  if (name.length > MAX_NAME) {
    return { ok: false, reason: `\`name\` is too long (${name.length} > ${MAX_NAME} chars).` };
  }
  const description = (meta.description || '').trim();
  if (!description) {
    return { ok: false, reason: 'Missing `description` in the YAML frontmatter.' };
  }
  if (description.length > MAX_DESCRIPTION) {
    return { ok: false, reason: `\`description\` is too long (${description.length} > ${MAX_DESCRIPTION} chars).` };
  }
  // Emit the raw frontmatter map so custom keys (`version`, `author`, etc.)
  // survive the round-trip into storage. `name` and `description` are
  // re-normalized at the top of the map; createSkill in the store layer
  // takes them as the source of truth and any duplicate keys in the rest
  // of `meta` will be overwritten on serialization there.
  return { ok: true, skill: { name, description, content, frontmatter: meta } };
}
