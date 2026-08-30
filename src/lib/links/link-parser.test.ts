import { describe, it, expect } from 'vitest';
import { parseWikiLinks } from './link-parser';

describe('parseWikiLinks', () => {
  it('matches a basic wikilink', () => {
    const refs = parseWikiLinks('see [[Foo]] later');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ target: 'Foo', section: '', display: '', isTransclusion: false });
  });

  it('matches a wikilink containing an ampersand', () => {
    const refs = parseWikiLinks('[[Search & Discovery]]');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.target).toBe('Search & Discovery');
  });

  it('matches a wikilink inside a numbered-heading line', () => {
    const refs = parseWikiLinks('## 1. [[Search & Discovery]] (P0)');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.target).toBe('Search & Discovery');
  });

  it('matches a wikilink wrapped in GFM strikethrough', () => {
    // The regression the user reported: a heading like
    //   ## ~~1. [[Search & Discovery]] (P0)~~
    // should still surface its wikilinks. The parser operates on raw text
    // so the surrounding `~~` characters must not affect bracket matching.
    const refs = parseWikiLinks('~~[[Search & Discovery]]~~');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.target).toBe('Search & Discovery');
  });

  it('matches a transclusion (![[...]])', () => {
    const refs = parseWikiLinks('![[Embedded]]');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ target: 'Embedded', isTransclusion: true });
  });

  it('matches a section reference ([[note#section]])', () => {
    const refs = parseWikiLinks('[[Project#Roadmap]]');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ target: 'Project', section: 'Roadmap' });
  });

  it('matches a piped display ([[target|display]])', () => {
    const refs = parseWikiLinks('[[Foo|Bar]]');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ target: 'Foo', display: 'Bar' });
  });

  it('tolerates Milkdown-escaped brackets (\\[\\[ ... \\]\\])', () => {
    // Crepe re-serializes wikilinks with escaped brackets; the parser must
    // accept that form so the index doesn't lose links after a round-trip.
    const refs = parseWikiLinks('\\[\\[Foo\\]\\]');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.target).toBe('Foo');
  });

  it('ignores wikilinks inside fenced code blocks', () => {
    const refs = parseWikiLinks('```\n[[NotALink]]\n```');
    expect(refs).toHaveLength(0);
  });

  it('ignores wikilinks inside inline code spans', () => {
    const refs = parseWikiLinks('inline `[[NotALink]]` example');
    expect(refs).toHaveLength(0);
  });

  it('returns offsets relative to the original (un-masked) input', () => {
    const src = 'a [[X]] b';
    const refs = parseWikiLinks(src);
    expect(refs).toHaveLength(1);
    expect(src.slice(refs[0]!.start, refs[0]!.end)).toBe('[[X]]');
  });
});
