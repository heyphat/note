'use client';

// Keyboard-first file-explorer overlay. Four view modes share one palette
// chrome (header, search, toolbar, overlay) so the Cmd+Shift+E shortcut
// lands users in whichever layout they last used without ceremony.
//
// View modes:
//   tree    — expand/collapse nested like the sidebar (virtualized)
//   columns — Finder-style drill-down, one column per level
//   list    — single folder, arrow keys drill in/out
//   grid    — tile layout of the same folder
//
// All file actions (create / rename / delete / move) route back to the
// page.tsx callbacks that already power the sidebar, so there is no new
// storage code here.

import {
  memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslations } from 'next-intl';
import type { NoteMeta } from '@/lib/storage';
import {
  buildTree, flattenTree, childrenAt, isDescendantOrSelf, parentOf,
  DELETE_CONFIRM_MS,
  type FlatRow, type TreeNode,
} from '@/lib/tree';
import { showToast } from '@/components/Toast';

type ViewMode = 'tree' | 'columns' | 'list' | 'grid';

const VIEW_MODES: ViewMode[] = ['tree', 'columns', 'list', 'grid'];

const LS_VIEW = 'fileExplorerViewMode';
const LS_PATH = 'fileExplorerLastPath';
const LS_COLS = 'fileExplorerColPath';

// Virtualization constants for the Tree view — identical to NoteTree's so
// behavior is consistent between the sidebar and the palette.
const ROW_HEIGHT = 30;
const OVERSCAN = 10;
const VIRT_THRESHOLD = 500;

interface Props {
  open: boolean;
  onClose: () => void;
  notes: NoteMeta[];
  folders: string[];
  activeId: string | null;
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
  pinned: Set<string>;
  onTogglePin: (path: string) => void;
  onSelectNote: (id: string) => void | Promise<unknown>;
  onMove: (srcId: string, destFolder: string) => void | Promise<unknown>;
  onDelete: (path: string) => void | Promise<unknown>;
  onRenameFolder: (oldPath: string, newName: string) => void | Promise<unknown>;
  onCreateNote: (parentFolder?: string) => Promise<unknown>;
  onCreateFolder: (parentFolder: string, name: string) => Promise<unknown>;
  onRevealFolder?: (path: string) => void | Promise<unknown>;
}

type ContextMenuState = {
  x: number;
  y: number;
  path: string;
  isFolder: boolean;
} | null;

type MovePopoverState = {
  path: string;
  /** Anchor rect (viewport coords) of the row the user invoked Move-to from. */
  anchor: { top: number; left: number; width: number };
} | null;

function basename(path: string): string {
  return path.split('/').pop() || path;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'tree';
  const raw = window.localStorage.getItem(LS_VIEW);
  return VIEW_MODES.includes(raw as ViewMode) ? (raw as ViewMode) : 'tree';
}

function loadLastPath(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(LS_PATH) ?? '';
}

function loadColPath(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_COLS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string') : [];
  } catch { return []; }
}

function FileExplorerPalette(props: Props) {
  const tToast = useTranslations('toast');
  const {
    open, onClose,
    notes, folders, activeId, expanded, onToggleFolder,
    pinned, onTogglePin,
    onSelectNote, onMove, onDelete, onRenameFolder, onCreateNote, onCreateFolder, onRevealFolder,
  } = props;

  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
  const [currentFolder, setCurrentFolder] = useState<string>(() => loadLastPath());
  const [colPath, setColPath] = useState<string[]>(() => loadColPath());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Rename + delete-confirm state (folder-only for rename; both for delete)
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  const confirmTimer = useRef<number | null>(null);

  // New-folder inline input: key = parent path ("" for root). Null when idle.
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderValue, setNewFolderValue] = useState('');

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>(null);
  const [movePopover, setMovePopover] = useState<MovePopoverState>(null);

  const filterInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Build the tree once per notes/folders change. Every view mode consumes
  // it; rebuilding per-view is wasteful on large vaults.
  const tree = useMemo(() => buildTree(notes, folders), [notes, folders]);
  const allFolders = useMemo(() => {
    const s = new Set<string>(folders);
    for (const n of notes) {
      const p = parentOf(n.id);
      if (p) {
        const parts = p.split('/');
        for (let i = 1; i <= parts.length; i++) s.add(parts.slice(0, i).join('/'));
      }
    }
    return Array.from(s).sort();
  }, [folders, notes]);

  // If stored paths no longer exist, fall back to root silently.
  useEffect(() => {
    if (!open) return;
    if (currentFolder && !allFolders.includes(currentFolder)) {
      setCurrentFolder('');
    }
    if (colPath.length) {
      const validPrefix: string[] = [];
      let probe = '';
      for (const seg of colPath) {
        probe = probe ? `${probe}/${seg}` : seg;
        if (!allFolders.includes(probe)) break;
        validPrefix.push(seg);
      }
      if (validPrefix.length !== colPath.length) setColPath(validPrefix);
    }
  }, [open, allFolders, currentFolder, colPath]);

  // Persist view mode + nav state (debounced so arrow-key nav doesn't thrash).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.setTimeout(() => {
      window.localStorage.setItem(LS_VIEW, viewMode);
      window.localStorage.setItem(LS_PATH, currentFolder);
      window.localStorage.setItem(LS_COLS, JSON.stringify(colPath));
    }, 150);
    return () => window.clearTimeout(t);
  }, [viewMode, currentFolder, colPath]);

  // Reset transient state on every open so stale context menus / rename
  // carets don't resurrect between openings.
  useEffect(() => {
    if (!open) return;
    setFilter('');
    setSelectedPath(null);
    setRenamingPath(null);
    setConfirmDeletePath(null);
    setCtxMenu(null);
    setMovePopover(null);
    setNewFolderParent(null);
    requestAnimationFrame(() => filterInputRef.current?.focus());
  }, [open]);

  // Cleanup the delete-confirm timer when the palette closes / unmounts so
  // the confirm state doesn't silently carry into the next opening.
  useEffect(() => () => {
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
  }, []);

  const requestDelete = useCallback((path: string): boolean => {
    if (confirmDeletePath === path) {
      if (confirmTimer.current) {
        window.clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
      }
      setConfirmDeletePath(null);
      void onDelete(path);
      return true;
    }
    setConfirmDeletePath(path);
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => {
      setConfirmDeletePath(null);
      confirmTimer.current = null;
    }, DELETE_CONFIRM_MS);
    return false;
  }, [confirmDeletePath, onDelete]);

  const startRename = useCallback((path: string, currentName: string) => {
    setRenamingPath(path);
    setRenameValue(currentName);
    requestAnimationFrame(() => renameInputRef.current?.select());
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingPath) return;
    const trimmed = renameValue.trim();
    const oldName = basename(renamingPath);
    setRenamingPath(null);
    if (!trimmed || trimmed === oldName) return;
    void onRenameFolder(renamingPath, trimmed);
  }, [renamingPath, renameValue, onRenameFolder]);

  const cancelRename = useCallback(() => setRenamingPath(null), []);

  // "Target folder" for new-note/folder actions — depends on view mode +
  // cursor. Tree: folder of selected row, or selected folder if one is
  // selected. Columns: rightmost column path. List/Grid: the breadcrumb
  // folder.
  const targetFolder = useCallback((): string => {
    if (viewMode === 'columns') return colPath.join('/');
    if (viewMode === 'list' || viewMode === 'grid') return currentFolder;
    // tree
    if (!selectedPath) return '';
    const isFolder = !selectedPath.endsWith('.md');
    return isFolder ? selectedPath : parentOf(selectedPath);
  }, [viewMode, colPath, currentFolder, selectedPath]);

  const handleCreateNote = useCallback(async () => {
    const parent = targetFolder();
    await onCreateNote(parent || undefined);
    onClose();
  }, [onCreateNote, targetFolder, onClose]);

  const handleStartNewFolder = useCallback(() => {
    const parent = targetFolder();
    setNewFolderParent(parent);
    setNewFolderValue('');
    requestAnimationFrame(() => newFolderInputRef.current?.focus());
  }, [targetFolder]);

  const commitNewFolder = useCallback(async () => {
    if (newFolderParent === null) return;
    const name = newFolderValue.trim();
    const parent = newFolderParent;
    setNewFolderParent(null);
    setNewFolderValue('');
    if (!name) return;
    await onCreateFolder(parent, name);
    // Jump the user's cursor into the newly created folder for quick entry.
    const fullPath = parent ? `${parent}/${name}` : name;
    if (viewMode === 'list' || viewMode === 'grid') setCurrentFolder(fullPath);
    else if (viewMode === 'columns') setColPath(fullPath.split('/'));
    else setSelectedPath(fullPath);
  }, [newFolderParent, newFolderValue, onCreateFolder, viewMode]);

  const cancelNewFolder = useCallback(() => {
    setNewFolderParent(null);
    setNewFolderValue('');
  }, []);

  const revealInSidebar = useCallback((path: string) => {
    // Expand every ancestor folder so the sidebar scrolls straight to the row.
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('/');
      if (!expanded.has(ancestor)) onToggleFolder(ancestor);
    }
    if (path.endsWith('.md')) void onSelectNote(path);
    else void onRevealFolder?.(path);
    onClose();
  }, [expanded, onToggleFolder, onSelectNote, onRevealFolder, onClose]);

  const activatePath = useCallback((path: string, isFolder: boolean) => {
    if (isFolder) {
      if (viewMode === 'tree') {
        if (!expanded.has(path)) onToggleFolder(path);
        setSelectedPath(path);
      } else if (viewMode === 'list' || viewMode === 'grid') {
        setCurrentFolder(path);
        setSelectedPath(null);
      } else {
        setColPath(path.split('/'));
        setSelectedPath(path);
      }
    } else {
      void onSelectNote(path);
      onClose();
    }
  }, [viewMode, expanded, onToggleFolder, onSelectNote, onClose]);

  // ── Global keyboard handling while the palette is open ──────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Let the inline rename / new-folder inputs own their own keys.
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';
      const isFilter = (e.target as HTMLElement | null) === filterInputRef.current;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (ctxMenu) { setCtxMenu(null); return; }
        if (movePopover) { setMovePopover(null); return; }
        if (renamingPath) { cancelRename(); return; }
        if (newFolderParent !== null) { cancelNewFolder(); return; }
        if (confirmDeletePath) { setConfirmDeletePath(null); return; }
        if (isFilter && filter) { setFilter(''); return; }
        onClose();
        return;
      }

      // Don't hijack typing inside rename/new-folder inputs.
      if (isInput && !isFilter) return;

      const meta = e.metaKey || e.ctrlKey;

      if (meta && !e.shiftKey) {
        if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
          e.preventDefault();
          const idx = Number(e.key) - 1;
          setViewMode(VIEW_MODES[idx]);
          return;
        }
        const k = e.key.toLowerCase();
        if (k === 'n') { e.preventDefault(); void handleCreateNote(); return; }
        if (k === 'f') {
          e.preventDefault();
          filterInputRef.current?.focus();
          filterInputRef.current?.select();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (selectedPath) requestDelete(selectedPath);
          return;
        }
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleStartNewFolder();
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        if (!selectedPath) return;
        if (selectedPath.endsWith('.md')) {
          showToast(tToast('renameFromTitle'));
          return;
        }
        startRename(selectedPath, basename(selectedPath));
        return;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    open, ctxMenu, movePopover, renamingPath, newFolderParent, confirmDeletePath,
    filter, selectedPath, handleCreateNote, handleStartNewFolder, startRename,
    onClose, requestDelete, cancelRename, cancelNewFolder, tToast,
  ]);

  // Dismiss context menu on outside click.
  useEffect(() => {
    if (!ctxMenu) return;
    const onDocClick = () => setCtxMenu(null);
    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  }, [ctxMenu]);

  // Dismiss move-to popover on outside click (but let the popover's own
  // children stop propagation to keep it open while interacting).
  useEffect(() => {
    if (!movePopover) return;
    const onDocClick = () => setMovePopover(null);
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, [movePopover]);

  if (!open) return null;

  // Helper: pass to rows so they can open a context menu at the cursor.
  const openContextMenu = (e: React.MouseEvent, path: string, isFolder: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPath(path);
    setCtxMenu({ x: e.clientX, y: e.clientY, path, isFolder });
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px] flex items-start justify-center pt-[8vh] px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-[min(1100px,92vw)] h-[min(720px,82vh)] rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <Header
          viewMode={viewMode}
          onSetViewMode={setViewMode}
          currentFolder={viewMode === 'columns' ? colPath.join('/') : viewMode === 'tree' ? '' : currentFolder}
          showBreadcrumb={viewMode !== 'tree'}
          onBreadcrumbJump={(path) => {
            if (viewMode === 'columns') setColPath(path ? path.split('/') : []);
            else setCurrentFolder(path);
            setSelectedPath(null);
          }}
          filter={filter}
          onFilterChange={setFilter}
          filterInputRef={filterInputRef}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleStartNewFolder}
          onClose={onClose}
        />

        <div className="flex-1 min-h-0">
          {viewMode === 'tree' && (
            <TreeView
              tree={tree}
              expanded={expanded}
              onToggleFolder={onToggleFolder}
              activeId={activeId}
              selectedPath={selectedPath}
              setSelectedPath={setSelectedPath}
              filter={filter}
              activatePath={activatePath}
              openContextMenu={openContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              commitRename={commitRename}
              cancelRename={cancelRename}
              renameInputRef={renameInputRef}
              confirmDeletePath={confirmDeletePath}
              newFolderParent={newFolderParent}
              newFolderValue={newFolderValue}
              setNewFolderValue={setNewFolderValue}
              commitNewFolder={commitNewFolder}
              cancelNewFolder={cancelNewFolder}
              newFolderInputRef={newFolderInputRef}
            />
          )}
          {viewMode === 'columns' && (
            <ColumnsView
              tree={tree}
              colPath={colPath}
              setColPath={setColPath}
              selectedPath={selectedPath}
              setSelectedPath={setSelectedPath}
              activeId={activeId}
              filter={filter}
              activatePath={activatePath}
              openContextMenu={openContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              commitRename={commitRename}
              cancelRename={cancelRename}
              renameInputRef={renameInputRef}
              newFolderParent={newFolderParent}
              newFolderValue={newFolderValue}
              setNewFolderValue={setNewFolderValue}
              commitNewFolder={commitNewFolder}
              cancelNewFolder={cancelNewFolder}
              newFolderInputRef={newFolderInputRef}
              confirmDeletePath={confirmDeletePath}
            />
          )}
          {viewMode === 'list' && (
            <ListView
              tree={tree}
              currentFolder={currentFolder}
              setCurrentFolder={setCurrentFolder}
              selectedPath={selectedPath}
              setSelectedPath={setSelectedPath}
              activeId={activeId}
              filter={filter}
              activatePath={activatePath}
              openContextMenu={openContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              commitRename={commitRename}
              cancelRename={cancelRename}
              renameInputRef={renameInputRef}
              confirmDeletePath={confirmDeletePath}
              newFolderParent={newFolderParent}
              newFolderValue={newFolderValue}
              setNewFolderValue={setNewFolderValue}
              commitNewFolder={commitNewFolder}
              cancelNewFolder={cancelNewFolder}
              newFolderInputRef={newFolderInputRef}
            />
          )}
          {viewMode === 'grid' && (
            <GridView
              tree={tree}
              currentFolder={currentFolder}
              setCurrentFolder={setCurrentFolder}
              selectedPath={selectedPath}
              setSelectedPath={setSelectedPath}
              activeId={activeId}
              filter={filter}
              activatePath={activatePath}
              openContextMenu={openContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              commitRename={commitRename}
              cancelRename={cancelRename}
              renameInputRef={renameInputRef}
              newFolderParent={newFolderParent}
              newFolderValue={newFolderValue}
              setNewFolderValue={setNewFolderValue}
              commitNewFolder={commitNewFolder}
              cancelNewFolder={cancelNewFolder}
              newFolderInputRef={newFolderInputRef}
              confirmDeletePath={confirmDeletePath}
            />
          )}
        </div>

        <Footer viewMode={viewMode} />

        {ctxMenu && (
          <ContextMenu
            state={ctxMenu}
            pinned={pinned}
            onOpen={() => { activatePath(ctxMenu.path, ctxMenu.isFolder); setCtxMenu(null); }}
            onReveal={() => { revealInSidebar(ctxMenu.path); setCtxMenu(null); }}
            onRename={() => {
              if (!ctxMenu.isFolder) {
                showToast(tToast('renameFromTitle'));
              } else {
                startRename(ctxMenu.path, basename(ctxMenu.path));
              }
              setCtxMenu(null);
            }}
            onMove={(anchor) => {
              setMovePopover({ path: ctxMenu.path, anchor });
              setCtxMenu(null);
            }}
            isConfirmingDelete={confirmDeletePath === ctxMenu.path}
            onDelete={() => {
              if (requestDelete(ctxMenu.path)) setCtxMenu(null);
            }}
            onTogglePin={() => { onTogglePin(ctxMenu.path); setCtxMenu(null); }}
          />
        )}

        {movePopover && (
          <MoveToPopover
            state={movePopover}
            allFolders={allFolders}
            onPick={async (dest) => {
              if (movePopover.path === dest) { setMovePopover(null); return; }
              const srcIsFolder = !movePopover.path.endsWith('.md');
              if (srcIsFolder && isDescendantOrSelf(dest, movePopover.path)) {
                showToast(tToast('cantMoveIntoSelf'));
                setMovePopover(null);
                return;
              }
              if (parentOf(movePopover.path) === dest) {
                setMovePopover(null);
                return;
              }
              await onMove(movePopover.path, dest);
              setMovePopover(null);
            }}
            onClose={() => setMovePopover(null)}
          />
        )}
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────

function Header(p: {
  viewMode: ViewMode;
  onSetViewMode: (m: ViewMode) => void;
  currentFolder: string;
  showBreadcrumb: boolean;
  onBreadcrumbJump: (path: string) => void;
  filter: string;
  onFilterChange: (v: string) => void;
  filterInputRef: React.RefObject<HTMLInputElement>;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('fileExplorer');
  const segments = p.currentFolder ? p.currentFolder.split('/') : [];
  const viewLabels: Record<ViewMode, string> = {
    tree: t('viewTree'),
    columns: t('viewColumns'),
    list: t('viewList'),
    grid: t('viewGrid'),
  };
  return (
    <div className="border-b px-3 py-2 flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2">
        {p.showBreadcrumb ? (
          <div className="flex items-center gap-1 text-xs text-muted flex-1 min-w-0">
            <button
              onClick={() => p.onBreadcrumbJump('')}
              className="px-1.5 py-0.5 rounded hover:bg-[var(--panel-2)] text-muted hover:text-text transition"
              title={t('rootTitle')}
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 10l7-7 7 7M5 8v9h10V8" strokeLinejoin="round" strokeLinecap="round"/>
              </svg>
            </button>
            {segments.map((seg, i) => {
              const path = segments.slice(0, i + 1).join('/');
              return (
                <span key={path} className="flex items-center gap-1 min-w-0">
                  <span className="text-muted">/</span>
                  <button
                    onClick={() => p.onBreadcrumbJump(path)}
                    className="px-1.5 py-0.5 rounded hover:bg-[var(--panel-2)] text-text truncate"
                    title={path}
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-muted flex-1">{t('header')}</div>
        )}

        <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {VIEW_MODES.map((m, i) => (
            <button
              key={m}
              onClick={() => p.onSetViewMode(m)}
              className={`px-2 py-1 text-[11px] transition ${p.viewMode === m ? 'bg-accent text-[var(--on-accent)]' : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
              title={`${viewLabels[m]} (Cmd+${i + 1})`}
            >
              {viewLabels[m]}
            </button>
          ))}
        </div>

        <button
          onClick={p.onCreateNote}
          className="px-2 py-1 text-[11px] rounded text-muted hover:text-text hover:bg-[var(--panel-2)] transition"
          title={t('newNoteTitle')}
        >+ {t('newNoteButton')}</button>
        <button
          onClick={p.onCreateFolder}
          className="px-2 py-1 text-[11px] rounded text-muted hover:text-text hover:bg-[var(--panel-2)] transition"
          title={t('newFolderTitle')}
        >+ {t('newFolderButton')}</button>
        <button
          onClick={p.onClose}
          className="px-2 py-1 text-[11px] rounded text-muted hover:text-text hover:bg-[var(--panel-2)] transition"
          title={t('closeEsc')}
        >Esc</button>
      </div>

      <div className="flex items-center gap-2 rounded px-2" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted shrink-0">
          <circle cx="8.5" cy="8.5" r="5"/>
          <path d="M13 13l4 4" strokeLinecap="round"/>
        </svg>
        <input
          ref={p.filterInputRef}
          value={p.filter}
          onChange={e => p.onFilterChange(e.target.value)}
          placeholder={t('filterPlaceholder')}
          className="flex-1 bg-transparent outline-none py-1.5 text-xs text-text placeholder:text-muted"
        />
      </div>
    </div>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────

function Footer({ viewMode }: { viewMode: ViewMode }) {
  const t = useTranslations('fileExplorer');
  const arrows = viewMode === 'tree'
    ? t('footerTree')
    : viewMode === 'columns'
      ? t('footerColumns')
      : viewMode === 'list'
        ? t('footerList')
        : t('footerGrid');
  return (
    <div className="shrink-0 border-t px-3 py-1.5 text-[10px] text-muted flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
      <span>{arrows}</span>
      <span className="ml-auto">{t('footerShortcuts')}</span>
    </div>
  );
}

// ── Row primitives ─────────────────────────────────────────────────────

function FolderIcon({ open = false }: { open?: boolean }) {
  return (
    <span className="text-muted shrink-0" aria-hidden>
      {open ? '📂' : '📁'}
    </span>
  );
}

function NoteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-muted shrink-0">
      <path d="M5 2h7l3 3v13H5z" strokeLinejoin="round"/>
      <path d="M12 2v3h3" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Tree view ──────────────────────────────────────────────────────────

function TreeView(p: {
  tree: TreeNode[];
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
  activeId: string | null;
  selectedPath: string | null;
  setSelectedPath: (p: string | null) => void;
  filter: string;
  activatePath: (path: string, isFolder: boolean) => void;
  openContextMenu: (e: React.MouseEvent, path: string, isFolder: boolean) => void;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  renameInputRef: React.RefObject<HTMLInputElement>;
  confirmDeletePath: string | null;
  newFolderParent: string | null;
  newFolderValue: string;
  setNewFolderValue: (v: string) => void;
  commitNewFolder: () => void;
  cancelNewFolder: () => void;
  newFolderInputRef: React.RefObject<HTMLInputElement>;
}) {
  const t = useTranslations('fileExplorer');
  const rows: FlatRow[] = useMemo(() => {
    if (!p.filter) return flattenTree(p.tree, p.expanded);
    // Filter mode — expand every folder that contains a match so hits are
    // visible without the user having to click chevrons first.
    const q = p.filter.toLowerCase();
    const match = (n: TreeNode): boolean => {
      // Notes carry a title that can diverge from their filename (set from
      // frontmatter or the first heading). The visible-row filter below
      // matches on title + id, so the expansion walk must too — otherwise a
      // title-only hit in a collapsed folder stays hidden.
      if (n.note) {
        return n.note.title.toLowerCase().includes(q) || n.note.id.toLowerCase().includes(q);
      }
      if (n.name.toLowerCase().includes(q)) return true;
      return n.children.some(match);
    };
    const allExpanded = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (!n.note && n.children.some(match)) allExpanded.add(n.path);
        walk(n.children);
      }
    };
    walk(p.tree);
    const flat = flattenTree(p.tree, allExpanded);
    return flat.filter(r => {
      if (r.kind === 'folder') return match(r.node!);
      return r.note!.title.toLowerCase().includes(q) || r.note!.id.toLowerCase().includes(q);
    });
  }, [p.tree, p.expanded, p.filter]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const updateSize = () => setViewportHeight(el.clientHeight);
    el.addEventListener('scroll', onScroll, { passive: true });
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);

  // Arrow-key navigation scoped to this view. The global handler stays out
  // of view-specific logic so each view can encode its own traversal.
  useEffect(() => {
    const rowIdx = (path: string) => rows.findIndex(r => (r.kind === 'note' ? r.note!.id : r.node!.path) === path);
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return;
      if (e.metaKey || e.ctrlKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLElement).getAttribute('data-palette-filter') !== 'true') return;
      e.preventDefault();
      const cur = p.selectedPath ? rowIdx(p.selectedPath) : -1;
      const setByIdx = (i: number) => {
        const r = rows[i];
        if (!r) return;
        p.setSelectedPath(r.kind === 'note' ? r.note!.id : r.node!.path);
        const el = scrollRef.current;
        if (el) {
          const top = i * ROW_HEIGHT;
          if (top < el.scrollTop) el.scrollTop = top;
          else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
        }
      };
      if (e.key === 'ArrowDown') setByIdx(Math.min(rows.length - 1, cur + 1));
      else if (e.key === 'ArrowUp') setByIdx(Math.max(0, cur === -1 ? 0 : cur - 1));
      else if (e.key === 'ArrowRight') {
        if (cur === -1) return;
        const r = rows[cur];
        if (r.kind === 'folder') {
          if (!p.expanded.has(r.node!.path)) p.onToggleFolder(r.node!.path);
          else if (r.node!.children.length) setByIdx(cur + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (cur === -1) return;
        const r = rows[cur];
        if (r.kind === 'folder' && p.expanded.has(r.node!.path)) {
          p.onToggleFolder(r.node!.path);
          return;
        }
        // Otherwise jump to parent row.
        const parent = parentOf(r.kind === 'note' ? r.note!.id : r.node!.path);
        if (!parent) return;
        const pi = rows.findIndex(x => x.kind === 'folder' && x.node!.path === parent);
        if (pi >= 0) setByIdx(pi);
      } else if (e.key === 'Enter') {
        if (cur === -1) return;
        const r = rows[cur];
        p.activatePath(r.kind === 'note' ? r.note!.id : r.node!.path, r.kind === 'folder');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, p]);

  const shouldVirt = rows.length >= VIRT_THRESHOLD;
  const startIdx = shouldVirt ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const endIdx = shouldVirt
    ? Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)
    : rows.length;

  const renderRow = (r: FlatRow) => {
    if (r.kind === 'folder') {
      return (
        <TreeFolderRow
          key={r.key}
          node={r.node!}
          depth={r.depth}
          isOpen={p.expanded.has(r.node!.path)}
          isSelected={p.selectedPath === r.node!.path}
          isConfirmingDelete={p.confirmDeletePath === r.node!.path}
          isRenaming={p.renamingPath === r.node!.path}
          renameValue={p.renameValue}
          setRenameValue={p.setRenameValue}
          commitRename={p.commitRename}
          cancelRename={p.cancelRename}
          renameInputRef={p.renameInputRef}
          onClick={() => p.activatePath(r.node!.path, true)}
          onToggle={(e) => { e.stopPropagation(); p.onToggleFolder(r.node!.path); p.setSelectedPath(r.node!.path); }}
          onContextMenu={(e) => p.openContextMenu(e, r.node!.path, true)}
          newFolderParent={p.newFolderParent}
          newFolderValue={p.newFolderValue}
          setNewFolderValue={p.setNewFolderValue}
          commitNewFolder={p.commitNewFolder}
          cancelNewFolder={p.cancelNewFolder}
          newFolderInputRef={p.newFolderInputRef}
        />
      );
    }
    const note = r.note!;
    const isActive = p.activeId === note.id;
    const isSelected = p.selectedPath === note.id;
    const isConfirming = p.confirmDeletePath === note.id;
    return (
      <div
        key={r.key}
        onClick={() => { p.setSelectedPath(note.id); p.activatePath(note.id, false); }}
        onContextMenu={(e) => p.openContextMenu(e, note.id, false)}
        className={`flex items-center gap-1.5 pr-2 text-xs cursor-pointer ${
          isConfirming ? 'bg-red-500/10 ring-1 ring-inset ring-red-500/40'
            : isSelected ? 'bg-[var(--panel-2)] ring-1 ring-inset ring-accent/40'
              : isActive ? 'bg-[var(--panel-2)]'
                : 'hover:bg-[var(--panel-2)]'
        }`}
        style={{ paddingLeft: 12 + r.depth * 14, height: ROW_HEIGHT }}
      >
        <span className="w-2" />
        <NoteIcon />
        <span className={`truncate ${isActive ? 'text-accent' : isConfirming ? 'text-red-500' : 'text-text'}`}>
          {isConfirming ? t('confirmDeleteNote') : note.title}
        </span>
        <span className="ml-auto text-[10px] text-muted">{fmtDate(note.updatedAt)}</span>
      </div>
    );
  };

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) p.setSelectedPath(null); }}
    >
      {rows.length === 0 && (
        <div className="text-xs text-muted p-4">{t('noMatches')}</div>
      )}
      {/* Root-level new-folder input, when the create target is "" */}
      {p.newFolderParent === '' && (
        <NewFolderRow
          depth={0}
          value={p.newFolderValue}
          setValue={p.setNewFolderValue}
          commit={p.commitNewFolder}
          cancel={p.cancelNewFolder}
          inputRef={p.newFolderInputRef}
        />
      )}
      {!shouldVirt && rows.map(renderRow)}
      {shouldVirt && (
        <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${startIdx * ROW_HEIGHT}px)` }}>
            {rows.slice(startIdx, endIdx).map(r => (
              <div key={r.key} style={{ height: ROW_HEIGHT }}>{renderRow(r)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeFolderRow(p: {
  node: TreeNode;
  depth: number;
  isOpen: boolean;
  isSelected: boolean;
  isConfirmingDelete: boolean;
  isRenaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  renameInputRef: React.RefObject<HTMLInputElement>;
  onClick: () => void;
  onToggle: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  newFolderParent: string | null;
  newFolderValue: string;
  setNewFolderValue: (v: string) => void;
  commitNewFolder: () => void;
  cancelNewFolder: () => void;
  newFolderInputRef: React.RefObject<HTMLInputElement>;
}) {
  const t = useTranslations('fileExplorer');
  const noteCount = p.node.children.filter(c => c.note).length;
  const showNewFolder = p.newFolderParent === p.node.path && p.isOpen;
  return (
    <>
      <div
        onClick={p.onClick}
        onContextMenu={p.onContextMenu}
        className={`flex items-center gap-1.5 pr-2 text-xs cursor-pointer ${
          p.isConfirmingDelete ? 'bg-red-500/10 ring-1 ring-inset ring-red-500/40'
            : p.isSelected ? 'bg-[var(--panel-2)] ring-1 ring-inset ring-accent/40'
              : 'hover:bg-[var(--panel-2)]'
        }`}
        style={{ paddingLeft: 12 + p.depth * 14, height: ROW_HEIGHT }}
      >
        <button onClick={p.onToggle} className="text-[10px] text-muted w-2 shrink-0" aria-label={p.isOpen ? t('collapseAria') : t('expandAria')}>
          {p.isOpen ? '▼' : '▶'}
        </button>
        <FolderIcon open={p.isOpen} />
        {p.isRenaming ? (
          <input
            ref={p.renameInputRef}
            value={p.renameValue}
            onChange={e => p.setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); p.commitRename(); }
              else if (e.key === 'Escape') { e.preventDefault(); p.cancelRename(); }
              e.stopPropagation();
            }}
            onBlur={p.commitRename}
            onClick={e => e.stopPropagation()}
            className="flex-1 bg-transparent border-b border-accent outline-none text-text text-xs min-w-0 py-0"
            autoFocus
          />
        ) : (
          <span className={`truncate ${p.isConfirmingDelete ? 'text-red-500' : 'text-text'}`}>
            {p.isConfirmingDelete ? t('confirmDeleteFolder', { name: p.node.name }) : p.node.name}
          </span>
        )}
        {!p.isRenaming && noteCount > 0 && (
          <span className="ml-auto text-[10px] text-muted tabular-nums">{noteCount}</span>
        )}
      </div>
      {showNewFolder && (
        <NewFolderRow
          depth={p.depth + 1}
          value={p.newFolderValue}
          setValue={p.setNewFolderValue}
          commit={p.commitNewFolder}
          cancel={p.cancelNewFolder}
          inputRef={p.newFolderInputRef}
        />
      )}
    </>
  );
}

function NewFolderRow(p: {
  depth: number;
  value: string;
  setValue: (v: string) => void;
  commit: () => void;
  cancel: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const t = useTranslations('fileExplorer');
  return (
    <div
      className="flex items-center gap-1.5 pr-2 text-xs bg-accent/10"
      style={{ paddingLeft: 12 + p.depth * 14, height: ROW_HEIGHT }}
    >
      <span className="w-2" />
      <FolderIcon />
      <input
        ref={p.inputRef}
        value={p.value}
        onChange={e => p.setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); p.commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); p.cancel(); }
          e.stopPropagation();
        }}
        onBlur={p.commit}
        placeholder={t('newFolderName')}
        className="flex-1 bg-transparent border-b border-accent outline-none text-text text-xs min-w-0 py-0"
        autoFocus
      />
    </div>
  );
}

// ── Columns view ───────────────────────────────────────────────────────

function ColumnsView(p: {
  tree: TreeNode[];
  colPath: string[];
  setColPath: (next: string[]) => void;
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  activeId: string | null;
  filter: string;
  activatePath: (path: string, isFolder: boolean) => void;
  openContextMenu: (e: React.MouseEvent, path: string, isFolder: boolean) => void;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  renameInputRef: React.RefObject<HTMLInputElement>;
  newFolderParent: string | null;
  newFolderValue: string;
  setNewFolderValue: (v: string) => void;
  commitNewFolder: () => void;
  cancelNewFolder: () => void;
  newFolderInputRef: React.RefObject<HTMLInputElement>;
  confirmDeletePath: string | null;
}) {
  const t = useTranslations('fileExplorer');
  // The set of columns to render: root, then one per colPath prefix, plus
  // the preview column of the deepest selected folder.
  const columns = useMemo(() => {
    const out: { path: string; children: TreeNode[] }[] = [];
    out.push({ path: '', children: childrenAt(p.tree, '') });
    for (let i = 0; i < p.colPath.length; i++) {
      const path = p.colPath.slice(0, i + 1).join('/');
      out.push({ path, children: childrenAt(p.tree, path) });
    }
    return out;
  }, [p.tree, p.colPath]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }, [p.colPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace'].includes(e.key)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLElement).getAttribute('data-palette-filter') !== 'true') return;
      e.preventDefault();

      if (e.key === 'Backspace') {
        if (p.colPath.length > 0) p.setColPath(p.colPath.slice(0, -1));
        return;
      }

      // Which column is "active"? The deepest one we can see that has
      // content. For Left/Right we navigate among the columns; for Up/Down
      // we walk rows within the active column.
      if (e.key === 'ArrowLeft') {
        if (p.colPath.length > 0) p.setColPath(p.colPath.slice(0, -1));
        return;
      }
      const activeColIdx = columns.length - 1;
      const activeCol = columns[activeColIdx];
      const activeItems = filterItems(activeCol.children, p.filter);
      const curIdx = p.selectedPath
        ? activeItems.findIndex(c => (c.note ? c.note.id : c.path) === p.selectedPath)
        : -1;

      if (e.key === 'ArrowDown') {
        const next = Math.min(activeItems.length - 1, curIdx + 1);
        if (next >= 0 && activeItems[next]) p.setSelectedPath(activeItems[next].note ? activeItems[next].note!.id : activeItems[next].path);
      } else if (e.key === 'ArrowUp') {
        const next = Math.max(0, curIdx === -1 ? 0 : curIdx - 1);
        if (activeItems[next]) p.setSelectedPath(activeItems[next].note ? activeItems[next].note!.id : activeItems[next].path);
      } else if (e.key === 'ArrowRight') {
        if (curIdx >= 0 && activeItems[curIdx] && !activeItems[curIdx].note) {
          p.setColPath([...p.colPath, activeItems[curIdx].name]);
        }
      } else if (e.key === 'Enter') {
        if (curIdx >= 0 && activeItems[curIdx]) {
          const it = activeItems[curIdx];
          p.activatePath(it.note ? it.note.id : it.path, !it.note);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [columns, p]);

  return (
    <div ref={scrollRef} className="h-full overflow-x-auto flex" style={{ background: 'var(--bg)' }}>
      {columns.map((col, i) => {
        const items = filterItems(col.children, p.filter);
        const isLast = i === columns.length - 1;
        const activeSegment = p.colPath[i]; // the folder-name that got us into the next column (if any)
        return (
          <div
            key={col.path || 'root'}
            className="w-[240px] shrink-0 overflow-y-auto border-r"
            style={{ borderColor: 'var(--border)' }}
          >
            {items.length === 0 && (
              <div className="text-xs text-muted p-3">{t('emptyFolder')}</div>
            )}
            {items.map(it => {
              const path = it.note ? it.note.id : it.path;
              const isNote = !!it.note;
              const isSelected = p.selectedPath === path;
              const isPathActive = !isNote && activeSegment === it.name;
              const isActiveNote = isNote && p.activeId === it.note!.id;
              const isConfirming = p.confirmDeletePath === path;
              const isRenaming = !isNote && p.renamingPath === path;
              const confirmText = isNote ? t('confirmDeleteNote') : t('confirmDeleteFolder', { name: it.name });
              return (
                <div
                  key={path}
                  onClick={() => {
                    if (isRenaming) return;
                    p.setSelectedPath(path);
                    if (isNote) p.activatePath(path, false);
                    else p.setColPath([...p.colPath.slice(0, i), it.name]);
                  }}
                  onDoubleClick={() => { if (!isRenaming) p.activatePath(path, !isNote); }}
                  onContextMenu={(e) => p.openContextMenu(e, path, !isNote)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 text-xs cursor-pointer ${
                    isConfirming ? 'bg-red-500/10 ring-1 ring-inset ring-red-500/40'
                      : isPathActive ? 'bg-accent/15 text-text'
                        : isSelected ? 'bg-[var(--panel-2)] ring-1 ring-inset ring-accent/40'
                          : isActiveNote ? 'bg-[var(--panel-2)]'
                            : 'hover:bg-[var(--panel-2)]'
                  }`}
                >
                  {isNote ? <NoteIcon /> : <FolderIcon />}
                  {isRenaming ? (
                    <input
                      ref={p.renameInputRef}
                      value={p.renameValue}
                      onChange={e => p.setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); p.commitRename(); }
                        else if (e.key === 'Escape') { e.preventDefault(); p.cancelRename(); }
                        e.stopPropagation();
                      }}
                      onBlur={p.commitRename}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-transparent border-b border-accent outline-none text-text text-xs min-w-0 py-0"
                      autoFocus
                    />
                  ) : (
                    <span className={`truncate ${isConfirming ? 'text-red-500' : isActiveNote ? 'text-accent' : 'text-text'}`}>
                      {isConfirming ? confirmText : isNote ? it.note!.title : it.name}
                    </span>
                  )}
                  {!isNote && !isRenaming && <span className="ml-auto text-muted text-[10px]">›</span>}
                </div>
              );
            })}
            {/* New-folder input shows in the column whose path matches the pending parent */}
            {p.newFolderParent === col.path && isLast && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs bg-accent/10">
                <FolderIcon />
                <input
                  ref={p.newFolderInputRef}
                  value={p.newFolderValue}
                  onChange={e => p.setNewFolderValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); p.commitNewFolder(); }
                    else if (e.key === 'Escape') { e.preventDefault(); p.cancelNewFolder(); }
                    e.stopPropagation();
                  }}
                  onBlur={p.commitNewFolder}
                  placeholder={t('newFolderDots')}
                  className="flex-1 bg-transparent border-b border-accent outline-none text-text text-xs min-w-0 py-0"
                  autoFocus
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function filterItems(items: TreeNode[], q: string): TreeNode[] {
  if (!q) return items;
  const needle = q.toLowerCase();
  return items.filter(it => (it.note ? it.note.title : it.name).toLowerCase().includes(needle));
}

// ── List view ──────────────────────────────────────────────────────────

function ListView(p: {
  tree: TreeNode[];
  currentFolder: string;
  setCurrentFolder: (path: string) => void;
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  activeId: string | null;
  filter: string;
  activatePath: (path: string, isFolder: boolean) => void;
  openContextMenu: (e: React.MouseEvent, path: string, isFolder: boolean) => void;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  renameInputRef: React.RefObject<HTMLInputElement>;
  confirmDeletePath: string | null;
  newFolderParent: string | null;
  newFolderValue: string;
  setNewFolderValue: (v: string) => void;
  commitNewFolder: () => void;
  cancelNewFolder: () => void;
  newFolderInputRef: React.RefObject<HTMLInputElement>;
}) {
  const t = useTranslations('fileExplorer');
  const items = useMemo(() => filterItems(childrenAt(p.tree, p.currentFolder), p.filter), [p.tree, p.currentFolder, p.filter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (!['ArrowUp', 'ArrowDown', 'Enter', 'Backspace'].includes(e.key)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLElement).getAttribute('data-palette-filter') !== 'true') return;
      e.preventDefault();
      const curIdx = p.selectedPath ? items.findIndex(c => (c.note ? c.note.id : c.path) === p.selectedPath) : -1;
      if (e.key === 'Backspace') {
        if (p.currentFolder) {
          p.setCurrentFolder(parentOf(p.currentFolder));
          p.setSelectedPath(null);
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        const next = Math.min(items.length - 1, curIdx + 1);
        if (next >= 0 && items[next]) p.setSelectedPath(items[next].note ? items[next].note!.id : items[next].path);
      } else if (e.key === 'ArrowUp') {
        const next = Math.max(0, curIdx === -1 ? 0 : curIdx - 1);
        if (items[next]) p.setSelectedPath(items[next].note ? items[next].note!.id : items[next].path);
      } else if (e.key === 'Enter') {
        if (curIdx >= 0 && items[curIdx]) {
          const it = items[curIdx];
          p.activatePath(it.note ? it.note.id : it.path, !it.note);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, p]);

  return (
    <div className="h-full overflow-y-auto">
      {items.length === 0 && p.newFolderParent !== p.currentFolder && (
        <div className="text-xs text-muted p-4">{t('emptyFolder')}</div>
      )}
      {p.newFolderParent === p.currentFolder && (
        <NewFolderRow
          depth={0}
          value={p.newFolderValue}
          setValue={p.setNewFolderValue}
          commit={p.commitNewFolder}
          cancel={p.cancelNewFolder}
          inputRef={p.newFolderInputRef}
        />
      )}
      {items.map(it => {
        const path = it.note ? it.note.id : it.path;
        const isNote = !!it.note;
        const isSelected = p.selectedPath === path;
        const isConfirming = p.confirmDeletePath === path;
        const isActiveNote = isNote && p.activeId === it.note!.id;
        const isRenaming = !isNote && p.renamingPath === path;
        const confirmText = isNote ? t('confirmDeleteNote') : t('confirmDeleteFolder', { name: it.name });
        return (
          <div
            key={path}
            onClick={() => p.setSelectedPath(path)}
            onDoubleClick={() => p.activatePath(path, !isNote)}
            onContextMenu={(e) => p.openContextMenu(e, path, !isNote)}
            className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer ${
              isConfirming ? 'bg-red-500/10 ring-1 ring-inset ring-red-500/40'
                : isSelected ? 'bg-[var(--panel-2)] ring-1 ring-inset ring-accent/40'
                  : isActiveNote ? 'bg-[var(--panel-2)]'
                    : 'hover:bg-[var(--panel-2)]'
            }`}
          >
            {isNote ? <NoteIcon /> : <FolderIcon />}
            {isRenaming ? (
              <input
                ref={p.renameInputRef}
                value={p.renameValue}
                onChange={e => p.setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); p.commitRename(); }
                  else if (e.key === 'Escape') { e.preventDefault(); p.cancelRename(); }
                  e.stopPropagation();
                }}
                onBlur={p.commitRename}
                className="flex-1 bg-transparent border-b border-accent outline-none text-text text-xs min-w-0 py-0"
                autoFocus
              />
            ) : (
              <span className={`truncate ${isConfirming ? 'text-red-500' : isActiveNote ? 'text-accent' : 'text-text'}`}>
                {isConfirming ? confirmText : isNote ? it.note!.title : it.name}
              </span>
            )}
            {isNote && !isRenaming && !isConfirming && <span className="ml-auto text-[10px] text-muted">{fmtDate(it.note!.updatedAt)}</span>}
            {!isNote && !isRenaming && <span className="ml-auto text-muted text-[10px]">›</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Grid view ──────────────────────────────────────────────────────────

function GridView(p: {
  tree: TreeNode[];
  currentFolder: string;
  setCurrentFolder: (path: string) => void;
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  activeId: string | null;
  filter: string;
  activatePath: (path: string, isFolder: boolean) => void;
  openContextMenu: (e: React.MouseEvent, path: string, isFolder: boolean) => void;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  renameInputRef: React.RefObject<HTMLInputElement>;
  newFolderParent: string | null;
  newFolderValue: string;
  setNewFolderValue: (v: string) => void;
  commitNewFolder: () => void;
  cancelNewFolder: () => void;
  newFolderInputRef: React.RefObject<HTMLInputElement>;
  confirmDeletePath: string | null;
}) {
  const t = useTranslations('fileExplorer');
  const items = useMemo(() => filterItems(childrenAt(p.tree, p.currentFolder), p.filter), [p.tree, p.currentFolder, p.filter]);

  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const tile = 128; // 120px tile + ~8px gap
      setCols(Math.max(1, Math.floor(w / tile)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace'].includes(e.key)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLElement).getAttribute('data-palette-filter') !== 'true') return;
      e.preventDefault();
      const curIdx = p.selectedPath ? items.findIndex(c => (c.note ? c.note.id : c.path) === p.selectedPath) : -1;
      const move = (delta: number) => {
        const next = Math.max(0, Math.min(items.length - 1, (curIdx === -1 ? 0 : curIdx) + delta));
        if (items[next]) p.setSelectedPath(items[next].note ? items[next].note!.id : items[next].path);
      };
      if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowDown') move(cols);
      else if (e.key === 'ArrowUp') move(-cols);
      else if (e.key === 'Backspace') {
        if (p.currentFolder) {
          p.setCurrentFolder(parentOf(p.currentFolder));
          p.setSelectedPath(null);
        }
      } else if (e.key === 'Enter') {
        if (curIdx >= 0 && items[curIdx]) {
          const it = items[curIdx];
          p.activatePath(it.note ? it.note.id : it.path, !it.note);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, cols, p]);

  return (
    <div ref={gridRef} className="h-full overflow-y-auto p-3">
      {items.length === 0 && p.newFolderParent !== p.currentFolder && <div className="text-xs text-muted">{t('emptyFolder')}</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {p.newFolderParent === p.currentFolder && (
          <div
            className="flex flex-col items-center justify-center gap-1 p-2 rounded text-center bg-accent/10"
            style={{ height: 92 }}
          >
            <span className="text-2xl leading-none">📁</span>
            <input
              ref={p.newFolderInputRef}
              value={p.newFolderValue}
              onChange={e => p.setNewFolderValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); p.commitNewFolder(); }
                else if (e.key === 'Escape') { e.preventDefault(); p.cancelNewFolder(); }
                e.stopPropagation();
              }}
              onBlur={p.commitNewFolder}
              placeholder={t('newFolderDots')}
              className="w-full bg-transparent border-b border-accent outline-none text-text text-[11px] text-center min-w-0 py-0"
              autoFocus
            />
          </div>
        )}
        {items.map(it => {
          const path = it.note ? it.note.id : it.path;
          const isNote = !!it.note;
          const isSelected = p.selectedPath === path;
          const isActive = isNote && p.activeId === it.note!.id;
          const isConfirming = p.confirmDeletePath === path;
          const isRenaming = !isNote && p.renamingPath === path;
          const confirmText = isNote ? t('confirmDeleteNote') : t('confirmDeleteFolder', { name: it.name });
          return (
            <div
              key={path}
              role="button"
              tabIndex={0}
              onClick={() => { if (!isRenaming) p.setSelectedPath(path); }}
              onDoubleClick={() => { if (!isRenaming) p.activatePath(path, !isNote); }}
              onContextMenu={(e) => p.openContextMenu(e, path, !isNote)}
              className={`flex flex-col items-center justify-center gap-1 p-2 rounded text-center ${
                isConfirming ? 'bg-red-500/10 ring-1 ring-red-500/40'
                  : isSelected ? 'bg-[var(--panel-2)] ring-1 ring-accent/60'
                    : isActive ? 'bg-[var(--panel-2)]'
                      : 'hover:bg-[var(--panel-2)]'
              }`}
              style={{ height: 92 }}
            >
              <span className="text-2xl leading-none">{isNote ? '📄' : '📁'}</span>
              {isRenaming ? (
                <input
                  ref={p.renameInputRef}
                  value={p.renameValue}
                  onChange={e => p.setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); p.commitRename(); }
                    else if (e.key === 'Escape') { e.preventDefault(); p.cancelRename(); }
                    e.stopPropagation();
                  }}
                  onBlur={p.commitRename}
                  onClick={e => e.stopPropagation()}
                  className="w-full bg-transparent border-b border-accent outline-none text-text text-[11px] text-center min-w-0 py-0"
                  autoFocus
                />
              ) : (
                <span className={`text-[11px] truncate w-full ${isConfirming ? 'text-red-500' : isActive ? 'text-accent' : 'text-text'}`}>
                  {isConfirming ? confirmText : isNote ? it.note!.title : it.name}
                </span>
              )}
              {!isRenaming && (
                <span className="text-[10px] text-muted truncate w-full">
                  {isNote ? fmtDate(it.note!.updatedAt) : `${it.children.length} items`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Context menu ───────────────────────────────────────────────────────

function ContextMenu(p: {
  state: { x: number; y: number; path: string; isFolder: boolean };
  pinned: Set<string>;
  onOpen: () => void;
  onReveal: () => void;
  onRename: () => void;
  onMove: (anchor: { top: number; left: number; width: number }) => void;
  isConfirmingDelete: boolean;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const t = useTranslations('fileExplorer');
  const menuRef = useRef<HTMLDivElement>(null);
  const isPinned = p.pinned.has(p.state.path);
  // Clamp to viewport.
  const [pos, setPos] = useState({ top: p.state.y, left: p.state.x });
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let top = p.state.y;
    let left = p.state.x;
    if (top + rect.height > window.innerHeight) top = Math.max(8, window.innerHeight - rect.height - 8);
    if (left + rect.width > window.innerWidth) left = Math.max(8, window.innerWidth - rect.width - 8);
    setPos({ top, left });
  }, [p.state.x, p.state.y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[95] rounded shadow-xl text-xs py-1 min-w-[180px]"
      style={{ top: pos.top, left: pos.left, background: 'var(--panel)', border: '1px solid var(--border)' }}
      onClick={e => e.stopPropagation()}
    >
      <MenuItem onClick={p.onOpen}>{t('menuOpen')}</MenuItem>
      <MenuItem onClick={p.onReveal}>{t('menuReveal')}</MenuItem>
      {p.state.isFolder && <MenuItem onClick={p.onRename}>{t('menuRename')}</MenuItem>}
      <MenuItem onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        p.onMove({ top: rect.top, left: rect.right, width: 260 });
      }}>{t('menuMoveTo')}</MenuItem>
      <MenuItem onClick={p.onTogglePin}>{isPinned ? 'Unpin' : 'Pin'}</MenuItem>
      <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
      <MenuItem onClick={p.onDelete} tone="danger">
        {p.isConfirmingDelete ? t('menuConfirmDelete') : t('menuDelete')}
      </MenuItem>
    </div>
  );
}

function MenuItem(p: { onClick: (e: React.MouseEvent) => void; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <button
      onClick={p.onClick}
      className={`w-full text-left px-3 py-1.5 hover:bg-[var(--panel-2)] transition ${p.tone === 'danger' ? 'text-red-500' : 'text-text'}`}
    >
      {p.children}
    </button>
  );
}

// ── Move-to popover ────────────────────────────────────────────────────

function MoveToPopover(p: {
  state: { path: string; anchor: { top: number; left: number; width: number } };
  allFolders: string[];
  onPick: (dest: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('fileExplorer');
  const [q, setQ] = useState('');
  // Include root ("") as the first option so users can move items out to top level.
  const options = useMemo(() => {
    const base = ['', ...p.allFolders];
    if (!q) return base;
    const needle = q.toLowerCase();
    return base.filter(f => f.toLowerCase().includes(needle));
  }, [p.allFolders, q]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [q]);

  const popRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let top = p.state.anchor.top;
    let left = p.state.anchor.left + 4;
    if (top + rect.height > window.innerHeight) top = Math.max(8, window.innerHeight - rect.height - 8);
    if (left + rect.width > window.innerWidth) left = Math.max(8, p.state.anchor.left - rect.width - 4);
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [p.state.anchor]);

  return (
    <div
      ref={popRef}
      className="fixed z-[96] rounded shadow-xl flex flex-col"
      style={{ background: 'var(--panel)', border: '1px solid var(--border)', width: p.state.anchor.width, maxHeight: 320 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <input
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); p.onClose(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(options.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (options[idx] !== undefined) p.onPick(options[idx]); }
          e.stopPropagation();
        }}
        placeholder={t('moveToFolder')}
        className="px-2 py-1.5 bg-transparent outline-none text-xs text-text border-b placeholder:text-muted"
        style={{ borderColor: 'var(--border)' }}
      />
      <div className="flex-1 overflow-y-auto py-1">
        {options.length === 0 && <div className="text-xs text-muted px-3 py-2">{t('noFolders')}</div>}
        {options.map((f, i) => (
          <button
            key={f || '<root>'}
            onClick={() => p.onPick(f)}
            className={`w-full text-left px-3 py-1 text-xs flex items-center gap-1.5 ${i === idx ? 'bg-[var(--panel-2)] text-accent' : 'text-text hover:bg-[var(--panel-2)]'}`}
          >
            <FolderIcon />
            <span className="truncate">{f || t('rootEntry')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Memo: all parent callbacks are useCallback-stable in page.tsx. Re-rendering
// on every keystroke in other parts of the app would be wasteful.
export default memo(FileExplorerPalette);
