// AWS Bedrock browser-side proxy caller. Bedrock blocks browser-direct
// calls (no CORS), so the wrapper here only assembles provider-specific
// extras (region from localStorage) and delegates to the shared client.
// Server-side regional-prefix logic lives in `./server/bedrock.ts`.

import { getBedrockRegion } from '../../index';
import { proxyChatRound, proxyTestConnection } from './_client';
import type { AgenticRound, RoundResult, StreamOpts } from '../shared/types';

export function bedrockChatRound(opts: StreamOpts, priorRounds: AgenticRound[]): Promise<RoundResult> {
  return proxyChatRound(opts, priorRounds, { region: getBedrockRegion() });
}

export function bedrockTestConnection(apiKey: string, modelId?: string): Promise<void> {
  return proxyTestConnection('bedrock', apiKey, modelId, { region: getBedrockRegion() });
}
