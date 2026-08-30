// Shared types for the streaming pipeline. These live here so per-provider
// modules under `direct/` and `proxy/` (and the agentic loop in this
// directory) can all speak the same shape without depending on each other.

import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { ChatMessage, ProviderId } from '../../index';
import type { ImageAttachment } from '../../images';
import type { ProposedEditInput } from '../../tools';

export type ProposedEdit = ProposedEditInput & { toolCallId: string };

export type ProviderAttachmentKind = 'image' | 'pdf';

export interface ProviderAttachment {
  kind: ProviderAttachmentKind;
  bytes: Uint8Array;
  mimeType: string;
  filename?: string;
}

/**
 * Executor for read-only tools the chat hook auto-runs. Originally just
 * `search_vault`; now also covers MCP tools whose `annotations.readOnlyHint`
 * is true (their namespaced names start with `mcp__`). Returns the JSON or
 * text result the model will see in the next turn's `tool_result`. Throwing
 * surfaces as a user-visible tool failure, but the loop continues so the
 * model can recover.
 */
export type ReadOnlyToolExecutor = (
  toolName: string,
  input: unknown,
) => Promise<string>;

/**
 * Optional listener invoked when an agentic turn's read-only tool calls have
 * been executed. The chat UI uses this to render a small "🔍 Searched for X
 * — N hits" affordance inline so the user understands why the assistant
 * paused before responding. `toolName` is the literal name the model called
 * — built-ins like `search_vault` plus any `mcp__server__tool` MCP variant.
 */
export type ReadOnlyToolEventListener = (event: {
  toolCallId: string;
  toolName: string;
  input: unknown;
  result: string;
  error?: string;
}) => void;

export interface StreamOpts {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  system?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onDelta: (chunk: string) => void;
  /** If true, advertise edit tools to the model and forward tool-call events. */
  withEditTools?: boolean;
  /** Called when the model proposes an edit (tool call observed in fullStream). */
  onProposedEdit?: (edit: ProposedEdit) => void;
  /**
   * Auto-executor for read-only tools. When supplied, calls to `search_vault`
   * are run synchronously and their results fed back into the model on a
   * follow-up streaming turn. When omitted, read-only tool calls fall
   * through to `onProposedEdit` (legacy behavior — they appear as inert
   * proposals the user can dismiss).
   */
  executeReadOnlyTool?: ReadOnlyToolExecutor;
  /** Notified after each successful read-only tool invocation. */
  onReadOnlyToolEvent?: ReadOnlyToolEventListener;
  /** Legacy: images-only attachments. Prefer `attachments` for new code. */
  images?: ImageAttachment[];
  /** Images + PDFs attached to the latest user turn (provider-specific encoding). */
  attachments?: ProviderAttachment[];
}

/**
 * Captured tool call from a single round of streaming. The `input` is the
 * fully-parsed JSON object the model emitted; `inputRaw` is the raw string
 * (preserved for re-encoding into the next-turn assistant message exactly
 * as the provider sent it, so providers that hash on the wire get a match).
 *
 * `providerMetadata` carries provider-specific metadata that has to be
 * threaded back into the next-turn assistant message — most importantly
 * Gemini's `thoughtSignature`, which the API rejects requests for if it's
 * stripped from a follow-up function-call part. The AI SDK exposes it on
 * the streamed `tool-call` event under `providerMetadata`, then accepts it
 * back as `providerOptions` on the outgoing ToolCallPart (same shape).
 */
export interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  input: unknown;
  inputRaw: string;
  providerMetadata?: ProviderOptions;
}

/**
 * One reasoning block the model emitted alongside its tool calls. Captured
 * so we can replay it on the next request: OpenAI's Responses API rejects a
 * follow-up that contains a `function_call` item without the matching
 * `reasoning` item that originally accompanied it. `providerMetadata`
 * carries the provider's own item id (e.g. `{ openai: { itemId: 'rs_…' } }`)
 * which the AI SDK uses to reconstruct the wire item.
 */
export interface ReasoningRecord {
  text: string;
  providerMetadata?: ProviderOptions;
}

/**
 * One round-trip of agentic streaming: the assistant turn the model just
 * emitted (text + any tool calls) plus the synthesized user/tool turn that
 * carries the executor's results back. Both halves are kept together so the
 * provider adapter can re-emit them as a paired pair on the next request.
 */
export interface AgenticRound {
  assistantText: string;
  assistantToolCalls: ToolCallRecord[];
  reasoningParts: ReasoningRecord[];
  toolResults: Array<{ toolCallId: string; output: string }>;
}

export interface RoundResult {
  text: string;
  toolCalls: ToolCallRecord[];
  reasoningParts: ReasoningRecord[];
}

/**
 * JSON-safe encoding of agentic rounds for the proxy wire format. The proxy
 * route translates these into ModelMessage parts (assistant tool-call +
 * tool-result) before handing off to streamText.
 */
export interface SerializedAgenticRound {
  assistantText: string;
  assistantToolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    providerMetadata?: ProviderOptions;
  }>;
  /** Reasoning blocks the model emitted alongside its tool calls. Required
   *  for OpenAI Responses round-trips — see `ReasoningRecord` for context. */
  reasoningParts?: Array<{
    text: string;
    providerMetadata?: ProviderOptions;
  }>;
  toolResults: Array<{ toolCallId: string; output: string }>;
}

/**
 * Per-provider round implementation. Each module under `direct/` and
 * `proxy/` exports one of these; the dispatcher in `agentic-loop.ts`
 * switches on `providerId` and calls into the right one.
 */
export type ProviderChatRound = (
  opts: StreamOpts,
  priorRounds: AgenticRound[],
) => Promise<RoundResult>;

/**
 * Per-provider connection test. Used by the settings UI's "Test" button.
 * Throws ChatProviderError on failure; returns void on success.
 */
export type ProviderTestConnection = (apiKey: string, modelId?: string) => Promise<void>;
