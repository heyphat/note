import { describe, expect, it } from 'vitest';
import { detectDuePhrase } from './parse-due-phrase';

// Reference "today" pinned to a Wednesday so weekday math is unambiguous.
const TODAY = new Date(2026, 4, 6); // 2026-05-06 (Wed)

function detect(text: string) {
  return detectDuePhrase(text, TODAY);
}

describe('detectDuePhrase', () => {
  it('returns null for empty / non-matching input', () => {
    expect(detect('')).toBeNull();
    expect(detect('buy milk')).toBeNull();
    expect(detect('the quick brown fox')).toBeNull();
  });

  it('matches today / tonight / tomorrow / yesterday', () => {
    expect(detect('do this today')?.iso).toBe('2026-05-06');
    expect(detect('finish tonight')?.iso).toBe('2026-05-06');
    expect(detect('ship tomorrow')?.iso).toBe('2026-05-07');
    expect(detect('yesterday was busy')?.iso).toBe('2026-05-05');
  });

  it('matches "in N days/weeks/months" with numerals and word forms', () => {
    expect(detect('check in 2 days')?.iso).toBe('2026-05-08');
    expect(detect('respond in three days')?.iso).toBe('2026-05-09');
    expect(detect('in a week')?.iso).toBe('2026-05-13');
    expect(detect('book in 1 week')?.iso).toBe('2026-05-13');
    expect(detect('schedule in 2 weeks')?.iso).toBe('2026-05-20');
    expect(detect('in 1 month')?.iso).toBe('2026-06-06');
  });

  it('matches "next week" / "next month"', () => {
    expect(detect('plan next week')?.iso).toBe('2026-05-13');
    expect(detect('review next month')?.iso).toBe('2026-06-06');
  });

  it('matches a bare weekday — today if same DOW, else upcoming', () => {
    // TODAY is Wed.
    expect(detect('meet wednesday')?.iso).toBe('2026-05-06'); // today
    expect(detect('lunch friday')?.iso).toBe('2026-05-08');
    expect(detect('call monday')?.iso).toBe('2026-05-11');
    expect(detect('sync sunday')?.iso).toBe('2026-05-10');
  });

  it('treats "next <weekday>" as strictly after today', () => {
    expect(detect('next wednesday')?.iso).toBe('2026-05-13');
    expect(detect('next friday')?.iso).toBe('2026-05-08');
  });

  it('matches ISO YYYY-MM-DD', () => {
    expect(detect('ship by 2026-12-31')?.iso).toBe('2026-12-31');
    expect(detect('2026-13-01 nope')).toBeNull(); // invalid month
  });

  it('matches M/D and M/D/YY[YY]', () => {
    expect(detect('on 7/4')?.iso).toBe('2026-07-04');
    expect(detect('on 12/31/26')?.iso).toBe('2026-12-31');
    expect(detect('on 12/31/2026')?.iso).toBe('2026-12-31');
    expect(detect('13/40 nope')).toBeNull();
  });

  it('returns the right-most match when multiple phrases are present', () => {
    // "tomorrow" appears later than "today" → tomorrow wins.
    const m = detect('today or tomorrow');
    expect(m?.iso).toBe('2026-05-07');
    expect(m?.text.toLowerCase()).toBe('tomorrow');
  });

  it('reports start/end positions of the matched substring', () => {
    const m = detect('buy milk tomorrow');
    expect(m?.start).toBe(9);
    expect(m?.end).toBe(17);
    expect(m?.text).toBe('tomorrow');
  });

  it('is case-insensitive', () => {
    expect(detect('Tomorrow')?.iso).toBe('2026-05-07');
    expect(detect('Next Friday')?.iso).toBe('2026-05-08');
  });
});
