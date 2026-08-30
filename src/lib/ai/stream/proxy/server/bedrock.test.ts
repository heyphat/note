import { describe, expect, it } from 'vitest';
import {
  applyBedrockRegionalPrefix, resolveBedrockRegion, extractBedrockKeyRegion,
} from './bedrock';
import { BEDROCK_REGION } from '../../../index';

describe('applyBedrockRegionalPrefix', () => {
  it('passes through models that already carry a global. profile prefix', () => {
    expect(applyBedrockRegionalPrefix('global.anthropic.claude-sonnet-4-6', 'ap-northeast-2'))
      .toBe('global.anthropic.claude-sonnet-4-6');
    expect(applyBedrockRegionalPrefix('global.anthropic.claude-opus-4-7', 'us-east-1'))
      .toBe('global.anthropic.claude-opus-4-7');
  });

  it('passes through models that already carry a regional prefix', () => {
    expect(applyBedrockRegionalPrefix('apac.amazon.nova-pro-v1:0', 'us-east-1'))
      .toBe('apac.amazon.nova-pro-v1:0');
    expect(applyBedrockRegionalPrefix('us.anthropic.claude-3-5-sonnet-20241022-v2:0', 'eu-west-1'))
      .toBe('us.anthropic.claude-3-5-sonnet-20241022-v2:0');
  });

  it('prepends apac. prefix for bare IDs in Seoul', () => {
    expect(applyBedrockRegionalPrefix('amazon.nova-pro-v1:0', 'ap-northeast-2'))
      .toBe('apac.amazon.nova-pro-v1:0');
    expect(applyBedrockRegionalPrefix('meta.llama4-maverick-17b-instruct-v1:0', 'ap-northeast-1'))
      .toBe('apac.meta.llama4-maverick-17b-instruct-v1:0');
  });

  it('prepends us. prefix for bare IDs in US regions', () => {
    expect(applyBedrockRegionalPrefix('amazon.nova-pro-v1:0', 'us-east-1'))
      .toBe('us.amazon.nova-pro-v1:0');
    expect(applyBedrockRegionalPrefix('mistral.mistral-large-2407-v1:0', 'us-west-2'))
      .toBe('us.mistral.mistral-large-2407-v1:0');
  });

  it('prepends eu. prefix for bare IDs in EU regions', () => {
    expect(applyBedrockRegionalPrefix('amazon.nova-pro-v1:0', 'eu-west-1'))
      .toBe('eu.amazon.nova-pro-v1:0');
  });

  it('falls back to bare passthrough for unknown regions', () => {
    expect(applyBedrockRegionalPrefix('amazon.nova-pro-v1:0', 'xx-fake-1'))
      .toBe('amazon.nova-pro-v1:0');
  });
});

describe('resolveBedrockRegion', () => {
  it('returns the region when valid', () => {
    expect(resolveBedrockRegion('ap-northeast-2')).toBe('ap-northeast-2');
    expect(resolveBedrockRegion('us-east-1')).toBe('us-east-1');
  });

  it('falls back to the default for unknown regions', () => {
    expect(resolveBedrockRegion('xx-fake-1')).toBe(BEDROCK_REGION);
    expect(resolveBedrockRegion(undefined)).toBe(BEDROCK_REGION);
    expect(resolveBedrockRegion(null)).toBe(BEDROCK_REGION);
    expect(resolveBedrockRegion(123)).toBe(BEDROCK_REGION);
  });
});

describe('extractBedrockKeyRegion', () => {
  // Build a fake short-term key with a known region in its credential scope.
  function buildShortTermKey(region: string): string {
    const url = `bedrock.amazonaws.com/?Action=CallWithBearerToken&X-Amz-Credential=ASIATEST%2F20260101%2F${region}%2Fbedrock%2Faws4_request&X-Amz-Date=20260101T000000Z`;
    return `bedrock-api-key-${Buffer.from(url, 'utf-8').toString('base64')}`;
  }

  it('pulls the region out of the credential scope', () => {
    expect(extractBedrockKeyRegion(buildShortTermKey('ap-northeast-2'))).toBe('ap-northeast-2');
    expect(extractBedrockKeyRegion(buildShortTermKey('us-west-2'))).toBe('us-west-2');
    expect(extractBedrockKeyRegion(buildShortTermKey('eu-west-1'))).toBe('eu-west-1');
  });

  it('returns null for keys that do not start with bedrock-api-key-', () => {
    expect(extractBedrockKeyRegion('AKIASOMEACCESSKEY')).toBeNull();
    expect(extractBedrockKeyRegion('')).toBeNull();
  });

  it('returns null when the embedded region is not in the supported list', () => {
    expect(extractBedrockKeyRegion(buildShortTermKey('xx-fake-1'))).toBeNull();
  });

  it('returns null when the base64 payload is malformed', () => {
    expect(extractBedrockKeyRegion('bedrock-api-key-not!base64!')).toBeNull();
    expect(extractBedrockKeyRegion('bedrock-api-key-aGVsbG8=')).toBeNull();
  });

  it('handles the real-world short-term key shape from the Bedrock console', () => {
    // The shape the Bedrock console emits: a presigned URL carrying the
    // credential scope, expiry, and signed headers. The key ID below is AWS's
    // documented example value — a real one would identify the account it was
    // minted in, so don't paste one here.
    const url = 'bedrock.amazonaws.com/?Action=CallWithBearerToken&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAIOSFODNN7EXAMPLE%2F20260430%2Fap-northeast-2%2Fbedrock%2Faws4_request&X-Amz-Date=20260430T004719Z&X-Amz-Expires=43200&X-Amz-SignedHeaders=host&Version=1';
    const key = `bedrock-api-key-${Buffer.from(url, 'utf-8').toString('base64')}`;
    expect(extractBedrockKeyRegion(key)).toBe('ap-northeast-2');
  });
});
