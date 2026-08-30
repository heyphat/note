// Validate a Vertex AI service-account credential by doing a 1-token
// generateText against the user's selected (or default) Gemini model. This
// mirrors the Bedrock test approach and exercises the same code path the
// chat endpoint uses, surfacing the real Google error verbatim:
//
//   - bad/expired private key → google-auth-library throws
//   - wrong project_id        → 403 / 404 from Google
//   - missing model           → "Publisher Model … was not found"
//   - Express-mode w/o Claude → same publisher-not-found
//
// We deliberately do NOT call the publishers list endpoint — it returns
// 404 in some project shapes (notably AI Studio Express) even when
// generation works fine, so it gave false negatives.

import { NextRequest, NextResponse } from 'next/server';
import { createVertex } from '@ai-sdk/google-vertex';
import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText, type LanguageModel } from 'ai';
import { PROVIDERS, VERTEX_LOCATION } from '@/lib/ai';

export const runtime = 'nodejs';

interface ServiceAccountJson {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
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
  let body: { credential?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const raw = typeof body.credential === 'string' ? body.credential : '';
  if (!raw) return NextResponse.json({ error: 'Missing service-account JSON' }, { status: 400 });

  let cred: ParsedCredential;
  try {
    cred = parseCredential(raw);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid credential' },
      { status: 400 },
    );
  }

  const modelId = typeof body.model === 'string' && body.model
    ? body.model
    : PROVIDERS.vertex.defaultModel;

  try {
    await generateText({
      model: buildVertexModel(modelId, cred),
      prompt: 'hi',
      maxOutputTokens: 1,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vertex test failed';
    const status = (err as { statusCode?: number })?.statusCode ?? 401;
    return NextResponse.json({ error: message }, { status });
  }
}
