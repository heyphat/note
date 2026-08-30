// Google Gemini direct path. Browser → generativelanguage.googleapis.com
// via the AI SDK's Google Generative AI adapter. `thoughtSignature`
// round-trip is handled generically in `_ai-sdk-round.ts` (it captures
// providerMetadata on every tool-call event).

import { ChatProviderError, PROVIDERS } from '../../index';
import { aiSdkChatRound } from './_ai-sdk-round';
import { friendlyMessage } from '../shared/errors';
import type { AgenticRound, RoundResult, StreamOpts } from '../shared/types';

export function geminiChatRound(opts: StreamOpts, priorRounds: AgenticRound[]): Promise<RoundResult> {
  const factory = PROVIDERS.google.factory;
  if (!factory) {
    throw new ChatProviderError({
      provider: 'google',
      message: 'Google Gemini provider has no client factory.',
    });
  }
  return aiSdkChatRound(opts, factory(opts.apiKey)(opts.model), priorRounds);
}

export async function geminiTestConnection(apiKey: string): Promise<void> {
  // `v1beta/models` accepts the key as a query param — no auth header needed.
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (err) {
    throw new ChatProviderError({
      provider: 'google',
      message: err instanceof Error ? err.message : 'Network request failed',
    });
  }
  if (res.ok) return;
  throw new ChatProviderError({
    provider: 'google',
    status: res.status,
    message: friendlyMessage(res.status, `HTTP ${res.status}`),
  });
}
