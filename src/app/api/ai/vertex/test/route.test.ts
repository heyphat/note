// Integration tests for the Vertex AI test endpoint. Both Vertex SDK
// adapters (@ai-sdk/google-vertex and @ai-sdk/google-vertex/anthropic) and
// `generateText` are mocked, so the test exercises the wiring (JSON
// parsing, service-account validation, Gemini-vs-Claude dispatch, error
// pass-through) without touching Google.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createVertexMock, createVertexAnthropicMock, generateTextMock,
  geminiFactoryMock, claudeFactoryMock, modelMock,
} = vi.hoisted(() => {
  const modelMock = vi.fn();
  const geminiFactoryMock = vi.fn();
  const claudeFactoryMock = vi.fn();
  const createVertexMock = vi.fn();
  const createVertexAnthropicMock = vi.fn();
  const generateTextMock = vi.fn();
  return {
    createVertexMock, createVertexAnthropicMock, generateTextMock,
    geminiFactoryMock, claudeFactoryMock, modelMock,
  };
});

vi.mock('@ai-sdk/google-vertex', () => ({
  createVertex: createVertexMock,
}));
vi.mock('@ai-sdk/google-vertex/anthropic', () => ({
  createVertexAnthropic: createVertexAnthropicMock,
}));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: generateTextMock,
  };
});

import { POST } from './route';
import { PROVIDERS, VERTEX_LOCATION } from '@/lib/ai';

const VALID_SA = {
  type: 'service_account',
  project_id: 'my-test-project',
  client_email: 'sa@my-test-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nFAKEKEY\n-----END PRIVATE KEY-----\n',
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/vertex/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/ai/vertex/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createVertexMock.mockReturnValue(geminiFactoryMock);
    createVertexAnthropicMock.mockReturnValue(claudeFactoryMock);
    geminiFactoryMock.mockReturnValue(modelMock);
    claudeFactoryMock.mockReturnValue(modelMock);
    generateTextMock.mockResolvedValue({ text: '' });
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const res = await POST(makeReq('not-json{'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it('returns 400 when credential is missing', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/service-account json/i);
  });

  it('returns 400 when the credential is not parseable JSON', async () => {
    const res = await POST(makeReq({ credential: 'definitely-not-json' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not valid json/i);
  });

  it('returns 400 when the service-account JSON is missing project_id', async () => {
    const { project_id, ...rest } = VALID_SA;
    void project_id;
    const res = await POST(makeReq({ credential: JSON.stringify(rest) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/project_id/);
  });

  it('returns 400 when the service-account JSON is missing client_email', async () => {
    const { client_email, ...rest } = VALID_SA;
    void client_email;
    const res = await POST(makeReq({ credential: JSON.stringify(rest) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/client_email/);
  });

  it('returns 400 when the service-account JSON is missing private_key', async () => {
    const { private_key, ...rest } = VALID_SA;
    void private_key;
    const res = await POST(makeReq({ credential: JSON.stringify(rest) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/private_key/);
  });

  it('uses the default Vertex model when none is provided', async () => {
    const res = await POST(makeReq({ credential: JSON.stringify(VALID_SA) }));
    expect(res.status).toBe(200);
    expect(geminiFactoryMock).toHaveBeenCalledWith(PROVIDERS.vertex.defaultModel);
  });

  it('routes Gemini IDs through createVertex with the configured location and credentials', async () => {
    await POST(makeReq({
      credential: JSON.stringify(VALID_SA),
      model: 'gemini-3.1-pro-preview',
    }));
    expect(createVertexMock).toHaveBeenCalledWith({
      project: VALID_SA.project_id,
      location: VERTEX_LOCATION,
      googleAuthOptions: {
        credentials: { client_email: VALID_SA.client_email, private_key: VALID_SA.private_key },
      },
    });
    expect(geminiFactoryMock).toHaveBeenCalledWith('gemini-3.1-pro-preview');
    expect(createVertexAnthropicMock).not.toHaveBeenCalled();
  });

  it('routes Claude IDs through createVertexAnthropic instead of createVertex', async () => {
    await POST(makeReq({
      credential: JSON.stringify(VALID_SA),
      model: 'claude-sonnet-4-6',
    }));
    expect(createVertexAnthropicMock).toHaveBeenCalledTimes(1);
    expect(claudeFactoryMock).toHaveBeenCalledWith('claude-sonnet-4-6');
    expect(createVertexMock).not.toHaveBeenCalled();
  });

  it('also routes versioned Claude IDs (with @date suffix) through the Anthropic adapter', async () => {
    await POST(makeReq({
      credential: JSON.stringify(VALID_SA),
      model: 'claude-haiku-4-5@20251001',
    }));
    expect(createVertexAnthropicMock).toHaveBeenCalled();
    expect(claudeFactoryMock).toHaveBeenCalledWith('claude-haiku-4-5@20251001');
  });

  it('returns 200 with { ok: true } when generateText resolves', async () => {
    const res = await POST(makeReq({ credential: JSON.stringify(VALID_SA) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('forwards the upstream Google error message and status when generateText throws', async () => {
    const err = Object.assign(
      new Error('Publisher Model `…/gemini-3-pro-preview` was not found or your project does not have access to it.'),
      { statusCode: 404 },
    );
    generateTextMock.mockRejectedValueOnce(err);

    const res = await POST(makeReq({
      credential: JSON.stringify(VALID_SA),
      model: 'gemini-3-pro-preview',
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Publisher Model');
  });

  it('falls back to status 401 when the upstream error has no statusCode', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('private_key invalid'));
    const res = await POST(makeReq({ credential: JSON.stringify(VALID_SA) }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/private_key invalid/);
  });
});
