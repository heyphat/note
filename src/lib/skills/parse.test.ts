import { describe, it, expect } from 'vitest';
import { parseSkillMarkdown } from './parse';

const valid = `---
name: weekly-recap
description: Triggered when the user asks for a weekly recap of their daily notes.
---

Walk the daily notes from the last 7 days and synthesize a recap.
`;

describe('parseSkillMarkdown', () => {
  it('accepts a well-formed skill', () => {
    const r = parseSkillMarkdown(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skill.name).toBe('weekly-recap');
      expect(r.skill.description).toMatch(/weekly recap/);
      expect(r.skill.content.trim()).toMatch(/^Walk the daily notes/);
    }
  });

  it('accepts Anthropic-style frontmatter without a `type` field', () => {
    const raw = `---\nname: pdf\ndescription: Use this to fill PDF forms.\n---\nbody`;
    const r = parseSkillMarkdown(raw);
    expect(r.ok).toBe(true);
  });

  it('rejects missing name', () => {
    const raw = `---\ndescription: y\n---\nbody`;
    const r = parseSkillMarkdown(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/name/);
  });

  it('rejects missing description', () => {
    const raw = `---\nname: x\n---\nbody`;
    const r = parseSkillMarkdown(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/description/);
  });

  it('rejects empty input', () => {
    expect(parseSkillMarkdown('').ok).toBe(false);
    expect(parseSkillMarkdown('  \n  ').ok).toBe(false);
  });

  it('rejects an excessively long name', () => {
    const longName = 'x'.repeat(200);
    const raw = `---\nname: ${longName}\ndescription: y\n---\nbody`;
    const r = parseSkillMarkdown(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too long/);
  });
});
