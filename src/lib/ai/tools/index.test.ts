import { describe, it, expect } from 'vitest';
import {
  applyProposedEdit,
  formatSearchTasksResult,
  formatSearchVaultResult,
  normalizeSearchTasksInput,
  normalizeSearchVaultInput,
} from './index';

describe('applyProposedEdit', () => {
  it('replaces a unique substring with find/replace', () => {
    const before = '# Title\n\nHello world.\n';
    const out = applyProposedEdit(before, {
      toolName: 'edit_note',
      input: { find: 'Hello world.', replace: 'Goodbye world.' },
    });
    expect(out).toBe('# Title\n\nGoodbye world.\n');
  });

  it('throws when find is missing from the note', () => {
    expect(() => applyProposedEdit('body', {
      toolName: 'edit_note',
      input: { find: 'nope', replace: 'x' },
    })).toThrow(/not found in the note/i);
  });

  it('throws when find appears more than once (ambiguous)', () => {
    expect(() => applyProposedEdit('a\na\na\n', {
      toolName: 'edit_note',
      input: { find: 'a', replace: 'b' },
    })).toThrow(/more than once/i);
  });

  it('throws on empty find', () => {
    expect(() => applyProposedEdit('body', {
      toolName: 'edit_note',
      input: { find: '', replace: 'x' },
    })).toThrow(/empty find/i);
  });

  it('rewrite_note replaces the entire content', () => {
    const out = applyProposedEdit('old content', {
      toolName: 'rewrite_note',
      input: { new_content: 'brand new content' },
    });
    expect(out).toBe('brand new content');
  });

  it('preserves content around the edited region exactly', () => {
    const before = 'prefix ## heading\n\nbody text\n\nafter\n';
    const out = applyProposedEdit(before, {
      toolName: 'edit_note',
      input: { find: 'body text', replace: 'NEW body text with more info' },
    });
    expect(out).toBe('prefix ## heading\n\nNEW body text with more info\n\nafter\n');
  });

  it('whitespace-tolerant: applies edit when find differs only in newlines/spaces', () => {
    const before = '## Title\n\n- item one\n- item two\n';
    // Model emitted single-newline form; real text has the same tokens but
    // separated by blank lines and the list markers. This is the most common
    // class of "find not found" miss in chat.
    const out = applyProposedEdit(before, {
      toolName: 'edit_note',
      input: { find: 'item one\n- item two', replace: 'item one\n- item two\n- item three' },
    });
    expect(out).toBe('## Title\n\n- item one\n- item two\n- item three\n');
  });

  it('whitespace-tolerant: does NOT apply when the fuzzy match is ambiguous', () => {
    // Two equally-valid whitespace-collapsed matches: must surface ambiguity
    // rather than silently editing the wrong span.
    const before = 'foo\nbar\n\n…\n\nfoo\nbar\n';
    expect(() => applyProposedEdit(before, {
      toolName: 'edit_note',
      input: { find: 'foo bar', replace: 'X' },
    })).toThrow(/not found in the note/i);
  });

  it('error message tells the model to use rewrite_note when the note is empty', () => {
    expect(() => applyProposedEdit('', {
      toolName: 'edit_note',
      input: { find: '## Heading', replace: 'X' },
    })).toThrow(/rewrite_note/i);
  });

  it('error message includes a snapshot of the actual note body for non-empty misses', () => {
    const note = '# Real heading\n\nA paragraph of actual content the model needs to see.\n';
    let caught: Error | null = null;
    try {
      applyProposedEdit(note, {
        toolName: 'edit_note',
        input: { find: '## Fabricated heading', replace: 'X' },
      });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    // Either the "essentially empty" branch (short notes) or the snapshot
    // branch (long notes) must echo back the real text so the model can
    // anchor against it on the next attempt.
    expect(caught!.message).toContain('Real heading');
  });
});

describe('normalizeSearchVaultInput', () => {
  it('accepts a plain query', () => {
    expect(normalizeSearchVaultInput({ query: 'hello' })).toEqual({ query: 'hello' });
  });

  it('clamps limit to [1, 25] and floors floats', () => {
    expect(normalizeSearchVaultInput({ query: 'x', limit: 0 })).toEqual({ query: 'x', limit: 1 });
    expect(normalizeSearchVaultInput({ query: 'x', limit: 100 })).toEqual({ query: 'x', limit: 25 });
    expect(normalizeSearchVaultInput({ query: 'x', limit: 7.9 })).toEqual({ query: 'x', limit: 7 });
  });

  it('drops non-string tag entries and empties', () => {
    expect(normalizeSearchVaultInput({ query: 'x', tags: ['ok', '', 7, null] as unknown as string[] }))
      .toEqual({ query: 'x', tags: ['ok'] });
  });

  it('omits the tags key when no usable tags survive filtering', () => {
    expect(normalizeSearchVaultInput({ query: 'x', tags: [] })).toEqual({ query: 'x' });
    expect(normalizeSearchVaultInput({ query: 'x', tags: ['', '   '] })).toEqual({ query: 'x' });
  });

  it('returns null for missing/empty query', () => {
    expect(normalizeSearchVaultInput({})).toBeNull();
    expect(normalizeSearchVaultInput({ query: '' })).toBeNull();
    expect(normalizeSearchVaultInput({ query: '   ' })).toBeNull();
    expect(normalizeSearchVaultInput(null)).toBeNull();
    expect(normalizeSearchVaultInput('not an object')).toBeNull();
  });

  it('ignores non-finite limit values', () => {
    expect(normalizeSearchVaultInput({ query: 'x', limit: NaN })).toEqual({ query: 'x' });
    expect(normalizeSearchVaultInput({ query: 'x', limit: Infinity })).toEqual({ query: 'x' });
  });
});

describe('formatSearchVaultResult', () => {
  it('round-trips through JSON.parse with the expected shape', () => {
    const result = formatSearchVaultResult({
      hits: [{ path: 'a.md', title: 'A', snippet: 's', score: 0.5, updatedAt: '2026-01-01' }],
      total: 1,
      truncated: false,
      query: 'x',
    });
    expect(JSON.parse(result)).toEqual({
      hits: [{ path: 'a.md', title: 'A', snippet: 's', score: 0.5, updatedAt: '2026-01-01' }],
      total: 1,
      truncated: false,
      query: 'x',
    });
  });
});

describe('normalizeSearchTasksInput', () => {
  it('returns an empty filter set for null/garbage input', () => {
    expect(normalizeSearchTasksInput(null)).toEqual({});
    expect(normalizeSearchTasksInput('not an object')).toEqual({});
    expect(normalizeSearchTasksInput({})).toEqual({});
  });

  it('passes through a clean filter set', () => {
    expect(normalizeSearchTasksInput({
      text: 'budget',
      status: 'open',
      priority: 'high',
      tags: ['urgent'],
      contexts: ['@work'],
      projects: ['[[Q2]]'],
      due_after: '2026-01-01',
      due_before: '2026-12-31',
      limit: 30,
    })).toEqual({
      text: 'budget',
      status: 'open',
      priority: 'high',
      tags: ['urgent'],
      contexts: ['@work'],
      projects: ['[[Q2]]'],
      due_after: '2026-01-01',
      due_before: '2026-12-31',
      limit: 30,
    });
  });

  it('drops invalid priority values', () => {
    expect(normalizeSearchTasksInput({ priority: 'critical' })).toEqual({});
    expect(normalizeSearchTasksInput({ priority: 'highest' })).toEqual({ priority: 'highest' });
  });

  it('drops malformed dates rather than passing them through', () => {
    expect(normalizeSearchTasksInput({ due_before: 'tomorrow' })).toEqual({});
    expect(normalizeSearchTasksInput({ due_before: '2026-1-1' })).toEqual({});
    expect(normalizeSearchTasksInput({ due_before: '2026-01-01' })).toEqual({ due_before: '2026-01-01' });
  });

  it('clamps limit to [1, 100] and floors floats', () => {
    expect(normalizeSearchTasksInput({ limit: 0 })).toEqual({ limit: 1 });
    expect(normalizeSearchTasksInput({ limit: 9999 })).toEqual({ limit: 100 });
    expect(normalizeSearchTasksInput({ limit: 7.9 })).toEqual({ limit: 7 });
  });

  it('drops empty/whitespace-only strings and empty arrays', () => {
    expect(normalizeSearchTasksInput({ text: '   ', tags: [] })).toEqual({});
    expect(normalizeSearchTasksInput({ tags: ['ok', '', null] as unknown as string[] }))
      .toEqual({ tags: ['ok'] });
  });
});

describe('formatSearchTasksResult', () => {
  it('round-trips through JSON.parse with the expected shape', () => {
    const out = formatSearchTasksResult({
      hits: [{
        path: 't.md',
        title: 'Draft proposal',
        status: 'open',
        priority: 'high',
        bodyExcerpt: '…',
        updatedAt: '2026-05-01T00:00:00Z',
      }],
      total: 1,
      truncated: false,
      filters: { text: 'proposal' },
    });
    expect(JSON.parse(out).hits[0].path).toBe('t.md');
  });
});
