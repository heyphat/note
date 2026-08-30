// Integration tests for the Bedrock proxy route. The AWS SDK is fully
// mocked so the test exercises the wiring (body parsing, region
// resolution, model-prefix application, SSE protocol) without touching
// the network.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { createAmazonBedrockMock, streamTextMock, modelMock } = vi.hoisted(() => {
  const modelMock = vi.fn();
  const createAmazonBedrockMock = vi.fn();
  const streamTextMock = vi.fn();
  return { createAmazonBedrockMock, streamTextMock, modelMock };
});

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: createAmazonBedrockMock,
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: streamTextMock,
  };
});

import { POST } from './route';

function asyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/bedrock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/bedrock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAmazonBedrockMock.mockReturnValue(modelMock);
    modelMock.mockReturnValue({});
    streamTextMock.mockReturnValue({ fullStream: asyncIterable([]) });
  });

  it('rejects body without a credential', async () => {
    const res = await POST(makeReq({ model: 'global.anthropic.claude-sonnet-4-6', messages: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/credential/i);
  });

  it('uses the user-selected region when the key has no embedded region', async () => {
    const res = await POST(makeReq({
      credential: 'plain-long-term-key',
      model: 'global.anthropic.claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      region: 'us-west-2',
    }));
    expect(res.status).toBe(200);
    expect(createAmazonBedrockMock).toHaveBeenCalledWith({
      apiKey: 'plain-long-term-key',
      region: 'us-west-2',
    });
    expect(modelMock).toHaveBeenCalledWith('global.anthropic.claude-sonnet-4-6');
  });

  it("prefers the key's embedded region over the user's dropdown choice", async () => {
    const url = 'bedrock.amazonaws.com/?Action=CallWithBearerToken&X-Amz-Credential=ASIATEST%2F20260101%2Fap-northeast-2%2Fbedrock%2Faws4_request';
    const key = `bedrock-api-key-${Buffer.from(url, 'utf-8').toString('base64')}`;

    await POST(makeReq({
      credential: key,
      region: 'ap-northeast-1',
      model: 'global.anthropic.claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    }));

    expect(createAmazonBedrockMock).toHaveBeenCalledWith({
      apiKey: key,
      region: 'ap-northeast-2',
    });
  });

  it('applies the regional inference-profile prefix to bare model IDs', async () => {
    await POST(makeReq({
      credential: 'k',
      model: 'amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: 'hi' }],
      region: 'ap-northeast-2',
    }));
    expect(modelMock).toHaveBeenCalledWith('apac.amazon.nova-pro-v1:0');
  });

  it('streams text-delta chunks back as SSE', async () => {
    streamTextMock.mockReturnValue({
      fullStream: asyncIterable([
        { type: 'text-delta', text: 'Hello' },
        { type: 'text-delta', text: ' world' },
      ]),
    });

    const res = await POST(makeReq({
      credential: 'k',
      model: 'global.anthropic.claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const body = await res.text();
    expect(body).toContain('event: text');
    expect(body).toContain('"delta":"Hello"');
    expect(body).toContain('"delta":" world"');
    expect(body).toContain('event: done');
  });

  it('forwards tool-call chunks as SSE tool events', async () => {
    streamTextMock.mockReturnValue({
      fullStream: asyncIterable([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'edit_note',
          input: { find: 'a', replace: 'b' },
        },
      ]),
    });
    const res = await POST(makeReq({
      credential: 'k',
      model: 'global.anthropic.claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'fix' }],
      withEditTools: true,
    }));
    const body = await res.text();
    expect(body).toContain('event: tool');
    expect(body).toContain('"toolName":"edit_note"');
    expect(body).toContain('"toolCallId":"call_1"');
  });
});
