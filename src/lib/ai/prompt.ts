// Assembles the system prompt the assistant sees. Provider-agnostic —
// every adapter receives the same string. The note body is re-assembled
// on every send (not cached) so edits between turns are always visible.

import { truncateCodeBlocks } from './code-block-truncation';
import { getMcpManager } from './mcp';

const MAX_NOTE_CHARS = 40_000;
const MAX_FOLDERS_LISTED = 60;
const MAX_FAILURE_FIND_CHARS = 800;
const MAX_FAILURE_REPLACE_CHARS = 200;

export interface NoteContext {
  noteId?: string | null;
  title?: string | null;
  text?: string | null;
  selection?: string | null;
  /** Folder paths in the vault, used so `create_note` can pick a sensible folder. */
  folders?: string[] | null;
  /** User-defined skills available in this vault. Surfaced as a name+description
   *  list so the model can decide whether to call `load_skill` to pull the body. */
  skills?: { name: string; description: string }[] | null;
}

/** Tool failure from a prior turn that the model should self-correct on. */
export type PriorToolFailure =
  | {
    toolName: 'edit_note';
    error: string;
    input: { find: string; replace: string };
  }
  | {
    toolName: 'rewrite_note';
    error: string;
    input: { new_content: string };
  }
  | {
    toolName: 'create_note';
    error: string;
    input: { title: string; content: string; folder?: string };
  }
  | {
    toolName: 'manage_tasks';
    error: string;
    input: unknown;
  };

const BASE_INSTRUCTIONS = [
  'You are an assistant embedded in a markdown note-taking app.',
  'Help the user think through, edit, and extend their notes.',
  'Be concise. Prefer lists and short paragraphs. Skip filler.',
  'Any images embedded in the current note are attached inline to the user message so you can see them directly — treat them as part of the note content, not external references.',
].join(' ');

const TOOL_INSTRUCTIONS = [
  '',
  '## Editing or creating notes',
  'When the user asks you to change the active note or save something as a new note, call one of the tools below. The app will surface your proposal to the user with Apply/Reject buttons — you never write directly to the file.',
  '- `edit_note(find, replace)` — targeted edits to the active note. `find` must be an EXACT substring of the current note content and must be unique; include enough surrounding context if the phrase repeats.',
  '- `rewrite_note(new_content)` — full rewrite of the active note. Only use when the change is larger than the original. Do not include YAML frontmatter; the app preserves it.',
  '- `create_note(title, content, folder?)` — spin up a new note from the discussion. Choose a `folder` from the vault folder list below if one obviously fits the topic; otherwise omit it and the note lands at the vault root. Pick a concise descriptive `title` (it becomes the filename).',
  '- `manage_tasks(kind, ...)` — create, update, complete, uncomplete, or delete task files under `.assets/tasks/`. Use exact task paths from visible task lists; do not guess paths.',
  '',
  '## Searching the vault',
  '`search_vault(query, limit?, tags?)` runs a relevance-ranked full-text search against every note in the vault. It is read-only and runs immediately — no Apply step — and the hits come back to you on the next turn so you can chain calls. Each hit carries `path`, `title`, a short `snippet`, and `updatedAt`. Use it when the answer needs context from notes other than the active one, or when you want to discover related notes before proposing an edit. Do all of your searches BEFORE proposing any mutations: once you call a mutating tool the turn ends pending user approval. The snippet is intentionally short — when you need a full body, follow up with `read_note`.',
  '',
  '## Reading note bodies',
  '`read_note(paths)` returns the full markdown body for up to 5 vault paths in a single call. It is read-only and auto-executes. Use this when `search_vault` confirms the path you need, when the user asks you to consolidate or summarize multiple notes (e.g. a weekly recap of daily notes), or when a `[[wikilink]]` mention only carries the link text. Do NOT call it for the active note — its full body is already in the system prompt above. Pass paths exactly as they appear in `search_vault` hits or `[[…]]` mentions, including the `.md` extension. Bodies are capped at 8000 chars per note; if a result reports `truncated: true` and you still need more, ask the user rather than re-fetching.',
  '',
  '## Current date and time',
  '`get_datetime({timezone?})` returns the user\'s current date, time, weekday, timezone, and ISO/unix forms from their browser clock. Call this **before** answering anything that depends on "today", "now", "this week", "tomorrow", or any relative date — your training data is stale and the user\'s clock is the ground truth. Pass an IANA `timezone` (e.g. "Europe/Berlin") only when the user explicitly asks about a different zone; omit it otherwise so you get their local time. Read-only and auto-executes.',
  '',
  '## Searching tasks',
  '`search_tasks({text?, status?, priority?, tags?, contexts?, projects?, due_after?, due_before?, scheduled_after?, scheduled_before?, limit?})` searches the user\'s task index (TaskNotes-spec files under `.assets/tasks/`). Tasks are NOT covered by `search_vault` — use this tool whenever the user asks about tasks, todos, due dates, projects, or contexts. All filters AND-combine. Each hit carries a `path` you can pass straight to `manage_tasks` to mutate the task. Like `search_vault`, this tool is read-only and auto-executes; chain calls before any mutation.',
  '**CRITICAL: only set the filters the user explicitly asked for.** All filters are required-match, including `priority` — most tasks have no priority set, so adding `priority: "normal"` to a query for "open tasks" will silently drop every task that didn\'t set a priority. If the user said "open tasks", call `search_tasks({status: "open"})` and nothing else. Add a filter only when the user named that dimension ("high-priority tasks", "tasks tagged urgent", "tasks due this week").',
  '',
  '## Acting on tools vs. narrating about them',
  '**When the user asks about current state (tasks, notes, "what do I have") OR asks you to read, summarize, consolidate, or recap multiple notes, you MUST emit a tool call. Do NOT describe the call you would make, do NOT show the JSON arguments in a code block as if explaining — actually invoke the tool.** The user can\'t see what you would do; they only see what you actually do. If you write text like "Let me try the read_note tool" or "Doing it now:" you MUST follow up in the same turn with the actual tool_use block — text-only "I will…" responses are a bug.',
  '**Trust the live tool over your own prior narration.** When the user pushes back ("are you sure?", "look more carefully", "that doesn\'t look right"), treat it as evidence your prior tool inputs were wrong. Re-call the tool with broader/simpler filters and answer from the FRESH result. Never summarize from earlier text in the conversation — those numbers may have been from a flawed query. Earlier assistant messages are NOT a source of truth; only the current tool result is.',
  '**NEVER fabricate tool output.** If a tool you need is not in your available tools, or an MCP server you need is not in `connected` state per the "External tools (MCP)" section, STOP and tell the user the data source is unavailable. Do not invent numbers, dates, rows, search results, or any other content that a tool would normally return. Equally: do not deny having tools that ARE listed in this prompt — if you see a tool listed under "External tools (MCP)" with a connected server, you can call it. Trust this list over your prior assumption that "I don\'t have access to that".',
  '',
  'If the user just asks a question, respond in text; do not call a tool.',
  'After calling a mutating tool, give a one-line text summary so the user understands the proposal.',
  '',
  '## Custom fenced code blocks',
  'The editor renders certain fenced code block languages as interactive widgets, NOT as plain code. When you write or edit content that should appear as one of these widgets, use the exact format below — a malformed block can break the editor.',
  '',
  '### `price-chart` — candlestick chart',
  '',
  '**Choosing JSON vs CSV — read this first.** The block body can be either JSON or CSV/TSV; the renderer auto-detects. The rule:',
  '- **If your source data is already JSON** (anything ending in `}` from a tool call — a market-data REST response, for instance) → **paste it verbatim**. Do NOT convert to CSV. Converting is extra work, introduces transcription errors, and is the leading cause of broken charts in this app.',
  '- **Only use CSV** when you are typing the data by hand or when the source is genuinely CSV/TSV already.',
  'When in doubt, JSON wins.',
  '',
  '**JSON shape.** Accepts a `{"results":[…]}`, `{"candles":[…]}`, or `{"data":[…]}` envelope, or a bare array `[…]`. Each candle is an object with `t`/`time`/`timestamp`/`date`, `o`/`open`, `h`/`high`, `l`/`low`, `c`/`close`, and optionally `v`/`volume`. Extra fields (`n`, `vw`, etc.) are ignored — leave them in, don\'t strip them.',
  '',
  '**CSV/TSV shape** (only use when source is not JSON). Comma-separated (tabs also accepted), one candle per line. Header row optional.',
  '- Header columns (case-insensitive, order-independent): `time` (aliases: `date`, `datetime`, `timestamp`, `t`), `open`/`o`, `high`/`h`, `low`/`l`, `close`/`c`, `volume`/`v` (optional).',
  '- Without a header, columns MUST be in this order: `time,open,high,low,close[,volume]`.',
  '- `time` accepts ISO dates (`2025-09-17`), ISO datetimes (`2025-09-17T13:30:00Z`), or unix seconds/ms.',
  '- Numbers must be plain numerics — **no thousand separators** (`38744616`, not `38,744,616`).',
  '- No title line, blank lines, or prose inside the block. Pure data only.',
  '',
  'Examples — JSON first because it\'s the path you should take when data came from a tool:',
  '```',
  '```price-chart',
  '{"results":[{"t":1577941200000,"o":74.06,"h":75.15,"l":73.7975,"c":75.0875,"v":135647456,"n":1,"vw":74.6099},{"t":1578027600000,"o":74.2875,"h":75.145,"l":74.125,"c":74.3575,"v":146535512,"n":1,"vw":74.7026}]}',
  '```',
  '',
  '```price-chart',
  'date,open,high,low,close,volume',
  '2025-09-17,18.98,22.85,18.93,22.54,126852159',
  '2025-09-18,22.87,24.85,22.34,24.02,80856464',
  '```',
  '```',
  'Aliases for the language tag: `price-chart`, `pricechart`, `ohlc`, `candles` — prefer `price-chart`.',
  '',
  '### Other interactive block languages (use only when the user asks)',
  '- `excalidraw` — body is the Excalidraw scene JSON. Only edit if you can produce valid Excalidraw JSON; otherwise leave the existing block alone.',
  '- `youtube` (alias `yt`) — body is a single YouTube URL or video ID on one line.',
  '- `bookmark` (alias `link-preview`) — body is a single URL on one line; the editor fetches the OG preview.',
].join('\n');

export function buildSystemPrompt(
  ctx: NoteContext,
  opts?: { withEditTools?: boolean; recentFailures?: PriorToolFailure[] },
): string {
  const parts: string[] = [BASE_INSTRUCTIONS];
  if (opts?.withEditTools) parts.push(TOOL_INSTRUCTIONS);

  // Surface any connected MCP servers and the tools they advertise so the
  // model knows what external surface is available. Tool descriptions come
  // straight from the server's spec; we keep the section short so users
  // without MCP configured pay nothing.
  if (opts?.withEditTools) {
    const mcpBlock = buildMcpToolsSection();
    if (mcpBlock) parts.push(mcpBlock);
  }

  // Surface user-defined skills (name + description) so the model can call
  // `load_skill` when one applies. Only the names and descriptions ride along
  // in the prompt — bodies stay out until explicitly loaded, which keeps the
  // token budget predictable when a vault accrues many skills.
  if (opts?.withEditTools && ctx.skills && ctx.skills.length > 0) {
    parts.push(buildSkillsSection(ctx.skills));
  }

  // Surface the vault's folder layout so create_note can place new notes
  // alongside related ones. Skip when the vault is flat (no folders) so we
  // don't bloat the prompt for users who haven't organized yet.
  if (opts?.withEditTools && ctx.folders && ctx.folders.length > 0) {
    const sliced = ctx.folders.slice(0, MAX_FOLDERS_LISTED);
    const list = sliced.map(f => `- ${f}`).join('\n');
    const overflow = ctx.folders.length > MAX_FOLDERS_LISTED
      ? `\n[… ${ctx.folders.length - MAX_FOLDERS_LISTED} more folders not shown]`
      : '';
    parts.push(`## Vault folders\n\n${list}${overflow}`);
  }

  if (ctx.title) {
    parts.push(`# Current note\n\nTitle: ${ctx.title}`);
  }
  if (ctx.noteId) {
    const header = ctx.title ? '' : '# Current note\n\n';
    parts.push(`${header}Path: ${ctx.noteId}`);
  }

  if (ctx.text && ctx.text.trim().length > 0) {
    // Shrink oversized fenced code blocks first (per-language rules), so
    // a single huge CSV/JSON paste doesn't starve the surrounding prose
    // when the overall MAX_NOTE_CHARS cap fires.
    const shrunk = truncateCodeBlocks(ctx.text);
    const body = truncate(shrunk, MAX_NOTE_CHARS);
    parts.push(`## Note content\n\n\`\`\`markdown\n${body}\n\`\`\``);
  }

  if (ctx.selection && ctx.selection.trim().length > 0) {
    const sel = truncate(ctx.selection, 2_000);
    parts.push(`## Highlighted selection\n\nThe user has highlighted this text in the editor:\n\n\`\`\`markdown\n${sel}\n\`\`\``);
  }

  // Surface failed tool calls from the previous turn(s) so the model can
  // self-correct. The note shown above already reflects the unchanged
  // current state — failures did NOT modify it.
  if (opts?.recentFailures && opts.recentFailures.length > 0) {
    parts.push(buildFailuresSection(opts.recentFailures));
  }

  return parts.join('\n\n');
}

function buildFailuresSection(failures: PriorToolFailure[]): string {
  const items = failures.map((f, i) => {
    const header = `### Failure ${i + 1}: ${f.toolName}`;
    const errLine = `Error: ${f.error}`;
    const inputBlock = formatFailureInput(f);
    return `${header}\n${errLine}\n${inputBlock}`;
  }).join('\n\n');
  return [
    '## Previous tool failures',
    'The tool calls below were attempted on a prior turn and did NOT modify the note. The "Note content" section above reflects the current, unchanged state. Re-read it before retrying.',
    'When retrying, do NOT repeat the same failed input — for `edit_note`, the `find` string must appear verbatim in the note content above (whitespace, casing, list markers, and punctuation all matter). If a clean substring anchor is not feasible, fall back to `rewrite_note`.',
    items,
  ].join('\n\n');
}

function formatFailureInput(f: PriorToolFailure): string {
  if (f.toolName === 'edit_note') {
    const find = truncate(f.input.find, MAX_FAILURE_FIND_CHARS);
    const replace = truncate(f.input.replace, MAX_FAILURE_REPLACE_CHARS);
    return `Find (verbatim, did not match):\n\`\`\`\n${find}\n\`\`\`\nReplace (preview):\n\`\`\`\n${replace}\n\`\`\``;
  }
  if (f.toolName === 'rewrite_note') {
    const preview = truncate(f.input.new_content, MAX_FAILURE_REPLACE_CHARS);
    return `New content (preview):\n\`\`\`\n${preview}\n\`\`\``;
  }
  if (f.toolName === 'manage_tasks') {
    const preview = truncate(JSON.stringify(f.input, null, 2), MAX_FAILURE_REPLACE_CHARS);
    return `Task operation (preview):\n\`\`\`json\n${preview}\n\`\`\``;
  }
  const folder = f.input.folder ? ` in folder \`${f.input.folder}\`` : '';
  const preview = truncate(f.input.content, MAX_FAILURE_REPLACE_CHARS);
  return `Title: \`${f.input.title}\`${folder}\nContent (preview):\n\`\`\`\n${preview}\n\`\`\``;
}

const MAX_SKILLS_LISTED = 50;

function buildSkillsSection(skills: { name: string; description: string }[]): string {
  const sliced = skills.slice(0, MAX_SKILLS_LISTED);
  const lines: string[] = ['## Available skills'];
  lines.push('Skills are user-authored instructions, examples, and references for specific tasks. Each is listed below by `name` and a short description. When a description plausibly matches the user\'s request, call `load_skill({name})` BEFORE attempting the task — the skill body carries concrete vault-specific guidance that overrides your defaults. Folder-bundle skills also surface auxiliary files; pull those with `read_skill_file({name, path})` when the body refers to them.');
  lines.push('');
  for (const s of sliced) {
    const desc = s.description.replace(/\s+/g, ' ').slice(0, 280) || '(no description)';
    lines.push(`- \`${s.name}\` — ${desc}`);
  }
  if (skills.length > MAX_SKILLS_LISTED) {
    lines.push(`\n[… ${skills.length - MAX_SKILLS_LISTED} more skills not shown]`);
  }
  return lines.join('\n');
}

function buildMcpToolsSection(): string | null {
  const manager = getMcpManager();
  const tools = manager.getAnthropicToolDefinitions();
  const servers = manager.listServerSnapshots();
  // Skip the section entirely when the user has no MCP servers configured;
  // adding a "no MCP" notice would just dilute the prompt for everyone else.
  if (tools.length === 0 && servers.length === 0) return null;

  const lines: string[] = ['## External tools (MCP)'];

  // Always tell the model which servers are configured AND their current
  // state. Without this, a configured-but-disconnected server is invisible
  // to the model, so it confidently denies the tools exist instead of
  // saying "that server looks disconnected — please reconnect."
  if (servers.length > 0) {
    lines.push('Configured MCP servers and their current connection state:');
    for (const s of servers) {
      const stateLabel = s.state === 'connected'
        ? `connected · ${s.toolCount} tool${s.toolCount === 1 ? '' : 's'}`
        : s.state === 'connecting'
          ? 'connecting…'
          : s.state === 'error'
            ? `ERROR${s.error ? `: ${s.error.slice(0, 120)}` : ''}`
            : 'disabled';
      lines.push(`- **${s.name}** — ${stateLabel}`);
    }
    lines.push('');
    lines.push('If a server the user asks about is in **ERROR**, **connecting**, or **disabled** state, do NOT pretend its tools are unavailable forever and do NOT invent data from them. Tell the user the server isn\'t connected right now and ask them to check the MCP settings panel.');
    lines.push('');
  }

  if (tools.length > 0) {
    lines.push('Tools below come from connected MCP servers. They behave like the built-in tools — call them by name with a JSON argument matching their schema. Tools whose name implies a read (search/get/list) auto-execute and their results return on the next turn; anything else surfaces an approval card before running.');
    lines.push('');
    for (const t of tools) {
      const desc = (t.description || '').replace(/\s+/g, ' ').slice(0, 240);
      lines.push(`- \`${t.name}\` — ${desc || '(no description)'}`);
    }
  } else {
    lines.push('No MCP tools are currently indexed (none of the configured servers are connected). Do not call any `mcp__*` tool — they will fail.');
  }

  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  return `${head}\n\n[… truncated: original is ${s.length.toLocaleString()} characters]`;
}
