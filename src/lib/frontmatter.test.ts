import { describe, expect, it } from 'vitest';
import { parseFrontmatter, serializeFrontmatter, splitFrontmatter, isTaskFrontmatter } from './frontmatter';

describe('frontmatter serialization', () => {
  it('quotes metadata values that would otherwise inject frontmatter lines', () => {
    const title = 'Recovered\nprovider: evil\n---\nbody';
    const raw = serializeFrontmatter({ id: 'note-1', title }, 'actual body');

    expect(raw).toContain('title: "Recovered\\nprovider: evil\\n---\\nbody"');
    expect(raw).not.toContain('\nprovider: evil\n');

    const parsed = parseFrontmatter(raw);
    expect(parsed.meta.title).toBe(title);
    expect(parsed.meta.provider).toBeUndefined();
    expect(parsed.content).toBe('actual body');
  });

  it('keeps existing list-style frontmatter parseable', () => {
    const parsed = parseFrontmatter('---\ntags: a, b, c\n---\nbody');

    expect(parsed.meta.tags).toBe('a, b, c');
    expect(parsed.metaList.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('splitFrontmatter', () => {
  it('splits a normal frontmatter + body into byte-exact halves', () => {
    const raw = '---\nid: 1\ntitle: hi\n---\nthe body';
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe('---\nid: 1\ntitle: hi\n---\n');
    expect(body).toBe('the body');
    expect(frontmatter + body).toBe(raw);
  });

  it('returns frontmatter="" and body=raw for files with no frontmatter', () => {
    const raw = '# A heading\n\nsome text';
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe('');
    expect(body).toBe(raw);
  });

  it('returns frontmatter="" for malformed input (open --- with no close)', () => {
    const raw = '---\nid: 1\nno closing delim\nstill body';
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe('');
    expect(body).toBe(raw);
  });

  it('preserves body content that contains horizontal-rule "---" lines', () => {
    const raw = '---\nid: 1\n---\nintro\n\n---\nmore body';
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe('---\nid: 1\n---\n');
    expect(body).toBe('intro\n\n---\nmore body');
  });

  it('handles leading whitespace before the frontmatter delimiter', () => {
    const raw = '\n\n---\nid: 1\n---\nbody';
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe('\n\n---\nid: 1\n---\n');
    expect(body).toBe('body');
  });

  it('handles a file that ends right at the closing delimiter (no trailing newline)', () => {
    const raw = '---\nid: 1\n---';
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe(raw);
    expect(body).toBe('');
  });
});

describe('isTaskFrontmatter', () => {
  it('returns true for canonical TaskNotes frontmatter (status + dateCreated)', () => {
    expect(isTaskFrontmatter({ status: 'open', dateCreated: '2026-05-04T10:00:00Z' })).toBe(true);
  });

  it('accepts the snake_case alias `date_created`', () => {
    expect(isTaskFrontmatter({ status: 'open', date_created: '2026-05-04T10:00:00Z' })).toBe(true);
  });

  it('accepts the short alias `created`', () => {
    expect(isTaskFrontmatter({ status: 'open', created: '2026-05-04T10:00:00Z' })).toBe(true);
  });

  it('rejects frontmatter with status but no date-created field', () => {
    expect(isTaskFrontmatter({ status: 'open' })).toBe(false);
  });

  it('rejects frontmatter with a date-created field but no status', () => {
    expect(isTaskFrontmatter({ dateCreated: '2026-05-04T10:00:00Z' })).toBe(false);
  });

  it('rejects empty frontmatter', () => {
    expect(isTaskFrontmatter({})).toBe(false);
  });

  it('rejects regular note frontmatter (createdAt, no status)', () => {
    expect(isTaskFrontmatter({
      id: 'note-1',
      title: 'Hello',
      createdAt: '2026-05-04T10:00:00Z',
      updatedAt: '2026-05-04T10:00:00Z',
    })).toBe(false);
  });
});
