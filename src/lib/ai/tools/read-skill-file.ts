// `read_skill_file` — fetch an auxiliary file inside a folder-bundle skill.
// Called after `load_skill` returns a `files` manifest with paths the
// model wants to consult. Owns its schema/description, AI-SDK wrapper,
// and executor adapter against `NoteStore.readSkillFile`.

import { tool, jsonSchema } from 'ai';
import type { NoteStore } from '@/lib/storage';
import type { ReadOnlyToolName } from './index';

export const READ_SKILL_FILE_DESCRIPTION = 'Read an auxiliary file inside a folder-bundle skill — used after `load_skill` returns a `files` manifest with paths the model may want to consult (reference docs, schemas, examples). Returns text content capped at 8000 chars. Read-only and auto-executes.';

export const READ_SKILL_FILE_JSON_SCHEMA = {
  type: 'object',
  required: ['name', 'path'],
  additionalProperties: false,
  properties: {
    name: {
      type: 'string',
      description: 'Skill name (must match a skill listed in "Available skills").',
    },
    path: {
      type: 'string',
      description: 'Relative path of the file inside the skill folder, exactly as it appears in the `files` manifest from `load_skill`. Do NOT include `..` or leading `/`.',
    },
  },
} as const;

export interface ReadSkillFileInput {
  name: string;
  path: string;
}

export interface ReadSkillFileResult {
  name: string;
  path: string;
  text: string;
  truncated: boolean;
  size: number;
}

export interface ReadSkillFileError {
  error: string;
}

export const readSkillFileTool = tool({
  description: READ_SKILL_FILE_DESCRIPTION,
  inputSchema: jsonSchema<ReadSkillFileInput>(READ_SKILL_FILE_JSON_SCHEMA),
});

// --- Executor adapter ---

const MAX_BODY_CHARS = 8_000;

export interface BuildReadSkillFileExecutorOpts {
  store: NoteStore;
}

export function buildReadSkillFileExecutor(opts: BuildReadSkillFileExecutorOpts) {
  return async function executor(toolName: ReadOnlyToolName, rawInput: unknown): Promise<string> {
    if (toolName !== 'read_skill_file') {
      throw new Error(`Unsupported read-only tool: ${toolName}`);
    }
    if (!rawInput || typeof rawInput !== 'object') {
      return JSON.stringify({ error: '`name` and `path` are required.' } satisfies ReadSkillFileError);
    }
    const { name: rawName, path: rawPath } = rawInput as { name?: unknown; path?: unknown };
    if (typeof rawName !== 'string' || !rawName.trim()) {
      return JSON.stringify({ error: '`name` must be a non-empty skill name.' } satisfies ReadSkillFileError);
    }
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      return JSON.stringify({ error: '`path` must be a non-empty relative path from a `load_skill` files manifest.' } satisfies ReadSkillFileError);
    }
    const name = rawName.trim();
    const path = rawPath.trim().replace(/^\.\//, '');
    console.info('[ai/read_skill_file] invoked for', name, '·', path);
    // Resolve the model-supplied `name` to the skill's path-shaped id first.
    // Skipping this step and feeding the name into `readSkillFile` directly
    // could match the wrong skill if another one has an id that happens to
    // equal this name.
    const target = await opts.store.getSkillByName(name);
    if (!target) {
      return JSON.stringify({ error: `No skill named "${name}" — see the "Available skills" section of the system prompt.` } satisfies ReadSkillFileError);
    }
    if (!target.isFolder) {
      return JSON.stringify({ error: `Skill "${name}" is a single-file skill and has no auxiliary files.` } satisfies ReadSkillFileError);
    }
    const got = await opts.store.readSkillFile(target.id, path);
    if (!got) {
      return JSON.stringify({ error: `No file "${path}" inside skill "${name}". Check the files manifest from \`load_skill\`.` } satisfies ReadSkillFileError);
    }
    const truncated = got.text.length > MAX_BODY_CHARS;
    const text = truncated ? got.text.slice(0, MAX_BODY_CHARS) : got.text;
    const result: ReadSkillFileResult = { name, path, text, truncated, size: got.size };
    return JSON.stringify(result);
  };
}
