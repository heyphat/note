import { describe, it, expect, vi } from 'vitest';
import { buildSearchVaultExecutor } from './search';
import type { SearchHit, SearchQuery } from '../../search/types';

function makeHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    id: 'a.md',
    title: 'A',
    score: 0.5,
    snippet: 'a snippet',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildSearchVaultExecutor', () => {
  it('passes the query through to runSearch and shapes hits', async () => {
    const runSearch = vi.fn<(q: SearchQuery) => Promise<SearchHit[]>>(async () => [
      makeHit({ id: 'one.md', title: 'One', score: 0.91 }),
      makeHit({ id: 'two.md', title: 'Two', score: 0.42 }),
    ]);
    const exec = buildSearchVaultExecutor({ runSearch });
    const raw = await exec('search_vault', { query: 'hello' });
    const parsed = JSON.parse(raw);
    expect(parsed.hits).toHaveLength(2);
    expect(parsed.hits[0].path).toBe('one.md');
    expect(parsed.hits[0].title).toBe('One');
    expect(parsed.hits[0].score).toBe(0.91);
    expect(parsed.total).toBe(2);
    expect(parsed.truncated).toBe(false);
    expect(parsed.query).toBe('hello');
    expect(runSearch).toHaveBeenCalledOnce();
    const arg = runSearch.mock.calls[0][0];
    expect(arg.text).toBe('hello');
    expect(arg.sort).toBe('relevance');
  });

  it('clamps to limit and reports truncation', async () => {
    const hits = Array.from({ length: 12 }, (_, i) => makeHit({ id: `n${i}.md`, title: `N${i}` }));
    const runSearch = vi.fn(async () => hits);
    const exec = buildSearchVaultExecutor({ runSearch });
    const parsed = JSON.parse(await exec('search_vault', { query: 'x', limit: 5 }));
    expect(parsed.hits).toHaveLength(5);
    expect(parsed.total).toBe(12);
    expect(parsed.truncated).toBe(true);
  });

  it('returns an empty result for an unusable query rather than throwing', async () => {
    const runSearch = vi.fn(async () => []);
    const exec = buildSearchVaultExecutor({ runSearch });
    const parsed = JSON.parse(await exec('search_vault', { query: '   ' }));
    expect(parsed.hits).toEqual([]);
    expect(parsed.total).toBe(0);
    expect(runSearch).not.toHaveBeenCalled();
  });

  it('clamps very long snippets so a 25-hit search stays compact', async () => {
    const longSnippet = 'word '.repeat(200);
    const runSearch = vi.fn(async () => [makeHit({ snippet: longSnippet })]);
    const exec = buildSearchVaultExecutor({ runSearch });
    const parsed = JSON.parse(await exec('search_vault', { query: 'x' }));
    expect(parsed.hits[0].snippet.length).toBeLessThanOrEqual(240);
    expect(parsed.hits[0].snippet.endsWith('…')).toBe(true);
  });

  it('falls back to getSnippetSource body when the index has no snippet', async () => {
    const runSearch = vi.fn(async () => [makeHit({ snippet: '' })]);
    const exec = buildSearchVaultExecutor({
      runSearch,
      getSnippetSource: (id) => id === 'a.md' ? { id, body: 'fallback body' } : null,
    });
    const parsed = JSON.parse(await exec('search_vault', { query: 'x' }));
    expect(parsed.hits[0].snippet).toBe('fallback body');
  });

  it('forwards tags into the SearchQuery', async () => {
    const runSearch = vi.fn<(q: SearchQuery) => Promise<SearchHit[]>>(async () => []);
    const exec = buildSearchVaultExecutor({ runSearch });
    await exec('search_vault', { query: 'x', tags: ['todo', 'urgent'] });
    expect(runSearch.mock.calls[0]?.[0].tags).toEqual(['todo', 'urgent']);
  });

  it('throws on an unknown tool name so the loop logs the misuse', async () => {
    const exec = buildSearchVaultExecutor({ runSearch: vi.fn() });
    // @ts-expect-error — deliberately exercising the runtime guard.
    await expect(exec('not_a_tool', {})).rejects.toThrow(/Unsupported/i);
  });
});
