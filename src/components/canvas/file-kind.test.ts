import { describe, it, expect } from 'vitest';
import { detectFileKind } from './file-kind';

describe('detectFileKind', () => {
  it('defaults to markdown for empty / whitespace input', () => {
    expect(detectFileKind('')).toBe('markdown');
    expect(detectFileKind('   ')).toBe('markdown');
  });

  it('defaults to markdown when there is no extension', () => {
    expect(detectFileKind('Some Note')).toBe('markdown');
    expect(detectFileKind('Folder/SubFolder')).toBe('markdown');
  });

  it('detects all supported image extensions', () => {
    const exts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'];
    for (const ext of exts) {
      expect(detectFileKind(`foo.${ext}`)).toBe('image');
    }
  });

  it('is case-insensitive on the extension', () => {
    expect(detectFileKind('Foo.PNG')).toBe('image');
    expect(detectFileKind('photo.JpEg')).toBe('image');
  });

  it('treats .md and other non-image extensions as markdown', () => {
    expect(detectFileKind('note.md')).toBe('markdown');
    expect(detectFileKind('schema.json')).toBe('markdown');
    expect(detectFileKind('script.ts')).toBe('markdown');
  });

  it('strips ?query before sniffing the extension', () => {
    // Cache-busting URLs are common — `?v=42` shouldn't hide the .png.
    expect(detectFileKind('https://cdn.test/img.png?v=42')).toBe('image');
    expect(detectFileKind('foo.jpg?size=large')).toBe('image');
  });

  it('strips #fragment before sniffing the extension', () => {
    // Otherwise a wikilink like `Note#section.png` would mis-detect.
    expect(detectFileKind('https://x.test/img.png#section')).toBe('image');
  });

  it('strips both ? and # together', () => {
    expect(detectFileKind('https://x.test/img.png?v=1#anchor')).toBe('image');
  });

  it('does NOT treat #section on a note title as an image', () => {
    expect(detectFileKind('Some Note#heading')).toBe('markdown');
  });

  it('handles deep paths correctly (uses last dot)', () => {
    expect(detectFileKind('a.b.c/foo.png')).toBe('image');
    expect(detectFileKind('Notes/2026.04.15/diary')).toBe('markdown');
  });
});
