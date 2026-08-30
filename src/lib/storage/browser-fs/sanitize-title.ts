const WINDOWS_RESERVED_RE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const TITLE_FILENAME_MAX_BYTES = 120;

// Note titles → safe basename (no extension). Preserves spaces and unicode so
// the OS file explorer shows something a human can read; only strips
// characters that fight the filesystem on macOS / Windows / Linux.
export function sanitizeNoteTitle(title: string): string {
  let s = (title || '').normalize('NFC');
  s = s.replace(/[\\/]/g, ' ');               // path separators -> space
  s = s.replace(/[:*?"<>|]/g, ' ');           // matches createFolder validator
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x1F\x7F]/g, '');      // strip control chars
  s = s.replace(/\s+/g, ' ').trim();          // collapse whitespace
  s = s.replace(/[ .]+$/g, '');               // trailing dots/spaces (Windows-hostile)
  s = s.replace(/^\.+/, '');                  // no hidden files
  if (WINDOWS_RESERVED_RE.test(s)) s = `_${s}`;
  // Cap at TITLE_FILENAME_MAX_BYTES UTF-8 bytes, trim at code-point boundary.
  const enc = new TextEncoder();
  if (enc.encode(s).length > TITLE_FILENAME_MAX_BYTES) {
    const cps = Array.from(s);
    while (cps.length > 0 && enc.encode(cps.join('')).length > TITLE_FILENAME_MAX_BYTES) {
      cps.pop();
    }
    s = cps.join('').replace(/[ .]+$/g, '');
  }
  return s || 'Untitled';
}

// Find a free filename `${base}.${ext}` in `dir`, suffixing " 1", " 2", ...
// on collision (case-insensitive — handles macOS APFS / Windows NTFS). If
// `selfName` is the existing basename for the file we're renaming, a match
// against it is treated as no-collision so save-to-same-name is a no-op.
export async function resolveUniqueFilename(
  dir: FileSystemDirectoryHandle,
  base: string,
  ext: string,
  selfName?: string,
): Promise<string> {
  const taken = new Set<string>();
  for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    taken.add(name.toLowerCase());
  }
  const selfLower = selfName?.toLowerCase();
  const candidate = `${base}.${ext}`;
  if (candidate.toLowerCase() === selfLower) return candidate;
  if (!taken.has(candidate.toLowerCase())) return candidate;
  for (let i = 1; i <= 9999; i++) {
    const next = `${base} ${i}.${ext}`;
    if (next.toLowerCase() === selfLower) return next;
    if (!taken.has(next.toLowerCase())) return next;
  }
  throw new Error(`Could not find a unique filename for "${base}.${ext}" after 9999 attempts`);
}

// Same idea as resolveUniqueFilename, but for directory names (no extension).
// Used by folder-bundle skills under `.assets/skills/<base>/`.
export async function resolveUniqueDirname(
  dir: FileSystemDirectoryHandle,
  base: string,
): Promise<string> {
  const taken = new Set<string>();
  for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    taken.add(name.toLowerCase());
  }
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 1; i <= 9999; i++) {
    const next = `${base} ${i}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
  throw new Error(`Could not find a unique dirname for "${base}" after 9999 attempts`);
}
