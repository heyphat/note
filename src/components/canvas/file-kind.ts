// Detects whether a JSON Canvas `file` field points at an image or a
// regular markdown note. Extracted so FileNode and (in the future) other
// callers can branch on the same set of extensions, and so the rule is
// unit-testable without rendering a React component.

export type FileKind = 'image' | 'markdown';

export const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico',
]);

export function detectFileKind(path: string): FileKind {
  const trimmed = path.trim();
  if (!trimmed) return 'markdown';
  // Strip any URL `?query` / `#fragment` before extension sniffing so
  // `https://…/foo.png?size=large` still detects as image, and so a
  // wikilink-style `Note#section` doesn't accidentally pick up an
  // image extension from the section name.
  const cleaned = trimmed.split(/[?#]/, 1)[0];
  const lastDot = cleaned.lastIndexOf('.');
  if (lastDot < 0) return 'markdown';
  const ext = cleaned.slice(lastDot + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) ? 'image' : 'markdown';
}
