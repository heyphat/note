import { describe, it, expect } from 'vitest';
import {
  slugFromPath,
  urlFromId,
  templateUrlFromId,
  taskUrlFromUuid,
  routeFromPath,
} from './routing';

describe('slugFromPath', () => {
  it('returns null for root / empty paths', () => {
    expect(slugFromPath('/')).toBeNull();
    expect(slugFromPath('')).toBeNull();
    expect(slugFromPath(null)).toBeNull();
    expect(slugFromPath(undefined)).toBeNull();
  });

  it('strips leading / trailing slashes', () => {
    expect(slugFromPath('/foo')).toBe('foo');
    expect(slugFromPath('/foo/')).toBe('foo');
    expect(slugFromPath('///foo//')).toBe('foo');
  });

  it('decodes URI-encoded segments', () => {
    expect(slugFromPath('/my%20note')).toBe('my note');
    expect(slugFromPath('/a/b%2Fc')).toBe('a/b/c');
  });

  it('returns null on malformed percent-encoding', () => {
    expect(slugFromPath('/bad%ZZencoding')).toBeNull();
  });

  it('preserves nested paths', () => {
    expect(slugFromPath('/learning/2024/foo')).toBe('learning/2024/foo');
  });
});

describe('urlFromId', () => {
  it('strips trailing .md', () => {
    expect(urlFromId('foo.md')).toBe('/foo');
    expect(urlFromId('a/b/c.md')).toBe('/a/b/c');
  });

  it('leaves ids without .md alone', () => {
    expect(urlFromId('foo')).toBe('/foo');
  });

  it('URI-encodes segments with special characters', () => {
    expect(urlFromId('my note.md')).toBe('/my%20note');
    expect(urlFromId('a/b c/d.md')).toBe('/a/b%20c/d');
  });
});

describe('templateUrlFromId', () => {
  it('prefixes with /templates/ and encodes the id', () => {
    expect(templateUrlFromId('foo')).toBe('/templates/foo');
    expect(templateUrlFromId('my template')).toBe('/templates/my%20template');
  });
});

describe('taskUrlFromUuid', () => {
  it('prefixes with /tasks/ and encodes the uuid', () => {
    expect(taskUrlFromUuid('11111111-2222-3333-4444-555555555555'))
      .toBe('/tasks/11111111-2222-3333-4444-555555555555');
  });

  it('respects the locale prefix', () => {
    expect(taskUrlFromUuid('abc', 'en')).toBe('/en/tasks/abc');
    expect(taskUrlFromUuid('abc', 'vi')).toBe('/vi/tasks/abc');
  });
});

describe('routeFromPath', () => {
  it('classifies the root as base', () => {
    expect(routeFromPath('/')).toEqual({ kind: 'base' });
    expect(routeFromPath('')).toEqual({ kind: 'base' });
    expect(routeFromPath(null)).toEqual({ kind: 'base' });
  });

  it('classifies /new as new-note', () => {
    expect(routeFromPath('/new')).toEqual({ kind: 'new-note' });
  });

  it('classifies /templates/<id> as template', () => {
    expect(routeFromPath('/templates/daily'))
      .toEqual({ kind: 'template', templateId: 'daily' });
  });

  it('joins nested template ids', () => {
    expect(routeFromPath('/templates/a/b'))
      .toEqual({ kind: 'template', templateId: 'a/b' });
  });

  it('classifies anything else as a note slug', () => {
    expect(routeFromPath('/foo')).toEqual({ kind: 'note', slug: 'foo' });
    expect(routeFromPath('/learning/2024/foo'))
      .toEqual({ kind: 'note', slug: 'learning/2024/foo' });
  });

  it('decodes note slugs', () => {
    expect(routeFromPath('/my%20note'))
      .toEqual({ kind: 'note', slug: 'my note' });
  });

  it('treats /templates (no id) as a note slug', () => {
    // Only /templates/<id> should be a template route; bare /templates
    // could plausibly be a note named "templates".
    expect(routeFromPath('/templates'))
      .toEqual({ kind: 'note', slug: 'templates' });
  });

  it('classifies /tasks/<uuid> as a task route', () => {
    expect(routeFromPath('/tasks/11111111-2222-3333-4444-555555555555'))
      .toEqual({ kind: 'task', taskUuid: '11111111-2222-3333-4444-555555555555' });
  });

  it('treats /tasks (no uuid) as a note slug', () => {
    // Symmetric with the /templates rule above — bare /tasks could be a
    // user-authored note title.
    expect(routeFromPath('/tasks'))
      .toEqual({ kind: 'note', slug: 'tasks' });
  });

  it('only consumes the first segment after /tasks/', () => {
    // Tasks are uuid-keyed and never nested. Any extra segments are
    // ignored — the uuid wins.
    expect(routeFromPath('/tasks/uuid-abc/extra'))
      .toEqual({ kind: 'task', taskUuid: 'uuid-abc' });
  });

  it('strips a /<locale> prefix before classifying as a task', () => {
    expect(routeFromPath('/en/tasks/abc'))
      .toEqual({ kind: 'task', taskUuid: 'abc' });
  });
});
