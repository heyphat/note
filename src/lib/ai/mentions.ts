// Note mentions: when the user types `@<note>` in chat and picks a note,
// the textarea is rewritten to `[[<noteId>]]`. At send-time we walk the
// latest user message body, resolve each mention via the store, and feed
// the referenced bodies into the system prompt so the model has full
// context — not just the link text.
//
// Stored format is path-based (`[[projects/foo.md]]`) so renames-by-title
// don't dangle the link. Resolution is best-effort: a missing or stale
// reference doesn't break the turn, the model just sees the markdown link
// in the user message verbatim.

import type { NoteStore } from '@/lib/storage';

export interface ResolvedMention {
  id: string;
  title: string;
  text: string;
}

const MENTION_RE = /\[\[([^\]\n]+)\]\]/g;

const MAX_MENTIONS = 5;
const MAX_TEXT_PER_NOTE = 8_000;
const MAX_TOTAL_CHARS = 24_000;

export function parseMentionIds(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(MENTION_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    // The picker inserts ids verbatim; defensively strip leading "./" so
    // a hand-typed mention still resolves.
    const id = raw.startsWith('./') ? raw.slice(2) : raw;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function resolveMentions(
  store: NoteStore,
  body: string,
  excludeNoteId?: string | null,
): Promise<ResolvedMention[]> {
  const ids = parseMentionIds(body);
  if (ids.length === 0) return [];
  const out: ResolvedMention[] = [];
  let totalChars = 0;
  for (const id of ids) {
    if (out.length >= MAX_MENTIONS) break;
    if (excludeNoteId && id === excludeNoteId) continue;
    try {
      const note = await store.get(id);
      if (!note) continue;
      const text = truncate(note.text || '', MAX_TEXT_PER_NOTE);
      if (totalChars + text.length > MAX_TOTAL_CHARS) break;
      out.push({ id: note.id, title: note.title, text });
      totalChars += text.length;
    } catch {
      // Treat as unresolved; the model still sees the link text.
      continue;
    }
  }
  return out;
}

export function buildMentionsPromptSection(mentions: ResolvedMention[]): string {
  if (mentions.length === 0) return '';
  const blocks = mentions.map((m) => {
    return [
      `### ${m.title} (\`${m.id}\`)`,
      '',
      '```markdown',
      m.text,
      '```',
    ].join('\n');
  });
  return `\n\n## Referenced notes\n\nThe user mentioned these notes via \`[[…]]\` in their message — treat them as additional context.\n\n${blocks.join('\n\n')}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[… truncated: original is ${s.length.toLocaleString()} characters]`;
}
