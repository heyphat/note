import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '../../index';

const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: streamTextMock,
    APICallError: {
      ...actual.APICallError,
      isInstance: () => false,
    },
  };
});

import { chatStream, MAX_AGENTIC_ITERATIONS } from './agentic-loop';

// Total fetches in a runaway agentic loop: every iteration through the cap,
// plus one final tools-disabled wrap-up call.
const MAX_LOOP_FETCHES = MAX_AGENTIC_ITERATIONS + 1;

function emptyAsyncIterable<T>() {
  return (async function* emptyGenerator(): AsyncGenerator<T> {
    // no-op
  })();
}

function readableFromChunks(chunks: string[]): NonNullable<Response['body']> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

describe('chatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams text from fullStream even when textStream yields nothing', async () => {
    streamTextMock.mockReturnValue({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* fullStream(): AsyncGenerator<{
        type: string;
        id?: string;
        text?: string;
        delta?: string;
      }> {
        yield { type: 'text-start', id: 't1' };
        yield { type: 'text-delta', id: 't1', text: 'Hello' };
        yield { type: 'text-delta', id: 't1', delta: ' world' };
        yield { type: 'text-end', id: 't1' };
      })(),
    });

    const deltas: string[] = [];
    const result = await chatStream({
      providerId: 'openai' satisfies ProviderId,
      model: 'gpt-5.4',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'hey' }],
      onDelta: (chunk) => { deltas.push(chunk); },
    });

    expect(result.fullText).toBe('Hello world');
    expect(deltas).toEqual(['Hello', ' world']);
  });

  it('surfaces tool calls from fullStream', async () => {
    streamTextMock.mockReturnValue({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* fullStream(): AsyncGenerator<{
        type: string;
        toolName?: string;
        toolCallId?: string;
        input?: unknown;
      }> {
        yield {
          type: 'tool-call',
          toolName: 'rewrite_note',
          toolCallId: 'call-1',
          input: { new_content: 'rewritten body' },
        };
      })(),
    });

    const edits: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];
    await chatStream({
      providerId: 'openai' satisfies ProviderId,
      model: 'gpt-5.4',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'rewrite this' }],
      onDelta: () => {},
      onProposedEdit: (edit) => { edits.push(edit); },
    });

    expect(edits).toEqual([{
      toolCallId: 'call-1',
      toolName: 'rewrite_note',
      input: { new_content: 'rewritten body' },
    }]);
  });

  it('surfaces manage_tasks tool calls from fullStream', async () => {
    streamTextMock.mockReturnValue({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* fullStream(): AsyncGenerator<{
        type: string;
        toolName?: string;
        toolCallId?: string;
        input?: unknown;
      }> {
        yield {
          type: 'tool-call',
          toolName: 'manage_tasks',
          toolCallId: 'call-task',
          input: { kind: 'complete_task', path: 'task.md' },
        };
      })(),
    });

    const edits: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];
    await chatStream({
      providerId: 'openai' satisfies ProviderId,
      model: 'gpt-5.4',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'complete task' }],
      onDelta: () => {},
      onProposedEdit: (edit) => { edits.push(edit); },
    });

    expect(edits).toEqual([{
      toolCallId: 'call-task',
      toolName: 'manage_tasks',
      input: { kind: 'complete_task', path: 'task.md' },
    }]);
  });

  it('streams Anthropic browser SSE deltas via fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => ({
      ok: true,
      status: 200,
      body: readableFromChunks([
        'event: message_start\n',
        'data: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
        'event: content_block_stop\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
      text: async () => '',
    } satisfies Partial<Response> as Response));
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    const result = await chatStream({
      providerId: 'anthropic' satisfies ProviderId,
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
      system: 'system prompt',
      messages: [{ role: 'user', content: 'hey' }],
      onDelta: (chunk) => { deltas.push(chunk); },
    });

    expect(streamTextMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.fullText).toBe('Hello world');
    expect(deltas).toEqual(['Hello', ' world']);
  });

  it('surfaces Anthropic tool calls from SSE blocks', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => ({
      ok: true,
      status: 200,
      body: readableFromChunks([
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"edit_note","input":{}}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"find\\":\\"old\\","}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"replace\\":\\"new\\"}"}}\n\n',
        'event: content_block_stop\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
      text: async () => '',
    } satisfies Partial<Response> as Response));
    vi.stubGlobal('fetch', fetchMock);

    const edits: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];
    await chatStream({
      providerId: 'anthropic' satisfies ProviderId,
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'rewrite this' }],
      onDelta: () => {},
      onProposedEdit: (edit) => { edits.push(edit); },
      withEditTools: true,
    });

    expect(edits).toEqual([{
      toolCallId: 'call-1',
      toolName: 'edit_note',
      input: { find: 'old', replace: 'new' },
    }]);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    const manageTasksTool = body.tools.find((item: { name?: string }) => item.name === 'manage_tasks');
    expect(manageTasksTool.input_schema).not.toHaveProperty('oneOf');
    expect(manageTasksTool.input_schema).not.toHaveProperty('anyOf');
    expect(manageTasksTool.input_schema).not.toHaveProperty('allOf');
  });

  it('Anthropic wrap-up turn keeps tools defined with tool_choice=none', async () => {
    // Force the agentic loop to hit MAX_AGENTIC_ITERATIONS by emitting a
    // read-only tool call (search_vault) on every round. The 6th fetch is
    // the wrap-up call with `withEditTools: false`. Anthropic rejects the
    // request if `tools` is dropped while prior assistant turns still
    // contain `tool_use` blocks — so the fix keeps `tools` on the wrap-up
    // request but sets `tool_choice: 'none'` to force a text-only reply.
    const toolUseChunks = [
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-loop","name":"search_vault","input":{}}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\"x\\"}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'event: message_stop\n',
      'data: {"type":"message_stop"}\n\n',
    ];
    const wrapUpTextChunks = [
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"summary"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'event: message_stop\n',
      'data: {"type":"message_stop"}\n\n',
    ];

    // MAX_AGENTIC_ITERATIONS tool-use rounds, then 1 wrap-up text round.
    // A fresh ReadableStream per call — Response.body can only be consumed once.
    let callIndex = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => ({
      ok: true,
      status: 200,
      body: readableFromChunks(callIndex++ < MAX_AGENTIC_ITERATIONS ? toolUseChunks : wrapUpTextChunks),
      text: async () => '',
    } satisfies Partial<Response> as Response));
    vi.stubGlobal('fetch', fetchMock);

    const executor = vi.fn(async () => JSON.stringify({ hits: [], total: 0 }));
    const result = await chatStream({
      providerId: 'anthropic' satisfies ProviderId,
      model: 'claude-opus-4-7',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'find x' }],
      onDelta: () => {},
      executeReadOnlyTool: executor,
      withEditTools: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(MAX_LOOP_FETCHES);
    expect(result.fullText).toBe('summary');

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(firstBody.tool_choice).toEqual({ type: 'auto' });
    expect(Array.isArray(firstBody.tools)).toBe(true);
    expect(firstBody.tools.length).toBeGreaterThan(0);

    // Wrap-up turn: tools still present (the prior turns have tool_use
    // blocks that need declaring), but tool_choice forces text output.
    const wrapUpBody = JSON.parse(String((fetchMock.mock.calls[MAX_LOOP_FETCHES - 1][1] as RequestInit).body));
    expect(wrapUpBody.tool_choice).toEqual({ type: 'none' });
    expect(Array.isArray(wrapUpBody.tools)).toBe(true);
    expect(wrapUpBody.tools.length).toBeGreaterThan(0);

    // The conversation sent on the wrap-up turn must end with a user
    // (tool_result) message — otherwise Anthropic returns the misleading
    // "must end with a user message" 400.
    const lastMessage = wrapUpBody.messages[wrapUpBody.messages.length - 1];
    expect(lastMessage.role).toBe('user');
  });

  it('runs the agentic loop: AI-SDK path executes search_vault and feeds the result back', async () => {
    // First round: model emits a `search_vault` tool call. Second round:
    // model emits the final text answer. Each call to streamText returns a
    // fresh fullStream because the loop in chatStream re-invokes it for the
    // follow-up turn.
    streamTextMock.mockImplementationOnce(() => ({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* () {
        yield { type: 'text-delta', id: 't1', text: 'Searching… ' };
        yield {
          type: 'tool-call',
          toolName: 'search_vault',
          toolCallId: 'call-search-1',
          input: { query: 'budget' },
        };
      })(),
    }));
    streamTextMock.mockImplementationOnce(() => ({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* () {
        yield { type: 'text-delta', id: 't2', text: 'Found one note.' };
      })(),
    }));

    const executor = vi.fn(async () => JSON.stringify({
      hits: [{ path: 'budget.md', title: 'Budget', snippet: 'Q1 plan', score: 0.9, updatedAt: '2026-01-02' }],
      total: 1,
      truncated: false,
      query: 'budget',
    }));

    const deltas: string[] = [];
    const result = await chatStream({
      providerId: 'openai' satisfies ProviderId,
      model: 'gpt-5.4',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'find budget notes' }],
      onDelta: (chunk) => { deltas.push(chunk); },
      executeReadOnlyTool: executor,
      withEditTools: true,
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith('search_vault', { query: 'budget' });
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(result.fullText).toBe('Searching… Found one note.');
    // Both rounds streamed text; the user saw a single seamless response.
    expect(deltas).toEqual(['Searching… ', 'Found one note.']);

    // The second round received the prior assistant turn (tool-call) plus
    // a `tool` turn carrying the executor's output.
    const secondCall = streamTextMock.mock.calls[1][0];
    const toolTurn = secondCall.messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolTurn).toBeTruthy();
    expect(toolTurn.content[0].toolCallId).toBe('call-search-1');
    expect(toolTurn.content[0].output.value).toContain('Budget');
  });

  it('mutating proposals short-circuit the agentic loop and surface as proposals', async () => {
    streamTextMock.mockImplementationOnce(() => ({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* () {
        yield {
          type: 'tool-call',
          toolName: 'rewrite_note',
          toolCallId: 'call-rewrite-1',
          input: { new_content: 'NEW' },
        };
      })(),
    }));

    const executor = vi.fn();
    const proposed: Array<{ toolName: string }> = [];
    await chatStream({
      providerId: 'openai' satisfies ProviderId,
      model: 'gpt-5.4',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'rewrite' }],
      onDelta: () => {},
      onProposedEdit: (edit) => { proposed.push(edit); },
      executeReadOnlyTool: executor,
      withEditTools: true,
    });

    expect(executor).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(proposed.map(p => p.toolName)).toEqual(['rewrite_note']);
  });

  it('search_vault without an executor is dropped (no proposal, no second round)', async () => {
    // Read-only tools have no `ProposedEdit` shape, so `onProposedEdit`
    // never fires for them. With no executor wired in there's nothing to
    // do — the loop ends, the assistant turn is empty, and the user can
    // ask their question again now that the index is ready.
    streamTextMock.mockImplementationOnce(() => ({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* () {
        yield {
          type: 'tool-call',
          toolName: 'search_vault',
          toolCallId: 'call-search-2',
          input: { query: 'x' },
        };
      })(),
    }));

    const proposed: Array<{ toolName: string }> = [];
    const result = await chatStream({
      providerId: 'openai' satisfies ProviderId,
      model: 'gpt-5.4',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'search x' }],
      onDelta: () => {},
      onProposedEdit: (edit) => { proposed.push(edit); },
      withEditTools: true,
    });

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(proposed).toEqual([]);
    expect(result.fullText).toBe('');
  });

  it('keeps attachments on every agentic round so the model can reference them after a search', async () => {
    // Round 1: model emits search_vault. Round 2: text answer. Both rounds
    // must carry the user's PDF; providers don't remember attachments
    // across HTTP requests, so dropping them after round 1 would lose the
    // PDF context for "what does the PDF say?" follow-ups.
    streamTextMock.mockImplementationOnce(() => ({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* () {
        yield {
          type: 'tool-call',
          toolName: 'search_vault',
          toolCallId: 'call-1',
          input: { query: 'x' },
        };
      })(),
    }));
    streamTextMock.mockImplementationOnce(() => ({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* () {
        yield { type: 'text-delta', id: 't', text: 'done' };
      })(),
    }));

    await chatStream({
      providerId: 'openai' satisfies ProviderId,
      model: 'gpt-5.4',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'summarize the PDF' }],
      onDelta: () => {},
      executeReadOnlyTool: async () => '{"hits":[],"total":0,"truncated":false,"query":"x"}',
      withEditTools: true,
      attachments: [{
        kind: 'pdf',
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'application/pdf',
        filename: 'doc.pdf',
      }],
    });

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    // On both rounds the latest user message must be a multipart message
    // containing the file part. The synthetic agentic turns are appended
    // AFTER it, so finding the file part means it's still attached.
    for (let round = 0; round < 2; round++) {
      const args = streamTextMock.mock.calls[round][0];
      const userTurn = args.messages.find((m: { role: string }) => m.role === 'user');
      expect(Array.isArray(userTurn.content)).toBe(true);
      const hasPdf = userTurn.content.some((p: { type: string }) => p.type === 'file');
      expect(hasPdf).toBe(true);
    }
  });

  it('caps agentic iterations and forces a tools-disabled wrap-up round', async () => {
    // First five rounds: model loops on search_vault. Sixth round: chatStream
    // forces tools off so the model must respond in text — without this the
    // user would see an empty bubble even though searches succeeded.
    let toolRounds = 0;
    streamTextMock.mockImplementation((args: { tools?: unknown }) => ({
      textStream: emptyAsyncIterable<string>(),
      fullStream: (async function* () {
        if (args.tools) {
          toolRounds += 1;
          yield {
            type: 'tool-call',
            toolName: 'search_vault',
            toolCallId: `call-${toolRounds}`,
            input: { query: 'x' },
          };
        } else {
          yield { type: 'text-delta', id: 't', text: 'I searched a few times — here is what I found.' };
        }
      })(),
    }));

    const executor = vi.fn(async () => '{"hits":[],"total":0,"truncated":false,"query":"x"}');
    const result = await chatStream({
      providerId: 'openai' satisfies ProviderId,
      model: 'gpt-5.4',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'loop' }],
      onDelta: () => {},
      executeReadOnlyTool: executor,
      withEditTools: true,
    });

    // MAX_AGENTIC_ITERATIONS tool-enabled rounds + 1 tools-disabled wrap-up.
    expect(streamTextMock).toHaveBeenCalledTimes(MAX_LOOP_FETCHES);
    expect(toolRounds).toBe(MAX_AGENTIC_ITERATIONS);
    // Last round had tools omitted — that's how we force the text response.
    const lastCall = streamTextMock.mock.calls[MAX_LOOP_FETCHES - 1][0];
    expect(lastCall.tools).toBeUndefined();
    // The model's final text reaches the caller even though earlier rounds
    // were silent.
    expect(result.fullText).toContain('I searched a few times');
  });
});
