// Anthropic direct path. Browser → api.anthropic.com over a hand-rolled
// SSE consumer; we don't go through the AI SDK adapter because it
// occasionally surfaces non-fatal warnings as thrown errors and stalls
// the live UI stream. The agentic loop in `../shared/agentic-loop.ts`
// calls this per round, threading prior `tool_use` + `tool_result`
// blocks into the request via `priorRounds`.

import { ChatProviderError } from '../../index';
import { getMcpManager } from '../../mcp';
import {
  CREATE_NOTE_DESCRIPTION,
  CREATE_NOTE_JSON_SCHEMA,
  EDIT_NOTE_DESCRIPTION,
  EDIT_NOTE_JSON_SCHEMA,
  GET_DATETIME_DESCRIPTION,
  GET_DATETIME_JSON_SCHEMA,
  LOAD_SKILL_DESCRIPTION,
  LOAD_SKILL_JSON_SCHEMA,
  MANAGE_TASKS_DESCRIPTION,
  MANAGE_TASKS_JSON_SCHEMA,
  READ_NOTE_DESCRIPTION,
  READ_NOTE_JSON_SCHEMA,
  READ_SKILL_FILE_DESCRIPTION,
  READ_SKILL_FILE_JSON_SCHEMA,
  REWRITE_NOTE_DESCRIPTION,
  REWRITE_NOTE_JSON_SCHEMA,
  SEARCH_TASKS_DESCRIPTION,
  SEARCH_TASKS_JSON_SCHEMA,
  SEARCH_VAULT_DESCRIPTION,
  SEARCH_VAULT_JSON_SCHEMA,
} from '../../tools';
import { bytesToBase64, mergeAttachments } from '../shared/attachments';
import { friendlyMessage, readErrorBody } from '../shared/errors';
import type {
  AgenticRound, ProviderAttachment, RoundResult, StreamOpts, ToolCallRecord,
} from '../shared/types';
import type { ChatMessage } from '../../index';

const DEFAULT_ANTHROPIC_MAX_TOKENS = 32000;

type AnthropicMessageContent =
  | { type: 'text'; text: string }
  | {
    type: 'image';
    source: { type: 'base64'; media_type: string; data: string };
  }
  | {
    type: 'document';
    source: { type: 'base64'; media_type: 'application/pdf'; data: string };
    title?: string;
  }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicWireMessage = {
  role: 'user' | 'assistant';
  content: AnthropicMessageContent[];
};

type AnthropicContentBlock =
  | { type: 'text' }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: string };

const ANTHROPIC_EDIT_TOOLS = [
  {
    name: 'edit_note',
    description: EDIT_NOTE_DESCRIPTION,
    input_schema: EDIT_NOTE_JSON_SCHEMA,
  },
  {
    name: 'rewrite_note',
    description: REWRITE_NOTE_DESCRIPTION,
    input_schema: REWRITE_NOTE_JSON_SCHEMA,
  },
  {
    name: 'create_note',
    description: CREATE_NOTE_DESCRIPTION,
    input_schema: CREATE_NOTE_JSON_SCHEMA,
  },
  {
    name: 'manage_tasks',
    description: MANAGE_TASKS_DESCRIPTION,
    input_schema: MANAGE_TASKS_JSON_SCHEMA,
  },
  {
    name: 'search_vault',
    description: SEARCH_VAULT_DESCRIPTION,
    input_schema: SEARCH_VAULT_JSON_SCHEMA,
  },
  {
    name: 'search_tasks',
    description: SEARCH_TASKS_DESCRIPTION,
    input_schema: SEARCH_TASKS_JSON_SCHEMA,
  },
  {
    name: 'read_note',
    description: READ_NOTE_DESCRIPTION,
    input_schema: READ_NOTE_JSON_SCHEMA,
  },
  {
    name: 'get_datetime',
    description: GET_DATETIME_DESCRIPTION,
    input_schema: GET_DATETIME_JSON_SCHEMA,
  },
  {
    name: 'load_skill',
    description: LOAD_SKILL_DESCRIPTION,
    input_schema: LOAD_SKILL_JSON_SCHEMA,
  },
  {
    name: 'read_skill_file',
    description: READ_SKILL_FILE_DESCRIPTION,
    input_schema: READ_SKILL_FILE_JSON_SCHEMA,
  },
] as const;

export async function anthropicChatRound(opts: StreamOpts, priorRounds: AgenticRound[]): Promise<RoundResult> {
  // Re-attach on every round. `toAnthropicMessages` splices attachments into
  // the latest *user* message; the synthetic agentic turns we append after
  // that don't get duplicate attachments because they're separate messages.
  const baseMessages = toAnthropicMessages(opts.messages, mergeAttachments(opts));
  const messages = appendAgenticRoundsForAnthropic(baseMessages, priorRounds);

  // If prior rounds contain tool_use blocks, the `tools` array MUST stay on
  // the request — Anthropic rejects a conversation that references tools the
  // current request doesn't declare. On the wrap-up turn (`withEditTools` is
  // false) we still ship the tools but force `tool_choice: 'none'` so the
  // model can only produce text. Without this guard the wrap-up turn hits
  // an opaque "must end with a user message" 400 from the API.
  const hasPriorToolUse = priorRounds.some(r => r.assistantToolCalls.length > 0);
  const includeTools = !!opts.withEditTools || hasPriorToolUse;
  const tools = includeTools
    ? [...ANTHROPIC_EDIT_TOOLS, ...getMcpManager().getAnthropicToolDefinitions()]
    : null;

  const body = {
    model: opts.model,
    max_tokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
    stream: true,
    ...(opts.system ? { system: [{ type: 'text' as const, text: opts.system }] } : {}),
    messages,
    ...(tools
      ? {
        tools,
        tool_choice: opts.withEditTools
          ? { type: 'auto' as const }
          : { type: 'none' as const },
      }
      : {}),
  };

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw new ChatProviderError({
      provider: 'anthropic',
      message: err instanceof Error ? err.message : 'Network request failed',
    });
  }

  if (!res.ok) {
    throw new ChatProviderError({
      provider: 'anthropic',
      status: res.status,
      message: friendlyMessage(res.status, await readErrorBody(res)),
    });
  }
  if (!res.body) {
    throw new ChatProviderError({
      provider: 'anthropic',
      message: 'The provider returned an empty response body.',
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const contentBlocks: Record<number, AnthropicContentBlock | undefined> = {};
  let full = '';
  const calls: ToolCallRecord[] = [];
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  const emitEvent = () => {
    if (dataLines.length === 0) {
      eventName = 'message';
      return;
    }
    const payload = dataLines.join('\n');
    dataLines = [];
    const currentEvent = eventName;
    eventName = 'message';
    handleAnthropicSseEvent(currentEvent, payload, contentBlocks, {
      onTextDelta: (delta) => {
        full += delta;
        opts.onDelta(delta);
      },
      onToolCall: (call) => calls.push(call),
    });
  };

  const processBuffer = (final = false) => {
    while (true) {
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx === -1) break;
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        emitEvent();
        continue;
      }
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
        continue;
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (!final || buffer.length === 0) return;
    let line = buffer;
    buffer = '';
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    processBuffer(false);
  }
  buffer += decoder.decode();
  processBuffer(true);
  emitEvent();

  // Anthropic's `thinking` blocks aren't routed through `reasoningParts` —
  // the direct API path round-trips them via the hand-rolled wire format
  // elsewhere in this file. The field is reserved for AI-SDK providers
  // that surface reasoning via the SDK's reasoning-* stream events.
  return { text: full, toolCalls: calls, reasoningParts: [] };
}

function toAnthropicMessages(messages: ChatMessage[], attachments?: ProviderAttachment[]): AnthropicWireMessage[] {
  return messages.flatMap((message, idx) => {
    if (message.role === 'system') return [];
    const include = message.role === 'user'
      && idx === messages.length - 1
      && attachments
      && attachments.length > 0;
    const content: AnthropicMessageContent[] = include
      ? [
        ...attachments.map((att): AnthropicMessageContent => {
          if (att.kind === 'pdf') {
            return {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: bytesToBase64(att.bytes),
              },
              ...(att.filename ? { title: att.filename } : {}),
            };
          }
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: att.mimeType,
              data: bytesToBase64(att.bytes),
            },
          };
        }),
        { type: 'text' as const, text: message.content },
      ]
      : [{ type: 'text', text: message.content }];
    return [{ role: message.role, content }];
  });
}

interface AnthropicSseHandlers {
  onTextDelta: (delta: string) => void;
  onToolCall: (call: ToolCallRecord) => void;
}

function handleAnthropicSseEvent(
  eventName: string,
  payload: string,
  contentBlocks: Record<number, AnthropicContentBlock | undefined>,
  handlers: AnthropicSseHandlers,
) {
  if (eventName === 'ping') return;

  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return;
  }

  const event = value as {
    type?: unknown;
    index?: unknown;
    content_block?: {
      type?: unknown;
      id?: unknown;
      name?: unknown;
      input?: unknown;
    };
    delta?: {
      type?: unknown;
      text?: unknown;
      partial_json?: unknown;
    };
    error?: { message?: unknown };
    message?: unknown;
  };

  switch (event.type) {
    case 'content_block_start': {
      const part = event.content_block;
      if (!part || typeof event.index !== 'number') return;
      if (part.type === 'text') {
        contentBlocks[event.index] = { type: 'text' };
      } else if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
        const hasNonEmptyInput = part.input && typeof part.input === 'object' && Object.keys(part.input).length > 0;
        contentBlocks[event.index] = {
          type: 'tool-call',
          toolCallId: part.id,
          toolName: part.name,
          input: hasNonEmptyInput ? JSON.stringify(part.input) : '',
        };
      }
      return;
    }

    case 'content_block_delta': {
      if (typeof event.index !== 'number' || !event.delta) return;
      if (event.delta.type === 'text_delta' && typeof event.delta.text === 'string') {
        handlers.onTextDelta(event.delta.text);
      } else if (event.delta.type === 'input_json_delta' && typeof event.delta.partial_json === 'string') {
        const block = contentBlocks[event.index];
        if (block?.type === 'tool-call') {
          block.input += event.delta.partial_json;
        }
      }
      return;
    }

    case 'content_block_stop': {
      if (typeof event.index !== 'number') return;
      const block = contentBlocks[event.index];
      delete contentBlocks[event.index];
      if (block?.type === 'tool-call') {
        const raw = block.input.trim() ? block.input : '{}';
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        handlers.onToolCall({
          toolCallId: block.toolCallId,
          toolName: block.toolName,
          input: parsed,
          inputRaw: raw,
        });
      }
      return;
    }

    case 'error': {
      const message = typeof event.error?.message === 'string'
        ? event.error.message
        : typeof event.message === 'string'
          ? event.message
          : 'The request failed.';
      throw new ChatProviderError({ provider: 'anthropic', message });
    }

    default:
      return;
  }
}

/**
 * Append the assistant tool_use blocks and paired user tool_result blocks
 * for each prior agentic round onto the base Anthropic message list. The
 * Anthropic API requires every `tool_use` to be matched by a `tool_result`
 * in the immediately following user message — see
 * https://docs.anthropic.com/en/docs/build-with-claude/tool-use.
 */
function appendAgenticRoundsForAnthropic(
  base: AnthropicWireMessage[],
  rounds: AgenticRound[],
): AnthropicWireMessage[] {
  if (rounds.length === 0) return base;
  const out: AnthropicWireMessage[] = [...base];
  for (const round of rounds) {
    const assistantContent: AnthropicMessageContent[] = [];
    if (round.assistantText) {
      assistantContent.push({ type: 'text', text: round.assistantText });
    }
    for (const call of round.assistantToolCalls) {
      assistantContent.push({
        type: 'tool_use',
        id: call.toolCallId,
        name: call.toolName,
        input: call.input ?? {},
      });
    }
    out.push({ role: 'assistant', content: assistantContent });

    const toolResultContent: AnthropicMessageContent[] = round.toolResults.map(r => ({
      type: 'tool_result',
      tool_use_id: r.toolCallId,
      content: r.output,
    }));
    if (toolResultContent.length > 0) {
      out.push({ role: 'user', content: toolResultContent });
    }
  }
  return out;
}

export async function anthropicTestConnection(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
  } catch (err) {
    throw new ChatProviderError({
      provider: 'anthropic',
      message: err instanceof Error ? err.message : 'Network request failed',
    });
  }
  if (res.ok) return;
  throw new ChatProviderError({
    provider: 'anthropic',
    status: res.status,
    message: friendlyMessage(res.status, `HTTP ${res.status}`),
  });
}
