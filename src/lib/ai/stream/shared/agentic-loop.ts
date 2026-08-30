// Provider-agnostic agentic loop. Each provider module (under `direct/`
// and `proxy/`) exports a `<provider>ChatRound` function with the same
// shape; this file's `runOneRound` is just a `switch` that picks the
// right one based on `opts.providerId`. The outer `chatStream` wraps that
// in a multi-round loop that auto-executes read-only tools and feeds the
// results back into the model on the next turn.
//
// Adding a sixth provider = new file under direct/ or proxy/ + two new
// case branches here (one for chat, one for testConnection).

import { READ_ONLY_TOOL_NAMES } from '../../tools';
import { ChatProviderError, type ProviderId } from '../../index';
import { McpManager, getMcpManager } from '../../mcp';
import { anthropicChatRound, anthropicTestConnection } from '../direct/anthropic';
import { openaiChatRound, openaiTestConnection } from '../direct/openai';
import { geminiChatRound, geminiTestConnection } from '../direct/gemini';
import { bedrockChatRound, bedrockTestConnection } from '../proxy/bedrock';
import { vertexChatRound, vertexTestConnection } from '../proxy/vertex';
import { emitValidatedToolCall } from './tool-validation';
import type {
  AgenticRound, ProviderChatRound, ProviderTestConnection, RoundResult,
  StreamOpts, ToolCallRecord,
} from './types';

const READ_ONLY_TOOL_SET = new Set<string>(READ_ONLY_TOOL_NAMES);

/**
 * Classify a tool call as auto-executable or as needing user approval.
 * Built-ins consult the closed READ_ONLY_TOOL_NAMES set; MCP tools consult
 * the manager's annotation map, which auto-executes anything not flagged
 * `destructiveHint: true`. (The spec says unannotated → treat as mutation,
 * but that breaks the agentic loop because a paused approval has no path
 * to feed results back; we trust the user-added server instead.)
 */
function isReadOnlyToolCall(toolName: string): boolean {
  if (READ_ONLY_TOOL_SET.has(toolName)) return true;
  if (McpManager.isMcpToolName(toolName)) return getMcpManager().isReadOnly(toolName);
  return false;
}

/** Hard cap on agentic iterations to prevent the model from looping forever. */
export const MAX_AGENTIC_ITERATIONS = 20;

const ROUND_BY_PROVIDER: Record<ProviderId, ProviderChatRound> = {
  anthropic: anthropicChatRound,
  openai:    openaiChatRound,
  google:    geminiChatRound,
  bedrock:   bedrockChatRound,
  vertex:    vertexChatRound,
};

const TEST_BY_PROVIDER: Record<ProviderId, ProviderTestConnection> = {
  anthropic: (apiKey) => anthropicTestConnection(apiKey),
  openai:    (apiKey) => openaiTestConnection(apiKey),
  google:    (apiKey) => geminiTestConnection(apiKey),
  bedrock:   (apiKey, modelId) => bedrockTestConnection(apiKey, modelId),
  vertex:    (apiKey, modelId) => vertexTestConnection(apiKey, modelId),
};

function runOneRound(opts: StreamOpts, priorRounds: AgenticRound[]): Promise<RoundResult> {
  return ROUND_BY_PROVIDER[opts.providerId](opts, priorRounds);
}

/**
 * Run a chat turn end-to-end, including any agentic sub-rounds where the
 * model calls a read-only tool (currently `search_vault`) and we feed the
 * result back. Each provider has its own single-round implementation; the
 * loop here is provider-agnostic.
 *
 * Stopping conditions:
 *   - The round emitted no tool calls → we're done, return.
 *   - The round emitted a mutation (edit_note, etc.) → we surface it to the
 *     UI as a proposal and stop. The user-approval step is what advances
 *     the conversation; the model doesn't get another turn until they reply.
 *   - The model exceeded MAX_AGENTIC_ITERATIONS → stop to avoid runaway
 *     loops on models that compulsively re-search.
 */
export async function chatStream(opts: StreamOpts): Promise<{ fullText: string }> {
  const rounds: AgenticRound[] = [];
  let combinedText = '';
  let iter = 0;
  while (true) {
    iter += 1;
    const inner = await runOneRound(opts, rounds);
    combinedText += inner.text;
    if (opts.signal?.aborted) break;

    const readOnlyCalls: ToolCallRecord[] = [];
    const otherCalls: ToolCallRecord[] = [];
    for (const call of inner.toolCalls) {
      if (isReadOnlyToolCall(call.toolName)) readOnlyCalls.push(call);
      else otherCalls.push(call);
    }

    // Fan mutating calls out to the proposal UI exactly as before. (The inner
    // round didn't surface them on its own — it just collected them.)
    for (const call of otherCalls) {
      emitValidatedToolCall(call.toolCallId, call.toolName, call.input, opts.onProposedEdit);
    }

    // Read-only calls without an executor fall through to onProposedEdit too.
    // That keeps the legacy code path working when no search backend is
    // wired in yet — the user just sees an inert "search_vault" proposal.
    if (readOnlyCalls.length === 0 || !opts.executeReadOnlyTool) {
      for (const call of readOnlyCalls) {
        emitValidatedToolCall(call.toolCallId, call.toolName, call.input, opts.onProposedEdit);
      }
      break;
    }

    // Mutations short-circuit the loop: every tool_use needs a paired
    // tool_result on the next request, and we don't want to fabricate a
    // result for an edit the user hasn't approved yet. The user's next
    // message starts a fresh agentic chain, so the queued search results
    // (which the model never sees) are dropped — small price for a clean
    // protocol state. Steer the model away from this in the prompt.
    if (otherCalls.length > 0) break;

    // Hit the cap. Execute the pending search results so the model has its
    // last batch of grounding, then run one final tools-disabled round to
    // force a text response. Without this fallback a model that loops on
    // tool calls leaves the user with an empty bubble — even when the
    // searches succeeded.
    const wrapUpAfter = iter >= MAX_AGENTIC_ITERATIONS;

    const toolResults: AgenticRound['toolResults'] = [];
    for (const call of readOnlyCalls) {
      let output: string;
      try {
        output = await opts.executeReadOnlyTool(call.toolName, call.input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        output = JSON.stringify({ error: message });
        opts.onReadOnlyToolEvent?.({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input,
          result: output,
          error: message,
        });
        toolResults.push({ toolCallId: call.toolCallId, output });
        continue;
      }
      opts.onReadOnlyToolEvent?.({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
        result: output,
      });
      toolResults.push({ toolCallId: call.toolCallId, output });
    }

    rounds.push({
      assistantText: inner.text,
      assistantToolCalls: inner.toolCalls,
      reasoningParts: inner.reasoningParts,
      toolResults,
    });

    if (wrapUpAfter) {
      // Force a text-only summary turn. Tools are disabled so the model
      // physically cannot loop again; it has to summarize what the search
      // results showed.
      const finalRound = await runOneRound({ ...opts, withEditTools: false }, rounds);
      combinedText += finalRound.text;
      break;
    }
  }
  return { fullText: combinedText };
}

/**
 * Quick check that an API key is live. Dispatches to the right provider's
 * implementation — direct providers hit each provider's lightweight
 * /models endpoint with a bare HTTP request; proxy providers POST to
 * `/api/ai/<provider>/test` and let the route validate server-side.
 */
export function testConnection(providerId: ProviderId, apiKey: string, modelId?: string): Promise<void> {
  const impl = TEST_BY_PROVIDER[providerId];
  if (!impl) {
    return Promise.reject(new ChatProviderError({
      provider: providerId,
      message: `No connection test for provider '${providerId}'.`,
    }));
  }
  return impl(apiKey, modelId);
}
