import { describe, expect, it } from 'vitest';
import { extractFirstImage, previewBody } from './body-preview';

describe('previewBody', () => {
  it('returns empty for missing or whitespace-only input', () => {
    expect(previewBody(undefined)).toBe('');
    expect(previewBody(null)).toBe('');
    expect(previewBody('')).toBe('');
    expect(previewBody('   \n\n  \t')).toBe('');
  });

  it('strips fenced code blocks', () => {
    const md = 'before\n```ts\nconst x = 1;\n```\nafter';
    expect(previewBody(md)).toBe('before after');
  });

  it('keeps link/image alt-text but drops URLs', () => {
    expect(previewBody('see [the docs](https://example.com)')).toBe('see the docs');
    expect(previewBody('![cat](https://cdn/cat.png) tag')).toBe('cat tag');
  });

  it('renders wikilink labels and bare targets', () => {
    expect(previewBody('refs [[Q2 Plan]] and [[notes/spec|the spec]]'))
      .toBe('refs Q2 Plan and the spec');
  });

  it('strips heading, blockquote, list, and task markers', () => {
    const md = '# Heading\n\n> a quote\n- bullet one\n- bullet two\n1. numbered\n- [ ] todo';
    expect(previewBody(md)).toBe('Heading a quote bullet one bullet two numbered todo');
  });

  it('drops emphasis markers but keeps emphasized text', () => {
    expect(previewBody('this is **bold** and *em* and ~~gone~~')).toBe('this is bold and em and gone');
  });

  it('strips inline code backticks', () => {
    expect(previewBody('run `npm test` first')).toBe('run npm test first');
  });

  it('truncates long previews with an ellipsis at maxLen', () => {
    const md = 'a'.repeat(200);
    const out = previewBody(md, 50);
    expect(out.length).toBeLessThanOrEqual(51); // 50 + ellipsis char
    expect(out.endsWith('…')).toBe(true);
  });

  it('does not truncate when the result fits', () => {
    expect(previewBody('short body', 100)).toBe('short body');
  });
});

describe('extractFirstImage', () => {
  it('returns null when no image is present', () => {
    expect(extractFirstImage(undefined)).toBeNull();
    expect(extractFirstImage('')).toBeNull();
    expect(extractFirstImage('plain text and a [link](https://x)')).toBeNull();
  });

  it('matches absolute http(s) image URLs', () => {
    const m = extractFirstImage('hello ![cat](https://cdn/cat.png) world');
    expect(m).toEqual({
      alt: 'cat',
      url: 'https://cdn/cat.png',
      match: '![cat](https://cdn/cat.png)',
    });
  });

  it('matches base64 data URLs for common raster types', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwbPmoAAAAASUVORK5CYII=';
    const m = extractFirstImage(`note ![tiny](${png}) more`);
    expect(m?.url).toBe(png);
    expect(m?.alt).toBe('tiny');
  });

  it('rejects SVG data URLs (defensive against legacy XSS in <img>)', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    expect(extractFirstImage(`![evil](${svg})`)).toBeNull();
  });

  it('rejects relative asset paths', () => {
    expect(extractFirstImage('![local](./foo.assets/img.png)')).toBeNull();
    expect(extractFirstImage('![local](../assets/img.png)')).toBeNull();
  });

  it('returns the first image when several are present', () => {
    const md = '![a](https://x/a.png) text ![b](https://x/b.png)';
    expect(extractFirstImage(md)?.url).toBe('https://x/a.png');
  });

  it('handles empty alt text', () => {
    const m = extractFirstImage('![](https://x/a.png)');
    expect(m?.alt).toBe('');
    expect(m?.url).toBe('https://x/a.png');
  });
});
