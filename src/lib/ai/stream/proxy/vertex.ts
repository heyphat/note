// Google Vertex AI browser-side proxy caller. Vertex doesn't permit
// browser-direct calls, so the wrapper just delegates to the shared
// client — no provider-specific extras are needed (location is
// hard-coded server-side via `VERTEX_LOCATION`).

import { proxyChatRound, proxyTestConnection } from './_client';
import type { AgenticRound, RoundResult, StreamOpts } from '../shared/types';

export function vertexChatRound(opts: StreamOpts, priorRounds: AgenticRound[]): Promise<RoundResult> {
  return proxyChatRound(opts, priorRounds);
}

export function vertexTestConnection(apiKey: string, modelId?: string): Promise<void> {
  return proxyTestConnection('vertex', apiKey, modelId);
}
