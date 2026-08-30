import { describe, it, expect } from 'vitest';
import {
  truncateCodeBlocks,
  headStrategy,
  headTailStrategy,
  type CodeBlockRule,
} from './code-block-truncation';

describe('truncateCodeBlocks', () => {
  it('passes through small code blocks untouched', () => {
    const text = 'prose\n\n```js\nconst x = 1;\n```\n\nmore prose';
    expect(truncateCodeBlocks(text)).toBe(text);
  });

  it('shrinks an oversized default-language block with the head strategy', () => {
    const big = 'x'.repeat(10_000);
    const text = `intro\n\n\`\`\`js\n${big}\n\`\`\`\nouter`;
    const out = truncateCodeBlocks(text);
    expect(out.length).toBeLessThan(text.length);
    expect(out).toMatch(/truncated/);
    expect(out).toContain('intro');
    expect(out).toContain('outer');
    expect(out).toContain('```js');
  });

  it('uses head+tail for csv so header and most-recent rows both survive', () => {
    const header = 'timestamp,open,high,low,close';
    const rows = Array.from({ length: 2_000 }, (_, i) => `2026-01-01 ${i},1,2,3,4`);
    const last = 'TAIL_MARKER,9,9,9,9';
    const csv = [header, ...rows, last].join('\n');
    const text = `before\n\n\`\`\`csv\n${csv}\n\`\`\`\nafter`;
    const out = truncateCodeBlocks(text);
    expect(out).toContain(header);
    expect(out).toContain(last);
    expect(out).toMatch(/truncated from middle/);
    expect(out.length).toBeLessThan(text.length);
  });

  it('preserves prose between multiple oversized blocks', () => {
    const big = 'y'.repeat(8_000);
    const text = `\`\`\`js\n${big}\n\`\`\`\n\nMIDDLE_PROSE\n\n\`\`\`csv\n${big}\n\`\`\``;
    const out = truncateCodeBlocks(text);
    expect(out).toContain('MIDDLE_PROSE');
    expect(out.match(/truncated/g)?.length).toBe(2);
  });

  it('keeps the original language tag on the rewritten fence', () => {
    const big = 'z'.repeat(6_000);
    const text = `\`\`\`python\n${big}\n\`\`\``;
    const out = truncateCodeBlocks(text);
    expect(out).toMatch(/^```python\n/);
    expect(out).toMatch(/```$/);
  });

  it('lets callers swap in custom rules', () => {
    const rules: CodeBlockRule[] = [
      { match: lang => lang === 'json', maxChars: 50, strategy: headStrategy },
      { match: () => true, maxChars: 1_000_000, strategy: headStrategy },
    ];
    const big = 'a'.repeat(500);
    const text = `\`\`\`json\n${big}\n\`\`\`\n\`\`\`js\n${big}\n\`\`\``;
    const out = truncateCodeBlocks(text, rules);
    // json shrunk, js untouched
    expect(out).toMatch(/```json[\s\S]*truncated/);
    expect(out).toContain(`\`\`\`js\n${big}\n\`\`\``);
  });

  it('handles a fence with no language tag (catch-all rule)', () => {
    const big = 'q'.repeat(8_000);
    const text = `\`\`\`\n${big}\n\`\`\``;
    const out = truncateCodeBlocks(text);
    expect(out).toMatch(/truncated/);
  });
});

describe('headStrategy', () => {
  it('cuts at a line boundary when one is reachable', () => {
    const body = 'aaaa\nbbbb\ncccc\ndddd\neeee';
    const out = headStrategy(body, 12);
    expect(out.startsWith('aaaa\nbbbb')).toBe(true);
    expect(out).toMatch(/truncated/);
  });

  it('returns input unchanged when within budget', () => {
    expect(headStrategy('short', 100)).toBe('short');
  });
});

describe('headTailStrategy', () => {
  it('keeps both ends and reports the gap', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line${i}`);
    const body = lines.join('\n');
    const out = headTailStrategy(body, 200);
    expect(out).toContain('line0');
    expect(out).toContain('line199');
    expect(out).toMatch(/truncated from middle/);
  });

  it('returns input unchanged when within budget', () => {
    expect(headTailStrategy('short', 100)).toBe('short');
  });
});
