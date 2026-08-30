'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge as RFEdge,
  type EdgeChange,
  type Node as RFNode,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type {
  CanvasDoc,
  CanvasFileNode,
  CanvasGroupNode,
  CanvasLinkNode,
  CanvasNode,
  CanvasTextNode,
} from '@/lib/canvas/types';
import { fromReactFlow, toReactFlow, type CanvasNodeData } from '@/lib/canvas/convert';
import { genId } from '@/lib/canvas/parser';
import { CanvasDepsProvider, type CanvasDeps } from './context';
import { TextNode } from './nodes/TextNode';
import { FileNode } from './nodes/FileNode';
import { LinkNode } from './nodes/LinkNode';
import { GroupNode } from './nodes/GroupNode';

interface Props {
  initialDoc: CanvasDoc;
  onChange: (doc: CanvasDoc) => void;
  deps: Omit<CanvasDeps, 'updateNode' | 'deleteNode'>;
}

const nodeTypes: NodeTypes = {
  text: TextNode,
  file: FileNode,
  link: LinkNode,
  group: GroupNode,
};

function nextNodeId(existing: RFNode<CanvasNodeData>[]): string {
  for (let i = 0; i < 1000; i += 1) {
    const id = genId('n');
    if (!existing.some(n => n.id === id)) return id;
  }
  return `n-${Date.now()}`;
}

function nextEdgeId(existing: RFEdge[]): string {
  for (let i = 0; i < 1000; i += 1) {
    const id = genId('e');
    if (!existing.some(e => e.id === id)) return id;
  }
  return `e-${Date.now()}`;
}

function CanvasInner({ initialDoc, onChange, deps }: Props) {
  const initial = useMemo(() => toReactFlow(initialDoc), [initialDoc]);
  const [nodes, setNodes] = useState<RFNode<CanvasNodeData>[]>(initial.nodes);
  const [edges, setEdges] = useState<RFEdge[]>(initial.edges);

  // Latest values in refs so the debounced flush always sees fresh state.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const colorInputRef = useRef<HTMLInputElement>(null);

  const flushTimer = useRef<number | null>(null);
  const dirty = useRef(false);

  const flushNow = useCallback(() => {
    if (flushTimer.current) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    onChangeRef.current(fromReactFlow(nodesRef.current, edgesRef.current));
  }, []);

  const scheduleFlush = useCallback(() => {
    dirty.current = true;
    if (flushTimer.current) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      dirty.current = false;
      onChangeRef.current(fromReactFlow(nodesRef.current, edgesRef.current));
    }, 400);
  }, []);

  // Flush before the React tree tears down — otherwise an edit made within
  // the 400ms debounce window before navigation / refresh / lightbox-open
  // is silently dropped and the markdown source still reflects the old
  // state. Flushing on visibilitychange catches "user clicks refresh"
  // before React even gets the unmount signal.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      flushNow();
    };
  }, [flushNow]);

  const onNodesChange = useCallback((changes: NodeChange<RFNode<CanvasNodeData>>[]) => {
    setNodes(curr => applyNodeChanges(changes, curr));
    if (changes.some(c => c.type === 'position' || c.type === 'dimensions' || c.type === 'remove' || c.type === 'add' || c.type === 'replace')) {
      scheduleFlush();
    }
  }, [scheduleFlush]);

  const onEdgesChange = useCallback((changes: EdgeChange<RFEdge>[]) => {
    setEdges(curr => applyEdgeChanges(changes, curr));
    if (changes.some(c => c.type !== 'select')) scheduleFlush();
  }, [scheduleFlush]);

  const onConnect = useCallback((conn: Connection) => {
    setEdges(curr => {
      const id = nextEdgeId(curr);
      return addEdge({
        ...conn,
        id,
        markerEnd: { type: 'arrowclosed' as const, color: 'currentColor' },
        data: {},
      }, curr);
    });
    scheduleFlush();
  }, [scheduleFlush]);

  const updateNode = useCallback((id: string, patch: Partial<CanvasNode>) => {
    setNodes(curr => curr.map(n => {
      if (n.id !== id) return n;
      const merged = { ...n.data.node, ...patch } as CanvasNode;
      return { ...n, data: { ...n.data, node: merged } };
    }));
    scheduleFlush();
  }, [scheduleFlush]);

  const deleteNode = useCallback((id: string) => {
    setNodes(curr => curr.filter(n => n.id !== id));
    setEdges(curr => curr.filter(e => e.source !== id && e.target !== id));
    scheduleFlush();
  }, [scheduleFlush]);

  const addTextNode = useCallback(() => {
    setNodes(curr => {
      const id = nextNodeId(curr);
      const x = 40 + curr.length * 24;
      const y = 40 + curr.length * 24;
      const node: CanvasTextNode = { id, type: 'text', x, y, width: 250, height: 80, text: 'New text' };
      return [...curr, {
        id, type: 'text', position: { x, y }, width: 250, height: 80, zIndex: 1,
        selectable: true, data: { node }, style: { width: 250, height: 80 },
      }];
    });
    scheduleFlush();
  }, [scheduleFlush]);

  const addFileNode = useCallback(() => {
    setNodes(curr => {
      const id = nextNodeId(curr);
      const x = 60 + curr.length * 24;
      const y = 60 + curr.length * 24;
      const node: CanvasFileNode = { id, type: 'file', x, y, width: 320, height: 220, file: '' };
      return [...curr, {
        id, type: 'file', position: { x, y }, width: 320, height: 220, zIndex: 1,
        selectable: true, data: { node }, style: { width: 320, height: 220 },
      }];
    });
    scheduleFlush();
  }, [scheduleFlush]);

  const addLinkNode = useCallback(() => {
    setNodes(curr => {
      const id = nextNodeId(curr);
      const x = 80 + curr.length * 24;
      const y = 80 + curr.length * 24;
      const node: CanvasLinkNode = { id, type: 'link', x, y, width: 280, height: 100, url: '' };
      return [...curr, {
        id, type: 'link', position: { x, y }, width: 280, height: 100, zIndex: 1,
        selectable: true, data: { node }, style: { width: 280, height: 100 },
      }];
    });
    scheduleFlush();
  }, [scheduleFlush]);

  const addGroupNode = useCallback(() => {
    setNodes(curr => {
      const id = nextNodeId(curr);
      const x = 0 + curr.length * 12;
      const y = 0 + curr.length * 12;
      const node: CanvasGroupNode = { id, type: 'group', x, y, width: 480, height: 280, label: 'Group' };
      return [
        // Groups go behind everything else.
        { id, type: 'group', position: { x, y }, width: 480, height: 280, zIndex: 0,
          selectable: true, data: { node }, style: { width: 480, height: 280 } },
        ...curr,
      ];
    });
    scheduleFlush();
  }, [scheduleFlush]);

  const deleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodesRef.current.filter(n => n.selected).map(n => n.id));
    setNodes(curr => curr.filter(n => !n.selected));
    setEdges(curr => curr.filter(e =>
      !e.selected
      && !selectedNodeIds.has(e.source)
      && !selectedNodeIds.has(e.target),
    ));
    scheduleFlush();
  }, [scheduleFlush]);

  const setSelectedColor = useCallback((color: string | undefined) => {
    let mutated = false;
    setNodes(curr => curr.map(n => {
      if (!n.selected) return n;
      const stored = n.data.node;
      if (stored.color === color) return n;
      mutated = true;
      const next = { ...stored, color } as CanvasNode;
      return { ...n, data: { ...n.data, node: next } };
    }));
    if (mutated) scheduleFlush();
  }, [scheduleFlush]);

  const anyNodeSelected = nodes.some(n => n.selected);

  const depsValue = useMemo<CanvasDeps>(() => ({
    ...deps,
    updateNode,
    deleteNode,
  }), [deps, updateNode, deleteNode]);

  return (
    <CanvasDepsProvider deps={depsValue}>
      <div className="canvas-toolbar">
        <button type="button" onClick={addTextNode}>+ Text</button>
        <button type="button" onClick={addFileNode}>+ Note</button>
        <button type="button" onClick={addLinkNode}>+ Link</button>
        <button type="button" onClick={addGroupNode}>+ Group</button>
        <button type="button" onClick={deleteSelected} className="canvas-toolbar-delete">Delete</button>
        {anyNodeSelected && (
          <span className="canvas-toolbar-colors" role="group" aria-label="Set color">
            {(['1', '2', '3', '4', '5', '6'] as const).map(c => (
              <button
                key={c}
                type="button"
                className="canvas-color-swatch"
                data-canvas-color={c}
                /* Prevent the button from stealing focus so React Flow doesn't
                   deselect the node before the color change applies. */
                onMouseDown={e => e.preventDefault()}
                onClick={() => setSelectedColor(c)}
                aria-label={`Color ${c}`}
                title={`Color ${c}`}
              />
            ))}
            {/* Custom-color picker. The visible button shows a rainbow conic
               gradient so it reads as "color wheel"; clicking it programmatically
               opens a hidden native <input type="color">. We do this dance
               because native color inputs are nearly impossible to style
               consistently across browsers — the chrome (swatch wrapper,
               focus ring) varies wildly. */}
            <button
              type="button"
              className="canvas-color-swatch canvas-color-wheel"
              onMouseDown={e => e.preventDefault()}
              onClick={() => colorInputRef.current?.click()}
              aria-label="Pick custom color"
              title="Custom color"
            />
            <input
              ref={colorInputRef}
              type="color"
              className="canvas-color-input-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={e => setSelectedColor(e.target.value)}
            />
            <button
              type="button"
              className="canvas-color-swatch canvas-color-clear"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setSelectedColor(undefined)}
              aria-label="Clear color"
              title="Clear color"
            >×</button>
          </span>
        )}
        {deps.onExpand && (
          <button
            type="button"
            className="canvas-toolbar-expand"
            onClick={() => deps.onExpand?.()}
            aria-label="Expand canvas"
            title="Expand"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        )}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </CanvasDepsProvider>
  );
}

export function CanvasEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
