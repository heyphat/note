// One round of streaming against an AI-SDK LanguageModel. Used by both
// OpenAI and Gemini direct paths — they only diverge in which factory
// builds the model (handled by their respective wrappers in this dir).
// Anthropic-direct uses a hand-rolled SSE path; see `./anthropic.ts`.

import { streamText, type LanguageModel, type ModelMessage } from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { EDIT_TOOLS } from '../../tools';
import { getMcpManager } from '../../mcp';
import { mergeAttachments } from '../shared/attachments';
import { normalizeError } from '../shared/errors';
import type {
  AgenticRound, RoundResult, StreamOpts, ToolCallRecord, ReasoningRecord,
} from '../shared/types';

export async function aiSdkChatRound(
  opts: StreamOpts,
  model: LanguageModel,
  priorRounds: AgenticRound[],
): Promise<RoundResult> {
  // Build the message array in ModelMessage form: original chat history
  // followed by any in-flight agentic round (assistant tool_use + paired
  // tool_result) so the model has full context for this iteration.
  const modelMessages: ModelMessage[] = opts.messages.map(m => ({ role: m.role, content: m.content }));

  // Splice attachments (images + PDFs) into the latest user turn as
  // multi-part content. Providers don't remember attachments across HTTP
  // requests, so we have to ship them on every agentic round — otherwise
  // a search_vault call followed by "what does the PDF say?" loses the
  // PDF context entirely. We splice into the original latest-user message
  // (which lives at modelMessages[lastIdx] BEFORE we append agentic turns),
  // not into the synthetic tool messages that come after.
  const attachments = mergeAttachments(opts);
  if (attachments.length > 0 && modelMessages.length > 0) {
    const lastIdx = modelMessages.length - 1;
    const last = modelMessages[lastIdx];
    if (last.role === 'user' && typeof last.content === 'string') {
      const parts = attachments.map((att) => {
        if (att.kind === 'pdf') {
          return {
            type: 'file' as const,
            data: att.bytes,
            mediaType: att.mimeType,
            ...(att.filename ? { filename: att.filename } : {}),
          };
        }
        return {
          type: 'image' as const,
          image: att.bytes,
          mediaType: att.mimeType,
        };
      });
      modelMessages[lastIdx] = {
        role: 'user',
        content: [
          ...parts,
          { type: 'text', text: last.content },
        ],
      };
    }
  }

  // Append agentic turns. ModelMessage's tool-call/tool-result parts are the
  // SDK's provider-agnostic representation; each provider adapter converts
  // these to its native wire format on the way out.
  for (const round of priorRounds) {
    const assistantParts: Array<
      | { type: 'text'; text: string }
      | { type: 'reasoning'; text: string; providerOptions?: ProviderOptions }
      | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown; providerOptions?: ProviderOptions }
    > = [];
    // Reasoning parts MUST precede the tool-call parts they accompanied.
    // OpenAI's Responses API rejects a `function_call` input item that
    // isn't preceded by its sibling `reasoning` item (matched by itemId
    // in providerMetadata) — see the error
    //   "Item 'fc_…' of type 'function_call' was provided without its
    //    required 'reasoning' item: 'rs_…'".
    for (const r of round.reasoningParts) {
      assistantParts.push({
        type: 'reasoning',
        text: r.text,
        ...(r.providerMetadata ? { providerOptions: r.providerMetadata } : {}),
      });
    }
    if (round.assistantText) {
      assistantParts.push({ type: 'text', text: round.assistantText });
    }
    // Build a toolCallId → toolName map from the assistant turn so each
    // tool-result is paired with the right tool name. Without this the
    // provider sees a mismatched tool_call_id ↔ tool_name pair on the
    // follow-up turn (e.g. asking for search_tasks but the result claims
    // it was search_vault) and silently drops the result, leaving the
    // model with no grounding for round 2.
    const toolNameById = new Map<string, string>();
    for (const call of round.assistantToolCalls) {
      // providerMetadata captured during streaming becomes providerOptions
      // on the way back — the AI SDK uses different field names for the
      // same shape on stream events vs outgoing message parts. Gemini
      // requires its `thoughtSignature` round-trip; OpenAI ignores it.
      assistantParts.push({
        type: 'tool-call',
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
        ...(call.providerMetadata ? { providerOptions: call.providerMetadata } : {}),
      });
      toolNameById.set(call.toolCallId, call.toolName);
    }
    modelMessages.push({ role: 'assistant', content: assistantParts });

    const toolParts = round.toolResults.map((r) => ({
      type: 'tool-result' as const,
      toolCallId: r.toolCallId,
      toolName: toolNameById.get(r.toolCallId) ?? 'search_vault',
      output: { type: 'text' as const, value: r.output },
    }));
    if (toolParts.length > 0) {
      modelMessages.push({ role: 'tool', content: toolParts });
    }
  }

  // Consume fullStream so the UI sees the provider-normalized chunk stream
  // directly. Some direct-browser Anthropic runs surfaced raw transport
  // events to the network panel while `textStream` stayed silent, which
  // meant the request completed and persisted but no live text rendered.
  let streamError: unknown = null;
  try {
    const tools = opts.withEditTools
      ? { ...EDIT_TOOLS, ...getMcpManager().getActiveTools() }
      : undefined;
    // For OpenAI's reasoning-capable models (gpt-5.x), default reasoning
    // effort is "medium" which can spend tens of seconds — minutes —
    // thinking before producing the first token, especially on long
    // agentic threads. Chat-style turns need to feel responsive, so we
    // clamp to "low". Users who want deeper reasoning can still see it
    // via the reasoning stream; we just don't pay the latency tax by
    // default. Other providers ignore the unknown providerOptions key.
    const result = streamText({
      model,
      system: opts.system,
      messages: modelMessages,
      abortSignal: opts.signal,
      tools,
      providerOptions: {
        openai: { reasoningEffort: 'low' },
      },
      onError: ({ error }) => {
        streamError = error;
      },
    });

    let full = '';
    const calls: ToolCallRecord[] = [];
    // Buffer reasoning text by stream id until `reasoning-end`. OpenAI's
    // Responses API emits one rs_* per stream id; the SDK forwards them as
    // start/delta/end triples carrying providerMetadata with that itemId.
    const reasoningBuffers = new Map<string, { text: string; providerMetadata?: ProviderOptions }>();
    const reasoningParts: ReasoningRecord[] = [];
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        const delta = (part as { text?: string; delta?: string }).text
          ?? (part as { delta?: string }).delta
          ?? '';
        if (!delta) continue;
        full += delta;
        opts.onDelta(delta);
      } else if (part.type === 'tool-call') {
        const toolName = (part as { toolName: string }).toolName;
        const input = (part as { input?: unknown }).input;
        const toolCallId = (part as { toolCallId: string }).toolCallId;
        // Capture providerMetadata so Gemini's `thoughtSignature` survives
        // into the follow-up assistant message — without it Gemini errors
        // out on the next request. The shape is already `ProviderOptions`
        // (the SDK uses `providerMetadata` on stream events and the same
        // type as `providerOptions` on outgoing message parts).
        const providerMetadata = (part as { providerMetadata?: ProviderOptions }).providerMetadata;
        calls.push({
          toolCallId,
          toolName,
          input,
          inputRaw: typeof input === 'string' ? input : JSON.stringify(input ?? {}),
          ...(providerMetadata ? { providerMetadata } : {}),
        });
      } else if (part.type === 'reasoning-start') {
        const p = part as { id: string; providerMetadata?: ProviderOptions };
        reasoningBuffers.set(p.id, { text: '', providerMetadata: p.providerMetadata });
      } else if (part.type === 'reasoning-delta') {
        const p = part as { id: string; delta?: string; providerMetadata?: ProviderOptions };
        const buf = reasoningBuffers.get(p.id);
        if (buf) {
          if (p.delta) buf.text += p.delta;
          if (p.providerMetadata) buf.providerMetadata = p.providerMetadata;
        }
      } else if (part.type === 'reasoning-end') {
        const p = part as { id: string; providerMetadata?: ProviderOptions };
        const buf = reasoningBuffers.get(p.id);
        if (buf) {
          if (p.providerMetadata) buf.providerMetadata = p.providerMetadata;
          reasoningParts.push({
            text: buf.text,
            ...(buf.providerMetadata ? { providerMetadata: buf.providerMetadata } : {}),
          });
          reasoningBuffers.delete(p.id);
        }
      }
    }
    // Any buffers still open at stream-end (the SDK didn't emit a matching
    // `reasoning-end`) still need to round-trip — the itemId on the
    // function_call sibling will reference them.
    for (const buf of Array.from(reasoningBuffers.values())) {
      reasoningParts.push({
        text: buf.text,
        ...(buf.providerMetadata ? { providerMetadata: buf.providerMetadata } : {}),
      });
    }
    if (streamError) throw streamError;
    return { text: full, toolCalls: calls, reasoningParts };
  } catch (err) {
    throw normalizeError(err, opts.providerId);
  }
}
