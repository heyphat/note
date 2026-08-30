import { describe, it, expect } from 'vitest';
import { sanitizeNoteTitle } from './browser-fs';

describe('sanitizeNoteTitle', () => {
  it('preserves human-readable titles unchanged', () => {
    expect(sanitizeNoteTitle('Hello World')).toBe('Hello World');
    expect(sanitizeNoteTitle('Daily standup notes')).toBe('Daily standup notes');
  });

  it('replaces path separators with spaces', () => {
    expect(sanitizeNoteTitle('My / Notes')).toBe('My Notes');
    expect(sanitizeNoteTitle('a\\b')).toBe('a b');
  });

  it('replaces filesystem-reserved chars with spaces', () => {
    expect(sanitizeNoteTitle('a:b*c?d"e<f>g|h')).toBe('a b c d e f g h');
  });

  it('strips control characters', () => {
    expect(sanitizeNoteTitle('foo\x00bar\x07baz')).toBe('foobarbaz');
  });

  it('collapses runs of whitespace', () => {
    expect(sanitizeNoteTitle('  too    many   spaces  ')).toBe('too many spaces');
  });

  it('strips trailing dots and spaces', () => {
    expect(sanitizeNoteTitle('foo. ')).toBe('foo');
    expect(sanitizeNoteTitle('foo...')).toBe('foo');
  });

  it('strips leading dots so files do not become hidden', () => {
    expect(sanitizeNoteTitle('.hidden')).toBe('hidden');
    expect(sanitizeNoteTitle('..nope')).toBe('nope');
  });

  it('prefixes Windows reserved names with an underscore', () => {
    expect(sanitizeNoteTitle('CON')).toBe('_CON');
    expect(sanitizeNoteTitle('com1')).toBe('_com1');
    expect(sanitizeNoteTitle('LPT9')).toBe('_LPT9');
    expect(sanitizeNoteTitle('aux')).toBe('_aux');
  });

  it('keeps unicode and emoji', () => {
    expect(sanitizeNoteTitle('🚀 Plan')).toBe('🚀 Plan');
    expect(sanitizeNoteTitle('café résumé')).toBe('café résumé');
  });

  it('normalizes to NFC so visually identical titles converge', () => {
    // NFD-encoded "café" (e + combining acute) should normalize to NFC "café"
    const nfd = 'café';
    const nfc = 'café';
    expect(sanitizeNoteTitle(nfd)).toBe(nfc);
  });

  it('caps at 120 UTF-8 bytes, trimming at code-point boundaries', () => {
    const long = 'a'.repeat(200);
    const result = sanitizeNoteTitle(long);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(120);
    expect(result).toBe('a'.repeat(120));
  });

  it('caps multi-byte titles without splitting code points', () => {
    // 🚀 is 4 bytes in UTF-8. 40 of them = 160 bytes; cap should trim to <=120.
    const rocket = '🚀'.repeat(40);
    const result = sanitizeNoteTitle(rocket);
    const bytes = new TextEncoder().encode(result).length;
    expect(bytes).toBeLessThanOrEqual(120);
    // Whatever the trim count is, every code point must be a complete 🚀.
    // Every code point must be a complete 🚀 (4 UTF-8 bytes). Array.from
    // splits the string into code points, so any orphaned surrogate would
    // surface as a separate single-char entry.
    expect(Array.from(result).every(cp => cp === '🚀')).toBe(true);
  });

  it('returns "Untitled" for empty / whitespace / pure-stripped input', () => {
    expect(sanitizeNoteTitle('')).toBe('Untitled');
    expect(sanitizeNoteTitle('   ')).toBe('Untitled');
    expect(sanitizeNoteTitle('///')).toBe('Untitled');
    expect(sanitizeNoteTitle('....')).toBe('Untitled');
    expect(sanitizeNoteTitle('\x00\x01\x02')).toBe('Untitled');
  });

  it('handles null-ish inputs without throwing', () => {
    expect(sanitizeNoteTitle(undefined as unknown as string)).toBe('Untitled');
    expect(sanitizeNoteTitle(null as unknown as string)).toBe('Untitled');
  });
});
