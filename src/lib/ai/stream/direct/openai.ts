// OpenAI direct path. Browser → api.openai.com via the AI SDK's OpenAI
// adapter. Reasoning-effort clamping for gpt-5.x lives in
// `_ai-sdk-round.ts` (it's keyed on the `openai` providerOptions namespace,
// which other adapters ignore).

import { ChatProviderError, PROVIDERS } from '../../index';
import { aiSdkChatRound } from './_ai-sdk-round';
import { friendlyMessage } from '../shared/errors';
import type { AgenticRound, RoundResult, StreamOpts } from '../shared/types';

export function openaiChatRound(opts: StreamOpts, priorRounds: AgenticRound[]): Promise<RoundResult> {
  const factory = PROVIDERS.openai.factory;
  if (!factory) {
    throw new ChatProviderError({
      provider: 'openai',
      message: 'OpenAI provider has no client factory.',
    });
  }
  return aiSdkChatRound(opts, factory(opts.apiKey)(opts.model), priorRounds);
}

// Quick liveness check. Plain GET against /v1/models — we intentionally
// bypass the AI SDK: its stream/generate helpers can surface non-fatal
// warnings as thrown errors, which made valid keys flash red.
export async function openaiTestConnection(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    throw new ChatProviderError({
      provider: 'openai',
      message: err instanceof Error ? err.message : 'Network request failed',
    });
  }
  if (res.ok) return;
  throw new ChatProviderError({
    provider: 'openai',
    status: res.status,
    message: friendlyMessage(res.status, `HTTP ${res.status}`),
  });
}
