// Recurrence engine per TaskNotes spec §4.
//
// The TaskNotes recurrence string is RRULE-derived but not a full RFC 5545
// content line. Canonical form:
//
//   DTSTART:YYYYMMDD;FREQ=...                    (date-only DTSTART)
//   DTSTART:YYYYMMDDTHHMMSSZ;FREQ=...            (UTC datetime DTSTART)
//   FREQ=...                                     (no DTSTART; seed resolved §4.4.1)
//
// Implementations MAY accept inbound `RRULE:` prefixes / multi-line iCalendar
// fragments for compatibility, but canonical writes use the combined single-
// field form.
//
// We use the `rrule` npm package for the heavy lifting (RRULE parsing, BYDAY,
// BYMONTHDAY, occurrence iteration). The shape conversions are local to this
// module; nothing else in `lib/tasks/*` knows about rrule.

import { RRule, rrulestr } from 'rrule';
import type { RecurrenceAnchor, SpecDate, SpecDateOrDateTime, Task } from './spec-types';

const DTSTART_RE = /^DTSTART:([^;]+);(.*)$/;
const ICAL_DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const ICAL_DATETIME_UTC_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

export interface ParsedRecurrence {
  /** The DTSTART portion if present (raw `YYYYMMDD` or `YYYYMMDDTHHMMSSZ` string). */
  dtstart?: string;
  /** Whether DTSTART was a date or a datetime. */
  dtstartIsDateTime: boolean;
  /** The RRULE parameter portion (everything after `DTSTART:...;` or the whole input). */
  rruleString: string;
}

export class RecurrenceParseError extends Error {
  readonly code = 'invalid_recurrence_rule';
  constructor(message: string) {
    super(message);
    this.name = 'RecurrenceParseError';
  }
}

export class MissingRecurrenceSeedError extends Error {
  readonly code = 'missing_recurrence_seed';
  constructor(message = 'recurrence has no resolvable seed/start date') {
    super(message);
    this.name = 'MissingRecurrenceSeedError';
  }
}

/**
 * Split the canonical TaskNotes recurrence string into its DTSTART and RRULE
 * parameter portions. Throws `RecurrenceParseError` for malformed input.
 *
 * Inbound compatibility: a leading `RRULE:` is stripped silently.
 */
export function parseRecurrenceString(input: string): ParsedRecurrence {
  if (!input || typeof input !== 'string') {
    throw new RecurrenceParseError('recurrence is empty');
  }
  let s = input.trim();
  // Strip an inbound `RRULE:` prefix if the user pasted iCalendar form.
  if (s.toUpperCase().startsWith('RRULE:')) s = s.slice(6);

  const m = DTSTART_RE.exec(s);
  if (m) {
    const dtstart = m[1];
    const rruleString = m[2];
    const dtstartIsDateTime = ICAL_DATETIME_UTC_RE.test(dtstart);
    if (!dtstartIsDateTime && !ICAL_DATE_RE.test(dtstart)) {
      throw new RecurrenceParseError(`DTSTART must be YYYYMMDD or YYYYMMDDTHHMMSSZ: ${dtstart}`);
    }
    if (!isValidIcalDate(dtstart)) {
      throw new RecurrenceParseError(`DTSTART is not a valid calendar date: ${dtstart}`);
    }
    if (!rruleString) {
      throw new RecurrenceParseError('recurrence missing RRULE parameters');
    }
    // Validate the RRULE portion via rrulestr; any throw is reported as our error.
    try {
      rrulestr(`RRULE:${rruleString}`);
    } catch (err) {
      throw new RecurrenceParseError(err instanceof Error ? err.message : String(err));
    }
    return { dtstart, dtstartIsDateTime, rruleString };
  }

  // No DTSTART portion — entire input must be RRULE parameters.
  try {
    rrulestr(`RRULE:${s}`);
  } catch (err) {
    throw new RecurrenceParseError(err instanceof Error ? err.message : String(err));
  }
  return { dtstart: undefined, dtstartIsDateTime: false, rruleString: s };
}

export interface SeedInput {
  recurrence: string;
  scheduled?: SpecDateOrDateTime;
  date_created?: string;
}

/**
 * Resolve the recurrence seed in spec §4.4.1 order:
 *   1. DTSTART embedded in `recurrence`
 *   2. semantic `scheduled`
 *   3. semantic `date_created`
 * Throws `MissingRecurrenceSeedError` when none can be resolved.
 *
 * Returns the seed as a `YYYYMMDD` (or `YYYYMMDDTHHMMSSZ`) iCal token — ready
 * to be inserted as a `DTSTART:` segment.
 */
export function resolveSeed(input: SeedInput): { token: string; isDateTime: boolean } {
  const parsed = parseRecurrenceString(input.recurrence);
  if (parsed.dtstart) {
    return { token: parsed.dtstart, isDateTime: parsed.dtstartIsDateTime };
  }
  if (input.scheduled) {
    return tokenFromIso(input.scheduled);
  }
  if (input.date_created) {
    return tokenFromIso(input.date_created);
  }
  throw new MissingRecurrenceSeedError();
}

/**
 * Ensure DTSTART is present in the recurrence string per §4.4.5. If it
 * already has DTSTART, return unchanged. Otherwise, resolve the seed and
 * insert a DTSTART segment before the RRULE parameters.
 */
export function canonicalizeDtstart(input: SeedInput): string {
  const parsed = parseRecurrenceString(input.recurrence);
  if (parsed.dtstart) return input.recurrence.trim().replace(/^RRULE:/i, '');
  const seed = resolveSeed(input);
  return `DTSTART:${seed.token};${parsed.rruleString}`;
}

/**
 * Rewrite DTSTART to a new target. Used by completion-anchor progression
 * per §4.4.3.
 *
 * - target is a `YYYY-MM-DD` (date) or full ISO datetime; we convert to
 *   the iCal token form.
 * - asDateTime forces datetime DTSTART even when target looks like a date.
 */
export function rewriteDtstart(recurrence: string, target: string, asDateTime?: boolean): string {
  const parsed = parseRecurrenceString(recurrence);
  const token = asDateTime
    ? tokenFromIso(target, true).token
    : tokenFromIso(target).token;
  return `DTSTART:${token};${parsed.rruleString}`;
}

export interface NextOccurrenceInput extends SeedInput {
  recurrence_anchor?: RecurrenceAnchor;
  /** For `scheduled` anchor only: dates already skipped. Not consulted in `completion` mode (§4.4.4). */
  skipped_instances?: SpecDate[];
  /** Reference instant; default `Date.now()`. Used as the lower bound for "next". */
  after?: Date;
}

/**
 * Compute the next occurrence date (calendar day) for a recurring task.
 *
 * For `scheduled` anchor: walks the RRULE chain from DTSTART forward, skipping
 * any date in `skipped_instances`.
 * For `completion` anchor: returns the first occurrence strictly after the
 * current DTSTART anchor (§4.4.4); `complete_instances` are NOT consulted.
 *
 * Returns the next occurrence day as `YYYY-MM-DD`, or `null` if the rule has
 * no further occurrences (e.g. UNTIL/COUNT exhausted).
 */
export function nextOccurrence(input: NextOccurrenceInput): SpecDate | null {
  const seed = resolveSeed(input);
  const dtstart = icalToDate(seed.token);
  const parsed = parseRecurrenceString(input.recurrence);
  const rule = rrulestr(`DTSTART:${seed.token}\nRRULE:${parsed.rruleString}`) as RRule;

  const after = input.after ?? new Date();
  const anchor = input.recurrence_anchor ?? 'scheduled';

  if (anchor === 'completion') {
    // §4.4.4: candidate is the first RRULE occurrence strictly after DTSTART.
    // The skipped_instances list still excludes (item 3 of §4.4.4).
    const skipSet = new Set(input.skipped_instances ?? []);
    const candidates = rule.between(dtstart, addYears(dtstart, 5), true);
    for (const candidate of candidates) {
      if (candidate.getTime() <= dtstart.getTime()) continue;
      const day = isoDay(candidate);
      if (!skipSet.has(day)) return day;
    }
    return null;
  }

  // `scheduled` anchor: future occurrences from `after`, excluding skipped.
  const skipSet = new Set(input.skipped_instances ?? []);
  const candidates = rule.between(after, addYears(after, 5), true);
  for (const candidate of candidates) {
    const day = isoDay(candidate);
    if (skipSet.has(day)) continue;
    return day;
  }
  return null;
}

/**
 * Determine the effective state of a single instance per §4.11.
 *   - `completed` if `D` ∈ complete_instances
 *   - `skipped` if `D` ∈ skipped_instances (and not completed)
 *   - `unresolved` otherwise (default)
 */
export function effectiveInstanceState(
  task: Pick<Task, 'complete_instances' | 'skipped_instances'>,
  day: SpecDate,
): 'completed' | 'skipped' | 'unresolved' {
  if ((task.complete_instances ?? []).includes(day)) return 'completed';
  if ((task.skipped_instances ?? []).includes(day)) return 'skipped';
  return 'unresolved';
}

// --- Date conversion helpers (local to this module) ------------------------

function tokenFromIso(value: string, forceDateTime?: boolean): { token: string; isDateTime: boolean } {
  // Date-only canonical form `YYYY-MM-DD` → `YYYYMMDD`.
  if (!forceDateTime && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { token: value.replace(/-/g, ''), isDateTime: false };
  }
  // Datetime → normalise to UTC second-precision and emit YYYYMMDDTHHMMSSZ.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RecurrenceParseError(`unparseable date/datetime: ${value}`);
  }
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const mo = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  const h = date.getUTCHours().toString().padStart(2, '0');
  const mi = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  return { token: `${y}${mo}${d}T${h}${mi}${s}Z`, isDateTime: true };
}

function isValidIcalDate(token: string): boolean {
  const dt = ICAL_DATETIME_UTC_RE.exec(token);
  if (dt) {
    const y = Number(dt[1]); const mo = Number(dt[2]) - 1; const d = Number(dt[3]);
    const h = Number(dt[4]); const mi = Number(dt[5]); const s = Number(dt[6]);
    const date = new Date(Date.UTC(y, mo, d, h, mi, s));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo && date.getUTCDate() === d
      && date.getUTCHours() === h && date.getUTCMinutes() === mi && date.getUTCSeconds() === s;
  }
  const dOnly = ICAL_DATE_RE.exec(token);
  if (dOnly) {
    const y = Number(dOnly[1]); const mo = Number(dOnly[2]) - 1; const d = Number(dOnly[3]);
    const date = new Date(Date.UTC(y, mo, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo && date.getUTCDate() === d;
  }
  return false;
}

function icalToDate(token: string): Date {
  let m = ICAL_DATETIME_UTC_RE.exec(token);
  if (m) {
    return new Date(Date.UTC(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6]),
    ));
  }
  m = ICAL_DATE_RE.exec(token);
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  throw new RecurrenceParseError(`malformed iCal token: ${token}`);
}

function isoDay(d: Date): SpecDate {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addYears(d: Date, years: number): Date {
  return new Date(d.getTime() + years * 365 * 24 * 3600 * 1000);
}
