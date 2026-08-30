// `load_skill` — fetch the full body of a user-defined skill the user has
// added to this vault. Skills are listed by name + description in the
// "Available skills" section of the system prompt; the model calls this
// when a skill plausibly applies. Owns its schema/description, AI-SDK
// wrapper, and executor adapter against `NoteStore.getSkillByName`.

import { tool, jsonSchema } from 'ai';
import type { NoteStore } from '@/lib/storage';
import type { ReadOnlyToolName } from './index';

export const LOAD_SKILL_DESCRIPTION = 'Load the full body of a user-defined skill (instructions, examples, references) the user has added to this vault. Skills are listed by name + description in the "Available skills" section of the system prompt; call this tool when one of those descriptions plausibly matches the request. Returns the skill\'s body plus a manifest of auxiliary files for folder-bundle skills. **Important: prefer calling this BEFORE attempting any task it might apply to — skills carry concrete, vault-specific instructions that override your defaults.** Read-only and auto-executes.';

export const LOAD_SKILL_JSON_SCHEMA = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: {
      type: 'string',
      description: 'Exact `name` of the skill as listed in the "Available skills" section. Case-sensitive.',
    },
  },
} as const;

export interface LoadSkillInput {
  name: string;
}

export interface LoadSkillResult {
  name: string;
  description: string;
  body: string;
  /** True when the body exceeded the per-call cap and was clipped. */
  truncated: boolean;
  /** Aux files in a folder skill (empty for single-file skills). */
  files: { path: string; size: number }[];
}

export interface LoadSkillError {
  error: string;
}

export const loadSkillTool = tool({
  description: LOAD_SKILL_DESCRIPTION,
  inputSchema: jsonSchema<LoadSkillInput>(LOAD_SKILL_JSON_SCHEMA),
});

// --- Executor adapter ---

/** Body cap. Skills are user-authored so we leave headroom over the 8k note
 *  cap (typical skill bodies run 2–10 KB; some include long examples). */
const MAX_BODY_CHARS = 32_000;

export interface BuildLoadSkillExecutorOpts {
  store: NoteStore;
}

export function buildLoadSkillExecutor(opts: BuildLoadSkillExecutorOpts) {
  return async function executor(toolName: ReadOnlyToolName, rawInput: unknown): Promise<string> {
    if (toolName !== 'load_skill') {
      throw new Error(`Unsupported read-only tool: ${toolName}`);
    }
    const name = pickName(rawInput);
    if (!name) {
      return JSON.stringify({ error: '`name` must be a non-empty string matching a listed skill.' } satisfies LoadSkillError);
    }
    console.info('[ai/load_skill] invoked for', name);
    // Strict-by-name lookup — the model only knows the frontmatter `name`
    // from the system prompt, never the path-shaped id. Resolving by id
    // would let a stale folder id collide with another skill's name.
    const skill = await opts.store.getSkillByName(name);
    if (!skill) {
      return JSON.stringify({ error: `No skill named "${name}" — see the "Available skills" section of the system prompt.` } satisfies LoadSkillError);
    }
    const truncated = skill.content.length > MAX_BODY_CHARS;
    const body = truncated ? skill.content.slice(0, MAX_BODY_CHARS) : skill.content;
    const result: LoadSkillResult = {
      name: skill.name,
      description: skill.description,
      body,
      truncated,
      files: skill.files,
    };
    return JSON.stringify(result);
  };
}

function pickName(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const v = (input as { name?: unknown }).name;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
