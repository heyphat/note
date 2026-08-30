// Natural-language due-date detection used by the task composer.
// Pure function: takes a string + a reference "today" and returns the last
// matching phrase (closest to end of input — that's where the user is most
// likely typing). Returns `null` when nothing matches.
//
// Supported phrases (case-insensitive):
//   today, tonight                      → reference day
//   tomorrow                            → reference day + 1
//   yesterday                           → reference day - 1
//   in N day(s)|week(s)|month(s)        → N as digit or word (a, an, one..ten)
//   in a day | in a week | in a month
//   next week | next month              → +7 days / +1 month
//   <weekday>                           → next occurrence (today if same DOW)
//   next <weekday>                      → next occurrence strictly after today
//   YYYY-MM-DD                          → ISO date
//   M/D[/YY[YY]]                        → US-style short date

export interface DuePhraseMatch {
  /** Inclusive start index of the matched substring in the input. */
  start: number;
  /** Exclusive end index of the matched substring in the input. */
  end: number;
  /** Matched substring (preserves original casing from input). */
  text: string;
  /** Resolved date as `YYYY-MM-DD` (local). */
  iso: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const WORD_NUMERALS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * Scan `text` for a recognized due-date phrase. Returns the match closest
 * to the end of the input (so as the user types, the most recently typed
 * phrase wins). `today` defaults to `new Date()` — pass an explicit value
 * for tests.
 */
export function detectDuePhrase(text: string, today: Date = new Date()): DuePhraseMatch | null {
  const lower = text.toLowerCase();
  const matches: DuePhraseMatch[] = [];

  // Order matters: more-specific patterns should run before less-specific
  // ones (e.g. `next monday` before bare `monday`) so we can filter dupes.

  // ISO `YYYY-MM-DD`
  for (const m of Array.from(lower.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g))) {
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
      pushMatch(matches, text, m.index ?? 0, m[0].length, dt);
    }
  }

  // M/D or M/D/Y[Y[YY]]
  for (const m of Array.from(lower.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g))) {
    const mo = +m[1], d = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    let y = m[3] ? +m[3] : today.getFullYear();
    if (m[3] && m[3].length === 2) y += 2000;
    const dt = new Date(y, mo - 1, d);
    if (dt.getMonth() === mo - 1 && dt.getDate() === d) {
      pushMatch(matches, text, m.index ?? 0, m[0].length, dt);
    }
  }

  // today / tonight / tomorrow / yesterday
  for (const m of Array.from(lower.matchAll(/\b(today|tonight|tomorrow|yesterday)\b/g))) {
    const dt = startOfDay(today);
    if (m[1] === 'tomorrow') dt.setDate(dt.getDate() + 1);
    else if (m[1] === 'yesterday') dt.setDate(dt.getDate() - 1);
    pushMatch(matches, text, m.index ?? 0, m[0].length, dt);
  }

  // in N day(s) / week(s) / month(s)
  const inRe = /\bin (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) (day|days|week|weeks|month|months)\b/g;
  for (const m of Array.from(lower.matchAll(inRe))) {
    const n = WORD_NUMERALS[m[1]] ?? Number.parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const unit = m[2];
    const dt = startOfDay(today);
    if (unit.startsWith('day')) dt.setDate(dt.getDate() + n);
    else if (unit.startsWith('week')) dt.setDate(dt.getDate() + n * 7);
    else if (unit.startsWith('month')) dt.setMonth(dt.getMonth() + n);
    pushMatch(matches, text, m.index ?? 0, m[0].length, dt);
  }

  // next week / next month
  for (const m of Array.from(lower.matchAll(/\bnext (week|month)\b/g))) {
    const dt = startOfDay(today);
    if (m[1] === 'week') dt.setDate(dt.getDate() + 7);
    else dt.setMonth(dt.getMonth() + 1);
    pushMatch(matches, text, m.index ?? 0, m[0].length, dt);
  }

  // next <weekday>  (must run before bare-weekday so the bare-weekday
  // pass can skip ranges already covered here)
  const nextWdRe = /\bnext (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g;
  const coveredByNext = new Set<number>();
  for (const m of Array.from(lower.matchAll(nextWdRe))) {
    const targetDow = WEEKDAYS.indexOf(m[1] as typeof WEEKDAYS[number]);
    const dt = nextOccurrence(today, targetDow, true);
    pushMatch(matches, text, m.index ?? 0, m[0].length, dt);
    // Mark the inner weekday range so the bare-weekday loop skips it.
    coveredByNext.add((m.index ?? 0) + 'next '.length);
  }

  // bare weekday — skip if it's the second word of a `next <weekday>` we
  // just consumed.
  const wdRe = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g;
  for (const m of Array.from(lower.matchAll(wdRe))) {
    if (coveredByNext.has(m.index ?? -1)) continue;
    const targetDow = WEEKDAYS.indexOf(m[1] as typeof WEEKDAYS[number]);
    const dt = nextOccurrence(today, targetDow, false);
    pushMatch(matches, text, m.index ?? 0, m[0].length, dt);
  }

  if (matches.length === 0) return null;
  // Last (right-most) match wins — that's where the user is typing.
  matches.sort((a, b) => b.start - a.start);
  return matches[0];
}

/** Format a Date as `YYYY-MM-DD` in local time. */
export function formatLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nextOccurrence(from: Date, targetDow: number, strictlyAfter: boolean): Date {
  const dt = startOfDay(from);
  const fromDow = dt.getDay();
  let diff = targetDow - fromDow;
  if (diff < 0) diff += 7;
  if (diff === 0 && strictlyAfter) diff = 7;
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function pushMatch(out: DuePhraseMatch[], original: string, start: number, len: number, dt: Date) {
  out.push({
    start,
    end: start + len,
    text: original.slice(start, start + len),
    iso: formatLocalISO(dt),
  });
}
