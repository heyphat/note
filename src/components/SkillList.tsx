'use client';

// Sidebar panel for user-defined skills. Mirrors TemplateList's affordances
// (collapsible header, rename + delete) and renders a NESTED tree when
// skills live in category subfolders (e.g. `.assets/skills/coding/python/SKILL.md`).
// Skills are read by the AI assistant via the `load_skill` tool — clicking
// a leaf in the tree opens the skill in the main editor through `openSkill`.

import { useState, useRef, useEffect } from 'react';
import type { SkillMeta } from '@/lib/storage';
import { buildSkillTree, type SkillTreeNode } from '@/lib/skills/tree';

interface Props {
  skills: SkillMeta[];
  activeSkill: string | null;
  onSelect: (id: string) => void;
  onImport: () => void;
  onRename: (id: string, newName: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  /** Move a skill into a different parent directory. `destDir` is empty for
   *  root, otherwise a path-shaped string like `coding` or `coding/python`.
   *  Returns the new id of the moved skill, or null on failure. */
  onMove: (skillId: string, destDir: string) => Promise<string | null>;
}

const DRAG_MIME = 'application/x-skill-id';

export default function SkillList({ skills, activeSkill, onSelect, onImport, onRename, onDelete, onMove }: Props) {
  const [expanded, setExpanded] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const deleteTimer = useRef<number | null>(null);
  // The id currently being dragged + the drop target path under the pointer.
  // Tracking both lets us suppress drops onto self / descendants in the UI
  // (the storage layer also enforces this server-side).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const isDescendantPath = (parent: string, candidate: string): boolean =>
    candidate === parent || candidate.startsWith(`${parent}/`);

  /** Parent path of an id — `coding/python` → `coding`, `coding` → ''. */
  const parentOf = (id: string): string => {
    const segments = id.split('/');
    segments.pop();
    return segments.join('/');
  };

  const canDropOn = (destPath: string): boolean => {
    if (!draggingId) return false;
    // Forbid drop onto the skill being dragged or any of its descendants —
    // moving a folder into its own subtree would form a path cycle. The
    // storage layer rejects this too; we mirror it here so the UI hint is
    // honest.
    if (isDescendantPath(draggingId, destPath)) return false;
    // Forbid drop onto the source's current parent — same-parent moves are
    // no-ops. Without this, the parent row pulses as a valid target during
    // drag-out, which makes it easy to release the mouse on the wrong row.
    if (parentOf(draggingId) === destPath) return false;
    return true;
  };

  const handleDrop = async (destPath: string) => {
    const src = draggingId;
    setDraggingId(null);
    setDropTarget(null);
    if (!src || !canDropOn(destPath)) return;
    await onMove(src, destPath);
  };

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); }, []);

  const requestDelete = (id: string) => {
    if (confirmDelete === id) {
      void onDelete(id);
      setConfirmDelete(null);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      return;
    }
    setConfirmDelete(id);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = window.setTimeout(() => setConfirmDelete(null), 3000);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    const skill = skills.find(s => s.id === renamingId);
    if (trimmed && skill && trimmed !== skill.name) {
      void onRename(renamingId, trimmed);
    }
    setRenamingId(null);
  };

  const tree = expanded ? buildSkillTree(skills) : [];

  return (
    <div className="px-2 pt-2">
      <div
        // Section header doubles as the root drop zone — dragging a nested
        // skill onto "SKILLS" moves it back to `.assets/skills/` top level.
        // `destPath = ''` is the canonical "root" path everywhere downstream.
        onDragOver={canDropOn('') ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
        onDragEnter={canDropOn('') ? () => setDropTarget('__root__') : undefined}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropTarget(prev => (prev === '__root__' ? null : prev));
          }
        }}
        onDrop={canDropOn('') ? (e) => { e.preventDefault(); void handleDrop(''); } : undefined}
        className={`w-full flex items-center gap-1 text-muted px-1 py-1 rounded transition-colors
          ${dropTarget === '__root__' && canDropOn('') ? 'ring-1 ring-accent bg-[var(--panel-2)]' : ''}`}
      >
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wide hover:text-text transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${expanded ? 'rotate-90' : ''}`} fill="currentColor">
            <path d="M3 1l4 4-4 4z" />
          </svg>
          Skills
          <span className="text-muted/70">{skills.length}</span>
        </button>
        <button
          onClick={onImport}
          title="Import a new skill"
          className="ml-auto px-1.5 py-0.5 text-[10px] text-muted hover:text-text hover:bg-[var(--panel-2)] rounded transition-colors"
        >
          + Import
        </button>
      </div>
      {tree.map((node, i) => (
        <TreeNode
          key={node.kind === 'category' ? `c:${node.path}` : `s:${node.path}`}
          node={node}
          depth={0}
          ancestorChain={[]}
          isLast={i === tree.length - 1}
          activeSkill={activeSkill}
          onSelect={onSelect}
          renamingId={renamingId}
          renameValue={renameValue}
          renameRef={renameRef}
          setRenamingId={setRenamingId}
          setRenameValue={setRenameValue}
          commitRename={commitRename}
          confirmDelete={confirmDelete}
          requestDelete={requestDelete}
          draggingId={draggingId}
          dropTarget={dropTarget}
          setDraggingId={setDraggingId}
          setDropTarget={setDropTarget}
          canDropOn={canDropOn}
          handleDrop={handleDrop}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: SkillTreeNode;
  depth: number;
  /** For each ancestor depth from outermost (i=0) to innermost (i=depth-1),
   *  whether that ancestor was the last child of its container. Used by the
   *  rail renderer to leave columns blank inside closed subtrees. Length
   *  always equals `depth`. */
  ancestorChain: boolean[];
  /** Is this row the last sibling in its current children array? Drives the
   *  innermost rail's L vs T connector. */
  isLast: boolean;
  activeSkill: string | null;
  onSelect: (id: string) => void;
  renamingId: string | null;
  renameValue: string;
  renameRef: React.RefObject<HTMLInputElement>;
  setRenamingId: (id: string | null) => void;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  confirmDelete: string | null;
  requestDelete: (id: string) => void;
  // Drag-and-drop wiring threaded from the top-level component so every row
  // shares the same source / target state.
  draggingId: string | null;
  dropTarget: string | null;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>;
  canDropOn: (destPath: string) => boolean;
  handleDrop: (destPath: string) => Promise<void>;
}

function TreeNode(props: TreeNodeProps) {
  const { node, depth, ancestorChain, isLast } = props;
  // Tree-view guide rails. Each nesting level contributes one thin vertical
  // line on the left so the parent/child relationship reads clearly. Three
  // states per column:
  //   - **Vertical only**: the outer ancestor at this column has more
  //     siblings below, so the indent line passes through this row.
  //   - **Empty (no line)**: the outer ancestor at this column was the last
  //     child of its parent — its subtree has closed, so descendant rows
  //     leave that column blank.
  //   - **Connector**: the innermost rail (closest to the row's content) is
  //     a T (`├──`) when this row has more siblings below, or an L (`└──`)
  //     for the last sibling — the vertical line stops at the row's middle.
  const Rails = () => (
    <>
      {Array.from({ length: depth }).map((_, c) => {
        const isInnermost = c === depth - 1;
        if (!isInnermost) {
          // Outer rail. Show a vertical line only if our ancestor at depth
          // c+1 still has siblings to render below — otherwise we're inside
          // a closed subtree and the column is empty.
          const ancestorAtThisColumnIsLast = ancestorChain[c + 1] === true;
          if (ancestorAtThisColumnIsLast) {
            return <span key={c} aria-hidden="true" className="shrink-0 w-3 self-stretch" />;
          }
          return (
            <span
              key={c}
              aria-hidden="true"
              className="shrink-0 w-3 self-stretch border-l border-[var(--border)]"
            />
          );
        }
        // Innermost rail: T or L connector depending on whether this row is
        // the last sibling. L is built from two pseudo-elements — one for
        // the top-half vertical stem, one for the horizontal stub at the
        // row's middle. T uses `border-l` for the full vertical line and a
        // `before:` pseudo for the stub.
        if (isLast) {
          return (
            <span
              key={c}
              aria-hidden="true"
              className="relative shrink-0 w-3 self-stretch
                before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-1/2 before:w-px before:bg-[var(--border)]
                after:content-[''] after:absolute after:left-0 after:top-1/2 after:w-3 after:border-t after:border-[var(--border)]"
            />
          );
        }
        return (
          <span
            key={c}
            aria-hidden="true"
            className="relative shrink-0 w-3 self-stretch border-l border-[var(--border)]
              before:content-[''] before:absolute before:left-0 before:top-1/2 before:w-3 before:border-t before:border-[var(--border)]"
          />
        );
      })}
    </>
  );

  if (node.kind === 'category') {
    const hybridSkill = node.skill;
    const isActive = hybridSkill ? hybridSkill.id === props.activeSkill : false;
    const nestedCount = countSkills(node) - (hybridSkill ? 1 : 0);

    // Hybrid: path is both a skill (clickable to open) and a parent of nested
    // skills (always rendered below). Pure category: just a static label
    // followed by its children — no click action, no toggle.
    return (
      <>
        {(() => {
          const acceptsDrop = props.canDropOn(node.path);
          const isDropHover = props.dropTarget === node.path && acceptsDrop;
          const dropHandlers = {
            onDragOver: (e: React.DragEvent) => {
              if (!acceptsDrop) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            },
            onDragEnter: () => {
              if (acceptsDrop) props.setDropTarget(node.path);
            },
            onDragLeave: (e: React.DragEvent) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                props.setDropTarget(prev => (prev === node.path ? null : prev));
              }
            },
            onDrop: (e: React.DragEvent) => { e.preventDefault(); void props.handleDrop(node.path); },
          };

          return hybridSkill ? (
            <button
              draggable
              onDragStart={e => {
                props.setDraggingId(hybridSkill.id);
                e.dataTransfer.setData(DRAG_MIME, hybridSkill.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => { props.setDraggingId(null); props.setDropTarget(null); }}
              {...dropHandlers}
              onClick={() => props.onSelect(hybridSkill.id)}
              className={`group w-full text-left text-xs rounded transition-colors flex items-stretch pl-1
                ${isActive
                  ? 'bg-[var(--panel-2)] text-text'
                  : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}
                ${isDropHover ? 'ring-1 ring-accent' : ''}
                ${props.draggingId === hybridSkill.id ? 'opacity-50' : ''}`}
              title={hybridSkill.description || node.path}
            >
              <Rails />
              <span className="flex-1 min-w-0 py-1 flex items-center">
                <span className="truncate flex-1">
                  {hybridSkill.name}
                  <span className="ml-1.5 text-[9px] text-muted/70 uppercase tracking-wide">
                    {nestedCount} nested
                  </span>
                </span>
              </span>
            </button>
          ) : (
            <div
              {...dropHandlers}
              className={`w-full text-[10px] uppercase tracking-wide text-muted/80 flex items-stretch pl-1 rounded transition-colors
                ${isDropHover ? 'ring-1 ring-accent bg-[var(--panel-2)]' : ''}`}
              title={node.path}
            >
              <Rails />
              <span className="flex-1 min-w-0 py-1 flex items-center">
                <span className="truncate">{node.name}</span>
                <span className="ml-1 text-muted/60 normal-case tracking-normal text-[9px]">
                  ({nestedCount})
                </span>
              </span>
            </div>
          );
        })()}
        {node.children.map((child, childIdx) => (
          <TreeNode
            key={child.kind === 'category' ? `c:${child.path}` : `s:${child.path}`}
            {...props}
            node={child}
            depth={depth + 1}
            ancestorChain={[...ancestorChain, isLast]}
            isLast={childIdx === node.children.length - 1}
          />
        ))}
      </>
    );
  }

  const skill = node.skill;
  const isActive = skill.id === props.activeSkill;
  const isConfirming = props.confirmDelete === skill.id;
  const slotBase = 'overflow-hidden transition-all duration-150 shrink-0';
  const hiddenSlot = `${slotBase} max-w-0 opacity-0 ml-0 group-hover:max-w-[28px] group-hover:opacity-100 group-hover:ml-1.5`;
  const visibleSlot = `${slotBase} max-w-[28px] opacity-100 ml-1.5`;

  if (props.renamingId === skill.id) {
    return (
      <div key={skill.id} className="w-full flex items-stretch pl-1">
        <Rails />
        <input
          ref={props.renameRef}
          value={props.renameValue}
          onChange={e => props.setRenameValue(e.target.value)}
          onBlur={props.commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') props.commitRename();
            if (e.key === 'Escape') props.setRenamingId(null);
          }}
          className="flex-1 min-w-0 px-2 py-1 text-xs bg-[var(--panel-2)] text-text rounded outline-none border border-accent"
        />
      </div>
    );
  }

  // A skill leaf is always draggable. Folder skills also accept drops
  // (drag-into puts the dropped skill inside this folder). Single-file
  // skills (`isFolder=false`) cannot be drop targets.
  const acceptsDrop = skill.isFolder && props.canDropOn(skill.id);
  const isDropHover = props.dropTarget === skill.id && acceptsDrop;
  // The row container is a `<div>` (not a `<button>`) so the rename / delete
  // controls can live inside as real `<button>`s without producing nested
  // interactive elements (invalid HTML, inconsistent click + focus behaviour
  // across browsers). The row exposes button semantics via role + tabIndex,
  // and Enter / Space activate the row's primary action.
  return (
    <div
      key={skill.id}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={e => {
        props.setDraggingId(skill.id);
        e.dataTransfer.setData(DRAG_MIME, skill.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => { props.setDraggingId(null); props.setDropTarget(null); }}
      onDragOver={skill.isFolder ? (e) => {
        if (!props.canDropOn(skill.id)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      } : undefined}
      onDragEnter={skill.isFolder ? () => {
        if (props.canDropOn(skill.id)) props.setDropTarget(skill.id);
      } : undefined}
      onDragLeave={skill.isFolder ? (e) => {
        // Only clear if leaving the row entirely, not just moving to a child.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          props.setDropTarget(prev => (prev === skill.id ? null : prev));
        }
      } : undefined}
      onDrop={skill.isFolder ? (e) => { e.preventDefault(); void props.handleDrop(skill.id); } : undefined}
      onClick={() => props.onSelect(skill.id)}
      onKeyDown={e => {
        // Only activate when the keyDown originated on the row itself.
        // Pressing Enter/Space while focus is on the rename or delete
        // buttons inside the row bubbles up to here; without this guard
        // those activations would also trigger row selection.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onSelect(skill.id);
        }
      }}
      className={`group w-full text-xs rounded transition-colors flex items-stretch pl-1 cursor-pointer
        focus:outline-none focus-visible:ring-1 focus-visible:ring-accent
        ${isActive
          ? 'bg-[var(--panel-2)] text-text'
          : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}
        ${isDropHover ? 'ring-1 ring-accent' : ''}
        ${props.draggingId === skill.id ? 'opacity-50' : ''}`}
      title={skill.description || skill.name}
    >
      <Rails />
      <span className="flex-1 min-w-0 py-1 flex items-center">
        <span className="truncate flex-1">{skill.name}</span>
        <div className="flex items-center shrink-0 pr-1">
          <div className={hiddenSlot}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); props.setRenamingId(skill.id); props.setRenameValue(skill.name); }}
              title="Rename skill"
              className="p-1 rounded text-muted hover:text-text hover:bg-black/10 dark:hover:bg-white/10 transition">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L7 17l-4 1 1-4z" />
              </svg>
            </button>
          </div>
          <div className={isConfirming ? visibleSlot : hiddenSlot}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); props.requestDelete(skill.id); }}
              title={isConfirming ? 'Click again to confirm delete' : 'Delete skill'}
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
      </span>
    </div>
  );
}

/** Recursively count skill leaves (including a hybrid category's own skill)
 *  under a node. Used for the `(N)` chip and the "N nested" hint. */
function countSkills(node: SkillTreeNode): number {
  if (node.kind === 'skill') return 1;
  const selfCount = node.skill ? 1 : 0;
  return selfCount + node.children.reduce((sum, c) => sum + countSkills(c), 0);
}
