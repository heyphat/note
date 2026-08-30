// Title derivation helpers. Pure, no DOM / storage deps — safe to unit test
// against the full matrix of bullet / heading / blockquote prefixes.

export const DEFAULT_NEW_NOTE_TITLE = 'Untitled note';
export const DEFAULT_NEW_TEMPLATE_TITLE = 'Untitled template';
export const DEFAULT_NEW_NOTE_FOLDER = 'unsorted';
// Seed body for freshly-created notes: an empty H2 so the user types their
// title into a heading block. deriveTitleFromMarkdown strips the `## ` prefix
// when populating the auto-title.
export const DEFAULT_NEW_NOTE_BODY = '## \n';

/**
 * Pull a title from the first non-empty line of a markdown body, stripping
 * blockquote, heading, list, and task-list prefixes. Returns `null` when the
 * body is entirely blank or prefix-only.
 */
export function deriveTitleFromMarkdown(markdown: string): string | null {
  for (const rawLine of markdown.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/^>\s*/g, '').trim();
    line = line.replace(/^#{1,6}(?:\s+|$)/, '').trim();
    line = line.replace(/^[-*+]\s+\[(?: |x|X)\](?:\s+|$)/, '').trim();
    line = line.replace(/^[-*+](?:\s+|$)/, '').trim();
    line = line.replace(/^\d+[.)](?:\s+|$)/, '').trim();
    if (line) return line;
  }
  return null;
}

/**
 * Pick the next available template name (`Untitled template`, then
 * `Untitled template 2`, `Untitled template 3`, …). Existing names are
 * compared case-sensitively.
 */
export function getNextTemplateName(existingNames: string[]): string {
  if (!existingNames.includes(DEFAULT_NEW_TEMPLATE_TITLE)) return DEFAULT_NEW_TEMPLATE_TITLE;
  let suffix = 2;
  while (existingNames.includes(`${DEFAULT_NEW_TEMPLATE_TITLE} ${suffix}`)) suffix += 1;
  return `${DEFAULT_NEW_TEMPLATE_TITLE} ${suffix}`;
}
