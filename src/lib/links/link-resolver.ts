/**
 * Resolve a wikilink target string to a concrete note id.
 *
 * Obsidian-style matching: users write `[[Note Title]]` and expect the link
 * to find the file whose title, basename, or stem is a close match. We try:
 *   1. Exact title match (normalized — case + whitespace insensitive)
 *   2. Exact filename match, with or without `.md`
 *   3. Exact id match (the raw on-disk path)
 *   4. Exact stem match (`projects/foo-bar.md` → matches `foo bar`)
 *
 * The first resolver that finds a unique hit wins. When multiple notes share
 * the same title, the tie is broken by lexicographic id order so the choice
 * is stable across runs.
 */

import type { NoteMeta } from '../storage';
import { normalizeWikiTarget } from './link-parser';

export interface ResolvedLink {
  id: string;
  title: string;
}

function normTitle(s: string): string {
  return normalizeWikiTarget(s);
}

function stemFromId(id: string): string {
  const base = id.split('/').pop() || id;
  return base.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

/**
 * Build a lookup table from every note title/basename/stem/id to its id.
 * Returns a map keyed by normalized strings. Call once per notes change
 * and reuse for resolve/isKnown checks.
 */
export function buildLinkResolver(notes: NoteMeta[]): Map<string, NoteMeta> {
  const byKey = new Map<string, NoteMeta>();
  const put = (key: string, note: NoteMeta) => {
    const k = normTitle(key);
    if (!k) return;
    const prev = byKey.get(k);
    if (!prev || note.id < prev.id) byKey.set(k, note);
  };
  for (const n of notes) {
    put(n.title, n);
    put(stemFromId(n.id), n);
    put(n.id, n);
    put(n.id.replace(/\.md$/i, ''), n);
  }
  return byKey;
}

export function resolveLink(resolver: Map<string, NoteMeta>, target: string): ResolvedLink | null {
  const found = resolver.get(normTitle(target));
  return found ? { id: found.id, title: found.title } : null;
}

export function isKnownTarget(resolver: Map<string, NoteMeta>, target: string): boolean {
  return resolver.has(normTitle(target));
}
