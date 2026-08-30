// `read_note` — fetch full markdown body for one or more vault paths.
// Owns its schema/description, AI-SDK wrapper, normalizer, formatter, the
// path-allow-list guard, and the executor adapter from `NoteStore.get`.

import { tool, jsonSchema } from 'ai';
import type { NoteStore } from '@/lib/storage';
import type { ReadOnlyToolName } from './index';

export const READ_NOTE_DESCRIPTION = 'Fetch the full markdown body of one or more notes by vault path. Use this when `search_vault` returned a hit and you need more than the snippet — e.g. to summarize a daily note, consolidate several notes into a weekly recap, or compare details across files. Pass paths exactly as they appear in `search_vault` hits or `[[…]]` mentions (relative to the vault root, including the `.md` extension). Capped at 5 paths per call and 8000 chars per body — call again with different paths if you need more. Do NOT use this tool to fetch the active note; its full body is already in the system prompt. This tool is read-only and runs without user approval.';

export const READ_NOTE_JSON_SCHEMA = {
  type: 'object',
  required: ['paths'],
  additionalProperties: false,
  properties: {
    paths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Vault paths to read, e.g. ["Daily/2026-05-04.md", "Daily/2026-05-05.md"]. Up to 5 per call.',
    },
  },
} as const;

export interface ReadNoteInput {
  /** Vault paths (e.g. `Folder/Note.md`) — typically taken from a prior `search_vault` hit's `path`. Capped at 5 per call. */
  paths: string[];
}

export interface ReadNoteHit {
  path: string;
  title: string;
  body: string;
  updatedAt: string;
  /** True when the body was clamped because it exceeded the per-note char cap. */
  truncated: boolean;
}

export interface ReadNoteError {
  path: string;
  message: string;
}

export interface ReadNoteResult {
  hits: ReadNoteHit[];
  errors: ReadNoteError[];
}

export const readNoteTool = tool({
  description: READ_NOTE_DESCRIPTION,
  inputSchema: jsonSchema<ReadNoteInput>(READ_NOTE_JSON_SCHEMA),
});

export const READ_NOTE_MAX_PATHS = 5;

/**
 * Normalize a `read_note` input from the model. Trims whitespace, drops
 * empty strings, dedupes, and clamps to READ_NOTE_MAX_PATHS so a single
 * call can't blow up the context window. Returns null for unusable input
 * so the caller can hand back a structured error.
 */
export function normalizeReadNoteInput(input: unknown): ReadNoteInput | null {
  if (!input || typeof input !== 'object') return null;
  const raw = (input as { paths?: unknown }).paths;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().replace(/^\.\//, '');
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    paths.push(trimmed);
    if (paths.length >= READ_NOTE_MAX_PATHS) break;
  }
  if (paths.length === 0) return null;
  return { paths };
}

export function formatReadNoteResult(result: ReadNoteResult): string {
  return JSON.stringify(result);
}

/**
 * Gate the model to the same surface area `BrowserFsStore.walk()` exposes:
 * `.md` files outside any dot-prefixed folder or `*.assets` folder. Without
 * this check, a prompt-injected note (or a confused model) could ask
 * `read_note` for `.assets/chats/<id>.md` — a thread the user opened with
 * the assistant — or for task files under `.assets/tasks/`, neither of
 * which the user sees in the sidebar. The store's `get()` will read
 * whatever path it's handed, so the validation has to live above it.
 */
export function isAllowedReadPath(path: string): { ok: true } | { ok: false; reason: string } {
  if (!path) return { ok: false, reason: 'Empty path.' };
  if (!path.endsWith('.md')) {
    return { ok: false, reason: 'Only `.md` note paths are readable.' };
  }
  const parts = path.split('/');
  for (const part of parts) {
    if (!part) {
      return { ok: false, reason: 'Path contains an empty segment.' };
    }
    if (part === '.' || part === '..') {
      return { ok: false, reason: 'Path traversal segments (`.` / `..`) are not allowed.' };
    }
    if (part.startsWith('.')) {
      return { ok: false, reason: 'Hidden directories (e.g. `.assets/`) are not readable via this tool.' };
    }
    if (part.endsWith('.assets')) {
      return { ok: false, reason: 'Asset folders (`*.assets/`) are not readable via this tool.' };
    }
  }
  return { ok: true };
}

// --- Executor adapter ---

export interface BuildReadNoteExecutorOpts {
  store: NoteStore;
}

/** Per-note body cap. Mirrors `mentions.ts` — same shape of "fetch full body
 *  by id" feature, same limits keep prompt budget predictable. */
const MAX_BODY_CHARS = 8_000;

/** Hard cap on total chars across all hits in a single call. */
const MAX_TOTAL_CHARS = 24_000;

export function buildReadNoteExecutor(opts: BuildReadNoteExecutorOpts) {
  return async function executor(toolName: ReadOnlyToolName, rawInput: unknown): Promise<string> {
    if (toolName !== 'read_note') {
      throw new Error(`Unsupported read-only tool: ${toolName}`);
    }
    const input = normalizeReadNoteInput(rawInput);
    if (!input) {
      return formatReadNoteResult({
        hits: [],
        errors: [{ path: '', message: '`paths` must be a non-empty array of vault paths.' }],
      });
    }

    // Surface tool firings to DevTools — there's no chat-UI affordance for
    // read-only tool events yet, and "the model said it would call but
    // didn't" looks identical to "the model called and we silently dropped
    // the result" without this. Cheap to keep in production.
    console.info('[ai/read_note] invoked with', input.paths.length, 'path(s):', input.paths);

    const hits: ReadNoteHit[] = [];
    const errors: ReadNoteError[] = [];
    let totalChars = 0;
    for (const path of input.paths) {
      const allowed = isAllowedReadPath(path);
      if (!allowed.ok) {
        errors.push({ path, message: allowed.reason });
        continue;
      }
      try {
        const note = await opts.store.get(path);
        if (!note) {
          errors.push({ path, message: 'Note not found at this path.' });
          continue;
        }
        const remaining = MAX_TOTAL_CHARS - totalChars;
        if (remaining <= 0) {
          errors.push({ path, message: 'Total response budget exhausted; call `read_note` again with this path on its own.' });
          continue;
        }
        const cap = Math.min(MAX_BODY_CHARS, remaining);
        const original = note.text ?? '';
        const truncated = original.length > cap;
        const body = truncated ? original.slice(0, cap) : original;
        hits.push({
          path: note.id,
          title: note.title,
          body,
          updatedAt: note.updatedAt,
          truncated,
        });
        totalChars += body.length;
      } catch (err) {
        errors.push({
          path,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const result: ReadNoteResult = { hits, errors };
    return formatReadNoteResult(result);
  };
}
