/**
 * Tag extraction from note body + frontmatter.
 *
 * Body syntax: `#tag-name` preceded by any non-word character (whitespace,
 * punctuation, brackets, start of line). Tag chars are `[a-z0-9]` then
 * `[a-z0-9-_/]*` — so nested tags like `#proj/foo` work. Fenced code blocks
 * and inline backtick spans are stripped before matching so `# heading`
 * syntax in a code sample and literal `#hashtags` inside backticks don't
 * pollute the index. A dedicated `Tags`/`Tag` markdown section is treated
 * specially: inline-code chips like `` `#momentum` `` are accepted there
 * because the app renders that authoring style as visible tag pills.
 * Markdown link syntax `[text](url)` is flattened to just the link text, so
 * tags inside a link (how Milkdown's auto-linker can render them) still count.
 *
 * Frontmatter tags come in via `metaList['tags']` — callers should parse
 * the frontmatter once and pass that array.
 *
 * All returned tags are lowercased and de-duplicated.
 */

// Permissive preceding boundary: anything that's NOT a word-char (letter,
// digit, underscore) is allowed before `#`. This lets tags sit after `[`,
// `,`, `.`, `-`, and other punctuation that can legitimately appear in
// prose — cases the previous `[\s(]` allow-list was missing.
const TAG_RE = /(?:^|[^a-z0-9_])#([a-z0-9][a-z0-9-_/]*)/gi;
const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function stripCode(text: string): string {
  // Remove fenced code blocks (```lang\n...\n```) first, then inline spans
  // (`...`). Order matters — if a fenced block contains backticks, we'd
  // otherwise strip them asymmetrically. Finally, flatten markdown link
  // syntax `[text](url)` → ` text ` so a tag inside a link still matches
  // (Milkdown renders bare `#tag` with a link decoration in some themes).
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, ' $1 ');
}

function normalize(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#+/, '');
}

function normalizeHeading(text: string): string {
  return text
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
    .replace(/:$/, '')
    .toLowerCase();
}

function collectTagsFromText(text: string, set: Set<string>): void {
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text)) !== null) {
    const t = normalize(m[1]);
    if (t) set.add(t);
  }
}

function tagsSectionText(body: string): string {
  const out: string[] = [];
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let inTagsSection = false;
  let tagsLevel = 0;

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      const label = normalizeHeading(heading[2]);
      if (inTagsSection && level <= tagsLevel) inTagsSection = false;
      if (label === 'tags' || label === 'tag') {
        inTagsSection = true;
        tagsLevel = level;
        continue;
      }
    }

    if (inTagsSection) out.push(line);
  }

  return out.join('\n');
}

/**
 * Extract the set of tags present in a note. `body` should be the markdown
 * content AFTER frontmatter has been stripped. `frontmatterTags` is the
 * parsed `tags:` list from frontmatter (pass `[]` if absent).
 */
export function extractTags(body: string, frontmatterTags: string[] = []): string[] {
  const set = new Set<string>();
  for (const raw of frontmatterTags) {
    const t = normalize(raw);
    if (t) set.add(t);
  }
  collectTagsFromText(tagsSectionText(body), set);
  const stripped = stripCode(body);
  collectTagsFromText(stripped, set);
  return Array.from(set).sort();
}
