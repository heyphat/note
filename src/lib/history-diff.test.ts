import { describe, expect, it } from 'vitest';
import { createHistoryDiff } from './history-diff';

describe('createHistoryDiff', () => {
  it('diffs a middle snapshot against the previous snapshot', () => {
    const diff = createHistoryDiff(
      '---\nid: note-1\n---\nalpha\nshared\n',
      '---\nid: note-1\n---\nalpha\nbeta\nshared\n',
      { oldLabel: 'older', newLabel: 'selected' },
    );

    expect(diff.hasChanges).toBe(true);
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0].lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'add', text: 'beta', newNumber: 2 }),
      ]),
    );
  });

  it('treats the oldest snapshot as a diff against an empty base', () => {
    const diff = createHistoryDiff('', '---\nid: note-1\n---\n# Start\n', {
      oldLabel: 'Initial version',
      newLabel: 'selected',
    });

    expect(diff.hasChanges).toBe(true);
    expect(diff.hunks[0].header).toBe('@@ -1,0 +1,1 @@');
    expect(diff.hunks[0].lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'add', text: '# Start', newNumber: 1 }),
      ]),
    );
  });

  it('strips frontmatter before diffing', () => {
    const diff = createHistoryDiff(
      '---\nid: note-1\ncreatedAt: 1\n---\nalpha\n',
      '---\nid: note-1\ncreatedAt: 2\n---\nbeta\n',
    );

    const visibleLines = diff.hunks.flatMap(hunk => hunk.lines.map(line => line.text));
    expect(visibleLines).toContain('alpha');
    expect(visibleLines).toContain('beta');
    expect(visibleLines).not.toContain('id: note-1');
    expect(visibleLines).not.toContain('createdAt: 2');
  });

  it('normalizes line endings before diffing', () => {
    const diff = createHistoryDiff(
      '---\nid: note-1\n---\nalpha\r\nbeta\r\n',
      '---\nid: note-1\n---\nalpha\nbeta\n',
    );

    expect(diff.hasChanges).toBe(false);
    expect(diff.hunks).toHaveLength(0);
  });

  it('returns an empty diff when the visible bodies are identical', () => {
    const diff = createHistoryDiff(
      '---\nid: note-1\n---\nalpha\nbeta\n',
      '---\nid: note-1\n---\nalpha\nbeta\n',
    );

    expect(diff.hasChanges).toBe(false);
    expect(diff.hunks).toHaveLength(0);
  });
});
