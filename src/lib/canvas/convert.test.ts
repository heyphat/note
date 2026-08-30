import { describe, it, expect } from 'vitest';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { toReactFlow, fromReactFlow, type CanvasNodeData } from './convert';
import type { CanvasDoc } from './types';

describe('toReactFlow', () => {
  it('maps each canvas node to an RFNode with position + size', () => {
    const doc: CanvasDoc = {
      nodes: [
        { id: 'a', type: 'text', x: 10, y: 20, width: 100, height: 50, text: 'hi' },
        { id: 'b', type: 'group', x: 0, y: 0, width: 300, height: 200, label: 'Sec' },
      ],
      edges: [],
    };
    const { nodes, edges } = toReactFlow(doc);
    expect(edges).toEqual([]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({
      id: 'a', type: 'text',
      position: { x: 10, y: 20 },
      width: 100, height: 50,
    });
    expect(nodes[0].data.node).toEqual(doc.nodes[0]);
  });

  it('stacks group nodes behind other nodes (zIndex 0 vs 1)', () => {
    const doc: CanvasDoc = {
      nodes: [
        { id: 't', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'g', type: 'group', x: 0, y: 0, width: 1, height: 1 },
      ],
      edges: [],
    };
    const { nodes } = toReactFlow(doc);
    expect(nodes[0].zIndex).toBe(1);
    expect(nodes[1].zIndex).toBe(0);
  });

  it('translates JSON-Canvas edge endpoints to RF source/target + handles', () => {
    const doc: CanvasDoc = {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
      ],
      edges: [{
        id: 'e1',
        fromNode: 'a', fromSide: 'right',
        toNode: 'b',   toSide: 'left',
        label: 'rel',
      }],
    };
    const { edges } = toReactFlow(doc);
    expect(edges[0]).toMatchObject({
      id: 'e1', source: 'a', target: 'b',
      sourceHandle: 'right', targetHandle: 'left',
      label: 'rel',
    });
  });

  it("defaults `toEnd` to arrow when unspecified (JSON Canvas convention)", () => {
    const doc: CanvasDoc = {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
      ],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
    };
    const { edges } = toReactFlow(doc);
    expect(edges[0].markerEnd).toBeDefined();
  });

  it("omits markerEnd when toEnd is explicitly 'none'", () => {
    const doc: CanvasDoc = {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
      ],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'b', toEnd: 'none' }],
    };
    const { edges } = toReactFlow(doc);
    expect(edges[0].markerEnd).toBeUndefined();
  });

  it('stashes the original CanvasEdge inside edge data for round-trip', () => {
    const doc: CanvasDoc = {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
      ],
      edges: [{
        id: 'e', fromNode: 'a', toNode: 'b',
        __extra: { weight: 0.7 },
      }],
    };
    const { edges } = toReactFlow(doc);
    const stored = (edges[0].data as { edge?: { __extra?: unknown } }).edge;
    expect(stored?.__extra).toEqual({ weight: 0.7 });
  });
});

describe('fromReactFlow', () => {
  it('reads live position + size from React Flow back into the canvas node', () => {
    const node: RFNode<CanvasNodeData> = {
      id: 'a', type: 'text',
      position: { x: 50, y: 60 },
      width: 222, height: 88,
      data: {
        node: { id: 'a', type: 'text', x: 10, y: 20, width: 100, height: 50, text: 'hi' },
      },
    };
    const doc = fromReactFlow([node], []);
    expect(doc.nodes[0]).toMatchObject({
      id: 'a', type: 'text', x: 50, y: 60, width: 222, height: 88, text: 'hi',
    });
  });

  it('preserves node __extra across the round-trip', () => {
    const stored = {
      id: 'a', type: 'text' as const,
      x: 0, y: 0, width: 1, height: 1,
      text: 'hi',
      __extra: { styleAttributes: { font: 'mono' } },
    };
    const node: RFNode<CanvasNodeData> = {
      id: 'a', type: 'text',
      position: { x: 0, y: 0 },
      data: { node: stored },
    };
    const doc = fromReactFlow([node], []);
    expect(doc.nodes[0].__extra).toEqual({ styleAttributes: { font: 'mono' } });
  });

  it('preserves edge __extra by spreading the stashed edge first', () => {
    const edge: RFEdge = {
      id: 'e', source: 'a', target: 'b',
      sourceHandle: 'right', targetHandle: 'left',
      data: {
        edge: {
          id: 'e', fromNode: 'a', toNode: 'b',
          __extra: { weight: 0.7 },
        },
      },
    };
    const doc = fromReactFlow([], [edge]);
    expect(doc.edges[0]).toMatchObject({
      id: 'e', fromNode: 'a', toNode: 'b',
      fromSide: 'right', toSide: 'left',
      __extra: { weight: 0.7 },
    });
  });

  it('handles new edges (added via React Flow onConnect) with no stored edge data', () => {
    // `onConnect` creates edges where `data` has no `.edge` field. The
    // conversion path must not crash, and must produce a valid CanvasEdge.
    const edge: RFEdge = {
      id: 'fresh', source: 'a', target: 'b',
      sourceHandle: 'right', targetHandle: 'left',
      data: {},
    };
    const doc = fromReactFlow([], [edge]);
    expect(doc.edges[0]).toMatchObject({
      id: 'fresh', fromNode: 'a', toNode: 'b',
      fromSide: 'right', toSide: 'left',
    });
    expect(doc.edges[0].__extra).toBeUndefined();
  });

  it('ignores unknown sourceHandle values rather than copying them as sides', () => {
    const edge: RFEdge = {
      id: 'e', source: 'a', target: 'b',
      sourceHandle: 'middle' as unknown as string, // not a valid CanvasSide
      targetHandle: null,
      data: {},
    };
    const doc = fromReactFlow([], [edge]);
    expect(doc.edges[0].fromSide).toBeUndefined();
    expect(doc.edges[0].toSide).toBeUndefined();
  });
});

describe('toReactFlow → fromReactFlow round-trip', () => {
  it('preserves all node fields including unknown ones', () => {
    const doc: CanvasDoc = {
      nodes: [{
        id: 'a', type: 'file',
        x: 1, y: 2, width: 100, height: 50,
        file: 'Note', subpath: '#h',
        color: '3',
        __extra: { custom: 'preserved' },
      }],
      edges: [],
    };
    const { nodes } = toReactFlow(doc);
    const restored = fromReactFlow(nodes, []);
    expect(restored.nodes[0]).toEqual(doc.nodes[0]);
  });

  it('preserves edges including __extra and sides', () => {
    const doc: CanvasDoc = {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
      ],
      edges: [{
        id: 'e', fromNode: 'a', toNode: 'b',
        fromSide: 'right', toSide: 'left',
        __extra: { weight: 0.7 },
      }],
    };
    const { nodes, edges } = toReactFlow(doc);
    const restored = fromReactFlow(nodes, edges);
    expect(restored.edges[0].fromSide).toBe('right');
    expect(restored.edges[0].toSide).toBe('left');
    expect(restored.edges[0].__extra).toEqual({ weight: 0.7 });
  });

  it('reflects a user drag (position change in RF) back into the canvas doc', () => {
    const doc: CanvasDoc = {
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'hi' }],
      edges: [],
    };
    const { nodes } = toReactFlow(doc);
    // Simulate React Flow updating position after a drag.
    const dragged = nodes.map(n => ({ ...n, position: { x: 200, y: 300 } }));
    const restored = fromReactFlow(dragged, []);
    expect(restored.nodes[0].x).toBe(200);
    expect(restored.nodes[0].y).toBe(300);
  });
});
