/**
 * Wikilink extraction from note body.
 *
 * Syntax (Obsidian-compatible):
 *   [[target]]               — regular link to a note
 *   [[target#heading]]       — link to a section inside a note
 *   [[target|display text]]  — regular link with custom display text
 *   ![[target]]              — transclusion (embed)
 *   ![[target#heading]]      — transclusion of a specific section
 *
 * Fenced code blocks and inline backtick spans are stripped before matching
 * (same approach as tags.ts) so `[[foo]]` inside a code sample is ignored.
 * Positions returned in the result refer to offsets in the ORIGINAL input
 * (not the stripped copy) so callers can splice the source faithfully.
 */

export interface WikiLinkRef {
  /** The target note title or path (without the [[ ]] brackets or !prefix). */
  target: string;
  /** Heading fragment (after `#`), empty when the link has no `#section`. */
  section: string;
  /** Custom display text (after `|`), empty when no pipe was used. */
  display: string;
  /** True for `![[...]]` transclusion syntax. */
  isTransclusion: boolean;
  /** Start offset of the full match (including `![[`) in the original string. */
  start: number;
  /** End offset (exclusive) of the full `]]` in the original string. */
  end: number;
}

// Match transclusions first (with !) vs regular links. Capturing groups:
//   1: optional leading `!`
//   2: the inner payload (anything up to the first `]]`, non-greedy)
//
// The `\\?` sprinkled through the bracket atoms lets us match Milkdown's
// serialized form too: when Crepe re-serializes a note, it escapes `[` and
// `]` as `\[` / `\]` because bracket chars are markdown-special. Without
// this tolerance, a note that round-trips through the editor loses its
// wikilinks from the index and gets flagged as "unlinked mentions" of
// itself. The payload group still excludes bracket chars so we stop at the
// first `]]` (or `\]\]`).
const WIKILINK_RE = /(!?)\\?\[\\?\[([^\[\]\n]+?)\\?\]\\?\]/g;

/**
 * Mask out positions where wikilinks should not be matched — fenced code
 * blocks, inline backtick spans. Returns a string of the same length as
 * `text` with masked regions replaced by spaces so character offsets stay
 * aligned with the input.
 */
function maskCodeRegions(text: string): string {
  const out = text.split('');
  const mask = (start: number, end: number) => {
    for (let i = start; i < end && i < out.length; i++) {
      // Preserve newlines so line-based regex features (if any) still work.
      if (out[i] !== '\n') out[i] = ' ';
    }
  };
  // Fenced code blocks: ```...``` (or ~~~...~~~), possibly multi-line.
  const fenceRe = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    mask(m.index, m.index + m[0].length);
  }
  // Inline code spans. Single-line only so a stray backtick doesn't eat
  // the rest of the document.
  const spanRe = /`[^`\n]+`/g;
  while ((m = spanRe.exec(text)) !== null) {
    mask(m.index, m.index + m[0].length);
  }
  return out.join('');
}

function parsePayload(payload: string): { target: string; section: string; display: string } {
  // Split off the display text first (`|`), then split the remainder at `#`.
  const pipeIdx = payload.indexOf('|');
  const linkPart = pipeIdx === -1 ? payload : payload.slice(0, pipeIdx);
  const display = pipeIdx === -1 ? '' : payload.slice(pipeIdx + 1).trim();
  const hashIdx = linkPart.indexOf('#');
  const target = (hashIdx === -1 ? linkPart : linkPart.slice(0, hashIdx)).trim();
  const section = hashIdx === -1 ? '' : linkPart.slice(hashIdx + 1).trim();
  return { target, section, display };
}

/**
 * Extract every `[[link]]` / `![[embed]]` reference from a markdown string.
 * Links inside fenced code blocks or inline code spans are ignored. The
 * returned list is in source order.
 */
export function parseWikiLinks(source: string): WikiLinkRef[] {
  if (!source) return [];
  const masked = maskCodeRegions(source);
  const out: WikiLinkRef[] = [];
  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(masked)) !== null) {
    const bang = m[1];
    const payload = m[2];
    if (!payload || !payload.trim()) continue;
    const { target, section, display } = parsePayload(payload);
    if (!target) continue;
    out.push({
      target,
      section,
      display,
      isTransclusion: bang === '!',
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/**
 * Normalize a wikilink target for comparison against note titles and ids.
 * Lowercase, trim, collapse whitespace. Kept loose — a user typing
 * `[[my note]]` should match a note titled `My Note` or filed as
 * `my-note.md`.
 */
export function normalizeWikiTarget(target: string): string {
  return target.trim().toLowerCase().replace(/\s+/g, ' ');
}
