// AWS Bedrock proxy. Bedrock APIs reject browser-direct calls (no CORS) so
// the chat panel POSTs here and the SDK runs server-side. The caller's API
// key arrives in each request body and is never persisted. Region is read
// from the key's embedded credential scope (short-term keys) and falls
// back to the user's dropdown for long-term keys.

import { NextRequest, NextResponse } from 'next/server';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import {
  parseProxyBody, proxyStreamResponse, EDIT_TOOLS,
  buildMcpToolSdkRecord,
} from '@/lib/ai/stream/proxy/server/common';
import {
  applyBedrockRegionalPrefix, resolveBedrockRegion, extractBedrockKeyRegion,
} from '@/lib/ai/stream/proxy/server/bedrock';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = await parseProxyBody(req);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request body' },
      { status: 400 },
    );
  }

  // Short-term keys are region-locked; trust the key's embedded scope over
  // the user's dropdown choice when we can read it.
  const region = extractBedrockKeyRegion(parsed.credential) ?? resolveBedrockRegion(parsed.region);
  const modelId = applyBedrockRegionalPrefix(parsed.model, region);

  const bedrock = createAmazonBedrock({ apiKey: parsed.credential, region });
  // Merge browser-supplied MCP tool defs into the AI SDK tools record so
  // Bedrock-routed turns can call `mcp__server__tool` names. Without this
  // the model sees the MCP tools in the system prompt (advertised by the
  // browser) and tries to call them, but the SDK rejects the call with
  // "unavailable tool" because the proxy never declared them.
  const tools = parsed.withEditTools
    ? { ...EDIT_TOOLS, ...buildMcpToolSdkRecord(parsed.mcpTools) }
    : undefined;
  const result = streamText({
    model: bedrock(modelId),
    system: parsed.system,
    messages: parsed.modelMessages,
    tools,
  });

  return proxyStreamResponse({ result, providerLabel: 'Bedrock' });
}
