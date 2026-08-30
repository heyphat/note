import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, cleanup } from '@testing-library/react';
import EmptyState, { formatEmptyStateDate, type EmptyStateProps } from './EmptyState';
import { renderWithIntl } from '@/utils/test/intl';

function makeProps(overrides: Partial<EmptyStateProps> = {}): EmptyStateProps {
  return {
    notes: [],
    activeId: null,
    activeTemplate: null,
    sidebarOpen: true,
    locale: 'en',
    onCreateNote: vi.fn(),
    onSelectNote: vi.fn(),
    onToggleSidebar: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('EmptyState', () => {
  it('renders the "Create your first note" CTA when the vault is empty', () => {
    renderWithIntl(<EmptyState {...makeProps()} />);
    expect(screen.getByRole('button', { name: /create your first note/i })).toBeInTheDocument();
    // Vault count line is suppressed when empty.
    expect(screen.queryByText(/note in your vault/i)).not.toBeInTheDocument();
  });

  it('renders the "New note" CTA + vault count once notes exist', () => {
    const notes = [
      { id: 'a.md', title: 'Alpha', createdAt: '2026-04-26T00:00:00Z', updatedAt: '2026-04-26T00:00:00Z' },
      { id: 'b.md', title: 'Beta', createdAt: '2026-04-25T00:00:00Z', updatedAt: '2026-04-25T00:00:00Z' },
    ];
    renderWithIntl(<EmptyState {...makeProps({ notes })} />);
    expect(screen.getByRole('button', { name: /new note/i })).toBeInTheDocument();
    expect(screen.getByText(/2 notes in your vault/i)).toBeInTheDocument();
  });

  it('uses singular vault-count copy for exactly one note', () => {
    const notes = [
      { id: 'a.md', title: 'Alpha', createdAt: '2026-04-26T00:00:00Z', updatedAt: '2026-04-26T00:00:00Z' },
    ];
    renderWithIntl(<EmptyState {...makeProps({ notes })} />);
    expect(screen.getByText(/1 note in your vault/i)).toBeInTheDocument();
  });

  it('fires onCreateNote when the CTA is clicked', () => {
    const onCreateNote = vi.fn();
    renderWithIntl(<EmptyState {...makeProps({ onCreateNote })} />);
    fireEvent.click(screen.getByRole('button', { name: /create your first note/i }));
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });

  it('renders the three most-recent notes and routes clicks through onSelectNote', () => {
    const notes = [
      { id: 'a.md', title: 'Alpha', createdAt: '', updatedAt: '2026-04-26T00:00:00Z' },
      { id: 'b.md', title: 'Beta', createdAt: '', updatedAt: '2026-04-25T00:00:00Z' },
      { id: 'c.md', title: 'Gamma', createdAt: '', updatedAt: '2026-04-24T00:00:00Z' },
      { id: 'd.md', title: 'Delta', createdAt: '', updatedAt: '2026-04-23T00:00:00Z' },
    ];
    const onSelectNote = vi.fn();
    renderWithIntl(<EmptyState {...makeProps({ notes, onSelectNote })} />);
    expect(screen.getByRole('button', { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gamma/i })).toBeInTheDocument();
    // 4th note is sliced off.
    expect(screen.queryByRole('button', { name: /delta/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /beta/i }));
    expect(onSelectNote).toHaveBeenCalledWith('b.md');
  });

  it('falls back to the "Untitled" label when a note has no title', () => {
    const notes = [
      { id: 'a.md', title: '', createdAt: '', updatedAt: '2026-04-26T00:00:00Z' },
    ];
    renderWithIntl(<EmptyState {...makeProps({ notes })} />);
    expect(screen.getByRole('button', { name: /untitled/i })).toBeInTheDocument();
  });

  it('renders a sidebar toggle when the sidebar is closed', () => {
    renderWithIntl(<EmptyState {...makeProps({ sidebarOpen: false })} />);
    // The HeaderToggles SidebarToggle uses an aria-label like "Show sidebar".
    expect(screen.getByLabelText(/show sidebar/i)).toBeInTheDocument();
  });

  it('does NOT render a sidebar toggle when the sidebar is open', () => {
    renderWithIntl(<EmptyState {...makeProps({ sidebarOpen: true })} />);
    expect(screen.queryByLabelText(/show sidebar/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/hide sidebar/i)).not.toBeInTheDocument();
  });

  it('re-rolls the journal prompt when activeId transitions', () => {
    // Math.random returning 0 picks promptQ1 ("What's on your mind today?").
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0);
    const props = makeProps({ activeId: null });
    const { rerender } = renderWithIntl(<EmptyState {...props} />);
    expect(screen.getByRole('heading', { name: /what's on your mind today/i })).toBeInTheDocument();

    // 7/8 picks the last prompt key (promptQ8).
    randomSpy.mockReturnValueOnce(7 / 8);
    rerender(<EmptyState {...props} activeId="some/note.md" />);
    expect(screen.getByRole('heading', { name: /what's worth remembering from today/i })).toBeInTheDocument();
    randomSpy.mockRestore();
  });
});

describe('formatEmptyStateDate', () => {
  const labels = {
    today: 'today',
    yesterday: 'yesterday',
    daysAgo: (n: number) => `${n}d ago`,
  };

  beforeEach(() => {
    // Pin "now" so date diffs are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "today" for an ISO within the last 24h', () => {
    const t = new Date('2026-04-27T01:00:00Z').toISOString();
    expect(formatEmptyStateDate(t, 'en', labels)).toBe('today');
  });

  it('returns "yesterday" for an ISO between 24h and 48h old', () => {
    const t = new Date('2026-04-26T06:00:00Z').toISOString();
    expect(formatEmptyStateDate(t, 'en', labels)).toBe('yesterday');
  });

  it('returns "Nd ago" for an ISO 2–6 days old', () => {
    const t = new Date('2026-04-23T12:00:00Z').toISOString(); // exactly 4 days
    expect(formatEmptyStateDate(t, 'en', labels)).toBe('4d ago');
  });

  it('falls back to a localized short date when older than 7 days', () => {
    const t = new Date('2026-03-15T00:00:00Z').toISOString();
    const out = formatEmptyStateDate(t, 'en', labels);
    // Locale-dependent formatting; assert it contains a recognizable month
    // token rather than pinning the exact string.
    expect(out).toMatch(/Mar/);
  });

  it('returns the empty string for an unparseable ISO', () => {
    expect(formatEmptyStateDate('not a date', 'en', labels)).toBe('');
  });
});
