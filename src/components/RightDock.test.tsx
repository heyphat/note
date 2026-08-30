import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import RightDock, { type RightDockProps } from './RightDock';
import type { LinkIndex } from '@/lib/links/link-index';
import type { NoteMeta, NoteStore } from '@/lib/storage';

// Stub the two child panels — we're testing RightDock's own gating
// (visibility, backdrop click, mobile/desktop layout), not their internals.
vi.mock('./BacklinksPanel', () => ({
  default: function BacklinksStub(props: { onClose: () => void }) {
    return (
      <div data-testid="backlinks-stub">
        backlinks
        <button onClick={props.onClose}>close-bl</button>
      </div>
    );
  },
}));
vi.mock('./HistoryPanel', () => ({
  default: function HistoryStub(props: { onClose: () => void }) {
    return (
      <div data-testid="history-stub">
        history
        <button onClick={props.onClose}>close-hist</button>
      </div>
    );
  },
}));

afterEach(() => cleanup());

const fakeLinkIndex: LinkIndex | null = null;
const fakeStore: NoteStore = {} as unknown as NoteStore;

function makeProps(overrides: Partial<RightDockProps> = {}): RightDockProps {
  const note: NoteMeta = {
    id: 'a.md',
    title: 'A',
    createdAt: '2026-04-26T00:00:00Z',
    updatedAt: '2026-04-26T00:00:00Z',
  };
  return {
    backlinksOpen: false,
    historyOpen: false,
    tasksOpen: false,
    activeId: 'a.md',
    linkIndex: fakeLinkIndex,
    linksVersion: 0,
    notesById: new Map([[note.id, note]]),
    activeBody: 'body',
    onSelectNote: vi.fn(),
    onLinkMention: vi.fn(),
    onCloseBacklinks: vi.fn(),
    store: fakeStore,
    historyReloadToken: 0,
    onRestoreFromHistory: vi.fn(async () => undefined),
    onCloseHistory: vi.fn(),
    taskIndex: null,
    tasksVersion: 0,
    onOpenTask: vi.fn(),
    onToggleTaskComplete: vi.fn(),
    onCloseTasks: vi.fn(),
    ...overrides,
  };
}

describe('RightDock — visibility', () => {
  it('renders nothing when neither panel is open', () => {
    const { container } = render(<RightDock {...makeProps()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when activeId is null (even if a panel flag is on)', () => {
    const { container } = render(<RightDock {...makeProps({ activeId: null, backlinksOpen: true })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders ONLY backlinks when backlinksOpen=true and historyOpen=false', () => {
    render(<RightDock {...makeProps({ backlinksOpen: true })} />);
    expect(screen.getByTestId('backlinks-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('history-stub')).not.toBeInTheDocument();
  });

  it('renders ONLY history when historyOpen=true and backlinksOpen=false', () => {
    render(<RightDock {...makeProps({ historyOpen: true })} />);
    expect(screen.getByTestId('history-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('backlinks-stub')).not.toBeInTheDocument();
  });

  it('renders BOTH panels when both flags are open', () => {
    render(<RightDock {...makeProps({ backlinksOpen: true, historyOpen: true })} />);
    expect(screen.getByTestId('backlinks-stub')).toBeInTheDocument();
    expect(screen.getByTestId('history-stub')).toBeInTheDocument();
  });
});

describe('RightDock — mobile backdrop', () => {
  it('renders the backdrop alongside the panel column', () => {
    render(<RightDock {...makeProps({ backlinksOpen: true })} />);
    expect(screen.getByTestId('right-dock-backdrop')).toBeInTheDocument();
  });

  it('clicking the backdrop closes whichever panels are open (only)', () => {
    const onCloseBacklinks = vi.fn();
    const onCloseHistory = vi.fn();
    render(<RightDock {...makeProps({
      backlinksOpen: true,
      historyOpen: true,
      onCloseBacklinks,
      onCloseHistory,
    })} />);
    fireEvent.click(screen.getByTestId('right-dock-backdrop'));
    expect(onCloseBacklinks).toHaveBeenCalledTimes(1);
    expect(onCloseHistory).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop with only history open does NOT call onCloseBacklinks', () => {
    const onCloseBacklinks = vi.fn();
    const onCloseHistory = vi.fn();
    render(<RightDock {...makeProps({
      backlinksOpen: false,
      historyOpen: true,
      onCloseBacklinks,
      onCloseHistory,
    })} />);
    fireEvent.click(screen.getByTestId('right-dock-backdrop'));
    expect(onCloseBacklinks).not.toHaveBeenCalled();
    expect(onCloseHistory).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop with only backlinks open does NOT call onCloseHistory', () => {
    const onCloseBacklinks = vi.fn();
    const onCloseHistory = vi.fn();
    render(<RightDock {...makeProps({
      backlinksOpen: true,
      historyOpen: false,
      onCloseBacklinks,
      onCloseHistory,
    })} />);
    fireEvent.click(screen.getByTestId('right-dock-backdrop'));
    expect(onCloseHistory).not.toHaveBeenCalled();
    expect(onCloseBacklinks).toHaveBeenCalledTimes(1);
  });
});

describe('RightDock — close-button wiring', () => {
  it('forwards each panel its own close callback', () => {
    const onCloseBacklinks = vi.fn();
    const onCloseHistory = vi.fn();
    render(<RightDock {...makeProps({
      backlinksOpen: true,
      historyOpen: true,
      onCloseBacklinks,
      onCloseHistory,
    })} />);
    fireEvent.click(screen.getByText('close-bl'));
    expect(onCloseBacklinks).toHaveBeenCalledTimes(1);
    expect(onCloseHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('close-hist'));
    expect(onCloseHistory).toHaveBeenCalledTimes(1);
  });
});
