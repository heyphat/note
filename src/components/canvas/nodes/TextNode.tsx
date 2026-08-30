'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useCanvasDeps } from '../context';
import { nodeColorStyle } from '../node-color';
import { renderCanvasMarkdown } from '../markdown-render';
import type { CanvasNodeData } from '@/lib/canvas/convert';
import type { CanvasTextNode } from '@/lib/canvas/types';

export function TextNode(props: NodeProps) {
  const data = props.data as CanvasNodeData;
  const node = data.node as CanvasTextNode;
  const { updateNode, proxyAssetUrl } = useCanvasDeps();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(node.text);
  }, [editing, node.text]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const html = useMemo(
    () => renderCanvasMarkdown(node.text || '_empty_', proxyAssetUrl),
    [node.text, proxyAssetUrl],
  );

  return (
    <div className="canvas-node canvas-node-text" data-canvas-color={node.color || undefined} style={nodeColorStyle(node.color)}>
      <NodeResizer minWidth={120} minHeight={48} isVisible={props.selected} lineClassName="canvas-resize-line" handleClassName="canvas-resize-handle" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      {editing ? (
        <textarea
          ref={textareaRef}
          className="canvas-text-edit nodrag nopan nowheel"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft !== node.text) updateNode(node.id, { text: draft } as Partial<CanvasTextNode>);
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(node.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <div
          className="canvas-text-view nowheel"
          onDoubleClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
