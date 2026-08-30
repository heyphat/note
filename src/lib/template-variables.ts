const pad = (n: number) => String(n).padStart(2, '0');

export interface InterpolationExtras {
  /**
   * Caller-supplied dotted-path values, e.g. `{ 'tasks.today': '- [ ] foo' }`.
   * Looked up before the built-in vars fall back to leaving the placeholder
   * intact, so callers can inject domain-specific tokens without bloating
   * this module's dependency graph.
   */
  [dottedKey: string]: string;
}

export function interpolateTemplateVariables(content: string, extras: InterpolationExtras = {}): string {
  const now = new Date();
  const YYYY = String(now.getFullYear());
  const MM = pad(now.getMonth() + 1);
  const DD = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const date = `${YYYY}-${MM}-${DD}`;
  const time = `${HH}:${mm}`;
  const EEEE = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now);

  const vars: Record<string, string> = {
    date, time, datetime: `${date} ${time}`,
    YYYY, MM, DD, EEEE,
  };

  // `\w` doesn't include `.`, so we widen to `[\w.]+` to support dotted
  // names like `{{tasks.today}}` while keeping the existing tokens working.
  return content.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(extras, key)) return extras[key];
    return vars[key] ?? match;
  });
}
