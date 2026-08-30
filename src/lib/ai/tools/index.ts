// Public surface of the tools directory. Each tool's schema, description,
// types, and (for read-only ones) executor live in its own file; this
// index aggregates cross-tool plumbing — the `EDIT_TOOLS` registry the AI
// SDK consumes, the `READ_ONLY_TOOL_NAMES` set the agentic loop checks,
// and `applyProposedEdit` (the in-place find/replace logic shared by
// edit_note + rewrite_note).
//
// `index.ts` also re-exports every per-tool file's public surface so
// consumers can write `import { SEARCH_VAULT_DESCRIPTION } from '…/tools'`
// without picking which subfile each constant lives in.

import { editNoteTool, type EditNoteInput } from './edit-note';
import { rewriteNoteTool, type RewriteNoteInput } from './rewrite-note';
import { createNoteTool, type CreateNoteInput } from './create-note';
import { manageTasksTool, type ManageTasksInput } from './manage-tasks';
import { searchVaultTool } from './search';
import { searchTasksTool } from './search-tasks';
import { readNoteTool } from './read-note';
import { getDatetimeTool } from './get-datetime';
import { loadSkillTool } from './load-skill';
import { readSkillFileTool } from './read-skill-file';

export * from './search';
export * from './search-tasks';
export * from './read-note';
export * from './read-skill-file';
export * from './load-skill';
export * from './get-datetime';
export * from './edit-note';
export * from './rewrite-note';
export * from './create-note';
export * from './manage-tasks';

/**
 * Args carried by a non-read-only MCP tool call as it surfaces to the
 * approval UI. We keep both the namespaced name (for the executor lookup
 * after Apply) and the original tool/server pair (for human-readable
 * display in the approval card).
 */
export interface McpCallInput {
  /** Namespaced tool name (e.g. `mcp__github__create_issue`). Pass this to
   *  `mcpManager.executeTool()` on Apply. */
  namespacedName: string;
  /** Short server identifier (e.g. `github`). */
  server: string;
  /** Original tool name on the server (e.g. `create_issue`). */
  tool: string;
  /** Arguments the model emitted, as a parsed JSON object/value. */
  args: unknown;
  /** Description the server advertised for the tool — surfaced in the card. */
  description: string;
}

// `search_vault` is intentionally absent from `ProposedEditInput`: it's a
// read-only auto-executed tool, not a user-reviewed mutation. The chat hook
// runs it inline (see `READ_ONLY_TOOL_NAMES`) and feeds the result back to
// the model on the next turn — no edit card surfaces in the UI. `mcp_call`
// is a fallback path for MCP tools the server explicitly flags as
// `destructiveHint: true`; everything else auto-executes.
export type ProposedEditInput =
  | { toolName: 'edit_note'; input: EditNoteInput }
  | { toolName: 'rewrite_note'; input: RewriteNoteInput }
  | { toolName: 'create_note'; input: CreateNoteInput }
  | { toolName: 'manage_tasks'; input: ManageTasksInput }
  | { toolName: 'mcp_call'; input: McpCallInput };

export type ReadOnlyToolName = 'search_vault' | 'search_tasks' | 'read_note' | 'get_datetime' | 'load_skill' | 'read_skill_file';

export const READ_ONLY_TOOL_NAMES: readonly ReadOnlyToolName[] = ['search_vault', 'search_tasks', 'read_note', 'get_datetime', 'load_skill', 'read_skill_file'] as const;

// All tools the model is allowed to call. The mutating ones surface as edit
// cards for human approval; `search_vault` is auto-executed by the chat hook
// (see READ_ONLY_TOOL_NAMES). The `EDIT_TOOLS` name is preserved for
// backwards compatibility with the proxy routes that import it.
export const EDIT_TOOLS = {
  edit_note: editNoteTool,
  rewrite_note: rewriteNoteTool,
  create_note: createNoteTool,
  manage_tasks: manageTasksTool,
  search_vault: searchVaultTool,
  search_tasks: searchTasksTool,
  read_note: readNoteTool,
  get_datetime: getDatetimeTool,
  load_skill: loadSkillTool,
  read_skill_file: readSkillFileTool,
} as const;

export type EditToolName = keyof typeof EDIT_TOOLS;

// Apply a single tool call against `originalText` and return the new full
// text, or throw a user-facing error if the edit can't be cleanly applied.
// `create_note` is handled separately by the chat hook (it writes a new
// file, not the active note's text), so it's rejected here.
export function applyProposedEdit(originalText: string, edit: ProposedEditInput): string {
  if (edit.toolName === 'rewrite_note') {
    return edit.input.new_content;
  }
  if (edit.toolName === 'create_note') {
    throw new Error('create_note is handled by the create flow, not the in-place edit flow.');
  }
  if (edit.toolName === 'manage_tasks') {
    throw new Error('manage_tasks is handled by the task store, not the in-place edit flow.');
  }
  if (edit.toolName === 'mcp_call') {
    throw new Error('mcp_call is handled by the MCP manager, not the in-place edit flow.');
  }
  const { find, replace } = edit.input;
  if (!find) throw new Error('The edit has an empty find string.');
  const firstIdx = originalText.indexOf(find);
  if (firstIdx !== -1) {
    const nextIdx = originalText.indexOf(find, firstIdx + 1);
    if (nextIdx !== -1) {
      throw new Error('The text to replace appears more than once. Ask the AI to include more surrounding context.');
    }
    return originalText.slice(0, firstIdx) + replace + originalText.slice(firstIdx + find.length);
  }
  // Literal match failed — try whitespace-tolerant matching before giving
  // up. Models routinely emit `find` strings that are byte-for-byte close
  // but differ in newline placement or run-of-spaces around list markers,
  // and forcing a retry on every such miss burns turns. We only apply the
  // fuzzy match when it resolves to exactly one span — otherwise we fall
  // through to the diagnostic error so the model can self-correct.
  const fuzzy = findWhitespaceTolerantSpan(originalText, find);
  if (fuzzy) {
    return originalText.slice(0, fuzzy.start) + replace + originalText.slice(fuzzy.end);
  }
  throw new Error(buildFindNotFoundError(originalText));
}

/** Locate a unique span in `text` matching `find` after collapsing runs of
 *  whitespace on both sides. Returns the original-text byte offsets so the
 *  caller can splice. Returns null on no match or ambiguity. */
function findWhitespaceTolerantSpan(text: string, find: string): { start: number; end: number } | null {
  const tokens = find.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Allow optional leading whitespace too — covers the case where the
  // model's `find` starts mid-line but the actual note has indentation.
  const re = new RegExp(escaped.join('\\s+'), 'g');
  const first = re.exec(text);
  if (!first) return null;
  const second = re.exec(text);
  if (second) return null;
  return { start: first.index, end: first.index + first[0].length };
}

const FIND_NOT_FOUND_BASE = 'The `find` string was not found in the note. It must appear verbatim — whitespace, list markers, and punctuation all matter.';
const NOTE_SNAPSHOT_MAX_CHARS = 1500;

/** Compose a diagnostic error message that gives the model the ground truth
 *  it needs to self-correct in one turn: the actual note body it's editing,
 *  plus an explicit `rewrite_note` hint when the note is essentially empty
 *  (the most common cause of "find not found" on a first-time edit). */
function buildFindNotFoundError(noteText: string): string {
  const parts: string[] = [FIND_NOT_FOUND_BASE];
  const trimmed = noteText.trim();
  if (trimmed.length === 0) {
    parts.push('The note is empty. Use `rewrite_note({ new_content })` to populate it instead of `edit_note`.');
    return parts.join('\n\n');
  }
  if (trimmed.length < 80) {
    parts.push(`The note is essentially empty (current content shown below). Use \`rewrite_note({ new_content })\` to populate it instead of repeatedly retrying \`edit_note\`.\n\n\`\`\`markdown\n${noteText}\n\`\`\``);
    return parts.join('\n\n');
  }
  const snapshot = noteText.length > NOTE_SNAPSHOT_MAX_CHARS
    ? `${noteText.slice(0, NOTE_SNAPSHOT_MAX_CHARS)}\n…[truncated; original is ${noteText.length} chars]`
    : noteText;
  parts.push(`Current note content (this is the exact text to anchor against — do not paraphrase it):\n\n\`\`\`markdown\n${snapshot}\n\`\`\``);
  return parts.join('\n\n');
}
