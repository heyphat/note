import { describe, it, expect } from 'vitest';
import { parseChatBody, serializeChatBody } from './chat-body';
import type { ChatTurn } from './types';

describe('chat-body', () => {
  it('round-trips a simple two-turn thread', () => {
    const msgs: ChatTurn[] = [
      { role: 'user', content: 'hi there' },
      { role: 'assistant', content: 'hello!' },
    ];
    const serialized = serializeChatBody(msgs);
    expect(parseChatBody(serialized)).toEqual(msgs);
  });

  it('preserves markdown inside turns, including headings and fences', () => {
    const msgs: ChatTurn[] = [
      { role: 'user', content: '# my heading\n\nsome `code` and a list:\n\n- a\n- b' },
      { role: 'assistant', content: '```js\nconsole.log(1);\n```' },
    ];
    const serialized = serializeChatBody(msgs);
    const parsed = parseChatBody(serialized);
    expect(parsed).toEqual(msgs);
  });

  it('ignores preamble before the first turn marker', () => {
    const body = 'some stray text\nmore stray\n## user\n\nreal message\n';
    const parsed = parseChatBody(body);
    expect(parsed).toEqual([{ role: 'user', content: 'real message' }]);
  });

  it('tolerates extra blank lines around turns', () => {
    const body = '\n\n## user\n\n\n\nhi\n\n\n\n## assistant\n\n\nhello\n\n\n';
    const parsed = parseChatBody(body);
    expect(parsed).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('returns empty list for empty / turnless body', () => {
    expect(parseChatBody('')).toEqual([]);
    expect(parseChatBody('just some random text\n')).toEqual([]);
  });

  it('handles a system turn', () => {
    const msgs: ChatTurn[] = [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'ok' },
    ];
    expect(parseChatBody(serializeChatBody(msgs))).toEqual(msgs);
  });

  it('does NOT treat a literal `## user` inside content as a turn (limitation)', () => {
    // Known limitation: `## user` inside content is indistinguishable from a
    // turn marker. Documented here so future readers know the trade-off.
    // If this bites in practice, promote to a literal sentinel like
    //   <!-- chat-turn: user --> ... but for now the H2-headers-as-turns
    // format keeps files human-readable.
    const userContent = 'look at this prefix:\n\n## user\n\nthat was literal';
    const serialized = serializeChatBody([{ role: 'user', content: userContent }]);
    const parsed = parseChatBody(serialized);
    // The second `## user` is parsed as a new turn; the first turn stops early.
    expect(parsed.length).toBe(2);
    expect(parsed[0].content).toBe('look at this prefix:');
    expect(parsed[1].content).toBe('that was literal');
  });
});
