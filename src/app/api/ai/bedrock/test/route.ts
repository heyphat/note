// Validate a Bedrock API key by doing a minimal runtime invocation
// (1-token completion) against the user's selected model and region.
// Bedrock API keys ship with inference-only permissions by default — they
// cannot call control-plane endpoints like ListFoundationModels, so a
// /foundation-models GET would 403 valid keys. A 1-token Converse call
// costs fractions of a cent and exercises the same code path real chats
// use, including the regional inference-profile prefix.

import { NextRequest, NextResponse } from 'next/server';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { PROVIDERS } from '@/lib/ai';
import {
  applyBedrockRegionalPrefix, resolveBedrockRegion, extractBedrockKeyRegion,
} from '@/lib/ai/stream/proxy/server/bedrock';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { credential?: unknown; model?: unknown; region?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const credential = typeof body.credential === 'string' ? body.credential : '';
  if (!credential) {
    return NextResponse.json({ error: 'Missing Bedrock API key' }, { status: 400 });
  }
  const baseModel = typeof body.model === 'string' && body.model
    ? body.model
    : PROVIDERS.bedrock.defaultModel;
  const region = extractBedrockKeyRegion(credential) ?? resolveBedrockRegion(body.region);
  const model = applyBedrockRegionalPrefix(baseModel, region);

  try {
    const bedrock = createAmazonBedrock({ apiKey: credential, region });
    await generateText({
      model: bedrock(model),
      prompt: 'hi',
      maxOutputTokens: 1,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bedrock test failed';
    const status = (err as { statusCode?: number })?.statusCode ?? 401;
    return NextResponse.json({ error: message }, { status });
  }
}
