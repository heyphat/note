import { describe, expect, it } from 'vitest';
import { parseBookmarkBlock } from './embed-blocks';

describe('parseBookmarkBlock', () => {
  it('parses a URL with optional title and description', () => {
    expect(parseBookmarkBlock('https://example.com/docs\nDocs\nUseful reference')).toEqual({
      url: 'https://example.com/docs',
      title: 'Docs',
      description: 'Useful reference',
      hostname: 'example.com',
    });
  });

  it('adds https and derives a title from the hostname', () => {
    expect(parseBookmarkBlock('www.example.com')?.title).toBe('example.com');
    expect(parseBookmarkBlock('www.example.com')?.url).toBe('https://www.example.com/');
  });

  it('rejects non-http URLs', () => {
    expect(parseBookmarkBlock('ftp://example.com/file')).toBeNull();
    expect(parseBookmarkBlock('not a url')).toBeNull();
  });
});
