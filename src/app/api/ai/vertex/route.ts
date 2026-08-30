// Google Vertex AI proxy. Vertex doesn't permit browser-direct calls, so
// the chat panel POSTs here. The user pastes their full service-account
// JSON in settings — the JSON travels in each request body, is parsed
// here, and is never persisted server-side. Project ID comes from the JSON
// itself so the user only ever fills out a single field.
//
// Model dispatch: Gemini models go through `@ai-sdk/google-vertex`;
// Anthropic Claude on Vertex is a separate sub-package
// (`@ai-sdk/google-vertex/anthropic`).

import { NextRequest, NextResponse } from 'next/server';
import { createVertex } from '@ai-sdk/google-vertex';
import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { streamText, type LanguageModel } from 'ai';
import { VERTEX_LOCATION } from '@/lib/ai';
import {
  parseProxyBody, proxyStreamResponse, EDIT_TOOLS, buildMcpToolSdkRecord,
} from '@/lib/ai/stream/proxy/server/common';

export const runtime = 'nodejs';

interface ServiceAccountJson {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
  type?: unknown;
}

interface ParsedCredential {
  projectId: string;
  credentials: { client_email: string; private_key: string };
}

function parseCredential(raw: string): ParsedCredential {
  let json: ServiceAccountJson;
  try {
    json = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new Error('Service-account JSON is not valid JSON');
  }
  if (typeof json.project_id !== 'string' || !json.project_id) {
    throw new Error('Service-account JSON is missing `project_id`');
  }
  if (typeof json.client_email !== 'string' || !json.client_email) {
    throw new Error('Service-account JSON is missing `client_email`');
  }
  if (typeof json.private_key !== 'string' || !json.private_key) {
    throw new Error('Service-account JSON is missing `private_key`');
  }
  return {
    projectId: json.project_id,
    credentials: { client_email: json.client_email, private_key: json.private_key },
  };
}

function buildVertexModel(modelId: string, parsed: ParsedCredential): LanguageModel {
  const isAnthropic = modelId.startsWith('claude-') || modelId.startsWith('anthropic.');
  const opts = {
    project: parsed.projectId,
    location: VERTEX_LOCATION,
    googleAuthOptions: { credentials: parsed.credentials },
  };
  return isAnthropic ? createVertexAnthropic(opts)(modelId) : createVertex(opts)(modelId);
}

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

  let cred: ParsedCredential;
  try {
    cred = parseCredential(parsed.credential);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid credential' },
      { status: 400 },
    );
  }

  const model = buildVertexModel(parsed.model, cred);

  const result = streamText({
    model,
    system: parsed.system,
    messages: parsed.modelMessages,
    // See bedrock/route.ts for why we merge MCP tools here — without this
    // the model can advertise `mcp__*` tools (from the system prompt) but
    // not actually call them through the Vertex AI SDK adapter.
    tools: parsed.withEditTools
      ? { ...EDIT_TOOLS, ...buildMcpToolSdkRecord(parsed.mcpTools) }
      : undefined,
  });

  return proxyStreamResponse({ result, providerLabel: 'Vertex' });
}
