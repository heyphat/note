// Browser-side client for the server-proxied providers (Bedrock, Vertex).
// Both APIs reject browser-direct calls (no CORS), so the request flows
// through `/api/ai/<provider>` which runs the AI SDK server-side. The
// credential is shipped in each POST body (sourced from localStorage in
// the browser) and is never persisted server-side.
//
// The route streams a tiny SSE-style protocol so we don't pin to the AI
// SDK's internal chunk shape:
//   event: text       data: {"delta":"..."}
//   event: tool       data: {"toolCallId":"...","toolName":"...","input":{...}}
//   event: reasoning  data: {"text":"...","providerMetadata":{...}}
//   event: error      data: {"message":"..."}
//   event: done       data: {}

import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { ChatProviderError, type ProviderId } from '../../index';
import { getMcpManager } from '../../mcp';
import { bytesToBase64, mergeAttachments } from '../shared/attachments';
import { normalizeError, readErrorBody } from '../shared/errors';
import type {
  AgenticRound, ProviderAttachmentKind, ReasoningRecord, RoundResult,
  SerializedAgenticRound, StreamOpts, ToolCallRecord,
} from '../shared/types';

/** Provider-specific bits the wrapper modules pass through to the proxy
 *  route. Today only Bedrock cares about region; Vertex's location is
 *  hard-coded server-side. */
export interface ProxyExtras {
  region?: string;
}

interface SerializedAttachment {
  kind: ProviderAttachmentKind;
  mimeType: string;
  filename?: string;
  /** base64-encoded bytes — JSON-safe transport over HTTP. */
  base64: string;
}

function serializeAttachments(opts: StreamOpts): SerializedAttachment[] {
  return mergeAttachments(opts).map(att => ({
    kind: att.kind,
    mimeType: att.mimeType,
    filename: att.filename,
    base64: bytesToBase64(att.bytes),
  }));
}

/**
 * One agentic round against a proxied provider (Bedrock, Vertex). The wire
 * format is documented near the top of this file; the proxy route is
 * single-shot, so multi-turn loops are orchestrated by the caller —
 * the agentic loop re-invokes this function for each round, accumulating
 * `priorRounds` so the proxy can feed the model the prior tool_result on
 * its next streamText call.
 */
export async function proxyChatRound(
  opts: StreamOpts,
  priorRounds: AgenticRound[],
  extras?: ProxyExtras,
): Promise<RoundResult> {
  // Ship the current MCP tool defs on every proxy request. The MCP manager
  // lives in the browser; the server route has no other way to know which
  // tools to declare to `streamText`. Without this, the model sees MCP
  // tools in the system prompt but can't actually call them — the AI SDK
  // rejects the call with "tool not declared" and the turn fails silently.
  // Format matches the Anthropic-native shape the manager already produces
  // (input_schema → inputSchema is the only field rename).
  const mcpTools = opts.withEditTools
    ? getMcpManager().getAnthropicToolDefinitions().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
    }))
    : [];

  const body = {
    credential: opts.apiKey,
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    withEditTools: !!opts.withEditTools,
    mcpTools,
    // Ship attachments on every agentic round. The proxy splices them into
    // the latest user message via `buildModelMessages`; that message is the
    // original human turn (the synthetic assistant/tool messages are
    // appended via `agenticRounds` afterward). Without this, a search →
    // "what does the PDF say?" flow loses the PDF on round 2.
    attachments: serializeAttachments(opts),
    agenticRounds: serializeAgenticRounds(priorRounds),
    region: extras?.region,
  };

  let res: Response;
  try {
    res = await fetch(`/api/ai/${opts.providerId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw new ChatProviderError({
      provider: opts.providerId,
      message: err instanceof Error ? err.message : 'Network request failed',
    });
  }

  if (!res.ok) {
    // Pass the upstream error through verbatim — `friendlyMessage` for 401/403
    // would say "API key rejected" and bury the real AWS / Vertex message
    // (model not enabled, region mismatch, expired token, etc.).
    throw new ChatProviderError({
      provider: opts.providerId,
      status: res.status,
      message: await readErrorBody(res) || `HTTP ${res.status}`,
    });
  }
  if (!res.body) {
    throw new ChatProviderError({
      provider: opts.providerId,
      message: 'The proxy returned an empty response body.',
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  const calls: ToolCallRecord[] = [];
  const reasoningParts: ReasoningRecord[] = [];
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  const emit = () => {
    if (dataLines.length === 0) {
      eventName = 'message';
      return;
    }
    const payload = dataLines.join('\n');
    const current = eventName;
    dataLines = [];
    eventName = 'message';
    handleProxyEvent(current, payload, opts.providerId, {
      onTextDelta: (delta) => {
        full += delta;
        opts.onDelta(delta);
      },
      onToolCall: (call) => calls.push(call),
      onReasoning: (r) => reasoningParts.push(r),
    });
  };

  const flush = (final = false) => {
    while (true) {
      const idx = buffer.indexOf('\n');
      if (idx === -1) break;
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        emit();
        continue;
      }
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        continue;
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (!final || buffer.length === 0) return;
    let line = buffer;
    buffer = '';
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flush(false);
    }
    buffer += decoder.decode();
    flush(true);
    emit();
  } catch (err) {
    throw normalizeError(err, opts.providerId);
  }
  return { text: full, toolCalls: calls, reasoningParts };
}

interface ProxyEventHandlers {
  onTextDelta: (delta: string) => void;
  onToolCall: (call: ToolCallRecord) => void;
  onReasoning: (part: ReasoningRecord) => void;
}

function handleProxyEvent(
  eventName: string,
  payload: string,
  providerId: ProviderId,
  handlers: ProxyEventHandlers,
) {
  if (eventName === 'done' || eventName === 'message') return;
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return;
  }
  if (eventName === 'text') {
    const delta = (value as { delta?: unknown }).delta;
    if (typeof delta === 'string' && delta) handlers.onTextDelta(delta);
    return;
  }
  if (eventName === 'tool') {
    const obj = value as {
      toolCallId?: unknown;
      toolName?: unknown;
      input?: unknown;
      providerMetadata?: unknown;
    };
    if (typeof obj.toolCallId !== 'string' || typeof obj.toolName !== 'string') return;
    // providerMetadata arrives as a JSON object (over the wire) and matches
    // the AI SDK's `ProviderOptions` shape; cast through the JSON object
    // form. Validating its inner structure here is the proxy's job — we
    // pass through whatever nested object the server sent.
    const providerMetadata = (obj.providerMetadata && typeof obj.providerMetadata === 'object' && !Array.isArray(obj.providerMetadata))
      ? obj.providerMetadata as ProviderOptions
      : undefined;
    handlers.onToolCall({
      toolCallId: obj.toolCallId,
      toolName: obj.toolName,
      input: obj.input,
      inputRaw: typeof obj.input === 'string' ? obj.input : JSON.stringify(obj.input ?? {}),
      ...(providerMetadata ? { providerMetadata } : {}),
    });
    return;
  }
  if (eventName === 'reasoning') {
    const obj = value as { text?: unknown; providerMetadata?: unknown };
    const text = typeof obj.text === 'string' ? obj.text : '';
    const providerMetadata = (obj.providerMetadata && typeof obj.providerMetadata === 'object' && !Array.isArray(obj.providerMetadata))
      ? obj.providerMetadata as ProviderOptions
      : undefined;
    handlers.onReasoning({
      text,
      ...(providerMetadata ? { providerMetadata } : {}),
    });
    return;
  }
  if (eventName === 'error') {
    const message = typeof (value as { message?: unknown }).message === 'string'
      ? (value as { message: string }).message
      : 'The request failed.';
    throw new ChatProviderError({ provider: providerId, message });
  }
}

function serializeAgenticRounds(rounds: AgenticRound[]): SerializedAgenticRound[] {
  return rounds.map(round => ({
    assistantText: round.assistantText,
    assistantToolCalls: round.assistantToolCalls.map(call => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
      // Round-trip providerMetadata so Gemini's thoughtSignature survives
      // even when the loop runs through the proxy (Bedrock/Vertex).
      ...(call.providerMetadata ? { providerMetadata: call.providerMetadata } : {}),
    })),
    reasoningParts: round.reasoningParts.map(r => ({
      text: r.text,
      ...(r.providerMetadata ? { providerMetadata: r.providerMetadata } : {}),
    })),
    toolResults: round.toolResults,
  }));
}

/**
 * Hit `/api/ai/<provider>/test` to validate a credential. Surfaces the
 * upstream error body verbatim on failure — see the matching block in
 * `proxyChatRound` for why we skip `friendlyMessage` here.
 */
export async function proxyTestConnection(
  providerId: 'bedrock' | 'vertex',
  credential: string,
  modelId?: string,
  extras?: ProxyExtras,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${providerId}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        credential,
        model: modelId,
        region: extras?.region,
      }),
    });
  } catch (err) {
    throw new ChatProviderError({
      provider: providerId,
      message: err instanceof Error ? err.message : 'Network request failed',
    });
  }
  if (res.ok) return;
  throw new ChatProviderError({
    provider: providerId,
    status: res.status,
    message: await readErrorBody(res) || `HTTP ${res.status}`,
  });
}
