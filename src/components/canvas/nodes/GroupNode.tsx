'use client';

import { useEffect, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useCanvasDeps } from '../context';
import { nodeColorStyle } from '../node-color';
import type { CanvasNodeData } from '@/lib/canvas/convert';
import type { CanvasGroupNode } from '@/lib/canvas/types';

export function GroupNode(props: NodeProps) {
  const data = props.data as CanvasNodeData;
  const node = data.node as CanvasGroupNode;
  const { updateNode } = useCanvasDeps();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.label ?? '');

  useEffect(() => {
    if (!editing) setDraft(node.label ?? '');
  }, [editing, node.label]);

  return (
    <div className="canvas-node canvas-node-group" data-canvas-color={node.color || undefined} style={nodeColorStyle(node.color)}>
      <NodeResizer minWidth={200} minHeight={120} isVisible={props.selected} lineClassName="canvas-resize-line" handleClassName="canvas-resize-handle" />
      <div className="canvas-group-label">
        {editing ? (
          <input
            className="canvas-group-input nodrag nopan"
            autoFocus
            value={draft}
            placeholder="Group label"
            onChange={e => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              const next = draft || undefined;
              if (next !== node.label) updateNode(node.id, { label: next } as Partial<CanvasGroupNode>);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setDraft(node.label ?? ''); setEditing(false); }
            }}
          />
        ) : (
          <button className="canvas-group-title" onDoubleClick={() => setEditing(true)}>
            {node.label || 'Group'}
          </button>
        )}
      </div>
    </div>
  );
}
