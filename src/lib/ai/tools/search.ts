// `search_vault` — full-text search over the user's note vault.
// Owns its schema/description, AI-SDK wrapper, normalizer, formatter, and
// the executor adapter from the vault's `useSearch` runner to the tool's
// JSON-shaped result. The cross-tool plumbing (EDIT_TOOLS registry,
// READ_ONLY_TOOL_NAMES, ReadOnlyToolName type) lives in `./index`.

import { tool, jsonSchema } from 'ai';
import type { SearchHit, SearchQuery } from '../../search/types';
import type { ReadOnlyToolName } from './index';

export const SEARCH_VAULT_DESCRIPTION = 'Search the user\'s note vault by free-text query. Returns up to `limit` hits ranked by relevance, each carrying a `path`, `title`, a short `snippet`, and `updatedAt`. Use this when the user asks about content that isn\'t in the active note, or when you need to find related notes before proposing an edit. The snippet is a small excerpt — call again with a tighter query, or rely on the active-note view / wikilink mentions, when you need full bodies. This tool is read-only and runs without user approval.';

export const SEARCH_VAULT_JSON_SCHEMA = {
  type: 'object',
  required: ['query'],
  additionalProperties: false,
  properties: {
    query: {
      type: 'string',
      description: 'Free-text search query. Multiple words are AND-combined; quoted phrases match verbatim.',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of hits to return. Defaults to 10; clamped to [1, 25].',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional tag filter. Each entry should be the bare tag name (no leading `#`); all listed tags must be present on a hit.',
    },
  },
} as const;

export interface SearchVaultInput {
  /** Free-text query, parsed by the same MiniSearch index that powers the palette. */
  query: string;
  /** Cap on hits returned. Defaults to 10, hard-capped at 25. */
  limit?: number;
  /** Optional tag filter (lowercased). All listed tags must be present on a hit. */
  tags?: string[];
}

export interface SearchVaultHit {
  path: string;
  title: string;
  snippet: string;
  score: number;
  updatedAt: string;
}

export interface SearchVaultResult {
  hits: SearchVaultHit[];
  total: number;
  truncated: boolean;
  /** Echoes back the parsed query so the model can self-correct on a second pass. */
  query: string;
}

export const searchVaultTool = tool({
  description: SEARCH_VAULT_DESCRIPTION,
  inputSchema: jsonSchema<SearchVaultInput>(SEARCH_VAULT_JSON_SCHEMA),
});

/**
 * Normalize a `search_vault` input from the model. Defaults `limit` to 10 and
 * clamps it to [1, 25] so the model can't blow up the context window with a
 * single call. Returns null when the input is unusable.
 */
export function normalizeSearchVaultInput(input: unknown): SearchVaultInput | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as { query?: unknown; limit?: unknown; tags?: unknown };
  if (typeof obj.query !== 'string' || !obj.query.trim()) return null;
  const out: SearchVaultInput = { query: obj.query };
  if (typeof obj.limit === 'number' && Number.isFinite(obj.limit)) {
    out.limit = Math.max(1, Math.min(25, Math.floor(obj.limit)));
  }
  if (Array.isArray(obj.tags)) {
    const tags = obj.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
    if (tags.length > 0) out.tags = tags;
  }
  return out;
}

/**
 * Render a search result as the JSON string we hand back to the model in a
 * `tool_result` block. Kept stable so prompt-engineering against the shape
 * doesn't drift between providers.
 */
export function formatSearchVaultResult(result: SearchVaultResult): string {
  return JSON.stringify(result);
}

// --- Executor adapter ---

export type SearchRunner = (q: SearchQuery) => Promise<SearchHit[]>;

interface SnippetSource {
  /** Vault note id, e.g. `Folder/Note.md`. */
  id: string;
  /** Latest known body, used as a fallback when the index didn't return a snippet. */
  body?: string | null;
}

export interface BuildSearchVaultExecutorOpts {
  runSearch: SearchRunner;
  /**
   * Optional resolver for synthesizing a snippet when the index didn't
   * include one (or when the query matched only the title). Returning null
   * leaves the snippet empty — the model still sees the path/title.
   */
  getSnippetSource?: (id: string) => SnippetSource | null;
}

/** Default cap on snippet length we feed back to the model. Long enough to
 *  show context around a hit, short enough that a 25-hit search doesn't
 *  push the prompt past 5k tokens. */
const SNIPPET_MAX_CHARS = 240;

/** Default cap on hits when the model omits `limit`. */
const DEFAULT_LIMIT = 10;

/**
 * Build the executor the chat hook plugs into `chatStream.executeReadOnlyTool`.
 * Returns null when called with anything but `search_vault` so future
 * read-only tools can compose alongside without the loop blowing up.
 */
export function buildSearchVaultExecutor(opts: BuildSearchVaultExecutorOpts) {
  return async function executor(toolName: ReadOnlyToolName, rawInput: unknown): Promise<string> {
    if (toolName !== 'search_vault') {
      throw new Error(`Unsupported read-only tool: ${toolName}`);
    }
    const input = normalizeSearchVaultInput(rawInput);
    if (!input) {
      // Hand the model a structured error so it can self-correct on the
      // next turn ("query was empty — please supply a search term").
      return formatSearchVaultResult({
        hits: [],
        total: 0,
        truncated: false,
        query: '',
      });
    }
    const limit = input.limit ?? DEFAULT_LIMIT;
    const query: SearchQuery = {
      text: input.query,
      tags: input.tags,
      // Pull a couple extra so we can decide whether the result is `truncated`
      // without making the model think it saw everything.
      limit: Math.min(limit + 5, 50),
      sort: 'relevance',
    };
    const rawHits = await opts.runSearch(query);
    const trimmed = rawHits.slice(0, limit);
    const hits: SearchVaultHit[] = trimmed.map(hit => ({
      path: hit.id,
      title: hit.title,
      snippet: deriveSnippet(hit, opts.getSnippetSource?.(hit.id) ?? null),
      score: roundScore(hit.score),
      updatedAt: hit.updatedAt,
    }));
    const result: SearchVaultResult = {
      hits,
      total: rawHits.length,
      truncated: rawHits.length > trimmed.length,
      query: input.query,
    };
    return formatSearchVaultResult(result);
  };
}

function deriveSnippet(hit: SearchHit, source: SnippetSource | null): string {
  if (hit.snippet && hit.snippet.trim()) return clampSnippet(hit.snippet);
  if (source?.body) return clampSnippet(source.body);
  return '';
}

function clampSnippet(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= SNIPPET_MAX_CHARS) return oneLine;
  return `${oneLine.slice(0, SNIPPET_MAX_CHARS - 1).trimEnd()}…`;
}

// Avoid leaking float noise like 0.5821203 into the prompt — three digits
// is plenty for the model to compare hits.
function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}
