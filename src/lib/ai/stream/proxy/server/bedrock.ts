// Bedrock-specific server helpers used by the proxy + test routes. Region
// resolution and inference-profile-prefix logic live here so the route
// handlers stay narrow.

import { BEDROCK_REGION, BEDROCK_REGIONS } from '../../../index';

const HAS_PREFIX_RE = /^(global|us|us-gov|eu|apac|jp|au)\./;

/**
 * Resolve a Bedrock model ID for the given region. Modern Claude 4.x and
 * Nova 2 use `global.*` profiles that work in every region — those are
 * stored fully-qualified in PROVIDERS and pass through verbatim. Older
 * Nova v1 / Llama / Mistral are stored bare (e.g. `amazon.nova-pro-v1:0`)
 * and need a regional inference-profile prefix prepended at request time
 * (`apac.amazon.nova-pro-v1:0` for Asia, `us.amazon.nova-pro-v1:0` for US,
 * etc.). If a caller pins their own prefix (`us.anthropic.…`) we leave it
 * alone — power users can target a specific geo.
 */
export function applyBedrockRegionalPrefix(modelId: string, region: string): string {
  if (HAS_PREFIX_RE.test(modelId)) return modelId;
  const entry = BEDROCK_REGIONS.find(r => r.id === region);
  const prefix = entry?.prefix ?? '';
  return prefix ? `${prefix}${modelId}` : modelId;
}

export function resolveBedrockRegion(raw: unknown): string {
  if (typeof raw === 'string' && BEDROCK_REGIONS.some(r => r.id === raw)) return raw;
  return BEDROCK_REGION;
}

/**
 * Short-term Bedrock API keys (12-hour expiry) are `bedrock-api-key-`
 * followed by a base64-encoded presigned URL whose `X-Amz-Credential`
 * scope embeds the region the key was issued for. Pull it out so the route
 * can use the right region even if the user picked a different one in the
 * dropdown — the key is region-locked, the dropdown is a hint at best.
 *
 * Long-term API keys (different format) won't match this scheme; the
 * function returns null and the caller falls back to the user's choice.
 */
export function extractBedrockKeyRegion(apiKey: string): string | null {
  if (!apiKey || !apiKey.startsWith('bedrock-api-key-')) return null;
  const b64 = apiKey.slice('bedrock-api-key-'.length);
  let decoded: string;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return null;
  }
  // The credential scope looks like:
  //   X-Amz-Credential=ASIA…%2F20260430%2Fap-northeast-2%2Fbedrock%2Faws4_request
  // We want the third segment (the region).
  const match = decoded.match(/X-Amz-Credential=[^&]+/);
  if (!match) return null;
  const credValue = decodeURIComponent(match[0].slice('X-Amz-Credential='.length));
  const parts = credValue.split('/');
  if (parts.length < 3) return null;
  const region = parts[2];
  if (!BEDROCK_REGIONS.some(r => r.id === region)) return null;
  return region;
}
