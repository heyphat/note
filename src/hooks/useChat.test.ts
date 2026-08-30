import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatTurn, NoteStore, ChatEdit } from '@/lib/storage';

const {
  buildSystemPromptMock,
  collectNoteImagesMock,
  preparePriceChartAiContextMock,
  chatStreamMock,
  streamControl,
} = vi.hoisted(() => {
  const streamControl = {
    opts: null as {
      onDelta: (chunk: string) => void;
      onProposedEdit?: (edit: {
        toolCallId: string;
        toolName: 'edit_note' | 'rewrite_note' | 'create_note' | 'manage_tasks';
        input: Record<string, unknown>;
      }) => void;
      system?: string;
      messages?: ChatTurn[];
      signal?: AbortSignal;
      images?: unknown[];
    } | null,
    resolve: null as ((value: { fullText: string }) => void) | null,
    reject: null as ((error: unknown) => void) | null,
  };
  return {
    buildSystemPromptMock: vi.fn(() => 'system prompt'),
    collectNoteImagesMock: vi.fn(async () => []),
    preparePriceChartAiContextMock: vi.fn(async (text: string | null | undefined) => ({ text, images: [] as unknown[] })),
    chatStreamMock: vi.fn((opts: { onDelta: (chunk: string) => void; signal?: AbortSignal; messages?: ChatTurn[]; system?: string; images?: unknown[] }) => new Promise<{ fullText: string }>((resolve, reject) => {
      streamControl.opts = opts;
      streamControl.resolve = resolve;
      streamControl.reject = reject;
      opts.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })),
    streamControl,
  };
});

vi.mock('@/lib/ai/prompt', () => ({
  buildSystemPrompt: buildSystemPromptMock,
}));

vi.mock('@/lib/ai/images', () => ({
  collectNoteImages: collectNoteImagesMock,
}));

vi.mock('@/lib/ai/price-chart-snapshots', () => ({
  preparePriceChartAiContext: preparePriceChartAiContextMock,
}));

vi.mock('@/lib/ai/stream', () => ({
  chatStream: chatStreamMock,
}));

import { deriveTitle, useChat } from './useChat';

function chatMeta(id: string) {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  };
}

function cloneEdit(edit: ChatEdit): ChatEdit {
  if (edit.toolName === 'edit_note') {
    return { ...edit, input: { ...edit.input } };
  }
  if (edit.toolName === 'rewrite_note') {
    return { ...edit, input: { ...edit.input } };
  }
  if (edit.toolName === 'create_note') {
    return { ...edit, input: { ...edit.input } };
  }
  if (edit.toolName === 'manage_tasks') {
    return { ...edit, input: { ...edit.input } };
  }
  return { ...edit, input: { ...edit.input } };
}

function createStore(seed?: {
  chats?: Partial<Record<string, ChatTurn[]>>;
  edits?: Partial<Record<string, ChatEdit[]>>;
}) {
  const chats: Record<string, ChatTurn[]> = {
    a: seed?.chats?.a ? [...seed.chats.a] : [],
    b: seed?.chats?.b ? [...seed.chats.b] : [],
  };
  const edits: Record<string, ChatEdit[]> = {
    a: seed?.edits?.a ? seed.edits.a.map(cloneEdit) : [],
    b: seed?.edits?.b ? seed.edits.b.map(cloneEdit) : [],
  };
  const getChat = vi.fn(async (id: string) => (
    id in chats ? { ...chatMeta(id), messages: [...chats[id]], edits: [...(edits[id] ?? [])] } : null
  ));
  const saveChatMessages = vi.fn(async (
    chatId: string,
    messages: ChatTurn[],
    opts?: { edits?: ChatEdit[] },
  ) => {
    chats[chatId] = [...messages];
    if (opts?.edits) edits[chatId] = opts.edits.map(cloneEdit);
    return chatMeta(chatId);
  });
  return {
    store: { getChat, saveChatMessages } as unknown as NoteStore,
    getChat,
    saveChatMessages,
    edits,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem('notes:ai:active', JSON.stringify({ providerId: 'openai', model: 'gpt-5.4' }));
  window.localStorage.setItem('notes:ai:key:openai', 'sk-test');
  preparePriceChartAiContextMock.mockImplementation(async (text: string | null | undefined) => ({ text, images: [] as unknown[] }));
  streamControl.opts = null;
  streamControl.resolve = null;
  streamControl.reject = null;
});

describe('deriveTitle', () => {
  it('skips greetings and picks the first substantive message', () => {
    const title = deriveTitle([
      { role: 'user', content: 'hey' },
      { role: 'assistant', content: 'Hi! How can I help?' },
      { role: 'user', content: 'explain to me what is on this note?' },
    ]);
    expect(title).toBe('explain to me what is on this note?');
  });

  it('uses the first message when it is already substantive', () => {
    const title = deriveTitle([
      { role: 'user', content: 'Summarize this note in three bullets' },
    ]);
    expect(title).toBe('Summarize this note in three bullets');
  });

  it('uses the question text for titles when a selected text attachment is included', () => {
    const title = deriveTitle([
      { role: 'user', content: '> Strategy & Setup\n\nexplain it to me' },
    ]);
    expect(title).toBe('explain it to me');
  });

  it('falls back to note title + date when nothing is substantive yet', () => {
    const title = deriveTitle([{ role: 'user', content: 'hey' }], 'Project notes');
    expect(title).toMatch(/^Project notes · /);
  });

  it('falls back to "Chat · <date>" when there is no note title', () => {
    const title = deriveTitle([{ role: 'user', content: 'hi' }]);
    expect(title).toMatch(/^Chat · /);
  });

  it('cuts at the first sentence boundary when short enough', () => {
    const title = deriveTitle([
      { role: 'user', content: 'What are the main points here? Also add a TL;DR.' },
    ]);
    expect(title).toBe('What are the main points here?');
  });

  it('truncates long one-liners with an ellipsis', () => {
    const long = 'Can you walk me through every step of the architecture decision behind the caching layer because I need full context';
    const title = deriveTitle([{ role: 'user', content: long }]);
    expect(title?.endsWith('…')).toBe(true);
    expect(title?.length).toBeLessThanOrEqual(61);
  });

  it('treats single-word and filler replies as non-substantive', () => {
    expect(deriveTitle([
      { role: 'user', content: 'hey' },
      { role: 'user', content: 'ok thanks' },
      { role: 'user', content: 'cool' },
    ], 'X')).toMatch(/^X · /);
  });

  it('ignores assistant messages when deriving titles', () => {
    const title = deriveTitle([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'This is a very long and substantive assistant turn explaining things.' },
    ], 'My note');
    expect(title).toMatch(/^My note · /);
  });
});

describe('useChat', () => {
  it('syncs the completed assistant turn into live state after a successful stream', async () => {
    const { store, getChat, saveChatMessages } = createStore();
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    let sendPromise: Promise<void> | null = null;
    act(() => {
      sendPromise = result.current.send('hello');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));
    expect(result.current.streamingMessage).toEqual({ role: 'assistant', content: '' });

    if (!sendPromise || !streamControl.resolve) throw new Error('stream never started');
    await act(async () => {
      streamControl.resolve?.({ fullText: 'final answer' });
      await sendPromise;
    });

    expect(saveChatMessages).toHaveBeenCalledWith(
      'a',
      [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'final answer' },
      ],
      expect.objectContaining({ provider: 'openai', model: 'gpt-5.4' }),
    );
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'final answer' },
    ]);
    expect(result.current.pending).toBe('');
    expect(result.current.streamingMessage).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('sends highlighted selection in the model request while keeping chat history clean', async () => {
    const { store, getChat, saveChatMessages } = createStore();
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Alpha\nBeta\nGamma',
        selection: 'Beta',
      }),
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    let sendPromise: Promise<void> | null = null;
    act(() => {
      sendPromise = result.current.send('Explain this');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));
    expect(buildSystemPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({ selection: 'Beta' }),
      expect.any(Object),
    );
    expect(streamControl.opts?.messages?.at(-1)).toEqual({
      role: 'user',
      content: expect.stringContaining('## Highlighted selection'),
    });
    expect(streamControl.opts?.messages?.at(-1)?.content).toContain('Beta');
    expect(streamControl.opts?.messages?.at(-1)?.content).toContain('## User question\nExplain this');

    if (!sendPromise || !streamControl.resolve) throw new Error('stream never started');
    await act(async () => {
      streamControl.resolve?.({ fullText: 'about beta' });
      await sendPromise;
    });

    expect(saveChatMessages).toHaveBeenCalledWith(
      'a',
      [
        { role: 'user', content: 'Explain this' },
        { role: 'assistant', content: 'about beta' },
      ],
      expect.objectContaining({ provider: 'openai', model: 'gpt-5.4' }),
    );
  });

  it('summarizes price charts and forwards generated chart images', async () => {
    const chartImage = {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      label: 'price-chart-1.png',
    };
    preparePriceChartAiContextMock.mockResolvedValueOnce({
      text: 'Chart summary replaces raw CSV',
      images: [chartImage],
    });
    const { store, getChat } = createStore();
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: '```price-chart\nraw,csv\n```',
        selection: null,
      }),
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    let sendPromise: Promise<void> | null = null;
    act(() => {
      sendPromise = result.current.send('what is happening?');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));
    expect(preparePriceChartAiContextMock).toHaveBeenCalledWith('```price-chart\nraw,csv\n```');
    expect(buildSystemPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Chart summary replaces raw CSV' }),
      expect.any(Object),
    );
    expect(chatStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ images: [chartImage] }),
    );

    if (!sendPromise || !streamControl.resolve) throw new Error('stream never started');
    await act(async () => {
      streamControl.resolve?.({ fullText: 'chart read' });
      await sendPromise;
    });
  });

  it('keeps a synthetic assistant message live while chunks stream in', async () => {
    const { store, getChat } = createStore();
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    act(() => {
      void result.current.send('hello');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));
    expect(result.current.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(result.current.streamingMessage).toEqual({ role: 'assistant', content: '' });

    act(() => {
      streamControl.opts?.onDelta('part');
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).toEqual({ role: 'assistant', content: 'part' });
    });
    expect(result.current.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('continues streaming correctly under React StrictMode', async () => {
    const { store, getChat, saveChatMessages } = createStore();
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(
      React.StrictMode,
      null,
      children,
    );
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
    }), { wrapper });

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    let sendPromise: Promise<void> | null = null;
    act(() => {
      sendPromise = result.current.send('hello');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));
    act(() => {
      streamControl.opts?.onDelta('Hello');
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).toEqual({ role: 'assistant', content: 'Hello' });
    });

    if (!sendPromise || !streamControl.resolve) throw new Error('stream never started');
    await act(async () => {
      streamControl.resolve?.({ fullText: 'Hello world' });
      await sendPromise;
    });

    expect(saveChatMessages).toHaveBeenCalledWith(
      'a',
      [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'Hello world' },
      ],
      expect.objectContaining({ provider: 'openai', model: 'gpt-5.4' }),
    );
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hello world' },
    ]);
    expect(result.current.streamingMessage).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('keeps an aborted stream from bleeding into the newly selected thread state', async () => {
    const { store, getChat, saveChatMessages } = createStore();
    const { result, rerender } = renderHook(
      ({ chatId }: { chatId: string | null }) => useChat({
        store,
        chatId,
        getContext: () => ({
          noteId: 'note.md',
          title: 'Note',
          text: 'Current body',
          selection: null,
        }),
      }),
      { initialProps: { chatId: 'a' } },
    );

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    let sendPromise: Promise<void> | null = null;
    act(() => {
      sendPromise = result.current.send('hello');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));

    act(() => {
      streamControl.opts?.onDelta('partial');
    });
    await waitFor(() => expect(result.current.pending).toBe('partial'));

    rerender({ chatId: 'b' });

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('b'));
    if (!sendPromise) throw new Error('send() never started');
    await act(async () => {
      await sendPromise;
    });

    expect(saveChatMessages).toHaveBeenCalledWith(
      'a',
      [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'partial' },
      ],
      expect.objectContaining({ provider: 'openai', model: 'gpt-5.4' }),
    );
    expect(result.current.pending).toBe('');
    expect(result.current.streamingMessage).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  it('hydrates persisted proposed edits when the thread reloads', async () => {
    const storedEdit: ChatEdit = {
      toolCallId: 'tool-1',
      toolName: 'edit_note',
      input: {
        find: 'Current body',
        replace: 'Updated body',
      },
      status: 'pending',
    };
    const { store, getChat } = createStore({
      chats: {
        a: [{ role: 'assistant', content: '_(proposed an edit to the note)_' }],
      },
      edits: {
        a: [storedEdit],
      },
    });
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));
    expect(result.current.pendingEdits).toEqual([storedEdit]);
  });

  it('feeds errored edits back to the model on the next send so it can self-correct', async () => {
    const erroredEdit: ChatEdit = {
      toolCallId: 'tool-err',
      toolName: 'edit_note',
      input: {
        find: '- **Decision notes:**\n```',
        replace: 'AI reflection content',
      },
      status: 'error',
      error: 'The `find` string was not found in the note.',
    };
    buildSystemPromptMock.mockClear();
    const { store, getChat } = createStore({
      chats: {
        a: [
          { role: 'user', content: 'save the reflection' },
          { role: 'assistant', content: '_(proposed an edit to the note)_' },
        ],
      },
      edits: {
        a: [erroredEdit],
      },
    });
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
      onApplyEdit: vi.fn(async () => {}),
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    act(() => {
      void result.current.send('try again');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));
    expect(buildSystemPromptMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        recentFailures: [
          expect.objectContaining({
            toolName: 'edit_note',
            error: 'The `find` string was not found in the note.',
            input: expect.objectContaining({ find: '- **Decision notes:**\n```' }),
          }),
        ],
      }),
    );
    // The errored card itself is swept on send so it doesn't clutter the UI
    // — the failure travels via the system prompt instead.
    expect(result.current.pendingEdits).toEqual([]);
  });

  it('does not pass recentFailures when there are no errored edits', async () => {
    buildSystemPromptMock.mockClear();
    const { store, getChat } = createStore();
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    act(() => {
      void result.current.send('hello');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));
    expect(buildSystemPromptMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ recentFailures: [] }),
    );
  });

  it('persists proposed edits with the completed assistant turn so they survive refresh', async () => {
    const { store, getChat, saveChatMessages } = createStore();
    const { result, unmount } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
      onApplyEdit: vi.fn(async () => {}),
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    let sendPromise: Promise<void> | null = null;
    act(() => {
      sendPromise = result.current.send('make a change');
    });

    await waitFor(() => expect(chatStreamMock).toHaveBeenCalledTimes(1));
    act(() => {
      streamControl.opts?.onProposedEdit?.({
        toolCallId: 'tool-1',
        toolName: 'edit_note',
        input: {
          find: 'Current body',
          replace: 'Updated body',
        },
      });
    });

    await waitFor(() => {
      expect(result.current.pendingEdits).toEqual([
        {
          toolCallId: 'tool-1',
          toolName: 'edit_note',
          input: {
            find: 'Current body',
            replace: 'Updated body',
          },
          status: 'pending',
          error: undefined,
          preview: 'Updated body',
        },
      ]);
    });

    if (!sendPromise || !streamControl.resolve) throw new Error('stream never started');
    await act(async () => {
      streamControl.resolve?.({ fullText: '' });
      await sendPromise;
    });

    expect(saveChatMessages).toHaveBeenLastCalledWith(
      'a',
      [
        { role: 'user', content: 'make a change' },
        { role: 'assistant', content: '_(proposed an edit to the note)_' },
      ],
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-5.4',
        edits: [
          {
            toolCallId: 'tool-1',
            toolName: 'edit_note',
            input: {
              find: 'Current body',
              replace: 'Updated body',
            },
            status: 'pending',
            error: undefined,
          },
        ],
      }),
    );

    unmount();

    const { result: reloaded } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
      onApplyEdit: vi.fn(async () => {}),
    }));

    await waitFor(() => {
      expect(reloaded.current.pendingEdits).toEqual([
        {
          toolCallId: 'tool-1',
          toolName: 'edit_note',
          input: {
            find: 'Current body',
            replace: 'Updated body',
          },
          status: 'pending',
        },
      ]);
    });
  });

  it('persists applied edit status changes', async () => {
    const storedEdit: ChatEdit = {
      toolCallId: 'tool-1',
      toolName: 'edit_note',
      input: {
        find: 'Current body',
        replace: 'Updated body',
      },
      status: 'pending',
    };
    const onApplyEdit = vi.fn(async () => {});
    const { store, getChat, saveChatMessages } = createStore({
      chats: {
        a: [
          { role: 'user', content: 'make a change' },
          { role: 'assistant', content: '_(proposed an edit to the note)_' },
        ],
      },
      edits: {
        a: [storedEdit],
      },
    });
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
      onApplyEdit,
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    await act(async () => {
      await result.current.applyEdit('tool-1');
    });

    expect(onApplyEdit).toHaveBeenCalledWith('Updated body');
    expect(saveChatMessages).toHaveBeenLastCalledWith(
      'a',
      [
        { role: 'user', content: 'make a change' },
        { role: 'assistant', content: '_(proposed an edit to the note)_' },
      ],
      expect.objectContaining({
        edits: [
          {
            toolCallId: 'tool-1',
            toolName: 'edit_note',
            input: {
              find: 'Current body',
              replace: 'Updated body',
            },
            status: 'applied',
          },
        ],
      }),
    );
    expect(result.current.pendingEdits[0]?.status).toBe('applied');
  });

  it('applies manage_tasks proposals through the task handler', async () => {
    const storedEdit: ChatEdit = {
      toolCallId: 'tool-1',
      toolName: 'manage_tasks',
      input: {
        kind: 'update_task',
        path: 'task.md',
        patch: { priority: 'high' },
      },
      status: 'pending',
    };
    const onManageTasks = vi.fn(async () => {});
    const { store, getChat, saveChatMessages } = createStore({
      chats: {
        a: [{ role: 'assistant', content: '_(proposed an edit to the note)_' }],
      },
      edits: {
        a: [storedEdit],
      },
    });
    const { result } = renderHook(() => useChat({
      store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
      onManageTasks,
    }));

    await waitFor(() => expect(getChat).toHaveBeenCalledWith('a'));

    await act(async () => {
      await result.current.applyEdit('tool-1');
    });

    expect(onManageTasks).toHaveBeenCalledWith(storedEdit.input);
    expect(saveChatMessages).toHaveBeenLastCalledWith(
      'a',
      [{ role: 'assistant', content: '_(proposed an edit to the note)_' }],
      expect.objectContaining({
        edits: [
          {
            ...storedEdit,
            status: 'applied',
          },
        ],
      }),
    );
    expect(result.current.pendingEdits[0]?.status).toBe('applied');
  });

  it('persists rejected and dismissed edits', async () => {
    const storedEdit: ChatEdit = {
      toolCallId: 'tool-1',
      toolName: 'rewrite_note',
      input: {
        new_content: '# Updated note',
      },
      status: 'pending',
    };
    const rejected = createStore({
      chats: {
        a: [{ role: 'assistant', content: '_(proposed an edit to the note)_' }],
      },
      edits: {
        a: [storedEdit],
      },
    });
    const { result: rejectedResult } = renderHook(() => useChat({
      store: rejected.store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
    }));

    await waitFor(() => expect(rejected.getChat).toHaveBeenCalledWith('a'));
    act(() => {
      rejectedResult.current.rejectEdit('tool-1');
    });
    await waitFor(() => {
      expect(rejected.saveChatMessages).toHaveBeenLastCalledWith(
        'a',
        [{ role: 'assistant', content: '_(proposed an edit to the note)_' }],
        expect.objectContaining({
          edits: [
            {
              toolCallId: 'tool-1',
              toolName: 'rewrite_note',
              input: {
                new_content: '# Updated note',
              },
              status: 'rejected',
            },
          ],
        }),
      );
    });

    const dismissed = createStore({
      chats: {
        a: [{ role: 'assistant', content: '_(proposed an edit to the note)_' }],
      },
      edits: {
        a: [storedEdit],
      },
    });
    const { result: dismissedResult } = renderHook(() => useChat({
      store: dismissed.store,
      chatId: 'a',
      getContext: () => ({
        noteId: 'note.md',
        title: 'Note',
        text: 'Current body',
        selection: null,
      }),
    }));

    await waitFor(() => expect(dismissed.getChat).toHaveBeenCalledWith('a'));
    act(() => {
      dismissedResult.current.dismissEdit('tool-1');
    });
    await waitFor(() => {
      expect(dismissed.saveChatMessages).toHaveBeenLastCalledWith(
        'a',
        [{ role: 'assistant', content: '_(proposed an edit to the note)_' }],
        expect.objectContaining({ edits: [] }),
      );
    });
    expect(dismissedResult.current.pendingEdits).toEqual([]);
  });
});
