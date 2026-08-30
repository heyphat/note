import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import RecoveryDialog from './RecoveryDialog';
import { FakeNoteStore } from '@/utils/test/fake-store';
import { renderWithIntl } from '@/utils/test/intl';

afterEach(() => cleanup());

function makeStore() {
  const store = new FakeNoteStore();
  return store;
}

describe('RecoveryDialog', () => {
  it('renders the dialog with title, subtitle, and a body preview', () => {
    const store = makeStore();
    renderWithIntl(<RecoveryDialog
      store={store}
      noteId="unsorted/note.md"
      noteUuid="u-1"
      noteTitle="My Note"
      body="hello world"
      onRecover={vi.fn()}
      onRestoreSnapshot={vi.fn()}
      onClose={vi.fn()}
    />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/recover this note/i)).toBeInTheDocument();
    expect(screen.getByText('My Note')).toBeInTheDocument();
    expect(screen.getByText(/hello world/)).toBeInTheDocument();
  });

  it('calls onRecover with the in-memory body when "Recover with these edits" is clicked', async () => {
    const store = makeStore();
    const onRecover = vi.fn(async () => undefined);
    renderWithIntl(<RecoveryDialog
      store={store}
      noteId="unsorted/note.md"
      noteUuid="u-1"
      noteTitle="My Note"
      body="recovered content"
      onRecover={onRecover}
      onRestoreSnapshot={vi.fn()}
      onClose={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: /recover with these edits/i }));
    await waitFor(() => expect(onRecover).toHaveBeenCalledWith('recovered content'));
  });

  it('calls onClose when Cancel is clicked', () => {
    const store = makeStore();
    const onClose = vi.fn();
    renderWithIntl(<RecoveryDialog
      store={store}
      noteId="unsorted/note.md"
      noteUuid="u-1"
      noteTitle="My Note"
      body="body"
      onRecover={vi.fn()}
      onRestoreSnapshot={vi.fn()}
      onClose={onClose}
    />);
    // There's both a close-X (aria-label="Cancel") and a footer Cancel
    // button (text content). Either dismisses the dialog; click the
    // footer one specifically.
    const cancelButtons = screen.getAllByRole('button', { name: /^cancel$/i });
    const footerCancel = cancelButtons.find(b => b.textContent === 'Cancel');
    fireEvent.click(footerCancel!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lists snapshots from listHistoryByUuid and lets the user restore one', async () => {
    const store = makeStore();
    // Seed a note + history snapshots keyed by the same uuid.
    const seeded = store._test_seedNote({ id: 'unsorted/note.md', title: 'My Note', text: 'body-v2' });
    (seeded as { uuid?: string }).uuid = 'u-1';
    // FakeStore's snapshotHistory is private; trigger one via saveContent
    // (which snapshots the prev text before overwriting).
    await store.saveContent('unsorted/note.md', 'body-v3', 'My Note');
    const onRestoreSnapshot = vi.fn<(raw: string) => Promise<void>>(async () => undefined);
    renderWithIntl(<RecoveryDialog
      store={store}
      noteId="unsorted/note.md"
      noteUuid="u-1"
      noteTitle="My Note"
      body="body-v3"
      onRecover={vi.fn()}
      onRestoreSnapshot={onRestoreSnapshot}
      onClose={vi.fn()}
    />);
    // The snapshot list loads asynchronously.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^restore$/i }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: /^restore$/i })[0]);
    await waitFor(() => expect(onRestoreSnapshot).toHaveBeenCalled());
    // The argument should be the raw history file content (frontmatter+body).
    const arg = onRestoreSnapshot.mock.calls[0][0];
    expect(typeof arg).toBe('string');
    expect(arg).toContain('---');
  });

  it('shows the empty-snapshots placeholder when there are none', async () => {
    const store = makeStore();
    renderWithIntl(<RecoveryDialog
      store={store}
      noteId="unsorted/note.md"
      noteUuid="u-1"
      noteTitle="My Note"
      body="body"
      onRecover={vi.fn()}
      onRestoreSnapshot={vi.fn()}
      onClose={vi.fn()}
    />);
    await waitFor(() => {
      expect(screen.getByText(/no history snapshots available/i)).toBeInTheDocument();
    });
  });

  it('hides the snapshot section entirely when noteUuid is null', () => {
    const store = makeStore();
    renderWithIntl(<RecoveryDialog
      store={store}
      noteId="unsorted/note.md"
      noteUuid={null}
      noteTitle="My Note"
      body="body"
      onRecover={vi.fn()}
      onRestoreSnapshot={vi.fn()}
      onClose={vi.fn()}
    />);
    expect(screen.queryByText(/Or restore from a history snapshot/i)).not.toBeInTheDocument();
  });
});
