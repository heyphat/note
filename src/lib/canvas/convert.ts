// Mapping between JSON Canvas's `{nodes, edges}` shape and React Flow's
// `{nodes, edges}` shape. React Flow uses `position.{x,y}` + per-node `data`,
// and `source`/`sourceHandle`/`target`/`targetHandle` on edges where the
// handle id encodes the side ("top"|"right"|"bottom"|"left").

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type {
  CanvasDoc,
  CanvasEdge,
  CanvasNode,
  CanvasSide,
} from './types';

export type CanvasNodeData = {
  node: CanvasNode;
};

export type CanvasEdgeData = {
  edge: CanvasEdge;
};

export function toReactFlow(doc: CanvasDoc): {
  nodes: RFNode<CanvasNodeData>[];
  edges: RFEdge[];
} {
  const nodes: RFNode<CanvasNodeData>[] = doc.nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    width: n.width,
    height: n.height,
    // Group nodes sit behind everything else.
    zIndex: n.type === 'group' ? 0 : 1,
    // Make group nodes selectable but allow children dragged over them.
    selectable: true,
    data: { node: n },
    style: {
      width: n.width,
      height: n.height,
    },
  }));

  const edges: RFEdge[] = doc.edges.map(e => ({
    id: e.id,
    source: e.fromNode,
    target: e.toNode,
    sourceHandle: e.fromSide ?? null,
    targetHandle: e.toSide ?? null,
    label: e.label,
    // Use arrow marker when an end is "arrow" — JSON Canvas defaults to
    // arrow on the `to` end and none on the `from` end if unspecified.
    // `color: 'currentColor'` makes the arrowhead inherit the theme color
    // from the `.react-flow` container instead of React Flow's hardcoded
    // gray, which is invisible on our dark background.
    markerEnd: (e.toEnd ?? 'arrow') === 'arrow' ? { type: 'arrowclosed' as const, color: 'currentColor' } : undefined,
    markerStart: e.fromEnd === 'arrow' ? { type: 'arrowclosed' as const, color: 'currentColor' } : undefined,
    // Stash the original edge so `fromReactFlow` can preserve `__extra` and
    // any other fields React Flow doesn't model (colors etc. that weren't
    // standardised in the spec rev we know about).
    data: { edge: e },
  }));

  return { nodes, edges };
}

function asSide(handle: string | null | undefined): CanvasSide | undefined {
  if (handle === 'top' || handle === 'right' || handle === 'bottom' || handle === 'left') {
    return handle;
  }
  return undefined;
}

export function fromReactFlow(
  rfNodes: RFNode<CanvasNodeData>[],
  rfEdges: RFEdge[],
): CanvasDoc {
  const nodes: CanvasNode[] = rfNodes.map(n => {
    const stored = n.data?.node;
    // Pull live position + size from React Flow, fall back to stored.
    const w = (typeof n.width === 'number' ? n.width : undefined)
      ?? (typeof n.style?.width === 'number' ? (n.style.width as number) : undefined)
      ?? stored?.width
      ?? 250;
    const h = (typeof n.height === 'number' ? n.height : undefined)
      ?? (typeof n.style?.height === 'number' ? (n.style.height as number) : undefined)
      ?? stored?.height
      ?? 60;
    const x = n.position?.x ?? stored?.x ?? 0;
    const y = n.position?.y ?? stored?.y ?? 0;

    if (!stored) {
      // Synthesised default — shouldn't happen, but keep types honest.
      return { id: n.id, type: 'text', x, y, width: w, height: h, text: '' };
    }
    return { ...stored, x, y, width: w, height: h };
  });

  const edges: CanvasEdge[] = rfEdges.map(e => {
    // Edges added via React Flow's `onConnect` have no stored canvas edge
    // (synthesised at connection time) — `stored` is undefined for those.
    // Spreading `stored` first means existing edges keep `__extra` and any
    // other fields, while the live RF values below win for ones we know.
    const stored = (e.data as CanvasEdgeData | { color?: string } | undefined);
    const storedEdge = stored && 'edge' in stored ? stored.edge : undefined;
    const storedColor = stored && 'color' in stored ? stored.color : undefined;
    return {
      ...(storedEdge ?? {}),
      id: e.id,
      fromNode: e.source,
      toNode: e.target,
      fromSide: asSide(e.sourceHandle),
      toSide: asSide(e.targetHandle),
      fromEnd: e.markerStart ? 'arrow' : undefined,
      toEnd: e.markerEnd ? 'arrow' : 'none',
      label: typeof e.label === 'string' ? e.label : undefined,
      color: storedEdge?.color ?? storedColor,
    };
  });

  return { nodes, edges };
}
