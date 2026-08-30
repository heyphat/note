import { describe, it, expect } from 'vitest';
import { collectNoteImages, type ImageAttachment } from './images';
import type { NoteStore } from '@/lib/storage';

function fakeStore(assets: Record<string, { bytes: Uint8Array; mimeType: string }>): NoteStore {
  const handlers = {
    getAssetBytes: async (_noteId: string, url: string) => assets[url] ?? null,
  } as Partial<NoteStore>;
  return handlers as NoteStore;
}

const PNG = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' };
const JPEG = { bytes: new Uint8Array([4, 5, 6]), mimeType: 'image/jpeg' };
const SVG = { bytes: new Uint8Array([7, 8, 9]), mimeType: 'image/svg+xml' };

describe('collectNoteImages', () => {
  it('resolves inline markdown images', async () => {
    const store = fakeStore({ '.assets/a.png': PNG, '.assets/b.jpg': JPEG });
    const text = '# Note\n\n![first](.assets/a.png)\n\nsome text\n\n![second](.assets/b.jpg)';
    const out = await collectNoteImages(store, 'note.md', text);
    expect(out).toHaveLength(2);
    expect(out[0].mimeType).toBe('image/png');
    expect(out[1].mimeType).toBe('image/jpeg');
  });

  it('skips unsupported formats (SVG)', async () => {
    const store = fakeStore({ '.assets/logo.svg': SVG, '.assets/shot.png': PNG });
    const text = '![logo](.assets/logo.svg)\n![shot](.assets/shot.png)';
    const out = await collectNoteImages(store, 'note.md', text);
    expect(out).toHaveLength(1);
    expect(out[0].mimeType).toBe('image/png');
  });

  it('deduplicates repeated references to the same image', async () => {
    const store = fakeStore({ '.assets/a.png': PNG });
    const text = '![once](.assets/a.png) and again ![twice](.assets/a.png)';
    const out = await collectNoteImages(store, 'note.md', text);
    expect(out).toHaveLength(1);
  });

  it('returns empty when noteId is missing (no vault anchor)', async () => {
    const store = fakeStore({ '.assets/a.png': PNG });
    const out = await collectNoteImages(store, null, '![x](.assets/a.png)');
    expect(out).toEqual([]);
  });

  it('ignores absolute and unresolvable URLs quietly', async () => {
    const store = fakeStore({});
    const text = '![hotlink](https://example.com/x.png)\n![missing](.assets/nope.png)';
    const out = await collectNoteImages(store, 'note.md', text);
    expect(out).toEqual([]);
  });

  it('respects the per-turn cap (first N in document order)', async () => {
    const assets: Record<string, { bytes: Uint8Array; mimeType: string }> = {};
    const parts: string[] = [];
    for (let i = 0; i < 12; i++) {
      const url = `.assets/img${i}.png`;
      assets[url] = { bytes: new Uint8Array([i]), mimeType: 'image/png' };
      parts.push(`![${i}](${url})`);
    }
    const store = fakeStore(assets);
    const out: ImageAttachment[] = await collectNoteImages(store, 'note.md', parts.join('\n'));
    expect(out).toHaveLength(8);
    expect(out[0].label).toBe('0');
    expect(out[7].label).toBe('7');
  });
});
