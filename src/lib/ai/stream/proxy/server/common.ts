// Shared helpers for the Bedrock + Vertex proxy routes. Each route receives
// a chat payload from the browser, builds a server-side language model, and
// streams `streamText`'s fullStream back as a tiny SSE protocol the browser
// helper in `../_client.ts` knows how to parse:
//
//   event: text       data: {"delta":"..."}
//   event: tool       data: {"toolCallId":"...","toolName":"...","input":{...}}
//   event: reasoning  data: {"text":"...","providerMetadata":{...}}
//   event: error      data: {"message":"..."}
//   event: done       data: {}
//
// Pinning to our own protocol avoids version-coupling to the AI SDK's
// internal chunk shape.

import type { NextRequest } from 'next/server';
import { tool, jsonSchema, type ModelMessage, type streamText } from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { EDIT_TOOLS } from '../../../tools';
import type { Role } from '../../../index';

export interface SerializedAttachment {
  kind: 'image' | 'pdf';
  mimeType: string;
  filename?: string;
  base64: string;
}

interface IncomingMessage {
  role: Role;
  content: string;
}

/** One agentic round captured by the browser to feed back into a follow-up
 *  proxy call. The browser orchestrates the multi-turn loop because the
 *  search index is browser-only — the proxy stays single-shot per request,
 *  reconstructing the full conversation from `messages + agenticRounds` on
 *  each call. Mirrored in `shared/types.ts` (`SerializedAgenticRound`). */
interface SerializedAgenticRound {
  assistantText: string;
  assistantToolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    /** Provider-specific metadata captured on the streamed tool-call event
     *  (notably Gemini's `thoughtSignature`). Must round-trip back onto the
     *  follow-up tool-call part or Gemini rejects the request. */
    providerMetadata?: ProviderOptions;
  }>;
  /** Reasoning blocks emitted alongside the tool calls in this round.
   *  Required for OpenAI Responses round-trips — the provider rejects a
   *  follow-up `function_call` whose sibling `reasoning` item (matched by
   *  providerMetadata.openai.itemId) isn't present in input. */
  reasoningParts?: Array<{
    text: string;
    providerMetadata?: ProviderOptions;
  }>;
  toolResults: Array<{ toolCallId: string; output: string }>;
}

/** Wire shape for an MCP tool advertised by the browser. The MCP manager
 *  lives in the browser, so the proxy can only know about these tools if
 *  the client ships them on every request. Mirrors the Anthropic native
 *  tool shape (`{name, description, input_schema}`) — the server converts
 *  to the AI SDK shape via `buildMcpToolSdkRecord`. */
export interface IncomingMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface IncomingBody {
  credential: string;
  model: string;
  system?: string;
  messages: IncomingMessage[];
  withEditTools?: boolean;
  attachments?: SerializedAttachment[];
  agenticRounds?: SerializedAgenticRound[];
  /** MCP tool defs from the browser-side MCP manager. The proxy doesn't
   *  have access to MCP itself, so the client ships current definitions on
   *  every request. The server merges these into the AI SDK `tools` arg so
   *  Bedrock/Vertex models can actually call them. */
  mcpTools?: IncomingMcpTool[];
  /** Bedrock-only: which AWS region to call. Ignored by other providers. */
  region?: string;
}

export interface ParsedProxyBody {
  credential: string;
  model: string;
  system?: string;
  withEditTools: boolean;
  modelMessages: ModelMessage[];
  /** Validated MCP tool defs the model can call this round. */
  mcpTools: IncomingMcpTool[];
  /** Raw region from the body — Bedrock route normalizes via resolveBedrockRegion. */
  region?: string;
}

export async function parseProxyBody(req: NextRequest): Promise<ParsedProxyBody> {
  let body: IncomingBody;
  try {
    body = await req.json() as IncomingBody;
  } catch {
    throw new Error('Body is not valid JSON');
  }
  if (typeof body.credential !== 'string' || !body.credential) {
    throw new Error('Missing credential');
  }
  if (typeof body.model !== 'string' || !body.model) {
    throw new Error('Missing model');
  }
  if (!Array.isArray(body.messages)) {
    throw new Error('Missing messages');
  }

  const messages = body.messages.filter(m => m && typeof m === 'object'
    && (m.role === 'user' || m.role === 'assistant' || m.role === 'system')
    && typeof m.content === 'string');

  const attachments = (body.attachments ?? []).filter(a => a && typeof a === 'object'
    && (a.kind === 'image' || a.kind === 'pdf')
    && typeof a.mimeType === 'string'
    && typeof a.base64 === 'string');

  const agenticRounds = sanitizeAgenticRounds(body.agenticRounds);
  const mcpTools = sanitizeMcpTools(body.mcpTools);

  return {
    credential: body.credential,
    model: body.model,
    system: typeof body.system === 'string' ? body.system : undefined,
    withEditTools: !!body.withEditTools,
    modelMessages: appendAgenticRounds(buildModelMessages(messages, attachments), agenticRounds),
    mcpTools,
    region: typeof body.region === 'string' ? body.region : undefined,
  };
}

function sanitizeMcpTools(raw: unknown): IncomingMcpTool[] {
  if (!Array.isArray(raw)) return [];
  const out: IncomingMcpTool[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.name !== 'string' || !r.name) continue;
    if (typeof r.description !== 'string') continue;
    if (!r.inputSchema || typeof r.inputSchema !== 'object' || Array.isArray(r.inputSchema)) continue;
    out.push({
      name: r.name,
      description: r.description,
      inputSchema: r.inputSchema as Record<string, unknown>,
    });
  }
  return out;
}

function sanitizeAgenticRounds(raw: unknown): SerializedAgenticRound[] {
  if (!Array.isArray(raw)) return [];
  const out: SerializedAgenticRound[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const round = r as { assistantText?: unknown; assistantToolCalls?: unknown; toolResults?: unknown };
    const calls = Array.isArray(round.assistantToolCalls) ? round.assistantToolCalls.filter(c => c && typeof c === 'object'
      && typeof (c as { toolCallId?: unknown }).toolCallId === 'string'
      && typeof (c as { toolName?: unknown }).toolName === 'string') as SerializedAgenticRound['assistantToolCalls'] : [];
    const results = Array.isArray(round.toolResults) ? round.toolResults.filter(r => r && typeof r === 'object'
      && typeof (r as { toolCallId?: unknown }).toolCallId === 'string'
      && typeof (r as { output?: unknown }).output === 'string') as Array<{ toolCallId: string; output: string }> : [];
    const reasoningRaw = (r as { reasoningParts?: unknown }).reasoningParts;
    const reasoningParts = Array.isArray(reasoningRaw)
      ? reasoningRaw
        .filter(p => p && typeof p === 'object'
          && typeof (p as { text?: unknown }).text === 'string')
        .map(p => {
          const pp = p as { text: string; providerMetadata?: unknown };
          const meta = (pp.providerMetadata && typeof pp.providerMetadata === 'object' && !Array.isArray(pp.providerMetadata))
            ? pp.providerMetadata as ProviderOptions
            : undefined;
          return { text: pp.text, ...(meta ? { providerMetadata: meta } : {}) };
        })
      : [];
    out.push({
      assistantText: typeof round.assistantText === 'string' ? round.assistantText : '',
      assistantToolCalls: calls,
      reasoningParts,
      toolResults: results,
    });
  }
  return out;
}

/** Translate captured agentic rounds into ModelMessage parts. The AI SDK
 *  lowers `tool-call` / `tool-result` parts into the provider-native
 *  `tool_use` / `tool_result` blocks (Anthropic) or the equivalent
 *  function-call shapes (OpenAI / Vertex / Bedrock-Nova). */
function appendAgenticRounds(base: ModelMessage[], rounds: SerializedAgenticRound[]): ModelMessage[] {
  if (rounds.length === 0) return base;
  const out: ModelMessage[] = [...base];
  for (const round of rounds) {
    const assistantParts: Array<
      | { type: 'text'; text: string }
      | { type: 'reasoning'; text: string; providerOptions?: ProviderOptions }
      | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown; providerOptions?: ProviderOptions }
    > = [];
    // Reasoning parts MUST precede the tool-call parts they accompanied —
    // OpenAI's Responses API rejects a follow-up `function_call` whose
    // sibling `reasoning` item (matched by itemId) isn't present.
    for (const r of round.reasoningParts ?? []) {
      assistantParts.push({
        type: 'reasoning',
        text: r.text,
        ...(r.providerMetadata ? { providerOptions: r.providerMetadata } : {}),
      });
    }
    if (round.assistantText) assistantParts.push({ type: 'text', text: round.assistantText });
    // Pair each tool-result with its origin call's tool name. Hardcoding
    // 'search_vault' would mismatch tool_call_id ↔ tool_name when the
    // assistant called any other read-only tool (e.g. `search_tasks`),
    // making the provider drop the result silently.
    const toolNameById = new Map<string, string>();
    for (const call of round.assistantToolCalls) {
      assistantParts.push({
        type: 'tool-call',
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
        // Round-trip Gemini's thoughtSignature etc. The browser captured
        // it on the tool-call stream event; the AI SDK accepts it back
        // as providerOptions on the outgoing ToolCallPart.
        ...(call.providerMetadata ? { providerOptions: call.providerMetadata } : {}),
      });
      toolNameById.set(call.toolCallId, call.toolName);
    }
    out.push({ role: 'assistant', content: assistantParts });

    if (round.toolResults.length > 0) {
      out.push({
        role: 'tool',
        content: round.toolResults.map(r => ({
          type: 'tool-result' as const,
          toolCallId: r.toolCallId,
          toolName: toolNameById.get(r.toolCallId) ?? 'search_vault',
          output: { type: 'text' as const, value: r.output },
        })),
      });
    }
  }
  return out;
}

function buildModelMessages(messages: IncomingMessage[], attachments: SerializedAttachment[]): ModelMessage[] {
  const out: ModelMessage[] = messages.map(m => ({ role: m.role, content: m.content }));
  if (attachments.length === 0 || out.length === 0) return out;
  const lastIdx = out.length - 1;
  const last = out[lastIdx];
  if (last.role !== 'user' || typeof last.content !== 'string') return out;

  const parts = attachments.map((att) => {
    const bytes = base64ToBytes(att.base64);
    if (att.kind === 'pdf') {
      return {
        type: 'file' as const,
        data: bytes,
        mediaType: att.mimeType,
        ...(att.filename ? { filename: att.filename } : {}),
      };
    }
    return {
      type: 'image' as const,
      image: bytes,
      mediaType: att.mimeType,
    };
  });

  out[lastIdx] = {
    role: 'user',
    content: [...parts, { type: 'text', text: last.content }],
  };
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// `streamText`'s generics gained a runtime-context parameter in ai v7. Deriving
// the result type from the function itself keeps this file off that moving
// surface — the proxy only ever reads `fullStream`.
export type EditStreamResult = ReturnType<typeof streamText<typeof EDIT_TOOLS>>;

// --- SSE response builder ---

interface ProxyStreamArgs {
  result: EditStreamResult;
  providerLabel: string;
}

export function proxyStreamResponse({ result, providerLabel }: ProxyStreamArgs): Response {
  const encoder = new TextEncoder();
  const tag = `ai/${providerLabel.toLowerCase()}`;
  const debug = process.env.AI_PROXY_DEBUG === '1' || process.env.NODE_ENV !== 'production';

  // Per-stream buffers for reasoning-text reassembly. Reasoning blocks
  // arrive as `reasoning-start` / `reasoning-delta` / `reasoning-end`
  // triples keyed by stream id; the providerMetadata on those events
  // carries the provider's own item id (e.g. OpenAI's `rs_…`) which the
  // browser must round-trip on the next request — see the matching
  // capture loop in `proxyChatRound`.
  interface ReasoningBuffer {
    text: string;
    providerMetadata?: ProviderOptions;
  }
  const reasoningBuffers = new Map<string, ReasoningBuffer>();

  // Per-stream buffers for tool-call reassembly. The AI SDK normally emits a
  // single `tool-call` part after it has parsed the streamed JSON args. With
  // Bedrock in v2 compatibility mode (and other providers' streaming quirks)
  // the final `tool-call` sometimes never arrives — the args come through as
  // `tool-input-delta` chunks but the SDK never closes them out. We buffer
  // the deltas keyed by `toolCallId`; if the stream ends without a matching
  // `tool-call`, we try to parse the accumulated text ourselves and
  // synthesize the call. Without this, a perfectly valid model edit can
  // disappear silently and the user sees "writing it now" with no edit.
  interface ToolInputBuffer {
    toolName: string;
    chunks: string[];
    providerMetadata?: ProviderOptions;
    completed: boolean;
  }
  const toolBuffers = new Map<string, ToolInputBuffer>();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const partTypeCounts = new Map<string, number>();
      try {
        for await (const part of result.fullStream) {
          if (debug) {
            partTypeCounts.set(part.type, (partTypeCounts.get(part.type) ?? 0) + 1);
          }

          if (part.type === 'text-delta') {
            const delta = (part as { text?: string; delta?: string }).text
              ?? (part as { delta?: string }).delta
              ?? '';
            if (delta) send('text', { delta });
            continue;
          }

          if (part.type === 'reasoning-start') {
            const p = part as { id: string; providerMetadata?: ProviderOptions };
            reasoningBuffers.set(p.id, { text: '', providerMetadata: p.providerMetadata });
            continue;
          }

          if (part.type === 'reasoning-delta') {
            const p = part as { id: string; delta?: string; providerMetadata?: ProviderOptions };
            const buf = reasoningBuffers.get(p.id);
            if (buf) {
              if (p.delta) buf.text += p.delta;
              if (p.providerMetadata) buf.providerMetadata = p.providerMetadata;
            }
            continue;
          }

          if (part.type === 'reasoning-end') {
            const p = part as { id: string; providerMetadata?: ProviderOptions };
            const buf = reasoningBuffers.get(p.id);
            if (buf) {
              if (p.providerMetadata) buf.providerMetadata = p.providerMetadata;
              send('reasoning', {
                text: buf.text,
                ...(buf.providerMetadata ? { providerMetadata: buf.providerMetadata } : {}),
              });
              reasoningBuffers.delete(p.id);
            }
            continue;
          }

          if (part.type === 'tool-call') {
            const toolName = (part as { toolName: string }).toolName;
            const toolCallId = (part as { toolCallId: string }).toolCallId;
            const input = (part as { input?: unknown }).input;
            // Round-trip providerMetadata so Gemini's `thoughtSignature`
            // survives the proxy hop. Without this, an agentic search call
            // through Vertex Gemini fails on the next request just like
            // the browser-direct Gemini path did before this was fixed.
            const providerMetadata = (part as { providerMetadata?: ProviderOptions }).providerMetadata;
            send('tool', {
              toolCallId,
              toolName,
              input,
              ...(providerMetadata ? { providerMetadata } : {}),
            });
            const buf = toolBuffers.get(toolCallId);
            if (buf) buf.completed = true;
            continue;
          }

          // Start of a streamed tool-call. Capture name + provider metadata
          // so we can synthesize a final tool-call later if the SDK never
          // emits one. Property names differ across AI SDK versions, so we
          // probe both common spellings.
          if (part.type === 'tool-input-start') {
            const p = part as {
              id?: string; toolCallId?: string;
              toolName?: string;
              providerMetadata?: ProviderOptions;
            };
            const id = p.toolCallId ?? p.id;
            if (id && p.toolName) {
              toolBuffers.set(id, {
                toolName: p.toolName,
                chunks: [],
                providerMetadata: p.providerMetadata,
                completed: false,
              });
            }
            continue;
          }

          if (part.type === 'tool-input-delta') {
            const p = part as {
              id?: string; toolCallId?: string;
              delta?: string; inputTextDelta?: string;
            };
            const id = p.toolCallId ?? p.id;
            const delta = p.delta ?? p.inputTextDelta ?? '';
            if (id && delta) {
              const buf = toolBuffers.get(id);
              if (buf) buf.chunks.push(delta);
            }
            continue;
          }

          // The SDK gave up on a tool-call (typically: it streamed the args
          // but couldn't parse them). Surface the error instead of silently
          // dropping the turn — otherwise the user sees "writing it now"
          // with no edit card and no idea why. Drop the buffer so the
          // synthesis loop below doesn't double-report.
          if (part.type === 'tool-error') {
            const p = part as {
              toolCallId?: string; id?: string;
              toolName?: string;
              error?: unknown;
            };
            const id = p.toolCallId ?? p.id;
            if (id) toolBuffers.delete(id);
            const errMsg = p.error instanceof Error ? p.error.message
              : typeof p.error === 'string' ? p.error
                : 'unknown parser error';
            const message = `${providerLabel}: ${p.toolName ?? 'tool'} call dropped — arguments failed to parse (${errMsg}). The model emitted a tool call but the streamed JSON was malformed.`;
            console.warn(`[${tag}] ${message}`);
            send('error', { message });
            continue;
          }

          if (part.type === 'error') {
            const err = (part as { error?: unknown }).error;
            const message = err instanceof Error ? err.message
              : typeof err === 'string' ? err
                : `${providerLabel} stream error`;
            console.warn(`[${tag}] stream error: ${message}`);
            send('error', { message });
            continue;
          }
        }

        // Flush any reasoning buffers the SDK left open (no matching
        // `reasoning-end`). The browser still needs them on the next
        // request so OpenAI Responses doesn't 400 on the orphaned fc_*.
        for (const buf of Array.from(reasoningBuffers.values())) {
          send('reasoning', {
            text: buf.text,
            ...(buf.providerMetadata ? { providerMetadata: buf.providerMetadata } : {}),
          });
        }
        reasoningBuffers.clear();

        // Fallback assembly: any tool-call buffers that received deltas but
        // never got a matching `tool-call` part. Parse the accumulated input
        // ourselves and synthesize the call. This rescues the Bedrock case
        // where the SDK streams the args but never closes them out.
        for (const [toolCallId, buf] of Array.from(toolBuffers.entries())) {
          if (buf.completed) continue;
          const joined = buf.chunks.join('');
          if (!joined.trim()) {
            console.warn(`[${tag}] dropped tool-input buffer for ${buf.toolName} (id=${toolCallId}) — no streamed input arrived`);
            continue;
          }
          try {
            const parsed = JSON.parse(joined);
            console.warn(`[${tag}] synthesized tool-call for ${buf.toolName} (id=${toolCallId}, ${joined.length} chars of streamed args) — SDK did not emit a tool-call part`);
            send('tool', {
              toolCallId,
              toolName: buf.toolName,
              input: parsed,
              ...(buf.providerMetadata ? { providerMetadata: buf.providerMetadata } : {}),
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const preview = joined.slice(0, 200);
            console.warn(`[${tag}] could not synthesize tool-call for ${buf.toolName} — JSON parse failed: ${errMsg}. Input preview: ${preview}`);
            send('error', {
              message: `${providerLabel}: ${buf.toolName} call dropped — ${joined.length} chars of streamed arguments were not valid JSON (${errMsg}).`,
            });
          }
        }

        if (debug && partTypeCounts.size > 0) {
          const summary = Array.from(partTypeCounts.entries())
            .map(([t, n]) => `${t}×${n}`)
            .join(' ');
          console.log(`[${tag}] stream parts: ${summary}`);
        }

        send('done', {});
      } catch (err) {
        const message = err instanceof Error ? err.message : `${providerLabel} stream failed`;
        console.warn(`[${tag}] stream threw: ${message}`);
        send('error', { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

export { EDIT_TOOLS };

/** Convert wire-format MCP tool defs (Anthropic-shaped, the same form the
 *  browser-side MCP manager produces) into an AI SDK tool record so they
 *  can be merged into `tools` on the proxy `streamText` call. Tools have
 *  no `execute` — the browser executes them via the MCP manager when the
 *  agentic loop sees the `tool-call` event come back. Used by all proxy
 *  routes (Bedrock, Vertex) so MCP tools work uniformly across providers,
 *  not only on the Anthropic-direct path. */
export function buildMcpToolSdkRecord(mcpTools: IncomingMcpTool[]): Record<string, ReturnType<typeof tool>> {
  const out: Record<string, ReturnType<typeof tool>> = {};
  for (const t of mcpTools) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(t.inputSchema),
    });
  }
  return out;
}
