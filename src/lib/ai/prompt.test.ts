import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, type PriorToolFailure } from './prompt';

describe('buildSystemPrompt', () => {
  it('omits the failures section when none are passed', () => {
    const out = buildSystemPrompt(
      { noteId: 'n.md', title: 'N', text: 'body' },
      { withEditTools: true },
    );
    expect(out).not.toContain('## Previous tool failures');
  });

  it('includes failed edit_note find/replace and the error verbatim', () => {
    const failures: PriorToolFailure[] = [
      {
        toolName: 'edit_note',
        error: 'The `find` string was not found in the note.',
        input: { find: '- **Decision notes:**\n```', replace: 'AI reflection text' },
      },
    ];
    const out = buildSystemPrompt(
      { noteId: 'n.md', title: 'N', text: 'body' },
      { withEditTools: true, recentFailures: failures },
    );
    expect(out).toContain('## Previous tool failures');
    expect(out).toContain('### Failure 1: edit_note');
    expect(out).toContain('Error: The `find` string was not found in the note.');
    expect(out).toContain('- **Decision notes:**');
    expect(out).toContain('AI reflection text');
    // Steers the model away from re-emitting the same broken find.
    expect(out).toMatch(/do NOT repeat/i);
  });

  it('includes multiple failures with sequential headers', () => {
    const failures: PriorToolFailure[] = [
      { toolName: 'edit_note', error: 'e1', input: { find: 'a', replace: 'b' } },
      { toolName: 'rewrite_note', error: 'e2', input: { new_content: 'NEW' } },
    ];
    const out = buildSystemPrompt(
      { noteId: 'n.md', text: 'x' },
      { withEditTools: true, recentFailures: failures },
    );
    expect(out).toContain('### Failure 1: edit_note');
    expect(out).toContain('### Failure 2: rewrite_note');
    expect(out).toContain('NEW');
  });

  it('truncates very long find strings to keep the prompt bounded', () => {
    const huge = 'X'.repeat(5_000);
    const failures: PriorToolFailure[] = [
      { toolName: 'edit_note', error: 'e', input: { find: huge, replace: 'r' } },
    ];
    const out = buildSystemPrompt(
      { noteId: 'n.md', text: 'x' },
      { withEditTools: true, recentFailures: failures },
    );
    // Original 5_000-char find isn't in there as-is; truncation suffix is.
    expect(out).not.toContain(huge);
    expect(out).toMatch(/truncated/i);
  });

  it('handles create_note failures with title + folder + content preview', () => {
    const failures: PriorToolFailure[] = [
      {
        toolName: 'create_note',
        error: 'permission denied',
        input: { title: 'Daily', folder: 'Journal/2026', content: 'today...' },
      },
    ];
    const out = buildSystemPrompt(
      { noteId: 'n.md', text: 'x' },
      { withEditTools: true, recentFailures: failures },
    );
    expect(out).toContain('### Failure 1: create_note');
    expect(out).toContain('Title: `Daily`');
    expect(out).toContain('Journal/2026');
    expect(out).toContain('today...');
  });
});
