import { describe, it, expect } from 'vitest';
import {
  deriveTitleFromMarkdown,
  getNextTemplateName,
  DEFAULT_NEW_TEMPLATE_TITLE,
} from './title';

describe('deriveTitleFromMarkdown', () => {
  it('returns null for an empty body', () => {
    expect(deriveTitleFromMarkdown('')).toBeNull();
    expect(deriveTitleFromMarkdown('\n\n\n')).toBeNull();
  });

  it('skips blank lines', () => {
    expect(deriveTitleFromMarkdown('\n\nHello\n')).toBe('Hello');
  });

  it('strips heading prefixes', () => {
    expect(deriveTitleFromMarkdown('# Hello')).toBe('Hello');
    expect(deriveTitleFromMarkdown('## Title here')).toBe('Title here');
    expect(deriveTitleFromMarkdown('###### Deep')).toBe('Deep');
  });

  it('returns null for empty headings', () => {
    // An `## ` with no text and nothing below is the seed body for a new
    // note — deriveTitle should skip it so callers fall back to the default.
    expect(deriveTitleFromMarkdown('## ')).toBeNull();
    expect(deriveTitleFromMarkdown('## \n')).toBeNull();
  });

  it('strips blockquote markers', () => {
    expect(deriveTitleFromMarkdown('> quote line')).toBe('quote line');
    expect(deriveTitleFromMarkdown('> # heading inside quote')).toBe('heading inside quote');
  });

  it('strips bullet list markers', () => {
    expect(deriveTitleFromMarkdown('- item')).toBe('item');
    expect(deriveTitleFromMarkdown('* item')).toBe('item');
    expect(deriveTitleFromMarkdown('+ item')).toBe('item');
  });

  it('strips ordered list markers', () => {
    expect(deriveTitleFromMarkdown('1. first')).toBe('first');
    expect(deriveTitleFromMarkdown('42) fortytwo')).toBe('fortytwo');
  });

  it('strips task list markers', () => {
    expect(deriveTitleFromMarkdown('- [ ] todo item')).toBe('todo item');
    expect(deriveTitleFromMarkdown('- [x] done item')).toBe('done item');
    expect(deriveTitleFromMarkdown('- [X] done upper')).toBe('done upper');
  });

  it('uses the first non-empty line', () => {
    expect(deriveTitleFromMarkdown('\n\n## First\nSecond')).toBe('First');
  });

  it('preserves inline formatting characters', () => {
    // Title derivation deliberately doesn't interpret markdown inside the
    // line — the user sees literally what they typed.
    expect(deriveTitleFromMarkdown('# **bold** word')).toBe('**bold** word');
  });
});

describe('getNextTemplateName', () => {
  it('returns the default when no templates exist', () => {
    expect(getNextTemplateName([])).toBe(DEFAULT_NEW_TEMPLATE_TITLE);
  });

  it('returns the default when unrelated names exist', () => {
    expect(getNextTemplateName(['Meeting notes', 'Daily log']))
      .toBe(DEFAULT_NEW_TEMPLATE_TITLE);
  });

  it('suffixes with " 2" when the default is taken', () => {
    expect(getNextTemplateName([DEFAULT_NEW_TEMPLATE_TITLE]))
      .toBe(`${DEFAULT_NEW_TEMPLATE_TITLE} 2`);
  });

  it('finds the next free slot', () => {
    expect(getNextTemplateName([
      DEFAULT_NEW_TEMPLATE_TITLE,
      `${DEFAULT_NEW_TEMPLATE_TITLE} 2`,
      `${DEFAULT_NEW_TEMPLATE_TITLE} 3`,
    ])).toBe(`${DEFAULT_NEW_TEMPLATE_TITLE} 4`);
  });

  it('skips gaps — numbering is "next available", not "one more"', () => {
    // If the user deleted `Untitled template 2` but kept the others, the
    // next new template slots into the gap.
    expect(getNextTemplateName([
      DEFAULT_NEW_TEMPLATE_TITLE,
      `${DEFAULT_NEW_TEMPLATE_TITLE} 3`,
    ])).toBe(`${DEFAULT_NEW_TEMPLATE_TITLE} 2`);
  });

  it('is case-sensitive', () => {
    expect(getNextTemplateName([DEFAULT_NEW_TEMPLATE_TITLE.toUpperCase()]))
      .toBe(DEFAULT_NEW_TEMPLATE_TITLE);
  });
});
