import { describe, expect, it } from 'vitest';
import { extractTags } from './tags';

describe('extractTags', () => {
  it('extracts visible inline-code chips from a Tags section', () => {
    const body = [
      '## Tags',
      '`#momentum` `#VWAP` `#build-up` `#breakout` `#price-action`',
      '',
      '## Notes',
      '`#not-a-tag` outside the tag section is just code.',
    ].join('\n');

    expect(extractTags(body)).toEqual([
      'breakout',
      'build-up',
      'momentum',
      'price-action',
      'vwap',
    ]);
  });

  it('still ignores inline-code hashtags outside a Tags section', () => {
    expect(extractTags('Use `#literal` in examples, but index #real.')).toEqual(['real']);
  });

  it('ignores fenced code inside a Tags section', () => {
    const body = [
      '# Demo',
      '## Tags',
      '```',
      '#code',
      '```',
      '`#real`',
    ].join('\n');

    expect(extractTags(body)).toEqual(['real']);
  });
});
