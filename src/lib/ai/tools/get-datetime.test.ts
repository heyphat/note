import { describe, it, expect } from 'vitest';
import { buildGetDatetimeExecutor, formatDatetime } from './get-datetime';

describe('formatDatetime', () => {
  // Fixed instant: 2026-05-13 23:30:00 UTC (Wednesday).
  // The same instant in America/Los_Angeles is 2026-05-13 16:30 (DST: -07:00).
  const fixed = new Date(Date.UTC(2026, 4, 13, 23, 30, 0));

  it('formats a known instant in a specific zone', () => {
    const out = formatDatetime({ now: fixed, timezone: 'America/Los_Angeles' });
    expect(out.now).toBe('2026-05-13T16:30:00-07:00');
    expect(out.now_utc).toBe('2026-05-13T23:30:00.000Z');
    expect(out.date).toBe('2026-05-13');
    expect(out.time).toBe('16:30:00');
    expect(out.weekday).toBe('Wednesday');
    expect(out.weekday_short).toBe('Wed');
    expect(out.year).toBe(2026);
    expect(out.month).toBe(5);
    expect(out.month_name).toBe('May');
    expect(out.day).toBe(13);
    expect(out.hour).toBe(16);
    expect(out.minute).toBe(30);
    expect(out.second).toBe(0);
    expect(out.timezone).toBe('America/Los_Angeles');
    expect(out.timezone_offset).toBe('-07:00');
    expect(out.timezone_offset_minutes).toBe(-420);
    expect(out.unix_ms).toBe(fixed.getTime());
    expect(out.unix_seconds).toBe(Math.floor(fixed.getTime() / 1000));
  });

  it('handles UTC and zones east of UTC', () => {
    const utc = formatDatetime({ now: fixed, timezone: 'UTC' });
    expect(utc.timezone_offset).toBe('+00:00');
    expect(utc.timezone_offset_minutes).toBe(0);
    expect(utc.time).toBe('23:30:00');

    const berlin = formatDatetime({ now: fixed, timezone: 'Europe/Berlin' });
    // Berlin is CEST in May (+02:00).
    expect(berlin.timezone_offset).toBe('+02:00');
    expect(berlin.timezone_offset_minutes).toBe(120);
    expect(berlin.date).toBe('2026-05-14'); // crosses midnight
    expect(berlin.hour).toBe(1);
  });

  it('computes ISO week date correctly', () => {
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    const jan1 = formatDatetime({ now: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)), timezone: 'UTC' });
    expect(jan1.iso_week).toBe('2026-W01');
    expect(jan1.iso_week_number).toBe(1);
    expect(jan1.iso_weekday).toBe(4); // Thursday

    // 2025-12-29 is a Monday → ISO week 1 of 2026 (early week-1).
    const earlyW1 = formatDatetime({ now: new Date(Date.UTC(2025, 11, 29, 12, 0, 0)), timezone: 'UTC' });
    expect(earlyW1.iso_week).toBe('2026-W01');
    expect(earlyW1.iso_weekday).toBe(1);

    // 2024-12-30 is a Monday → still part of ISO week 1 of 2025.
    const lateYear = formatDatetime({ now: new Date(Date.UTC(2024, 11, 30, 12, 0, 0)), timezone: 'UTC' });
    expect(lateYear.iso_week).toBe('2025-W01');
  });

  it('returns Sunday as ISO weekday 7', () => {
    // 2026-05-17 is a Sunday.
    const sun = formatDatetime({ now: new Date(Date.UTC(2026, 4, 17, 12, 0, 0)), timezone: 'UTC' });
    expect(sun.weekday).toBe('Sunday');
    expect(sun.iso_weekday).toBe(7);
  });
});

describe('buildGetDatetimeExecutor', () => {
  it('returns a JSON string with the expected fields', async () => {
    const exec = buildGetDatetimeExecutor();
    const raw = await exec('get_datetime', { timezone: 'UTC' });
    const parsed = JSON.parse(raw);
    expect(parsed.timezone).toBe('UTC');
    expect(parsed).toHaveProperty('now');
    expect(parsed).toHaveProperty('weekday');
    expect(parsed).toHaveProperty('unix_seconds');
  });

  it('falls back to the browser local zone when timezone is omitted', async () => {
    const exec = buildGetDatetimeExecutor();
    const parsed = JSON.parse(await exec('get_datetime', {}));
    // Just verify the field is populated; the actual zone depends on the
    // test runner's environment, which we can't pin here.
    expect(typeof parsed.timezone).toBe('string');
    expect(parsed.timezone.length).toBeGreaterThan(0);
  });

  it('surfaces an error result for invalid IANA names', async () => {
    const exec = buildGetDatetimeExecutor();
    const parsed = JSON.parse(await exec('get_datetime', { timezone: 'Not/A_Zone' }));
    expect(parsed.error).toMatch(/Could not resolve datetime/);
  });

  it('rejects calls under the wrong tool name', async () => {
    const exec = buildGetDatetimeExecutor();
    await expect(exec('search_vault' as never, {})).rejects.toThrow();
  });
});
