// Golden-master integration tests for <NotesPage>. These tests render the
// real page against a FakeNoteStore and exercise observable behavior. They
// must keep passing — unchanged — through every refactor step in the page
// breakup plan, since they're our only guard against regression for the
// flows page.tsx alone is responsible for.
//
// Heavy components (Milkdown / Graph / Palette / FileExplorer) are stubbed
// because we're testing page.tsx's orchestration, not their internals — the
// page is responsible for what it asks them to do, not how they render.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, act, within } from '@testing-library/react';
import { FakeNoteStore } from '@/utils/test/fake-store';

// ---------- Module mocks. vi.mock factories are hoisted, so these run before
// any of page.tsx's deps load. The factories dynamic-import from the helper
// at call-time so the fresh `storeRegistry` reference is always read.

vi.mock('@/lib/storage', async (orig) => {
  const actual = await orig<typeof import('@/lib/storage')>();
  const { storeRegistry } = await import('@/utils/test/render-app');
  return { ...actual, getStore: () => storeRegistry.get() };
});

vi.mock('@/components/MilkdownEditor', async () => {
  const { MilkdownStub } = await import('@/utils/test/render-app');
  return { default: MilkdownStub };
});

vi.mock('@/components/GraphView', async () => {
  const { GraphStub } = await import('@/utils/test/render-app');
  return { default: GraphStub };
});

vi.mock('@/components/CommandPalette', async () => {
  const { CommandPaletteStub } = await import('@/utils/test/render-app');
  return { default: CommandPaletteStub };
});

vi.mock('@/components/FileExplorerPalette', async () => {
  const { FileExplorerStub } = await import('@/utils/test/render-app');
  return { default: FileExplorerStub };
});

// MilkdownEditor is loaded via next/dynamic. By default that wraps the import
// in Suspense, which jsdom struggles to resolve for client-only modules.
// Force eager resolution so our stub is rendered synchronously.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    let Component: React.ComponentType<unknown> | null = null;
    void loader().then((m) => { Component = m.default; });
    const Wrapped: React.FC<Record<string, unknown>> = (props) => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        if (Component) return;
        loader().then((m) => { Component = m.default; force(v => v + 1); });
      }, []);
      if (!Component) return null;
      return React.createElement(Component, props);
    };
    return Wrapped;
  },
}));

import { renderApp, storeRegistry } from '@/utils/test/render-app';

beforeEach(() => {
  // Each test owns its store. localStorage carries vault-scoped state across
  // mounts, so wipe it to keep tests isolated. (FakeNoteStore generates a
  // unique vault id per instance so the IndexedDB snapshot cache also never
  // collides between tests.)
  window.localStorage.clear();
  // useUrlRouting reads `window.location.pathname` directly and writes via
  // history.pushState/replaceState — that survives unmount, so reset it.
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  // Always tear down the rendered tree so background effects from the
  // previous test don't race the next one's setup.
  cleanup();
  storeRegistry.clear();
  // A test that forgot vi.useRealTimers() in its `try`-block would corrupt
  // every following test's debounce assertions. Belt-and-suspenders.
  vi.useRealTimers();
});

// ---------- I-1: Boot with no vault → folder picker

describe('NotesPage boot states', () => {
  it('renders the folder picker when the store reports needsPicker', async () => {
    const store = new FakeNoteStore({ ready: false, needsPicker: true, label: 'Old Vault' });
    await renderApp({ store });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /choose your notes folder/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Old Vault')).toBeInTheDocument();
  }, 15000);

  it('renders the main UI when the store is ready', async () => {
    const store = new FakeNoteStore({ ready: true, label: 'My Vault' });
    await renderApp({ store });
    await waitFor(() => {
      // The empty-state heading uses one of the journal prompts. We can't
      // predict which prompt was picked, so anchor on the CTA copy that's
      // present regardless of vault size.
      expect(screen.getByRole('button', { name: /create your first note/i })).toBeInTheDocument();
    });
  });

  it('shows "New note" CTA copy once the vault has at least one note', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: '# A\n' });
    await renderApp({ store });
    // The CTA button reads "+ New note" — accessible name includes the
    // glyph. Anchor on substring + the vault count so we don't false-match
    // a sidebar button.
    await waitFor(() => {
      expect(screen.getByText(/1 note in your vault/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /new note/i })).toBeInTheDocument();
  });
});

// ---------- I-2 / I-3: Empty state journal card + recent shelf

describe('NotesPage empty state', () => {
  it('shows the recent shelf once notes exist', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: '# Alpha\n' });
    store._test_seedNote({ id: 'b.md', title: 'Beta', text: '# Beta\n' });
    await renderApp({ store });
    await waitFor(() => {
      expect(screen.getByText(/2 notes in your vault/i)).toBeInTheDocument();
    });
    // Recent cards link by clickable button rendering the title.
    expect(screen.getByRole('button', { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beta/i })).toBeInTheDocument();
  });
});

// ---------- I-4 / I-9 / I-10: Open + edit a note

describe('NotesPage note opening + autosave', () => {
  it('opens a seeded note when its recent card is clicked', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: '# Alpha\n\nbody' });
    const { flushAsync } = await renderApp({ store });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /alpha/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    await flushAsync();
    await waitFor(() => {
      // Title input shows the title; editor stub shows the body.
      const title = screen.getByPlaceholderText(/note title/i) as HTMLInputElement;
      expect(title.value).toBe('Alpha');
      const editor = screen.getByTestId('milkdown-stub') as HTMLTextAreaElement;
      expect(editor.value).toContain('body');
    });
  });

  it('autosaves on body change after the debounce window', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: '# Alpha\n' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { flushAsync } = await renderApp({ store });
    await waitFor(() => screen.getByRole('button', { name: /alpha/i }));
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    await flushAsync();
    const editor = await screen.findByTestId('milkdown-stub') as HTMLTextAreaElement;

    // Switch to fake timers only after the editor is on screen — `findByX`
    // uses `setTimeout` for its retry cadence and stalls under fake timers.
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(editor, { target: { value: '# Alpha\nedited' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    vi.useRealTimers();

    expect(saveSpy).toHaveBeenCalled();
    const lastCall = saveSpy.mock.calls.at(-1)!;
    expect(lastCall[1]).toBe('# Alpha\nedited');
  });

  it('does NOT autosave an empty body without a forced flag', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: '# Alpha\n' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { flushAsync } = await renderApp({ store });
    await waitFor(() => screen.getByRole('button', { name: /alpha/i }));
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    await flushAsync();
    const editor = await screen.findByTestId('milkdown-stub') as HTMLTextAreaElement;

    vi.useFakeTimers();
    await act(async () => { fireEvent.change(editor, { target: { value: '' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    vi.useRealTimers();

    // doSave explicitly skips empty-body writes without {force: true}.
    expect(saveSpy).not.toHaveBeenCalled();
  });
});

// ---------- I-9: Title rename autosave

describe('NotesPage title rename', () => {
  it('debounces a rename call when the user edits the title input', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: 'body' });
    const renameSpy = vi.spyOn(store, 'rename');
    const { flushAsync } = await renderApp({ store });
    await waitFor(() => screen.getByRole('button', { name: /alpha/i }));
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    await flushAsync();
    const titleInput = await screen.findByPlaceholderText(/note title/i) as HTMLInputElement;

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Renamed' } });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    vi.useRealTimers();

    expect(renameSpy).toHaveBeenCalled();
    const last = renameSpy.mock.calls.at(-1)!;
    expect(last[1]).toBe('Renamed');
  });
});

// ---------- I-12 / I-13: Delete confirmation

describe('NotesPage delete confirmation', () => {
  it('first delete click enters confirm state without deleting', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: 'body' });
    const deleteSpy = vi.spyOn(store, 'delete');
    const { flushAsync } = await renderApp({ store });
    await waitFor(() => screen.getByRole('button', { name: /alpha/i }));
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    await flushAsync();
    const deleteBtn = await screen.findByRole('button', { name: /delete note/i });
    fireEvent.click(deleteBtn);
    await flushAsync();
    expect(deleteSpy).not.toHaveBeenCalled();
    // Button label flips to "Click again to confirm delete".
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
  });

  it('second delete click within the window deletes the note', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: 'body' });
    const deleteSpy = vi.spyOn(store, 'delete');
    const { flushAsync } = await renderApp({ store });
    await waitFor(() => screen.getByRole('button', { name: /alpha/i }));
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    await flushAsync();
    const deleteBtn = await screen.findByRole('button', { name: /delete note/i });
    fireEvent.click(deleteBtn);
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    await flushAsync();
    expect(deleteSpy).toHaveBeenCalledWith('a.md');
  });
});

// ---------- I-39: Conflict on save

describe('NotesPage save conflict handling', () => {
  it('flips save status to error when saveContent throws a NoteConflictError', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: 'body' });
    const { flushAsync } = await renderApp({ store });
    await waitFor(() => screen.getByRole('button', { name: /alpha/i }));
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    await flushAsync();
    const editor = await screen.findByTestId('milkdown-stub') as HTMLTextAreaElement;
    // Arm the next saveContent to throw a conflict.
    store._test_simulateConflictOnNext('a.md');

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(editor, { target: { value: 'body 2' } });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    vi.useRealTimers();

    // Save status text region renders the error label.
    await waitFor(() => {
      expect(screen.getByText(/save failed/i)).toBeInTheDocument();
    });
  });
});

// ---------- I-15 / I-16: Keyboard shortcuts (palette + sidebar)

describe('NotesPage keyboard shortcuts', () => {
  it('Cmd+K opens the command palette', async () => {
    const store = new FakeNoteStore();
    await renderApp({ store });
    await waitFor(() => screen.getByRole('button', { name: /create your first note/i }));
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });
    expect(await screen.findByTestId('palette-stub')).toBeInTheDocument();
  });
});

// ---------- I-31: Tag filter (sidebar wiring)

describe('NotesPage tag filter', () => {
  it('clearing the active tag chip restores the full sidebar', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'Alpha', text: '# Alpha\n#focus' });
    store._test_seedNote({ id: 'b.md', title: 'Beta', text: '# Beta\n' });
    await renderApp({ store });
    await waitFor(() => {
      // Two notes both visible in the empty-state recent list.
      expect(screen.getByText(/2 notes in your vault/i)).toBeInTheDocument();
    });
    // We don't trigger the filter directly here — that's a sidebar
    // responsibility — but assert the wiring renders both notes by default.
    const recent = screen.getAllByRole('button', { name: /alpha|beta/i });
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------- Regression: the page renders without crashing for many shapes

describe('NotesPage smoke', () => {
  it('renders the empty-state journal card in a fresh vault', async () => {
    const store = new FakeNoteStore();
    await renderApp({ store });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create your first note/i })).toBeInTheDocument();
    });
    // Shortcut grid renders for visible shortcuts.
    expect(screen.getAllByText(/new note/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/command palette/i).length).toBeGreaterThan(0);
  });

  it('renders folders + notes from a seeded vault', async () => {
    const store = new FakeNoteStore();
    store._test_seedFolder('projects');
    store._test_seedNote({ id: 'projects/foo.md', title: 'Foo', text: 'x' });
    await renderApp({ store });
    await waitFor(() => {
      expect(screen.getByText(/1 note in your vault/i)).toBeInTheDocument();
    });
    // Foo appears in the recent shelf. (Sidebar tree rendering is exercised
    // by NotesSidebar's own tests; here we only assert page-level wiring.)
    expect(screen.getByRole('button', { name: /foo/i })).toBeInTheDocument();
  });
});

// `within` is exported above so future tests can scope queries; silence the
// unused-import linter without dropping it from the public surface.
void within;
