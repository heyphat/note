import { describe, it, expect } from 'vitest';
import { parseYamlFrontmatter, serializeYamlFrontmatter, YamlFrontmatterError } from './yaml-frontmatter';

describe('parseYamlFrontmatter', () => {
  it('returns empty data when no frontmatter', () => {
    const r = parseYamlFrontmatter('# just a heading\n\nbody');
    expect(r.data).toEqual({});
    expect(r.body).toBe('# just a heading\n\nbody');
    expect(r.hadFrontmatter).toBe(false);
  });

  it('parses flat key/value frontmatter', () => {
    const raw = '---\ntitle: Hello\nstatus: open\n---\nbody here';
    const r = parseYamlFrontmatter(raw);
    expect(r.data).toEqual({ title: 'Hello', status: 'open' });
    expect(r.body).toBe('body here');
    expect(r.hadFrontmatter).toBe(true);
  });

  it('parses nested arrays of objects', () => {
    const raw = `---
title: Task
blockedBy:
  - uid: "[[task-a]]"
    reltype: FINISHTOSTART
  - uid: "[[task-b]]"
    reltype: STARTTOSTART
    gap: P1D
---
notes`;
    const r = parseYamlFrontmatter(raw);
    expect(r.data.blockedBy).toEqual([
      { uid: '[[task-a]]', reltype: 'FINISHTOSTART' },
      { uid: '[[task-b]]', reltype: 'STARTTOSTART', gap: 'P1D' },
    ]);
  });

  it('throws on malformed YAML', () => {
    const raw = '---\ntitle: "unclosed string\n---\nbody';
    expect(() => parseYamlFrontmatter(raw)).toThrow(YamlFrontmatterError);
  });

  it('handles `...` stream-end delimiter', () => {
    const raw = '---\ntitle: foo\n...\nbody';
    const r = parseYamlFrontmatter(raw);
    expect(r.data).toEqual({ title: 'foo' });
    expect(r.body).toBe('body');
  });

  it('strips a UTF-8 BOM at the head of the file', () => {
    const raw = '﻿---\ntitle: foo\n---\nbody';
    const r = parseYamlFrontmatter(raw);
    expect(r.data).toEqual({ title: 'foo' });
  });
});

describe('serializeYamlFrontmatter', () => {
  it('round-trips flat keys', () => {
    const raw = '---\ntitle: Hello\nstatus: open\n---\nbody\n';
    const { data, body } = parseYamlFrontmatter(raw);
    const out = serializeYamlFrontmatter(data, body);
    expect(out).toContain('title: Hello');
    expect(out).toContain('status: open');
    expect(out.endsWith('body\n')).toBe(true);
  });

  it('writes empty body without frontmatter when data is empty', () => {
    expect(serializeYamlFrontmatter({}, 'just body')).toBe('just body');
  });

  it('preserves nested array-of-objects on round-trip', () => {
    const data = {
      blockedBy: [
        { uid: '[[task-a]]', reltype: 'FINISHTOSTART' as const },
      ],
    };
    const out = serializeYamlFrontmatter(data, '');
    const back = parseYamlFrontmatter(out);
    expect(back.data.blockedBy).toEqual(data.blockedBy);
  });
});
