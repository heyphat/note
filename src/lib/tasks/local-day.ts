/** YYYY-MM-DD from a Date using the user's local calendar. */
export function localDayFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD from an ISO timestamp interpreted in local time. */
export function localDayFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return localDayFromDate(d);
}

export function todayLocalDay(): string {
  return localDayFromDate(new Date());
}
