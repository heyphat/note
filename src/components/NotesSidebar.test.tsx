import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotesSidebar, { type NotesSidebarProps } from './NotesSidebar';
import { renderWithIntl as render } from '@/utils/test/intl';

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => null,
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makeProps(overrides: Partial<NotesSidebarProps> = {}): NotesSidebarProps {
  const note = {
    id: 'unsorted/demo.md',
    title: 'Demo',
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
  };
  return {
    open: true,
    onToggleSidebar: vi.fn(),
    loading: false,
    targetFolder: '',
    setTargetFolder: vi.fn(),
    onCreateNote: vi.fn(),
    onCreateFolder: vi.fn(),
    onCreateTemplate: vi.fn(),
    indexTags: [],
    activeTagFilter: null,
    setActiveTagFilter: vi.fn(),
    hiddenTags: new Set<string>(),
    hideTag: vi.fn(),
    unhideTag: vi.fn(),
    activeDateFilter: null,
    setActiveDateFilter: vi.fn(),
    recentIds: [],
    notesById: new Map([[note.id, note]]),
    activeId: null,
    editingTitle: '',
    selectNote: vi.fn(async () => undefined),
    savedSearches: [],
    activeSavedSearchId: null,
    setActiveSavedSearchId: vi.fn(),
    onRenameSavedSearch: vi.fn(),
    onDeleteSavedSearch: vi.fn(),
    templates: [],
    activeTemplate: null,
    openTemplate: vi.fn(async () => true),
    onRenameTemplate: vi.fn(async () => undefined),
    onDeleteTemplate: vi.fn(async () => undefined),
    skills: [],
    activeSkill: null,
    onSelectSkill: vi.fn(),
    onImportSkill: vi.fn(),
    onRenameSkill: vi.fn(async () => undefined),
    onDeleteSkill: vi.fn(async () => undefined),
    onMoveSkill: vi.fn(async () => null),
    notes: [note],
    visibleNotes: [note],
    folders: ['unsorted'],
    savedSearchResults: null,
    expanded: new Set<string>(),
    toggleFolder: vi.fn(),
    onFolderClick: vi.fn(),
    pinned: new Set<string>(),
    togglePin: vi.fn(),
    deleteItem: vi.fn(async () => undefined),
    onMove: vi.fn(async () => undefined),
    onRenameFolder: vi.fn(async () => undefined),
    bfsLabel: 'notes',
    onPickFolder: vi.fn(),
    dense: false,
    showCalendar: true,
    showTags: true,
    showRecent: true,
    showTemplates: true,
    showSkills: true,
    onOpenSettings: vi.fn(),
    ...overrides,
  };
}

describe('NotesSidebar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('shows the Tags section when enabled even before tags are indexed', () => {
    render(<NotesSidebar {...makeProps({ indexTags: [] })} />);

    fireEvent.click(screen.getByRole('button', { name: /Tags\s*0/ }));

    expect(screen.getByText('No tags indexed yet')).toBeInTheDocument();
  });
});
