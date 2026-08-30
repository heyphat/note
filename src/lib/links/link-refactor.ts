/**
 * Rewrite `[[old title]]` references to `[[new title]]` across every note
 * that links to an id being renamed. Called from page.tsx after a successful
 * store.rename() / store.move() so the vault's graph stays consistent.
 *
 * Only the wikilink `target` portion is touched — `[[old|display]]` keeps
 * its display text, `[[old#section]]` keeps its section, and `![[old]]`
 * transclusions are rewritten along with regular links. Pipe-aliases let
 * users retain wording across renames that obsolete the raw title.
 */

import type { NoteStore } from '../storage';
import type { LinkIndex } from './link-index';
import { normalizeWikiTarget, parseWikiLinks } from './link-parser';

export interface RefactorResult {
  /** Number of notes modified. */
  notesUpdated: number;
  /** Total wikilink occurrences rewritten. */
  linksUpdated: number;
  /** Ids that failed to save (permission error, disk, etc). */
  errors: string[];
}

/**
 * Replace every `[[oldTitle]]` / `![[oldTitle]]` / `[[oldTitle#...]]` with
 * the corresponding `[[newTitle...]]` in the given source text. Pipe aliases
 * are preserved. Returns both the rewritten text and the number of edits
 * made so the caller can report progress without walking twice.
 */
export function rewriteLinksInText(source: string, oldTitle: string, newTitle: string): { text: string; count: number } {
  const refs = parseWikiLinks(source);
  if (!refs.length) return { text: source, count: 0 };
  const oldKey = normalizeWikiTarget(oldTitle);
  // Walk refs in reverse so splicing doesn't invalidate earlier offsets.
  let text = source;
  let count = 0;
  for (let i = refs.length - 1; i >= 0; i--) {
    const r = refs[i];
    if (normalizeWikiTarget(r.target) !== oldKey) continue;
    // Rebuild only the target portion — preserve section and display text.
    const pipe = r.display ? `|${r.display}` : '';
    const hash = r.section ? `#${r.section}` : '';
    const replacement = `${r.isTransclusion ? '!' : ''}[[${newTitle}${hash}${pipe}]]`;
    text = text.slice(0, r.start) + replacement + text.slice(r.end);
    count += 1;
  }
  return { text, count };
}

/**
 * Find every note that currently links to `oldTitle`, rewrite those
 * references to `newTitle`, and save the modified notes. The link index is
 * used to find candidate source notes in O(1); a body read per source is
 * required to produce a new text that preserves the rest of the note.
 */
export async function refactorLinks(
  store: NoteStore,
  linkIndex: LinkIndex,
  oldTitle: string,
  newTitle: string,
): Promise<RefactorResult> {
  const result: RefactorResult = { notesUpdated: 0, linksUpdated: 0, errors: [] };
  if (normalizeWikiTarget(oldTitle) === normalizeWikiTarget(newTitle)) return result;
  const backlinks = linkIndex.getBacklinks(oldTitle);
  if (!backlinks.length) return result;
  const sourceIds = new Set(backlinks.map(b => b.sourceId));
  for (const sourceId of Array.from(sourceIds)) {
    try {
      const data = await store.get(sourceId);
      if (!data) continue;
      const { text, count } = rewriteLinksInText(data.text || '', oldTitle, newTitle);
      if (!count || text === (data.text || '')) continue;
      await store.saveContent(sourceId, text, data.title, {
        expected: { size: data.size, mtimeMs: data.mtimeMs },
      });
      // Keep the in-memory index in sync with what we just wrote. The
      // search-index body pass would catch this eventually via update(),
      // but running it now avoids a window where backlink panels show
      // stale results.
      linkIndex.update(sourceId, text);
      result.notesUpdated += 1;
      result.linksUpdated += count;
    } catch (err) {
      result.errors.push(sourceId);
      console.warn('[links] refactor failed for', sourceId, err);
    }
  }
  return result;
}
