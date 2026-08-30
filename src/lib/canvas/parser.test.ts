import { describe, it, expect } from 'vitest';
import { parseCanvas, serializeCanvas, genId } from './parser';
import type { CanvasDoc } from './types';

describe('parseCanvas', () => {
  it('returns an empty doc for blank input', () => {
    const r = parseCanvas('');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual({ nodes: [], edges: [] });
  });

  it('returns an error for invalid JSON', () => {
    const r = parseCanvas('{ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON|token/i);
  });

  it('rejects a non-object root', () => {
    const r = parseCanvas('[]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/object/i);
  });

  it('parses the four supported node types', () => {
    const src = JSON.stringify({
      nodes: [
        { id: 't', type: 'text', x: 0, y: 0, width: 250, height: 60, text: 'hi' },
        { id: 'f', type: 'file', x: 1, y: 2, width: 300, height: 200, file: 'Note', subpath: '#h' },
        { id: 'l', type: 'link', x: 3, y: 4, width: 200, height: 80, url: 'https://x.test' },
        { id: 'g', type: 'group', x: 5, y: 6, width: 400, height: 300, label: 'Sec' },
      ],
      edges: [],
    });
    const r = parseCanvas(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.nodes).toHaveLength(4);
    expect(r.doc.nodes[0]).toMatchObject({ type: 'text', text: 'hi' });
    expect(r.doc.nodes[1]).toMatchObject({ type: 'file', file: 'Note', subpath: '#h' });
    expect(r.doc.nodes[2]).toMatchObject({ type: 'link', url: 'https://x.test' });
    expect(r.doc.nodes[3]).toMatchObject({ type: 'group', label: 'Sec' });
  });

  it('drops nodes missing id, type, or with unknown type', () => {
    const src = JSON.stringify({
      nodes: [
        { id: '', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' }, // no id
        { id: 'ok', type: 'frobnicate', x: 0, y: 0, width: 1, height: 1 }, // unknown type
        { id: 'good', type: 'text', x: 0, y: 0, width: 1, height: 1, text: 'kept' },
      ],
      edges: [],
    });
    const r = parseCanvas(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.nodes).toHaveLength(1);
    expect(r.doc.nodes[0].id).toBe('good');
  });

  it('coerces missing numeric fields to defaults', () => {
    const src = JSON.stringify({
      nodes: [{ id: 'a', type: 'text', text: 'x' }],
      edges: [],
    });
    const r = parseCanvas(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.nodes[0]).toMatchObject({ x: 0, y: 0, width: 250, height: 60 });
  });

  it('filters edges that reference nodes not present in the doc', () => {
    const src = JSON.stringify({
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
      ],
      edges: [
        { id: 'e1', fromNode: 'a', toNode: 'b' },           // valid
        { id: 'e2', fromNode: 'a', toNode: 'ghost' },       // broken target
        { id: 'e3', fromNode: 'phantom', toNode: 'b' },     // broken source
        { id: '', fromNode: 'a', toNode: 'b' },             // missing id
      ],
    });
    const r = parseCanvas(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.edges).toHaveLength(1);
    expect(r.doc.edges[0].id).toBe('e1');
  });

  it('normalises side and end values; drops unknown ones', () => {
    const src = JSON.stringify({
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
      ],
      edges: [
        { id: 'e1', fromNode: 'a', fromSide: 'right', fromEnd: 'arrow',
          toNode: 'b', toSide: 'left', toEnd: 'none' },
        { id: 'e2', fromNode: 'a', fromSide: 'diagonal', toEnd: 'sparkle',
          toNode: 'b' },
      ],
    });
    const r = parseCanvas(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.edges[0]).toMatchObject({
      fromSide: 'right', toSide: 'left', fromEnd: 'arrow', toEnd: 'none',
    });
    expect(r.doc.edges[1].fromSide).toBeUndefined();
    expect(r.doc.edges[1].toEnd).toBeUndefined();
  });

  it('preserves unknown node fields in __extra (Obsidian interop)', () => {
    const src = JSON.stringify({
      nodes: [{
        id: 'a',
        type: 'text',
        x: 1, y: 2, width: 3, height: 4,
        text: 'hi',
        // Fields outside the JSON Canvas 1.0 spec — must round-trip.
        styleAttributes: { fontFamily: 'mono' },
        zIndex: 7,
      }],
      edges: [],
    });
    const r = parseCanvas(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.nodes[0].__extra).toEqual({
      styleAttributes: { fontFamily: 'mono' },
      zIndex: 7,
    });
  });

  it('preserves unknown edge fields in __extra', () => {
    const src = JSON.stringify({
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
        { id: 'b', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
      ],
      edges: [{
        id: 'e', fromNode: 'a', toNode: 'b',
        weight: 0.7, customLabel: { rich: true },
      }],
    });
    const r = parseCanvas(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.edges[0].__extra).toEqual({
      weight: 0.7,
      customLabel: { rich: true },
    });
  });

  it('preserves unknown top-level fields in doc.__extra', () => {
    const src = JSON.stringify({
      nodes: [], edges: [],
      schemaVersion: '1.0-experimental',
      metadata: { author: 'Phat' },
    });
    const r = parseCanvas(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.__extra).toEqual({
      schemaVersion: '1.0-experimental',
      metadata: { author: 'Phat' },
    });
  });
});

describe('serializeCanvas', () => {
  it('emits stable, pretty-printed JSON', () => {
    const doc: CanvasDoc = {
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 250, height: 60, text: 'hi' }],
      edges: [],
    };
    const s = serializeCanvas(doc);
    expect(s).toContain('\n');
    expect(s).toContain('  '); // 2-space indent
    expect(JSON.parse(s)).toEqual({
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 250, height: 60, text: 'hi' }],
      edges: [],
    });
  });

  it('omits undefined optional fields rather than emitting nulls', () => {
    const doc: CanvasDoc = {
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 250, height: 60, text: 'hi' }],
      edges: [],
    };
    const out = JSON.parse(serializeCanvas(doc));
    expect(out.nodes[0]).not.toHaveProperty('color');
  });

  it('replays node.__extra back into the output', () => {
    const doc: CanvasDoc = {
      nodes: [{
        id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '',
        __extra: { styleAttributes: { fontFamily: 'mono' } },
      }],
      edges: [],
    };
    const out = JSON.parse(serializeCanvas(doc));
    expect(out.nodes[0].styleAttributes).toEqual({ fontFamily: 'mono' });
    // The internal field itself is not re-emitted.
    expect(out.nodes[0]).not.toHaveProperty('__extra');
  });

  it('replays edge.__extra back into the output', () => {
    const doc: CanvasDoc = {
      nodes: [],
      edges: [{
        id: 'e', fromNode: 'a', toNode: 'b',
        __extra: { weight: 0.7 },
      }],
    };
    const out = JSON.parse(serializeCanvas(doc));
    expect(out.edges[0].weight).toBe(0.7);
    expect(out.edges[0]).not.toHaveProperty('__extra');
  });

  it('replays doc.__extra at the top level', () => {
    const doc: CanvasDoc = {
      nodes: [], edges: [],
      __extra: { schemaVersion: '1.0-experimental' },
    };
    const out = JSON.parse(serializeCanvas(doc));
    expect(out.schemaVersion).toBe('1.0-experimental');
    expect(out).not.toHaveProperty('__extra');
  });

  it("never lets __extra overwrite a known field", () => {
    // If a caller (or buggy parser) ever stashes a known key inside __extra,
    // the canonical field on the node must still win on serialize — otherwise
    // the user's edits could be silently shadowed.
    const doc: CanvasDoc = {
      nodes: [{
        id: 'a', type: 'text', x: 1, y: 2, width: 3, height: 4, text: 'live',
        __extra: { x: 999, text: 'shadow' },
      }],
      edges: [],
    };
    const out = JSON.parse(serializeCanvas(doc));
    expect(out.nodes[0].x).toBe(1);
    expect(out.nodes[0].text).toBe('live');
  });
});

describe('parseCanvas ↔ serializeCanvas round-trip', () => {
  it('preserves a doc with unknown fields verbatim', () => {
    const src = JSON.stringify({
      nodes: [{
        id: 'a', type: 'text', x: 1, y: 2, width: 3, height: 4, text: 'hi',
        styleAttributes: { fontFamily: 'mono' },
      }],
      edges: [{
        id: 'e', fromNode: 'a', toNode: 'a',
        weight: 0.5,
      }],
      schemaVersion: '1.0-experimental',
    }, null, 2);
    // Note: edges in this canned doc reference the only node 'a' twice
    // (self-loop) so they survive the broken-edge filter.

    const parsed = parseCanvas(src);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const reserialized = serializeCanvas(parsed.doc);
    const reparsed = parseCanvas(reserialized);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    // Second-generation parse must match first-generation parse exactly —
    // confirms the format converges after one round-trip.
    expect(reparsed.doc).toEqual(parsed.doc);
  });
});

describe('genId', () => {
  it('returns ids with the given prefix', () => {
    expect(genId('node')).toMatch(/^node-/);
    expect(genId('edge')).toMatch(/^edge-/);
  });

  it('produces sufficiently distinct ids across rapid calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => genId('x')));
    // 50 base36-timestamp + 4-char random ids should virtually never collide.
    expect(ids.size).toBe(50);
  });
});
