import { describe, it, expect } from 'vitest';
import {
  canonicalizeDtstart,
  effectiveInstanceState,
  nextOccurrence,
  parseRecurrenceString,
  RecurrenceParseError,
  MissingRecurrenceSeedError,
  resolveSeed,
  rewriteDtstart,
} from './recurrence';

describe('parseRecurrenceString', () => {
  it('parses a bare RRULE', () => {
    const r = parseRecurrenceString('FREQ=DAILY');
    expect(r.dtstart).toBeUndefined();
    expect(r.rruleString).toBe('FREQ=DAILY');
  });

  it('parses DTSTART + RRULE in date form', () => {
    const r = parseRecurrenceString('DTSTART:20260220;FREQ=WEEKLY;BYDAY=FR');
    expect(r.dtstart).toBe('20260220');
    expect(r.dtstartIsDateTime).toBe(false);
    expect(r.rruleString).toBe('FREQ=WEEKLY;BYDAY=FR');
  });

  it('parses DTSTART + RRULE in UTC datetime form', () => {
    const r = parseRecurrenceString('DTSTART:20260220T093000Z;FREQ=DAILY');
    expect(r.dtstartIsDateTime).toBe(true);
  });

  it('strips an inbound RRULE: prefix', () => {
    const r = parseRecurrenceString('RRULE:FREQ=DAILY');
    expect(r.rruleString).toBe('FREQ=DAILY');
  });

  it('throws RecurrenceParseError on malformed input', () => {
    expect(() => parseRecurrenceString('NOT_A_RULE')).toThrow(RecurrenceParseError);
    expect(() => parseRecurrenceString('DTSTART:20261301;FREQ=DAILY')).toThrow(RecurrenceParseError);
    expect(() => parseRecurrenceString('')).toThrow(RecurrenceParseError);
  });
});

describe('resolveSeed', () => {
  it('uses DTSTART when present', () => {
    const seed = resolveSeed({ recurrence: 'DTSTART:20260220;FREQ=DAILY' });
    expect(seed.token).toBe('20260220');
    expect(seed.isDateTime).toBe(false);
  });

  it('falls back to scheduled', () => {
    const seed = resolveSeed({
      recurrence: 'FREQ=DAILY',
      scheduled: '2026-02-20',
    });
    expect(seed.token).toBe('20260220');
  });

  it('falls back to date_created when scheduled is absent', () => {
    const seed = resolveSeed({
      recurrence: 'FREQ=DAILY',
      date_created: '2026-02-20T09:00:00Z',
    });
    expect(seed.isDateTime).toBe(true);
    expect(seed.token).toBe('20260220T090000Z');
  });

  it('throws MissingRecurrenceSeedError when nothing resolves', () => {
    expect(() => resolveSeed({ recurrence: 'FREQ=DAILY' }))
      .toThrow(MissingRecurrenceSeedError);
  });
});

describe('canonicalizeDtstart', () => {
  it('inserts DTSTART before RRULE when missing (§4.4.5)', () => {
    const result = canonicalizeDtstart({
      recurrence: 'FREQ=WEEKLY;BYDAY=FR',
      scheduled: '2026-02-20',
    });
    expect(result).toBe('DTSTART:20260220;FREQ=WEEKLY;BYDAY=FR');
  });

  it('leaves DTSTART unchanged when already present', () => {
    const input = 'DTSTART:20260220;FREQ=DAILY';
    expect(canonicalizeDtstart({ recurrence: input })).toBe(input);
  });
});

describe('rewriteDtstart', () => {
  it('rewrites DTSTART to a date target', () => {
    const result = rewriteDtstart('DTSTART:20260220;FREQ=DAILY', '2026-03-01');
    expect(result).toBe('DTSTART:20260301;FREQ=DAILY');
  });

  it('rewrites DTSTART to a datetime target when forced', () => {
    const result = rewriteDtstart('DTSTART:20260220;FREQ=DAILY', '2026-03-01T15:30:00Z', true);
    expect(result).toBe('DTSTART:20260301T153000Z;FREQ=DAILY');
  });

  it('inserts DTSTART when missing', () => {
    const result = rewriteDtstart('FREQ=DAILY', '2026-03-01');
    expect(result).toBe('DTSTART:20260301;FREQ=DAILY');
  });
});

describe('nextOccurrence — scheduled anchor', () => {
  it('returns the next weekly Friday after `after`', () => {
    const next = nextOccurrence({
      recurrence: 'DTSTART:20260206;FREQ=WEEKLY;BYDAY=FR',
      recurrence_anchor: 'scheduled',
      after: new Date('2026-02-09T00:00:00Z'),
    });
    expect(next).toBe('2026-02-13');
  });

  it('skips dates in skipped_instances', () => {
    const next = nextOccurrence({
      recurrence: 'DTSTART:20260220;FREQ=DAILY',
      recurrence_anchor: 'scheduled',
      after: new Date('2026-02-19T00:00:00Z'),
      skipped_instances: ['2026-02-20', '2026-02-21'],
    });
    expect(next).toBe('2026-02-22');
  });
});

describe('nextOccurrence — completion anchor (§4.4.4)', () => {
  it('chooses the first occurrence strictly after DTSTART', () => {
    const next = nextOccurrence({
      recurrence: 'DTSTART:20260220;FREQ=DAILY',
      recurrence_anchor: 'completion',
    });
    expect(next).toBe('2026-02-21');
  });

  it('does not consult complete_instances for exclusion (§4.4.4 step 2)', () => {
    // Even if 2026-02-21 is "completed", completion-anchor mode walks forward
    // from DTSTART and picks 2026-02-21 as the next candidate.
    const next = nextOccurrence({
      recurrence: 'DTSTART:20260220;FREQ=DAILY',
      recurrence_anchor: 'completion',
    });
    expect(next).toBe('2026-02-21');
  });

  it('does respect skipped_instances (§4.4.4 step 3)', () => {
    const next = nextOccurrence({
      recurrence: 'DTSTART:20260220;FREQ=DAILY',
      recurrence_anchor: 'completion',
      skipped_instances: ['2026-02-21', '2026-02-22'],
    });
    expect(next).toBe('2026-02-23');
  });
});

describe('effectiveInstanceState', () => {
  it('returns completed when the day is in complete_instances', () => {
    expect(effectiveInstanceState({ complete_instances: ['2026-02-20'] }, '2026-02-20')).toBe('completed');
  });

  it('returns skipped when the day is in skipped_instances', () => {
    expect(effectiveInstanceState({ skipped_instances: ['2026-02-21'] }, '2026-02-21')).toBe('skipped');
  });

  it('returns unresolved otherwise', () => {
    expect(effectiveInstanceState({}, '2026-02-22')).toBe('unresolved');
  });
});
