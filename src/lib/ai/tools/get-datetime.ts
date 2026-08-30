// `get_datetime` — browser-local datetime resolver. Runs in the user's
// browser so `new Date()` and the resolved Intl timezone reflect their
// actual clock and locale — the whole point of the tool is to give the
// model ground truth instead of letting it guess from its (stale)
// training data.
//
// All formatting goes through `Intl.DateTimeFormat` so a caller-supplied
// IANA `timezone` works without pulling in a tz database. We pin the
// locale to `en-US` for stable English weekday/month names regardless of
// the user's browser locale (the model reads these as plain tokens); the
// user's actual locale is exposed separately under `locale`.

import { tool, jsonSchema } from 'ai';
import type { ReadOnlyToolName } from './index';

export const GET_DATETIME_DESCRIPTION = 'Return the current date and time from the user\'s browser, with weekday, timezone, and ISO/unix forms ready to use. Call this whenever the answer depends on what "today", "now", "this week", or "tomorrow" means — your training data is stale and the user\'s clock is the ground truth. Pass an optional `timezone` (IANA name, e.g. "Europe/Berlin") to convert into a different zone; omit it to use the user\'s local zone. This tool is read-only and runs without user approval.';

export const GET_DATETIME_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    timezone: {
      type: 'string',
      description: 'IANA timezone name (e.g. "America/Los_Angeles", "Europe/Berlin", "UTC"). Omit to use the user\'s browser-local zone.',
    },
  },
} as const;

export interface GetDatetimeInput {
  timezone?: string;
}

export interface GetDatetimeResult {
  /** ISO 8601 in the resolved zone, with offset (e.g. "2026-05-13T16:30:00-07:00"). */
  now: string;
  /** ISO 8601 in UTC (e.g. "2026-05-13T23:30:00.000Z"). */
  now_utc: string;
  /** YYYY-MM-DD in the resolved zone. */
  date: string;
  /** HH:MM:SS in 24-hour format, in the resolved zone. */
  time: string;
  /** Full English weekday name (e.g. "Wednesday"). */
  weekday: string;
  /** Three-letter weekday abbreviation (e.g. "Wed"). */
  weekday_short: string;
  year: number;
  /** 1-indexed month (January = 1). */
  month: number;
  /** Full English month name (e.g. "May"). */
  month_name: string;
  /** Day of the month (1–31). */
  day: number;
  /** Hour in 24-hour format (0–23). */
  hour: number;
  minute: number;
  second: number;
  /** IANA timezone actually used (resolved from input, or browser default). */
  timezone: string;
  /** Offset from UTC formatted as ±HH:MM (e.g. "-07:00"). */
  timezone_offset: string;
  /** Offset from UTC in minutes (negative for zones west of UTC). */
  timezone_offset_minutes: number;
  /** Unix timestamp in seconds. */
  unix_seconds: number;
  /** Unix timestamp in milliseconds. */
  unix_ms: number;
  /** ISO 8601 week date (e.g. "2026-W20"). */
  iso_week: string;
  /** ISO week number (1–53). */
  iso_week_number: number;
  /** ISO weekday number (Monday = 1, Sunday = 7). */
  iso_weekday: number;
  /** Browser locale, e.g. "en-US". */
  locale: string;
}

export const getDatetimeTool = tool({
  description: GET_DATETIME_DESCRIPTION,
  inputSchema: jsonSchema<GetDatetimeInput>(GET_DATETIME_JSON_SCHEMA),
});

const ISO_LOCALE = 'en-US';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format the offset minutes as `±HH:MM`. UTC is `+00:00`. */
function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${pad2(hh)}:${pad2(mm)}`;
}

/** Read each calendar field by formatting in the target zone. */
function extractParts(date: Date, timezone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat(ISO_LOCALE, {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long',
  });
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

/** Compute the zone's offset from UTC at this instant, in minutes.
 *  We can't rely on `Date.prototype.getTimezoneOffset` because that's the
 *  *runtime's* offset, not the requested zone's. Trick: format the same
 *  instant in the target zone as a wall-clock string, parse it back as if
 *  it were UTC, and the diff is the offset. */
function getOffsetMinutes(date: Date, timezone: string): number {
  const parts = extractParts(date, timezone);
  // Hour '24' is a Node Intl quirk for midnight; normalize to 0.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** ISO 8601 week date: year-Www. Spec: weeks start on Monday; week 1 is
 *  the week containing the year's first Thursday. */
function isoWeek(year: number, month: number, day: number): { isoYear: number; week: number; weekday: number } {
  // UTC math is safe — we only use this for whole-day arithmetic.
  const date = new Date(Date.UTC(year, month - 1, day));
  // ISO weekday: Monday = 1, Sunday = 7
  const dayNum = date.getUTCDay() || 7;
  // Shift to the Thursday of this week — guarantees the right ISO year.
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return { isoYear, week, weekday: dayNum };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

export interface FormatDatetimeOpts {
  /** Instant to format. Defaults to `new Date()`. */
  now?: Date;
  /** IANA zone name (e.g. "Europe/Berlin"). Defaults to the runtime's resolved zone. */
  timezone?: string;
  /** Browser/locale tag for `locale`. Defaults to the runtime's resolved locale, or `en-US`. */
  locale?: string;
}

export function formatDatetime(opts: FormatDatetimeOpts = {}): GetDatetimeResult {
  const now = opts.now ?? new Date();
  const resolved = new Intl.DateTimeFormat().resolvedOptions();
  const timezone = opts.timezone ?? resolved.timeZone ?? 'UTC';
  const locale = opts.locale ?? resolved.locale ?? 'en-US';

  const parts = extractParts(now, timezone);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Intl returns '24' for midnight in some Node versions; map to '00' to
  // match the convention used by the rest of the app.
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  const offsetMinutes = getOffsetMinutes(now, timezone);
  const offset = formatOffset(offsetMinutes);

  const isoLocal = `${parts.year}-${parts.month}-${parts.day}T${pad2(hour)}:${parts.minute}:${parts.second}${offset}`;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${pad2(hour)}:${parts.minute}:${parts.second}`;

  const weekday = parts.weekday ?? '';
  const weekdayShort = WEEKDAY_SHORT[weekday] ?? weekday.slice(0, 3);
  const monthName = MONTH_NAMES[month - 1] ?? '';

  const { isoYear, week, weekday: isoWeekday } = isoWeek(year, month, day);
  const isoWeekStr = `${isoYear}-W${pad2(week)}`;

  return {
    now: isoLocal,
    now_utc: now.toISOString(),
    date,
    time,
    weekday,
    weekday_short: weekdayShort,
    year,
    month,
    month_name: monthName,
    day,
    hour,
    minute,
    second,
    timezone,
    timezone_offset: offset,
    timezone_offset_minutes: offsetMinutes,
    unix_seconds: Math.floor(now.getTime() / 1000),
    unix_ms: now.getTime(),
    iso_week: isoWeekStr,
    iso_week_number: week,
    iso_weekday: isoWeekday,
    locale,
  };
}

function isInput(value: unknown): value is GetDatetimeInput {
  if (value == null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.timezone !== undefined && typeof v.timezone !== 'string') return false;
  return true;
}

export function buildGetDatetimeExecutor() {
  return async function executor(toolName: ReadOnlyToolName, rawInput: unknown): Promise<string> {
    if (toolName !== 'get_datetime') {
      throw new Error(`Unsupported read-only tool: ${toolName}`);
    }
    const input = isInput(rawInput) ? (rawInput ?? {}) : {};
    const tz = typeof input.timezone === 'string' ? input.timezone.trim() : '';
    try {
      const result = formatDatetime(tz ? { timezone: tz } : {});
      return JSON.stringify(result);
    } catch (err) {
      // Most likely cause: bad IANA timezone name. Surface the error as the
      // tool result so the model can apologize / retry with no override.
      const msg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: `Could not resolve datetime: ${msg}` });
    }
  };
}
