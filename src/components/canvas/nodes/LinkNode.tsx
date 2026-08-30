'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useCanvasDeps } from '../context';
import { nodeColorStyle } from '../node-color';
import type { CanvasNodeData } from '@/lib/canvas/convert';
import type { CanvasLinkNode } from '@/lib/canvas/types';

function normalizeUrl(value: string): URL | null {
  const candidate = value.trim();
  if (!candidate) return null;
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

export function LinkNode(props: NodeProps) {
  const data = props.data as CanvasNodeData;
  const node = data.node as CanvasLinkNode;
  const { updateNode } = useCanvasDeps();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.url);
  const openTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!editing) setDraft(node.url);
  }, [editing, node.url]);

  useEffect(() => () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
  }, []);

  const parsed = useMemo(() => normalizeUrl(node.url), [node.url]);
  const hostname = parsed?.hostname.replace(/^www\./, '') ?? '';

  const cancelPendingOpen = () => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!parsed) return;
    if (openTimer.current) return;
    const href = parsed.toString();
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      window.open(href, '_blank', 'noopener,noreferrer');
    }, 250);
  };

  const handleLinkDoubleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    cancelPendingOpen();
    setEditing(true);
  };

  return (
    <div className="canvas-node canvas-node-link" data-canvas-color={node.color || undefined} style={nodeColorStyle(node.color)}>
      <NodeResizer minWidth={180} minHeight={80} isVisible={props.selected} lineClassName="canvas-resize-line" handleClassName="canvas-resize-handle" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      {editing ? (
        <input
          className="canvas-link-input nodrag nopan"
          autoFocus
          value={draft}
          placeholder="https://example.com"
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft !== node.url) updateNode(node.id, { url: draft } as Partial<CanvasLinkNode>);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setDraft(node.url); setEditing(false); }
          }}
        />
      ) : !parsed ? (
        <button className="canvas-link-empty" onDoubleClick={() => setEditing(true)}>
          Double-click to set URL
        </button>
      ) : (
        <a
          className="canvas-link-card"
          href={parsed.toString()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLinkClick}
          onDoubleClick={handleLinkDoubleClick}
        >
          <span className="canvas-link-icon">{hostname.slice(0, 1).toUpperCase() || '·'}</span>
          <span className="canvas-link-body">
            <span className="canvas-link-title">{hostname || parsed.toString()}</span>
            <span className="canvas-link-url">{parsed.toString()}</span>
          </span>
        </a>
      )}
    </div>
  );
}
