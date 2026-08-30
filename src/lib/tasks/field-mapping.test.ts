import { describe, it, expect } from 'vitest';
import { DEFAULT_MAPPING, knownKeys, readField } from './field-mapping';

describe('readField', () => {
  it('returns the canonical value when present', () => {
    const r = readField({ dateCreated: '2026-01-01T00:00:00Z' }, 'date_created');
    expect(r.value).toBe('2026-01-01T00:00:00Z');
    expect(r.issues).toEqual([]);
  });

  it('falls back to an alias when canonical absent', () => {
    const r = readField({ date_created: '2026-01-01T00:00:00Z' }, 'date_created');
    expect(r.value).toBe('2026-01-01T00:00:00Z');
    expect(r.issues).toEqual([]);
  });

  it('emits alias_conflict_ignored when both canonical and alias present', () => {
    const r = readField({
      dateCreated: '2026-01-01T00:00:00Z',
      date_created: '2025-01-01T00:00:00Z',
    }, 'date_created');
    expect(r.value).toBe('2026-01-01T00:00:00Z');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({
      code: 'alias_conflict_ignored',
      role: 'date_created',
      canonical: 'dateCreated',
      aliases: ['date_created'],
    });
  });

  it('treats empty strings as absent', () => {
    const r = readField({ dateCreated: '   ', date_created: '2026-01-01T00:00:00Z' }, 'date_created');
    expect(r.value).toBe('2026-01-01T00:00:00Z');
    expect(r.issues).toEqual([]);
  });

  it('honours overridden mapping (e.g. user maps `due` to `deadline`)', () => {
    const customMapping = { ...DEFAULT_MAPPING, due: 'deadline' };
    const r = readField({ deadline: '2026-05-10', due: '2025-01-01' }, 'due', customMapping);
    expect(r.value).toBe('2026-05-10');
    expect(r.issues[0]?.code).toBe('alias_conflict_ignored');
  });

  it('preserves empty arrays as present (user explicitly cleared)', () => {
    const r = readField({ tags: [] }, 'tags');
    expect(r.value).toEqual([]);
    expect(r.issues).toEqual([]);
  });
});

describe('knownKeys', () => {
  it('includes both canonical and aliases', () => {
    const set = knownKeys();
    expect(set.has('dateCreated')).toBe(true);
    expect(set.has('date_created')).toBe(true);
    expect(set.has('deadline')).toBe(true); // alias for due
  });
});
