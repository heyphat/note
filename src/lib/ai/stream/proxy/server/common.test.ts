import { describe, expect, it } from 'vitest';
import type { StreamTextResult } from 'ai';
import {
  proxyStreamResponse,
  buildMcpToolSdkRecord,
  EDIT_TOOLS,
} from './common';

// Build a minimal StreamTextResult-shaped fake whose fullStream emits the
// given parts. The proxy only consumes `fullStream`, so the rest of the
// surface is irrelevant.
function fakeStreamResult(parts: Array<Record<string, unknown>>): StreamTextResult<typeof EDIT_TOOLS, never> {
  return {
    fullStream: (async function* () { for (const p of parts) yield p; })(),
  } as unknown as StreamTextResult<typeof EDIT_TOOLS, never>;
}

async function readSseEvents(response: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await response.text();
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    let event = 'message';
    let dataLine = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
      else if (line.startsWith('data:')) dataLine = line.slice('data:'.length).trim();
    }
    let data: unknown = null;
    if (dataLine) { try { data = JSON.parse(dataLine); } catch { data = dataLine; } }
    events.push({ event, data });
  }
  return events;
}

describe('proxyStreamResponse', () => {
  it('forwards providerMetadata on tool-call events so Gemini thoughtSignature survives the proxy hop', async () => {
    const result = fakeStreamResult([
      { type: 'text-delta', text: 'Searching… ' },
      {
        type: 'tool-call',
        toolName: 'search_vault',
        toolCallId: 'call-gem-1',
        input: { query: 'budget' },
        providerMetadata: { google: { thoughtSignature: 'abc-thought-sig' } },
      },
    ]);
    const response = proxyStreamResponse({ result, providerLabel: 'Vertex' });
    const events = await readSseEvents(response);
    const toolEvent = events.find(e => e.event === 'tool');
    expect(toolEvent).toBeTruthy();
    expect(toolEvent!.data).toMatchObject({
      toolCallId: 'call-gem-1',
      toolName: 'search_vault',
      input: { query: 'budget' },
      providerMetadata: { google: { thoughtSignature: 'abc-thought-sig' } },
    });
  });

  it('omits providerMetadata when the upstream stream did not provide it (OpenAI / Anthropic via proxy)', async () => {
    const result = fakeStreamResult([
      {
        type: 'tool-call',
        toolName: 'search_tasks',
        toolCallId: 'call-noprov',
        input: { status: 'open' },
      },
    ]);
    const events = await readSseEvents(proxyStreamResponse({ result, providerLabel: 'Bedrock' }));
    const toolEvent = events.find(e => e.event === 'tool');
    expect(toolEvent).toBeTruthy();
    expect(toolEvent!.data).toEqual({
      toolCallId: 'call-noprov',
      toolName: 'search_tasks',
      input: { status: 'open' },
    });
  });

  it('synthesizes a tool-call from streamed tool-input chunks when the SDK never emits a final tool-call', async () => {
    // Reproduces the Bedrock-in-compat-mode failure where the model streams
    // edit_note args as tool-input-delta chunks but the SDK gives up before
    // emitting a final tool-call. Without the synthesis path the user sees
    // assistant text but no edit card.
    const result = fakeStreamResult([
      { type: 'text-delta', text: 'Writing data to the chart block now.' },
      { type: 'tool-input-start', toolCallId: 'call-edit-1', toolName: 'edit_note' },
      { type: 'tool-input-delta', toolCallId: 'call-edit-1', delta: '{"find":"old",' },
      { type: 'tool-input-delta', toolCallId: 'call-edit-1', delta: '"replace":"NEW"}' },
      // No `tool-call` part — the SDK lost it.
    ]);
    const events = await readSseEvents(proxyStreamResponse({ result, providerLabel: 'Bedrock' }));
    const toolEvent = events.find(e => e.event === 'tool');
    expect(toolEvent).toBeTruthy();
    expect(toolEvent!.data).toEqual({
      toolCallId: 'call-edit-1',
      toolName: 'edit_note',
      input: { find: 'old', replace: 'NEW' },
    });
  });

  it('does not double-emit when the SDK does emit a final tool-call after streaming the input', async () => {
    const result = fakeStreamResult([
      { type: 'tool-input-start', toolCallId: 'call-dup', toolName: 'search_vault' },
      { type: 'tool-input-delta', toolCallId: 'call-dup', delta: '{"query":"hi"}' },
      { type: 'tool-call', toolCallId: 'call-dup', toolName: 'search_vault', input: { query: 'hi' } },
    ]);
    const events = await readSseEvents(proxyStreamResponse({ result, providerLabel: 'Bedrock' }));
    const toolEvents = events.filter(e => e.event === 'tool');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0].data).toMatchObject({ toolCallId: 'call-dup', toolName: 'search_vault' });
  });

  it('surfaces a visible error event when streamed tool-input is not valid JSON', async () => {
    const result = fakeStreamResult([
      { type: 'tool-input-start', toolCallId: 'call-bad', toolName: 'edit_note' },
      { type: 'tool-input-delta', toolCallId: 'call-bad', delta: '{ this is not JSON' },
    ]);
    const events = await readSseEvents(proxyStreamResponse({ result, providerLabel: 'Bedrock' }));
    const errorEvent = events.find(e => e.event === 'error');
    expect(errorEvent).toBeTruthy();
    const data = errorEvent!.data as { message?: string };
    expect(data.message).toMatch(/edit_note/);
    expect(data.message).toMatch(/not valid JSON/);
    expect(events.find(e => e.event === 'tool')).toBeUndefined();
  });

  it('builds an AI SDK tool record from MCP tool defs', () => {
    const record = buildMcpToolSdkRecord([
      {
        name: 'mcp__example__call_api',
        description: 'Call an example REST endpoint',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      },
      {
        name: 'mcp__deepwiki__search',
        description: 'Search DeepWiki',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ]);
    expect(Object.keys(record).sort()).toEqual(['mcp__deepwiki__search', 'mcp__example__call_api']);
    // Sanity: the AI SDK tool() helper returns an object with `description`
    // and `inputSchema` fields. We don't poke at the schema shape (it goes
    // through `jsonSchema()`), just that the description survived.
    expect(record['mcp__example__call_api'].description).toBe('Call an example REST endpoint');
  });

  it('returns an empty record when no MCP tools are passed', () => {
    expect(buildMcpToolSdkRecord([])).toEqual({});
  });

  it('forwards a tool-error part from the SDK as a user-visible error', async () => {
    const result = fakeStreamResult([
      { type: 'text-delta', text: 'Trying edit_note...' },
      { type: 'tool-input-start', toolCallId: 'call-err', toolName: 'edit_note' },
      { type: 'tool-error', toolCallId: 'call-err', toolName: 'edit_note', error: new Error('args failed schema validation') },
    ]);
    const events = await readSseEvents(proxyStreamResponse({ result, providerLabel: 'Bedrock' }));
    const errorEvent = events.find(e => e.event === 'error');
    expect(errorEvent).toBeTruthy();
    const data = errorEvent!.data as { message?: string };
    expect(data.message).toMatch(/edit_note/);
    expect(data.message).toMatch(/args failed schema validation/);
    // Buffer should be cleared so we don't double-report at end-of-stream.
    expect(events.filter(e => e.event === 'error')).toHaveLength(1);
  });
});
