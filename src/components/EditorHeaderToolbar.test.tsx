import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, screen, cleanup, within } from '@testing-library/react';
import EditorHeaderToolbar, { type EditorHeaderToolbarProps } from './EditorHeaderToolbar';
import { DEFAULT_SETTINGS } from './EditorSettings';
import { renderWithIntl } from '@/utils/test/intl';

// PomodoroChip portals a popover to body and uses ResizeObserver for sizing.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

function makeProps(overrides: Partial<EditorHeaderToolbarProps> = {}): EditorHeaderToolbarProps {
  return {
    activeId: 'a.md',
    activeTemplate: null,
    activeSkill: null,
    editingTitle: 'Hello',
    isLocked: false,
    confirmDelete: false,
    sidebarOpen: true,
    backlinksOpen: false,
    historyOpen: false,
    narrowEditor: false,
    paletteId: 'default',
    editorSettings: { ...DEFAULT_SETTINGS },
    noteStats: { words: 12, chars: 64, readingMinutes: 1 },
    saveStatus: 'idle',
    backlinksCount: 0,
    onTitleChange: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleLock: vi.fn(),
    onToggleBacklinks: vi.fn(),
    onToggleGraph: vi.fn(),
    onToggleHistory: vi.fn(),
    onToggleNarrow: vi.fn(),
    onPaletteChange: vi.fn(),
    onEditorSettingsChange: vi.fn(),
    onDuplicate: vi.fn(),
    onExport: vi.fn(),
    onDelete: vi.fn(),
    onJumpToNote: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('EditorHeaderToolbar — title input', () => {
  it('fires onTitleChange when the user types', () => {
    const onTitleChange = vi.fn();
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ onTitleChange })} />);
    const input = screen.getByPlaceholderText(/note title/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New title' } });
    expect(onTitleChange).toHaveBeenCalledWith('New title');
  });

  it('renders the title as readOnly when the note is locked', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ isLocked: true })} />);
    const input = screen.getByPlaceholderText(/note title/i) as HTMLInputElement;
    expect(input).toHaveAttribute('readonly');
  });

  it('does NOT lock the title when editing a template (even if isLocked=true)', () => {
    // Templates can always be renamed; the lock UI is hidden in that mode.
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ activeTemplate: 't1', isLocked: true })} />);
    const input = screen.getByPlaceholderText(/template title/i) as HTMLInputElement;
    expect(input).not.toHaveAttribute('readonly');
  });
});

describe('EditorHeaderToolbar — word count + save status', () => {
  it('hides the word-count badge when showWordCount=false', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      editorSettings: { ...DEFAULT_SETTINGS, showWordCount: false },
    })} />);
    expect(screen.queryByText(/12 words/)).not.toBeInTheDocument();
  });

  it('hides the word-count badge when noteStats.words is 0', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      noteStats: { words: 0, chars: 0, readingMinutes: 0 },
    })} />);
    expect(screen.queryByText(/words/)).not.toBeInTheDocument();
  });

  it('renders the word-count badge when both flags are on and words > 0', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps()} />);
    expect(screen.getByText(/12 words/)).toBeInTheDocument();
  });

  it('shows "Saving..." for saving status', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ saveStatus: 'saving' })} />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('shows "Saved" for saved status', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ saveStatus: 'saved' })} />);
    expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
  });

  it('shows "Save failed" for error status', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ saveStatus: 'error' })} />);
    expect(screen.getByText(/save failed/i)).toBeInTheDocument();
  });

  it('shows nothing in the save-status slot when idle', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ saveStatus: 'idle' })} />);
    expect(screen.queryByText(/saving|^saved$|save failed/i)).not.toBeInTheDocument();
  });
});

describe('EditorHeaderToolbar — action buttons (note mode)', () => {
  it('renders lock / backlinks / graph / history / duplicate / export / delete', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps()} />);
    expect(screen.getByLabelText(/lock editor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/duplicate note/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/export as pdf/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^delete note$/i)).toBeInTheDocument();
  });

  it('hides the action buttons when editing a template', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ activeTemplate: 't1', activeId: null })} />);
    expect(screen.queryByLabelText(/lock editor/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/duplicate note/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/export as pdf/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^delete note$/i)).not.toBeInTheDocument();
  });

  it('toggles the lock label between "Lock editor" and "Unlock editor"', () => {
    const { rerender } = renderWithIntl(<EditorHeaderToolbar {...makeProps({ isLocked: false })} />);
    expect(screen.getByLabelText(/lock editor/i)).toHaveAttribute('aria-pressed', 'false');
    rerender(<EditorHeaderToolbar {...makeProps({ isLocked: true })} />);
    expect(screen.getByLabelText(/unlock editor/i)).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders different lock SVG paths for unlocked vs locked', () => {
    const { container, rerender } = renderWithIntl(<EditorHeaderToolbar {...makeProps({ isLocked: false })} />);
    const unlockedSvgHtml = container.querySelector('[aria-label="Lock editor"] svg')?.innerHTML ?? '';
    rerender(<EditorHeaderToolbar {...makeProps({ isLocked: true })} />);
    const lockedSvgHtml = container.querySelector('[aria-label="Unlock editor"] svg')?.innerHTML ?? '';
    // Locked path includes the closed-shackle stroke; unlocked uses the open one.
    expect(unlockedSvgHtml).toContain('M8 11V7a4 4 0 0 1 8 0');
    expect(unlockedSvgHtml).not.toContain('M8 11V7a4 4 0 0 1 8 0v4');
    expect(lockedSvgHtml).toContain('M8 11V7a4 4 0 0 1 8 0v4');
  });

  it('routes onClick → onToggleLock', () => {
    const onToggleLock = vi.fn();
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ onToggleLock })} />);
    fireEvent.click(screen.getByLabelText(/lock editor/i));
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });

  it('routes onClick → onToggleBacklinks / onToggleGraph / onToggleHistory', () => {
    const onToggleBacklinks = vi.fn();
    const onToggleGraph = vi.fn();
    const onToggleHistory = vi.fn();
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      onToggleBacklinks, onToggleGraph, onToggleHistory,
    })} />);
    // Toggle buttons come from <HeaderToggles>; rely on accessible labels.
    fireEvent.click(screen.getByLabelText(/backlink/i));
    expect(onToggleBacklinks).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(/graph/i));
    expect(onToggleGraph).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(/history/i));
    expect(onToggleHistory).toHaveBeenCalledTimes(1);
  });

  it('routes duplicate / export with the activeId', () => {
    const onDuplicate = vi.fn();
    const onExport = vi.fn();
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      activeId: 'projects/foo.md', onDuplicate, onExport,
    })} />);
    fireEvent.click(screen.getByLabelText(/duplicate note/i));
    expect(onDuplicate).toHaveBeenCalledWith('projects/foo.md');
    fireEvent.click(screen.getByLabelText(/export as pdf/i));
    expect(onExport).toHaveBeenCalledWith('projects/foo.md');
  });

  it('does NOT call onDuplicate / onExport when activeId is null', () => {
    const onDuplicate = vi.fn();
    const onExport = vi.fn();
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      activeId: null, onDuplicate, onExport,
    })} />);
    fireEvent.click(screen.getByLabelText(/duplicate note/i));
    fireEvent.click(screen.getByLabelText(/export as pdf/i));
    expect(onDuplicate).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });
});

describe('EditorHeaderToolbar — delete confirm-state', () => {
  it('uses the regular label when not in confirm-delete state', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ confirmDelete: false })} />);
    const btn = screen.getByLabelText(/^delete note$/i);
    expect(btn).not.toHaveClass('animate-pulse');
  });

  it('switches to the "Click again to confirm delete" label and pulses in confirm state', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ confirmDelete: true })} />);
    const btn = screen.getByLabelText(/click again to confirm delete/i);
    expect(btn).toHaveClass('animate-pulse');
    expect(btn).toHaveClass('bg-red-500');
  });

  it('fires onDelete on click', () => {
    const onDelete = vi.fn();
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ onDelete })} />);
    fireEvent.click(screen.getByLabelText(/^delete note$/i));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('EditorHeaderToolbar — Recover button', () => {
  it('renders the Recover button when saveStatus="error" AND saveErrorKind="not-found"', () => {
    const onOpenRecovery = vi.fn();
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      saveStatus: 'error', saveErrorKind: 'not-found', onOpenRecovery,
    })} />);
    const btn = screen.getByLabelText(/recover note from missing-file state/i);
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/recover/i);
  });

  it('does NOT render the Recover button when saveErrorKind is undefined', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ saveStatus: 'error' })} />);
    expect(screen.queryByLabelText(/recover note from missing-file state/i)).not.toBeInTheDocument();
  });

  it('does NOT render the Recover button on conflict / other error kinds', () => {
    const { rerender } = renderWithIntl(<EditorHeaderToolbar {...makeProps({
      saveStatus: 'error', saveErrorKind: 'conflict', onOpenRecovery: vi.fn(),
    })} />);
    expect(screen.queryByLabelText(/recover note from missing-file state/i)).not.toBeInTheDocument();
    rerender(<EditorHeaderToolbar {...makeProps({
      saveStatus: 'error', saveErrorKind: 'other', onOpenRecovery: vi.fn(),
    })} />);
    expect(screen.queryByLabelText(/recover note from missing-file state/i)).not.toBeInTheDocument();
  });

  it('does NOT render the Recover button when saveStatus is not "error"', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      saveStatus: 'saved', saveErrorKind: 'not-found', onOpenRecovery: vi.fn(),
    })} />);
    expect(screen.queryByLabelText(/recover note from missing-file state/i)).not.toBeInTheDocument();
  });

  it('routes onClick → onOpenRecovery', () => {
    const onOpenRecovery = vi.fn();
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      saveStatus: 'error', saveErrorKind: 'not-found', onOpenRecovery,
    })} />);
    fireEvent.click(screen.getByLabelText(/recover note from missing-file state/i));
    expect(onOpenRecovery).toHaveBeenCalledTimes(1);
  });

  it('uses the missing-file-specific tooltip on the "Save failed" indicator when kind=not-found', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({
      saveStatus: 'error', saveErrorKind: 'not-found', onOpenRecovery: vi.fn(),
    })} />);
    const indicator = screen.getByText(/save failed/i);
    expect(indicator).toHaveAttribute('title');
    expect(indicator.getAttribute('title')).toMatch(/file is missing on disk/i);
  });
});

describe('EditorHeaderToolbar — sidebar toggle visibility', () => {
  it('renders the SidebarToggle when sidebar is closed', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ sidebarOpen: false })} />);
    // SidebarToggle uses "Show sidebar" / "Hide sidebar" aria-labels.
    expect(screen.getByLabelText(/show sidebar/i)).toBeInTheDocument();
  });

  it('does NOT render the SidebarToggle when sidebar is open', () => {
    renderWithIntl(<EditorHeaderToolbar {...makeProps({ sidebarOpen: true })} />);
    expect(screen.queryByLabelText(/show sidebar|hide sidebar/i)).not.toBeInTheDocument();
  });
});

describe('EditorHeaderToolbar — template mode chrome', () => {
  it('shows the template emoji and template-title placeholder', () => {
    const { container } = renderWithIntl(<EditorHeaderToolbar {...makeProps({
      activeTemplate: 't1', activeId: null, editingTitle: 'Daily',
    })} />);
    expect(within(container).getByText('📄')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/template title/i)).toBeInTheDocument();
  });
});
