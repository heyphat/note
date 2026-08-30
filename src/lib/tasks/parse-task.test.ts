import { describe, it, expect } from 'vitest';
import { parseTask } from './parse-task';
import { serializeTask } from './serialize-task';

const SPEC_EXAMPLE = `---
id: task-2026-05-04-q2-proposal
title: Draft the Q2 proposal
status: in-progress
priority: high
due: 2026-05-10
scheduled: 2026-05-08
contexts:
  - "@work"
  - "@deep-focus"
projects:
  - "[[Q2 Launch]]"
tags:
  - drafting
  - billable
timeEstimate: 240
timeEntries:
  - startTime: 2026-05-04T10:00:00Z
    endTime: 2026-05-04T11:30:00Z
    description: outline + intro
recurrence: DTSTART:20260508;FREQ=WEEKLY;BYDAY=FR
recurrence_anchor: scheduled
complete_instances: []
skipped_instances: []
blockedBy:
  - uid: "[[task-2026-05-01-research]]"
    reltype: FINISHTOSTART
    gap: P1D
reminders:
  - id: rem_day_before
    type: relative
    relatedTo: due
    offset: -P1D
  - id: rem_kickoff
    type: absolute
    absoluteTime: 2026-05-08T09:00:00Z
dateCreated: 2026-05-01T09:00:00Z
dateModified: 2026-05-04T11:30:00Z
custom_field_we_dont_understand: preserved on round-trip
---

# Notes

- Outline: problem statement, market sizing, ask, milestones.
`;

describe('parseTask', () => {
  it('parses the full spec example', () => {
    const { task, issues } = parseTask(SPEC_EXAMPLE);
    expect(issues).toEqual([]);
    expect(task.id).toBe('task-2026-05-04-q2-proposal');
    expect(task.title).toBe('Draft the Q2 proposal');
    expect(task.status).toBe('in-progress');
    expect(task.priority).toBe('high');
    expect(task.due).toBe('2026-05-10');
    expect(task.scheduled).toBe('2026-05-08');
    expect(task.contexts).toEqual(['@work', '@deep-focus']);
    expect(task.projects).toEqual(['[[Q2 Launch]]']);
    expect(task.tags).toEqual(['drafting', 'billable']);
    expect(task.time_estimate).toBe(240);
    expect(task.time_entries).toEqual([
      {
        startTime: '2026-05-04T10:00:00Z',
        endTime: '2026-05-04T11:30:00Z',
        description: 'outline + intro',
      },
    ]);
    expect(task.recurrence).toBe('DTSTART:20260508;FREQ=WEEKLY;BYDAY=FR');
    expect(task.recurrence_anchor).toBe('scheduled');
    expect(task.complete_instances).toEqual([]);
    expect(task.blocked_by).toEqual([
      { uid: '[[task-2026-05-01-research]]', reltype: 'FINISHTOSTART', gap: 'P1D' },
    ]);
    expect(task.reminders).toEqual([
      { id: 'rem_day_before', type: 'relative', relatedTo: 'due', offset: '-P1D' },
      { id: 'rem_kickoff', type: 'absolute', absoluteTime: '2026-05-08T09:00:00Z' },
    ]);
    expect(task.date_created).toBe('2026-05-01T09:00:00Z');
    expect(task.date_modified).toBe('2026-05-04T11:30:00Z');
    expect(task._frontmatter.custom_field_we_dont_understand).toBe('preserved on round-trip');
  });

  it('round-trips losslessly', () => {
    const { task } = parseTask(SPEC_EXAMPLE);
    const out = serializeTask(task);
    const { task: roundTripped } = parseTask(out);
    expect(roundTripped.title).toBe(task.title);
    expect(roundTripped.tags).toEqual(task.tags);
    expect(roundTripped.blocked_by).toEqual(task.blocked_by);
    expect(roundTripped.reminders).toEqual(task.reminders);
    // Unknown fields survive (spec §2.7).
    expect(roundTripped._frontmatter.custom_field_we_dont_understand).toBe('preserved on round-trip');
  });

  it('falls back to alias keys (snake_case ↔ camelCase)', () => {
    const raw = `---
title: Aliased
status: open
date_created: 2026-01-01T00:00:00Z
date_modified: 2026-01-01T00:00:00Z
---
`;
    const { task, issues } = parseTask(raw);
    expect(task.date_created).toBe('2026-01-01T00:00:00Z');
    expect(issues).toEqual([]);
  });

  it('emits alias_conflict_ignored when both forms coexist', () => {
    const raw = `---
title: Aliased
status: open
dateCreated: 2026-02-01T00:00:00Z
date_created: 2025-02-01T00:00:00Z
dateModified: 2026-02-01T00:00:00Z
---
`;
    const { task, issues } = parseTask(raw);
    expect(task.date_created).toBe('2026-02-01T00:00:00Z'); // canonical wins
    expect(issues.some(i => i.code === 'alias_conflict_ignored')).toBe(true);
  });

  it('returns empty title/status/date_created when frontmatter missing', () => {
    const { task } = parseTask('# just a heading\n');
    expect(task.title).toBe('');
    expect(task.status).toBe('');
    expect(task.date_created).toBe('');
  });

  it('coerces a comma-separated string into a string array (legacy form)', () => {
    const raw = `---
title: Foo
status: open
tags: a, b, c
dateCreated: 2026-01-01T00:00:00Z
dateModified: 2026-01-01T00:00:00Z
---
`;
    const { task } = parseTask(raw);
    expect(task.tags).toEqual(['a', 'b', 'c']);
  });

  it('drops malformed time_entry items but keeps valid ones', () => {
    const raw = `---
title: Foo
status: open
dateCreated: 2026-01-01T00:00:00Z
dateModified: 2026-01-01T00:00:00Z
timeEntries:
  - startTime: 2026-01-01T10:00:00Z
  - endTime: 2026-01-01T11:00:00Z   # missing startTime
  - startTime: 2026-01-01T12:00:00Z
    endTime: 2026-01-01T13:00:00Z
---
`;
    const { task } = parseTask(raw);
    expect(task.time_entries).toHaveLength(2);
    expect(task.time_entries?.[0]?.startTime).toBe('2026-01-01T10:00:00Z');
    expect(task.time_entries?.[1]?.endTime).toBe('2026-01-01T13:00:00Z');
  });
});

describe('serializeTask', () => {
  it('writes only canonical keys (no alias keys appear)', () => {
    const raw = `---
title: Foo
status: open
date_created: 2026-01-01T00:00:00Z
date_modified: 2026-01-01T00:00:00Z
---
`;
    const { task } = parseTask(raw);
    const out = serializeTask(task);
    expect(out).toContain('dateCreated:');
    expect(out).not.toContain('date_created:');
  });

  it('preserves unknown fields by default (spec §2.7)', () => {
    const raw = `---
title: Foo
status: open
dateCreated: 2026-01-01T00:00:00Z
dateModified: 2026-01-01T00:00:00Z
customClient: ACME
---
`;
    const { task } = parseTask(raw);
    const out = serializeTask(task);
    expect(out).toContain('customClient: ACME');
  });

  it('drops unknown fields under explicit normalization', () => {
    const raw = `---
title: Foo
status: open
dateCreated: 2026-01-01T00:00:00Z
dateModified: 2026-01-01T00:00:00Z
customClient: ACME
---
`;
    const { task } = parseTask(raw);
    const out = serializeTask(task, { normalizeStripUnknown: true });
    expect(out).not.toContain('customClient');
  });

  it('omits empty arrays from output', () => {
    const raw = `---
title: Foo
status: open
tags: []
dateCreated: 2026-01-01T00:00:00Z
dateModified: 2026-01-01T00:00:00Z
---
`;
    const { task } = parseTask(raw);
    const out = serializeTask(task);
    expect(out).not.toContain('tags:');
  });
});
