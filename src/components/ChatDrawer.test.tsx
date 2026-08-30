import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/utils/test/intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteStore } from '@/lib/storage';

const sendMock = vi.fn(async () => {});
const useChatMock = vi.fn(() => ({
  messages: [],
  meta: null,
  status: 'idle',
  error: null,
  pending: '',
  streamingMessage: null,
  missingKey: false,
  pendingEdits: [],
  send: sendMock,
  stop: vi.fn(),
  applyEdit: vi.fn(async () => {}),
  rejectEdit: vi.fn(),
  dismissEdit: vi.fn(),
}));

vi.mock('@/hooks/useChat', () => ({
  useChat: (...args: Parameters<typeof useChatMock>) => useChatMock(...args),
}));

import ChatDrawer from './ChatDrawer';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem('notes:ai:active', JSON.stringify({ providerId: 'openai', model: 'gpt-5.4' }));
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 900 });
});

function createStore(
  listChatsImpl: (filter?: { noteId?: string; noteUuid?: string }) => Promise<Array<{ id: string; title: string; noteId?: string; noteUuid?: string }>>,
) {
  const listChats = vi.fn(listChatsImpl);
  return {
    store: {
      listChats,
      createChat: vi.fn(async (opts?: { noteId?: string; noteUuid?: string }) => ({
        id: 'new-chat',
        title: 'New chat',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        noteId: opts?.noteId,
        noteUuid: opts?.noteUuid,
      })),
      promoteChatToNote: vi.fn(),
      deleteChat: vi.fn(),
      findNoteByUuid: vi.fn(async () => null),
    } as unknown as NoteStore,
    listChats,
  };
}

describe('ChatDrawer', () => {
  it('does not force navigation back to the previous thread note when the active note changes', async () => {
    const threadA = {
      id: 'chat-a',
      title: 'Thread A',
      createdAt: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-24T00:00:00.000Z',
      noteId: 'note-a.md',
    };
    const { store, listChats } = createStore(async (filter) => (filter?.noteId === 'note-a.md' ? [threadA] : []));
    const onNavigateToNote = vi.fn();

    const { rerender } = render(
      <ChatDrawer
        open
        onClose={vi.fn()}
        store={store}
        storeReady
        clearingChats={false}
        chatResetNonce={0}
        activeNoteId="note-a.md"
        activeNoteUuid={null}
        noteTitle="Note A"
        getNoteContext={() => ({ noteId: 'note-a.md', title: 'Note A', text: '', selection: null })}
        onNavigateToNote={onNavigateToNote}
      />,
    );

    await waitFor(() => {
      expect(listChats).toHaveBeenCalledWith({ noteId: 'note-a.md', noteUuid: undefined });
    });

    rerender(
      <ChatDrawer
        open
        onClose={vi.fn()}
        store={store}
        storeReady
        clearingChats={false}
        chatResetNonce={0}
        activeNoteId="note-b.md"
        activeNoteUuid={null}
        noteTitle="Note B"
        getNoteContext={() => ({ noteId: 'note-b.md', title: 'Note B', text: '', selection: null })}
        onNavigateToNote={onNavigateToNote}
      />,
    );

    await waitFor(() => {
      expect(listChats).toHaveBeenCalledWith({ noteId: 'note-b.md', noteUuid: undefined });
    });
    expect(onNavigateToNote).not.toHaveBeenCalled();
  });

  it('navigates only when the user explicitly picks a thread anchored to another note', async () => {
    const threads = [
      {
        id: 'chat-a',
        title: 'Thread A',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        noteId: 'note-a.md',
      },
      {
        id: 'chat-b',
        title: 'Thread B',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        noteId: 'note-b.md',
      },
    ];
    const { store, listChats } = createStore(async () => threads);
    const onNavigateToNote = vi.fn();

    render(
      <ChatDrawer
        open
        onClose={vi.fn()}
        store={store}
        storeReady
        clearingChats={false}
        chatResetNonce={0}
        activeNoteId={null}
        activeNoteUuid={null}
        noteTitle={null}
        getNoteContext={() => ({ noteId: null, title: null, text: '', selection: null })}
        onNavigateToNote={onNavigateToNote}
      />,
    );

    await waitFor(() => {
      expect(listChats).toHaveBeenCalledWith({ noteId: undefined, noteUuid: undefined });
    });

    fireEvent.click(screen.getByTitle('Chat history'));
    fireEvent.click(await screen.findByText('Thread B'));

    await waitFor(() => {
      expect(onNavigateToNote).toHaveBeenCalledWith('note-b.md');
    });
  });

  it('resizes from the drawer border and persists the size', async () => {
    const { store } = createStore(async () => []);

    render(
      <ChatDrawer
        open
        onClose={vi.fn()}
        store={store}
        storeReady
        clearingChats={false}
        chatResetNonce={0}
        activeNoteId="note-a.md"
        activeNoteUuid={null}
        noteTitle="Note A"
        getNoteContext={() => ({ noteId: 'note-a.md', title: 'Note A', text: '', selection: null })}
      />,
    );

    const drawer = screen.getByTestId('chat-drawer');
    await waitFor(() => {
      expect(drawer).toHaveStyle({ width: '420px', height: '640px' });
    });

    fireEvent(screen.getByTestId('chat-drawer-resize-left'), new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 200,
      clientY: 200,
    }));
    fireEvent(window, new MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 200,
    }));
    fireEvent(window, new MouseEvent('pointerup', {
      bubbles: true,
      cancelable: true,
    }));

    await waitFor(() => {
      expect(drawer).toHaveStyle({ width: '500px', height: '640px' });
    });
    expect(JSON.parse(window.localStorage.getItem('notes:chat-drawer-size') || '{}')).toMatchObject({
      width: 500,
      height: 640,
    });
  });

  it('sends the mentioned selection with the typed question and clears the mention', async () => {
    const { store } = createStore(async () => []);
    const onClearMentionedSelection = vi.fn();

    render(
      <ChatDrawer
        open
        onClose={vi.fn()}
        store={store}
        storeReady
        clearingChats={false}
        chatResetNonce={0}
        activeNoteId="note-a.md"
        activeNoteUuid={null}
        noteTitle="Note A"
        getNoteContext={() => ({
          noteId: 'note-a.md',
          title: 'Note A',
          text: 'Strategy & Setup details',
          selection: 'Strategy & Setup',
        })}
        mentionedSelection="Strategy & Setup"
        onClearMentionedSelection={onClearMentionedSelection}
      />,
    );

    const input = screen.getByPlaceholderText(/Ask about this note/);
    await waitFor(() => {
      expect(input).not.toBeDisabled();
    });

    fireEvent.change(input, {
      target: { value: 'explain it to me' },
    });
    fireEvent.keyDown(input, {
      key: 'Enter',
      code: 'Enter',
      charCode: 13,
    });

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    expect(sendMock).toHaveBeenCalledWith('> Strategy & Setup\n\nexplain it to me');
    expect(onClearMentionedSelection).toHaveBeenCalledTimes(1);
  });
});
