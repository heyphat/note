'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useCanvasDeps, type CanvasNoteCandidate } from '../context';
import { nodeColorStyle } from '../node-color';
import { renderCanvasMarkdown } from '../markdown-render';
import { detectFileKind, type FileKind } from '../file-kind';
import type { CanvasNodeData } from '@/lib/canvas/convert';
import type { CanvasFileNode } from '@/lib/canvas/types';

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---\n') && !md.startsWith('---\r\n')) return md;
  const end = md.indexOf('\n---', 4);
  if (end === -1) return md;
  return md.slice(end + 4).replace(/^\r?\n/, '');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const MAX_SUGGESTIONS = 10;

export function FileNode(props: NodeProps) {
  const data = props.data as CanvasNodeData;
  const node = data.node as CanvasFileNode;
  const { resolveLinkId, readNoteBody, onNavigateLink, isKnownLinkTarget, getNoteCandidates, getNoteHref, proxyAssetUrl, updateNode } = useCanvasDeps();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.file);
  const [body, setBody] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(node.file);
  }, [editing, node.file]);

  const kind: FileKind = useMemo(() => detectFileKind(node.file), [node.file]);

  // Wikilink resolution only applies to markdown files. Image paths point
  // at attachments, not notes — we route those through `proxyAssetUrl`
  // (mirroring how the editor resolves inline markdown image refs).
  const resolvedId = useMemo(() => {
    if (kind !== 'markdown') return null;
    if (!node.file || !resolveLinkId) return null;
    return resolveLinkId(node.file);
  }, [kind, node.file, resolveLinkId]);

  const isKnown = kind === 'image'
    ? !!node.file.trim()
    : isKnownLinkTarget?.(node.file) ?? !!resolvedId;

  useEffect(() => {
    let cancelled = false;
    if (kind !== 'markdown' || !resolvedId || !readNoteBody) {
      setBody(null);
      return;
    }
    readNoteBody(resolvedId).then(text => {
      if (!cancelled) setBody(text);
    }).catch(() => {
      if (!cancelled) setBody(null);
    });
    return () => { cancelled = true; };
  }, [kind, resolvedId, readNoteBody]);

  const previewHtml = useMemo(() => {
    if (!body) return '';
    return renderCanvasMarkdown(truncate(stripFrontmatter(body), 1200), proxyAssetUrl);
  }, [body, proxyAssetUrl]);

  const imageSrc = useMemo(() => {
    if (kind !== 'image' || !node.file) return '';
    return proxyAssetUrl ? proxyAssetUrl(node.file) : node.file;
  }, [kind, node.file, proxyAssetUrl]);

  // Canonical URL of the linked note (or null for broken / image / empty
  // targets). Drives the "open in new tab" anchor in the header — only
  // shown for resolved markdown notes since image nodes already open
  // in a new tab from the title-click handler.
  const externalHref = useMemo(() => {
    if (kind !== 'markdown' || !node.file || !getNoteHref) return null;
    return getNoteHref(node.file);
  }, [kind, node.file, getNoteHref]);

  // Live filtered candidates while the picker is open. Empty query returns
  // the resolver's defaults (most recent / all), so the user sees options
  // immediately on focus without having to type anything first.
  const suggestions: CanvasNoteCandidate[] = useMemo(() => {
    if (!editing || !getNoteCandidates) return [];
    return getNoteCandidates(draft).slice(0, MAX_SUGGESTIONS);
  }, [editing, draft, getNoteCandidates]);

  // Reset highlight whenever the suggestion list shifts so it doesn't point
  // past the end after a filter narrows the list.
  useEffect(() => {
    setHighlight(0);
  }, [draft, editing]);

  const commit = (next: string) => {
    setEditing(false);
    if (next !== node.file) updateNode(node.id, { file: next } as Partial<CanvasFileNode>);
  };

  // Browsers fire `click` before `dblclick` — and `onNavigateLink` typically
  // swaps notes, which unmounts this entire component. So a naive
  // `onClick=navigate, onDoubleClick=edit` setup makes double-click
  // effectively impossible: the first click navigates away before the
  // double-click ever resolves. Defer single-click navigation by ~250ms
  // and let `onDoubleClick` cancel that timer to enter edit mode.
  const navTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (navTimer.current) window.clearTimeout(navTimer.current);
  }, []);

  const cancelPendingNav = () => {
    if (navTimer.current) {
      window.clearTimeout(navTimer.current);
      navTimer.current = null;
    }
  };

  const handleTitleClick = () => {
    // A broken target has nowhere to navigate to — the user almost
    // certainly meant to retarget. Skip the delayed-nav path entirely so
    // double-click feels instant for the most common "fix it" case.
    if (!isKnown) return;
    // If a nav timer is already pending, this is the second of a rapid
    // pair — let dblclick take over.
    if (navTimer.current) return;
    navTimer.current = window.setTimeout(() => {
      navTimer.current = null;
      if (kind === 'image') {
        if (imageSrc) window.open(imageSrc, '_blank', 'noopener,noreferrer');
      } else {
        onNavigateLink?.(node.file);
      }
    }, 250);
  };

  const handleTitleDoubleClick = () => {
    cancelPendingNav();
    setEditing(true);
  };

  const title = node.file || 'Untitled note';

  return (
    <div className="canvas-node canvas-node-file" data-canvas-color={node.color || undefined} style={nodeColorStyle(node.color)}>
      <NodeResizer minWidth={160} minHeight={80} isVisible={props.selected} lineClassName="canvas-resize-line" handleClassName="canvas-resize-handle" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <div className="canvas-file-header">
        {editing ? (
          <div className="canvas-file-picker nodrag nopan">
            <input
              ref={inputRef}
              className="canvas-file-input"
              autoFocus
              value={draft}
              placeholder="Search notes…"
              onChange={e => setDraft(e.target.value)}
              onBlur={() => {
                // Defer so a mousedown on a suggestion can fire first.
                window.setTimeout(() => {
                  if (document.activeElement !== inputRef.current) commit(draft);
                }, 120);
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlight(h => Math.min(h + 1, Math.max(suggestions.length - 1, 0)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlight(h => Math.max(h - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const picked = suggestions[highlight];
                  commit(picked ? picked.title : draft);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setDraft(node.file);
                  setEditing(false);
                }
              }}
            />
            {suggestions.length > 0 && (
              <ul className="canvas-file-suggestions nowheel" role="listbox">
                {suggestions.map((s, idx) => (
                  <li
                    key={s.id}
                    role="option"
                    aria-selected={idx === highlight}
                    className={`canvas-file-suggestion${idx === highlight ? ' is-active' : ''}`}
                    onMouseDown={e => {
                      // Prevent input blur before we commit.
                      e.preventDefault();
                      commit(s.title);
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <span className="canvas-file-suggestion-title">{s.title}</span>
                    {s.id !== s.title && <span className="canvas-file-suggestion-id">{s.id}</span>}
                  </li>
                ))}
              </ul>
            )}
            {suggestions.length === 0 && draft.trim() && (
              <div className="canvas-file-suggestions-empty">
                No notes match — press Enter to keep <strong>{draft}</strong> anyway
              </div>
            )}
          </div>
        ) : (
          <div className="canvas-file-titlebar">
            <button
              className={`canvas-file-title${isKnown ? '' : ' canvas-file-broken'}`}
              onDoubleClick={handleTitleDoubleClick}
              onClick={handleTitleClick}
              title={isKnown ? 'Click to open · double-click to change target' : 'Double-click to set a target'}
            >
              {title}
            </button>
            {externalHref && (
              // Real <a target="_blank"> so middle-click / cmd-click /
              // right-click → "open in new tab" all work without per-
              // affordance JS. `nodrag nopan` keeps React Flow from
              // hijacking the click into a node-drag.
              <a
                className="canvas-file-open-external nodrag nopan"
                href={externalHref}
                target="_blank"
                rel="noopener noreferrer"
                onMouseDown={e => e.stopPropagation()}
                aria-label="Open in new tab"
                title="Open in new tab"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 4h6v6" />
                  <path d="M20 4 10 14" />
                  <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            )}
          </div>
        )}
      </div>
      <div className={`canvas-file-body${kind === 'markdown' ? ' nowheel' : ''}${kind === 'image' ? ' canvas-file-body-image' : ''}`}>
        {kind === 'image'
          ? imageSrc
            ? (
              <img
                className="canvas-file-image"
                src={imageSrc}
                alt={node.file}
                draggable={false}
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                onError={e => { (e.currentTarget as any).dataset.error = '1'; }}
              />
            )
            : <div className="canvas-file-broken-msg">No image source</div>
          : body === null && resolvedId
            ? <div className="canvas-file-loading">Loading…</div>
            : body === null
              ? <div className="canvas-file-broken-msg">Note not found</div>
              : (
                <div
                  className="canvas-file-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
      </div>
    </div>
  );
}
