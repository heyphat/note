'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { NoteMeta } from '@/lib/storage';
import {
  buildTree,
  flattenTree,
  isDescendantOrSelf,
  parentOf,
  DELETE_CONFIRM_MS,
  type FlatRow,
  type TreeNode,
} from '@/lib/tree';

const DND_MIME = 'application/x-note-path';
const AUTO_EXPAND_MS = 600;

// Fixed row height used by the windowing renderer. Folder rows are naturally
// a bit shorter than note rows, but forcing both to the same height keeps
// the virtual-scroll arithmetic trivial — all rows are identical slots that
// can be indexed by `scrollTop / ROW_HEIGHT`. The extra whitespace on
// folders is visually inert. Tweak with care: the `h-[44px]` CSS classes on
// the row renderers must agree with this constant or rows will clip.
const ROW_HEIGHT_COMFORTABLE = 44;
const ROW_HEIGHT_DENSE = 30;
const OVERSCAN_ROWS = 10;
// A vault large enough to make a 70k-node React tree expensive. Below this
// threshold the legacy non-windowed render is fine and keeps drag/drop
// sizing behavior exactly identical.
const VIRTUALIZE_THRESHOLD = 500;

interface Props {
  notes: NoteMeta[];
  folders: string[];
  activeId: string | null;
  /** Live title for the active note — the editor's current `editingTitle`.
   *  Lets the tree follow auto-title updates during typing (before the
   *  autosave writes `notes[i].title`). */
  activeTitle?: string | null;
  onSelect: (id: string) => void;
  /** Called when a note or folder is dragged onto a folder (or root when destFolder === ""). */
  onMove?: (srcId: string, destFolder: string) => void;
  /** Set of folder paths currently expanded. Controlled by the parent. */
  expanded: Set<string>;
  /** Toggle a folder's expanded state. */
  onToggleFolder: (path: string) => void;
  /** The folder "+ New note/folder" will create into ("" = root). Highlighted in the tree. */
  targetFolder: string;
  /** Called when a folder row is clicked — parent should set targetFolder and toggle expand. */
  onFolderClick: (path: string) => void;
  /** Paths (notes and/or folders) the user has pinned. Shown in a "Pinned" section at the top. */
  pinned: Set<string>;
  /** Toggle a path's pinned state. */
  onTogglePin: (path: string) => void;
  /** Delete a note or folder at the given path. Called only after in-row confirmation. */
  onDelete: (path: string) => void;
  /** Rename a folder. Called with (oldPath, newName). */
  onRenameFolder?: (oldPath: string, newName: string) => void;
  /**
   * Rendering mode. `tree` (default) groups notes by folder structure;
   * `flat` ignores folders and just lists the given `flatNoteIds` in order.
   * Used for saved-search result views.
   */
  variant?: 'tree' | 'flat';
  /** Ordered note ids to show when `variant === 'flat'`. Unknown ids are skipped. */
  flatNoteIds?: string[];
  /**
   * Dense mode — hides the updated-at subtitle on note rows and tightens
   * vertical padding so more items fit above the fold. Folder rows already
   * have no subtitle; they just lose a bit of padding.
   */
  dense?: boolean;
}

function fmtDate(iso: string, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function NoteTree({
  notes,
  folders,
  activeId,
  activeTitle,
  onSelect,
  onMove,
  expanded,
  onToggleFolder,
  targetFolder,
  onFolderClick,
  pinned,
  onTogglePin,
  onDelete,
  onRenameFolder,
  variant = 'tree',
  flatNoteIds,
  dense = false,
}: Props) {
  const t = useTranslations('noteTree');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  // Row height the virtualizer uses for index→offset math. Must match the
  // actual rendered height of note/folder rows in the current mode.
  const ROW_HEIGHT = dense ? ROW_HEIGHT_DENSE : ROW_HEIGHT_COMFORTABLE;
  const tree = useMemo(
    () => variant === 'tree' ? buildTree(notes, folders) : [],
    [notes, folders, variant],
  );
  const treeRows = useMemo<FlatRow[]>(
    () => variant === 'tree' ? flattenTree(tree, expanded) : [],
    [tree, expanded, variant],
  );
  // `null` = hovering root drop zone; string = hovering a folder path; undefined = not hovering
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
  const autoExpandTimer = useRef<{ path: string; timeout: number } | null>(null);
  // Path awaiting delete confirmation. Clicking the trash again within
  // DELETE_CONFIRM_MS finalizes the delete.
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  const confirmDeleteTimer = useRef<number | null>(null);
  // Inline folder rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (confirmDeleteTimer.current) window.clearTimeout(confirmDeleteTimer.current);
  }, []);

  const requestDelete = (path: string) => {
    if (confirmDeletePath === path) {
      if (confirmDeleteTimer.current) {
        window.clearTimeout(confirmDeleteTimer.current);
        confirmDeleteTimer.current = null;
      }
      setConfirmDeletePath(null);
      onDelete(path);
      return;
    }
    setConfirmDeletePath(path);
    if (confirmDeleteTimer.current) window.clearTimeout(confirmDeleteTimer.current);
    confirmDeleteTimer.current = window.setTimeout(() => {
      setConfirmDeletePath(null);
      confirmDeleteTimer.current = null;
    }, DELETE_CONFIRM_MS);
  };

  const startRename = (path: string, currentName: string) => {
    setRenamingPath(path);
    setRenameValue(currentName);
    // Focus the input after it mounts
    requestAnimationFrame(() => renameInputRef.current?.select());
  };

  const commitRename = () => {
    if (!renamingPath || !onRenameFolder) return;
    const trimmed = renameValue.trim();
    const oldName = renamingPath.split('/').pop() || '';
    setRenamingPath(null);
    if (!trimmed || trimmed === oldName) return;
    onRenameFolder(renamingPath, trimmed);
  };

  const cancelRename = () => {
    setRenamingPath(null);
  };

  // Returns an index lookup of pinned notes by id (for the Pinned section).
  const notesById = useMemo(() => {
    const m = new Map<string, NoteMeta>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const cancelAutoExpand = () => {
    if (autoExpandTimer.current) {
      window.clearTimeout(autoExpandTimer.current.timeout);
      autoExpandTimer.current = null;
    }
  };

  const scheduleAutoExpand = (path: string) => {
    if (autoExpandTimer.current?.path === path) return;
    cancelAutoExpand();
    autoExpandTimer.current = {
      path,
      timeout: window.setTimeout(() => {
        if (!expanded.has(path)) onToggleFolder(path);
        autoExpandTimer.current = null;
      }, AUTO_EXPAND_MS),
    };
  };

  // Returns true if (src, destFolder) is a valid move and not a no-op
  const canDrop = (src: string, destFolder: string): boolean => {
    if (!src) return false;
    const srcIsFolder = !src.endsWith('.md');
    if (srcIsFolder && isDescendantOrSelf(destFolder, src)) return false;
    if (parentOf(src) === destFolder) return false;
    return true;
  };

  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.stopPropagation();
    e.dataTransfer.setData(DND_MIME, path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragOver = (e: React.DragEvent, folderPath: string) => {
    if (!onMove) return;
    if (!e.dataTransfer.types.includes(DND_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(folderPath);
    scheduleAutoExpand(folderPath);
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    if (!onMove) return;
    if (!e.dataTransfer.types.includes(DND_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(null);
    cancelAutoExpand();
  };

  const handleFolderDrop = (e: React.DragEvent, folderPath: string) => {
    if (!onMove) return;
    const src = e.dataTransfer.getData(DND_MIME);
    e.preventDefault();
    e.stopPropagation();
    cancelAutoExpand();
    setDropTarget(undefined);
    if (!canDrop(src, folderPath)) return;
    onMove(src, folderPath);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    if (!onMove) return;
    const src = e.dataTransfer.getData(DND_MIME);
    e.preventDefault();
    cancelAutoExpand();
    setDropTarget(undefined);
    if (!canDrop(src, '')) return;
    onMove(src, '');
  };

  const RowActions = ({ path, isFolder }: { path: string; isFolder?: boolean }) => {
    const isPinned = pinned.has(path);
    const isConfirming = confirmDeletePath === path;
    // Each icon lives in its own "slot" that collapses to width 0 when not
    // active and grows on hover. Animating max-width + margin gives the
    // effect of the buttons sliding in from the right while the count
    // shifts leftward to make room. For pinned items, the star slot is
    // always open so the yellow pin stays visible.
    const slotBase = 'overflow-hidden transition-all duration-150 shrink-0';
    const hiddenSlot = `${slotBase} max-w-0 opacity-0 ml-0 group-hover:max-w-[28px] group-hover:opacity-100 group-hover:ml-1.5`;
    const visibleSlot = `${slotBase} max-w-[28px] opacity-100 ml-1.5`;
    return (
      <div className="flex items-center shrink-0">
        <div className={isPinned ? visibleSlot : hiddenSlot}>
          <button
            onClick={e => { e.stopPropagation(); onTogglePin(path); }}
            title={isPinned ? t('unpin') : t('pin')}
            className={`p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition
              ${isPinned ? 'text-yellow-500' : 'text-muted hover:text-text'}`}>
            <svg width="12" height="12" viewBox="0 0 20 20"
              fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M10 1.8l2.55 5.16 5.7.83-4.12 4.02.97 5.67L10 14.8l-5.1 2.68.97-5.67L1.75 7.79l5.7-.83z" />
            </svg>
          </button>
        </div>
        {isFolder && onRenameFolder && (
          <div className={hiddenSlot}>
            <button
              onClick={e => { e.stopPropagation(); startRename(path, path.split('/').pop() || ''); }}
              title={t('renameFolder')}
              className="p-1 rounded text-muted hover:text-text hover:bg-black/10 dark:hover:bg-white/10 transition">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L7 17l-4 1 1-4z" />
              </svg>
            </button>
          </div>
        )}
        <div className={isConfirming ? visibleSlot : hiddenSlot}>
          <button
            onClick={e => { e.stopPropagation(); requestDelete(path); }}
            title={isConfirming ? t('confirmDelete') : t('delete')}
            className={`p-1 rounded transition
              ${isConfirming
                ? 'bg-red-500 text-white ring-2 ring-red-500/40 animate-pulse'
                : 'text-muted hover:text-red-500 hover:bg-red-500/10'}`}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h12M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 6l1 10a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-10" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  const renderNoteRow = (note: NoteMeta, depth: number, keyPrefix = '') => {
    const isActive = activeId === note.id;
    const isConfirming = confirmDeletePath === note.id;
    const displayTitle = isActive && activeTitle ? activeTitle : note.title;
    // Dense mode drops the border-b separator entirely — at reduced row
    // height the horizontal lines read as visual noise. Comfortable mode
    // keeps them so the subtitle+title pair has a clean card edge.
    const separator = dense ? '' : 'border-b border-[var(--border)]';
    return (
      <div
        key={`${keyPrefix}${note.id}`}
        draggable={!!onMove}
        onDragStart={e => handleDragStart(e, note.id)}
        className={`group flex items-center pr-2 ${separator} transition-colors
          ${isConfirming
            ? 'bg-red-500/10 ring-1 ring-inset ring-red-500/40'
            : isActive
              ? 'bg-[var(--panel-2)]'
              : 'hover:bg-[var(--panel-2)]'}`}
        style={{ paddingLeft: 12 + depth * 14 }}>
        <button onClick={() => onSelect(note.id)}
          className={`flex-1 min-w-0 text-left ${dense ? 'py-1' : 'py-2'}`}>
          <div className={`text-xs font-medium truncate ${isConfirming ? 'text-red-500' : isActive ? 'text-accent' : 'text-text'}`}>
            {isConfirming ? tCommon('clickTrashAgainToDelete') : displayTitle}
          </div>
          {(!dense || isConfirming) && (
            <div className="text-[11px] text-muted mt-0.5">
              {isConfirming ? displayTitle : fmtDate(note.updatedAt, locale)}
            </div>
          )}
        </button>
        <RowActions path={note.id} />
      </div>
    );
  };

  // Standalone folder row — renders only the folder label, not its children.
  // Children are separate rows in the flattened list, which lets the outer
  // virtualizer skip them cleanly when the folder is collapsed.
  const renderFolderRow = (node: TreeNode, depth: number, keyPrefix = '') => {
    const isOpen = expanded.has(node.path);
    const isDropTarget = dropTarget === node.path;
    const isTarget = targetFolder === node.path;
    const isConfirming = confirmDeletePath === node.path;
    const isRenaming = renamingPath === node.path;
    const noteCount = node.children.filter(c => c.note).length;
    return (
      <div key={`${keyPrefix}${node.path}`}>
        <div
          draggable={!!onMove && !isRenaming}
          onDragStart={e => handleDragStart(e, node.path)}
          onDragOver={e => handleFolderDragOver(e, node.path)}
          onDrop={e => handleFolderDrop(e, node.path)}
          className={`group flex items-center pr-2 transition-colors
            ${isConfirming
              ? 'bg-red-500/10 ring-1 ring-inset ring-red-500/40'
              : isDropTarget
                ? 'bg-accent/15 ring-1 ring-inset ring-accent/60'
                : isTarget
                  ? 'bg-accent/10'
                  : 'hover:bg-[var(--panel-2)]'}`}
          style={{ paddingLeft: 12 + depth * 14 }}>
          <button onClick={() => { if (!isRenaming) onFolderClick(node.path); }}
            className="flex-1 min-w-0 text-left py-1.5 flex items-center gap-1.5">
            <span className="text-[10px] text-muted w-2 inline-block">{isOpen ? '▼' : '▶'}</span>
            <span className={isConfirming ? 'text-red-500' : isTarget ? 'text-accent' : 'text-muted'}>&#128193;</span>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                  e.stopPropagation();
                }}
                onBlur={commitRename}
                onClick={e => e.stopPropagation()}
                className="text-xs bg-transparent border-b border-accent outline-none text-text min-w-0 flex-1 py-0"
                autoFocus
              />
            ) : (
              <span
                className={`text-xs truncate ${isConfirming ? 'text-red-500 font-medium' : isTarget ? 'text-accent font-medium' : 'text-text'}`}
                onDoubleClick={e => {
                  if (onRenameFolder) {
                    e.stopPropagation();
                    startRename(node.path, node.name);
                  }
                }}>
                {isConfirming ? tCommon('clickTrashAgainToDeleteFolder', { name: node.name }) : node.name}
              </span>
            )}
          </button>
          {noteCount > 0 && !isConfirming && !isRenaming && (
            <span className="shrink-0 ml-1.5 inline-flex items-center justify-center w-5 h-5 p-1 text-[10px] text-muted tabular-nums select-none">
              {noteCount}
            </span>
          )}
          {!isRenaming && <RowActions path={node.path} isFolder />}
        </div>
      </div>
    );
  };

  const renderRow = (row: FlatRow, keyPrefix = ''): React.ReactNode => {
    if (row.kind === 'note') return renderNoteRow(row.note!, row.depth, keyPrefix);
    return renderFolderRow(row.node!, row.depth, keyPrefix);
  };

  // Pinned items, flattened, shown above the main tree (folders first, then notes by title).
  const pinnedItems = useMemo(() => {
    const items: { path: string; isFolder: boolean; title: string; note?: NoteMeta }[] = [];
    for (const p of Array.from(pinned)) {
      if (p.endsWith('.md')) {
        const note = notesById.get(p);
        if (note) items.push({ path: p, isFolder: false, title: note.title, note });
      } else {
        const exists = folders.includes(p) || notes.some(n => n.id.startsWith(`${p}/`));
        if (exists) items.push({ path: p, isFolder: true, title: p.split('/').pop() || p });
      }
    }
    return items.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });
  }, [pinned, notes, folders, notesById]);

  const rootDropHighlight = dropTarget === null ? 'ring-1 ring-inset ring-accent/40' : '';

  // Flat rows fed to the renderer. For variant='flat' this is the ordered
  // `flatNoteIds` resolved to notes; for variant='tree' it's the depth-first
  // flatten of the visible tree. Either way the renderer below treats them
  // identically, which lets both paths share virtualization.
  const rowsForRender: FlatRow[] = useMemo(() => {
    if (variant === 'flat') {
      const ids = flatNoteIds || [];
      const out: FlatRow[] = [];
      for (const id of ids) {
        const n = notesById.get(id);
        if (n) out.push({ kind: 'note', key: `flat-${id}`, depth: 0, note: n });
      }
      return out;
    }
    return treeRows;
  }, [variant, flatNoteIds, notesById, treeRows]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // scroll listener is passive so rapid keyboard scrolling doesn't stall
    const onScroll = () => setScrollTop(el.scrollTop);
    const updateSize = () => setViewportHeight(el.clientHeight);
    el.addEventListener('scroll', onScroll, { passive: true });
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);

  const shouldVirt = rowsForRender.length >= VIRTUALIZE_THRESHOLD;
  const startIdx = shouldVirt
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS)
    : 0;
  const endIdx = shouldVirt
    ? Math.min(rowsForRender.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS)
    : rowsForRender.length;

  const renderBody = () => {
    if (variant === 'flat' && rowsForRender.length === 0) {
      return <div className="text-xs text-muted p-4">{t('emptyFlat')}</div>;
    }
    if (variant === 'tree' && tree.length === 0) {
      return <div className="text-xs text-muted p-4">{t('emptyTree')}</div>;
    }
    if (!shouldVirt) {
      return <>{rowsForRender.map(r => renderRow(r))}</>;
    }
    const totalHeight = rowsForRender.length * ROW_HEIGHT;
    const translateY = startIdx * ROW_HEIGHT;
    return (
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${translateY}px)` }}>
          {rowsForRender.slice(startIdx, endIdx).map(r => (
            // Fixed-height slot keeps each row at exactly ROW_HEIGHT so the
            // virtualizer's index→offset arithmetic lines up with the DOM.
            // Folder rows are naturally shorter; the flex wrapper centers
            // them vertically to hide the extra padding.
            <div key={r.key} style={{ height: ROW_HEIGHT }} className="flex flex-col justify-center">
              {renderRow(r)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`h-full flex flex-col ${rootDropHighlight}`}>
      {pinnedItems.length > 0 && (
        <div className="shrink-0 border-b border-[var(--border)] pb-1">
          <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted">
            {t('pinnedHeading')}
          </div>
          {pinnedItems.map(item =>
            item.isFolder
              ? (
                <div
                  key={`pin-${item.path}`}
                  className="group flex items-center pr-2 hover:bg-[var(--panel-2)] transition-colors"
                  style={{ paddingLeft: 12 }}>
                  <button onClick={() => onFolderClick(item.path)}
                    className="flex-1 min-w-0 text-left py-1.5 flex items-center gap-1.5">
                    <span className="text-muted">&#128193;</span>
                    <span className="text-xs text-text truncate">{item.title}</span>
                  </button>
                  <RowActions path={item.path} isFolder />
                </div>
              )
              : renderNoteRow(item.note!, 0, 'pin-')
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto py-1"
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
      >
        {renderBody()}
        {/* Click empty space below the rows to reset target to root. */}
        <div className="min-h-[48px]" onClick={() => onFolderClick('')} />
      </div>
    </div>
  );
}

// Memoized: the tree rebuild is expensive on large vaults (virtualization
// math + sorted children per folder), and parent re-renders from unrelated
// state (sidebar toggle, editor settings, etc.) would otherwise re-run all
// of it. All callback props from page.tsx are already useCallback-stable.
export default memo(NoteTree);
