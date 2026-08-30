import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithIntl as render } from '@/utils/test/intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteStore } from '@/lib/storage';

vi.mock('next/dynamic', () => ({
  default: () => function DynamicMilkdownMock(props: { defaultValue?: string }) {
    return <div data-testid="milkdown-preview">{props.defaultValue}</div>;
  },
}));

import HistoryPanel from './HistoryPanel';

const ENTRIES = [
  '2026-04-23T10-00-00.000Z',
  '2026-04-23T09-00-00.000Z',
  '2026-04-23T08-00-00.000Z',
];

const SNAPSHOTS = new Map<string, string>([
  [
    ENTRIES[0],
    '---\nid: note-1\n---\nalpha\ngamma from newer version\nshared\n',
  ],
  [
    ENTRIES[1],
    '---\nid: note-1\n---\nalpha\nbeta from selected version\nshared\n',
  ],
  [
    ENTRIES[2],
    '---\nid: note-1\n---\nalpha\nshared\n',
  ],
]);

const CURRENT_BODY = 'alpha\ncurrent live version\nshared\n';

function createStore(): NoteStore {
  return {
    listHistory: vi.fn().mockResolvedValue(ENTRIES),
    get: vi.fn().mockResolvedValue({
      id: 'note-1',
      title: 'Note 1',
      text: CURRENT_BODY,
      createdAt: '',
      updatedAt: '',
    }),
    getHistoryVersion: vi.fn(async (_noteId: string, ts: string) => SNAPSHOTS.get(ts) ?? null),
  } as unknown as NoteStore;
}

async function openSnapshot(ts: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(ts) }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HistoryPanel', () => {
  it('opens the modal on the Diff tab by default', async () => {
    const store = createStore();

    render(
      <HistoryPanel
        store={store}
        noteId="note-1"
        reloadToken={0}
        onRestore={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = await openSnapshot(ENTRIES[1]);
    const scope = within(dialog);

    expect(scope.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true');
    expect(scope.getByText('beta from selected version')).toBeInTheDocument();
  });

  it('compares a selected snapshot against the immediately older snapshot', async () => {
    const store = createStore();

    render(
      <HistoryPanel
        store={store}
        noteId="note-1"
        reloadToken={0}
        onRestore={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = await openSnapshot(ENTRIES[1]);
    const scope = within(dialog);

    expect(scope.getByText(ENTRIES[2])).toBeInTheDocument();
    expect(scope.getByText('beta from selected version')).toBeInTheDocument();
    expect(scope.queryByText('gamma from newer version')).not.toBeInTheDocument();
  });

  it('labels the oldest snapshot as the initial version', async () => {
    const store = createStore();

    render(
      <HistoryPanel
        store={store}
        noteId="note-1"
        reloadToken={0}
        onRestore={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = await openSnapshot(ENTRIES[2]);
    const scope = within(dialog);

    expect(scope.getByLabelText('Base snapshot')).toHaveValue('__initial__');
  });

  it('switches to the Snapshot tab and renders the selected version', async () => {
    const store = createStore();

    render(
      <HistoryPanel
        store={store}
        noteId="note-1"
        reloadToken={0}
        onRestore={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = await openSnapshot(ENTRIES[1]);
    const scope = within(dialog);

    fireEvent.click(scope.getByRole('tab', { name: 'Snapshot' }));

    expect(scope.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'true');
    expect(scope.getByTestId('milkdown-preview')).toHaveTextContent('beta from selected version');
    expect(scope.getByTestId('milkdown-preview')).not.toHaveTextContent('id: note-1');
  });

  it('lets you compare any two snapshot versions', async () => {
    const store = createStore();

    render(
      <HistoryPanel
        store={store}
        noteId="note-1"
        reloadToken={0}
        onRestore={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = await openSnapshot(ENTRIES[1]);
    const scope = within(dialog);

    fireEvent.change(scope.getByLabelText('Compare snapshot'), {
      target: { value: ENTRIES[0] },
    });

    await waitFor(() => {
      expect(scope.getByText('gamma from newer version')).toBeInTheDocument();
      expect(scope.queryByText('beta from selected version')).not.toBeInTheDocument();
    });
  });

  it('shows the current version in the selectors and marks it as already current', async () => {
    const store = createStore();

    render(
      <HistoryPanel
        store={store}
        noteId="note-1"
        reloadToken={0}
        onRestore={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = await openSnapshot(ENTRIES[1]);
    const scope = within(dialog);
    const baseSelect = scope.getByLabelText('Base snapshot');
    const compareSelect = scope.getByLabelText('Compare snapshot');

    expect(within(baseSelect).getByRole('option', { name: 'Current version' })).toBeInTheDocument();
    expect(within(compareSelect).getByRole('option', { name: 'Current version' })).toBeInTheDocument();

    fireEvent.change(compareSelect, {
      target: { value: '__current__' },
    });

    await waitFor(() => {
      expect(scope.getByText('Live note state')).toBeInTheDocument();
      expect(scope.getByText('current live version')).toBeInTheDocument();
      expect(scope.getByRole('button', { name: 'Already current' })).toBeDisabled();
    });
  });

  it('restores the selected snapshot body', async () => {
    const store = createStore();
    const onRestore = vi.fn().mockResolvedValue(undefined);

    render(
      <HistoryPanel
        store={store}
        noteId="note-1"
        reloadToken={0}
        onRestore={onRestore}
        onClose={vi.fn()}
      />,
    );

    const dialog = await openSnapshot(ENTRIES[1]);
    const scope = within(dialog);

    fireEvent.click(scope.getByRole('button', { name: 'Restore this version' }));

    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith('alpha\nbeta from selected version\nshared\n');
    });
  });

  it('restores the currently selected compare snapshot', async () => {
    const store = createStore();
    const onRestore = vi.fn().mockResolvedValue(undefined);

    render(
      <HistoryPanel
        store={store}
        noteId="note-1"
        reloadToken={0}
        onRestore={onRestore}
        onClose={vi.fn()}
      />,
    );

    const dialog = await openSnapshot(ENTRIES[1]);
    const scope = within(dialog);

    fireEvent.change(scope.getByLabelText('Compare snapshot'), {
      target: { value: ENTRIES[0] },
    });

    await waitFor(() => {
      expect(scope.getByText('gamma from newer version')).toBeInTheDocument();
    });

    fireEvent.click(scope.getByRole('button', { name: 'Restore this version' }));

    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith('alpha\ngamma from newer version\nshared\n');
    });
  });
});
