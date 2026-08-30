// Render a short plain-text preview of a markdown task body for list/kanban
// surfaces. Pure: takes markdown in, returns a one-line excerpt. The intent
// is "what would the user see at a glance" — fenced code blocks, link URLs,
// emphasis markers, and list bullets are stripped; only readable text is
// kept. Result is collapsed to a single line and capped at `maxLen`.
//
// `extractFirstImage` is a complementary helper that pulls the first inline
// image out of the body so list/kanban rows can render a thumbnail
// alongside the text excerpt. Only absolute URLs are returned — relative
// `./*.assets/...` paths can't be resolved without a real `noteKey`, and
// raster `data:` URLs are accepted (SVG is excluded to keep the surface
// boring on the off chance an old browser executes script in SVG `<img>`).

const STRIP_RULES: Array<[RegExp, string | ((...args: string[]) => string)]> = [
  // Fenced code blocks — drop entirely; their content is rarely useful in
  // a short preview and the formatting noise hurts.
  [/```[\s\S]*?```/g, ''],
  // HTML comments
  [/<!--[\s\S]*?-->/g, ''],
  // HTML tags — the body is markdown, but `<br>` etc do appear.
  [/<[^>]+>/g, ''],
  // Images: `![alt](url)` → `alt`
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  // Links: `[text](url)` → `text`
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],
  // Wikilinks: `[[Target|Label]]` → `Label`, `[[Target]]` → `Target`
  [/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_m: string, target: string, label?: string) => label || target],
  // Inline code: `` `code` `` → `code`
  [/`([^`]+)`/g, '$1'],
  // Leading line markers: `#`, `>`, `-`, `*`, `+`, numbered list.
  [/^[ \t]*(#+\s+|>+\s+|[-*+]\s+|\d+\.\s+)/gm, ''],
  // Task-list checkboxes: `[ ]` / `[x]` after the bullet was already stripped.
  [/^[ \t]*\[[ xX]\]\s+/gm, ''],
  // Emphasis markers (**bold**, __bold__, *em*, _em_, ~~strike~~).
  [/(\*\*|__)([^*_]+)\1/g, '$2'],
  [/(\*|_|~~)([^*_~]+)\1/g, '$2'],
];

export interface FirstImageMatch {
  /** Resolved URL (http(s) or `data:image/...`). */
  url: string;
  /** Alt text from the markdown — empty string when absent. */
  alt: string;
  /** The full original substring, e.g. `![alt](data:...)`. Use this to
   *  strip the image from the body before generating the text preview so
   *  the alt text doesn't appear duplicated next to the thumbnail. */
  match: string;
}

const IMAGE_RE = new RegExp(
  // ![alt](url) where url is either:
  //   - data:image/<type>;base64,<payload>      (raster types only)
  //   - http(s)://<no parens, no spaces>
  // The negative-paren chars match Markdown's link grammar — Crepe's renderer
  // also bails on parens inside URLs, so this stays compatible.
  '!\\[([^\\]]*)\\]\\((data:image\\/(?:png|jpe?g|webp|gif);base64,[^)]+|https?:\\/\\/[^)\\s]+)\\)',
);

/**
 * Pull the first inline image from a markdown body. Returns `null` when no
 * image is present or when the only images are relative paths or
 * unsupported data types.
 */
export function extractFirstImage(body: string | undefined | null): FirstImageMatch | null {
  if (!body) return null;
  const m = body.match(IMAGE_RE);
  if (!m) return null;
  return { alt: m[1], url: m[2], match: m[0] };
}

/**
 * Convert a markdown body to a single-line plain-text preview.
 * Returns `''` when the body has no displayable text (whitespace-only,
 * code-blocks-only, etc.).
 */
export function previewBody(body: string | undefined | null, maxLen = 140): string {
  if (!body) return '';
  let s = body;
  for (const [pattern, replacement] of STRIP_RULES) {
    // The cast is safe — `replacement` is either a string or a function
    // that matches `String#replace`'s signature.
    s = s.replace(pattern, replacement as string);
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).trimEnd() + '…';
}
