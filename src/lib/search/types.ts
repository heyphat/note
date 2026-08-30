import type { NoteMeta } from '../storage';
import type { LinkIndex } from '../links/link-index';

export type SortMode = 'relevance' | 'updated' | 'created' | 'title';

export interface SearchQuery {
  text?: string;
  tags?: string[];
  updatedAfter?: string;
  updatedBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
  sort?: SortMode;
  limit?: number;
}

export interface SearchHit {
  id: string;
  title: string;
  score: number;
  snippet?: string;
  matchedTerms?: string[];
  updatedAt: string;
}

export interface IndexProgress {
  indexed: number;
  total: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface SearchIndex {
  /**
   * Seed the index from a freshly-listed set of notes. Title-only docs are
   * added synchronously; bodies are enqueued for idle-time indexing. Called
   * on boot and after any list-level change (cross-tab sync, folder rename).
   * Docs whose id is no longer in `notes` are removed.
   */
  sync(notes: NoteMeta[]): void;
  progress(): IndexProgress;
  onProgress(cb: (p: IndexProgress) => void): () => void;
  search(q: SearchQuery): Promise<SearchHit[]>;
  /** Re-read body for one note and replace its doc. */
  update(id: string): Promise<void>;
  remove(id: string): void;
  /** Called after a note/folder rename so the index picks up new ids. Equivalent to remove(old) + update(new), but batched. */
  rename(oldId: string, newId: string): Promise<void>;
  /** All known tags with the number of notes each appears in. Sorted by count desc, then alpha. */
  getTags(): TagCount[];
  /** Note ids that carry the given tag (lowercased). Empty set when the tag is unknown. */
  getNoteIdsForTag(tag: string): Set<string>;
  /** Subscribe to tag-set changes. Fires on every update/remove that alters any tag membership. Returns an unsubscribe. */
  onTagsChange(cb: (tags: TagCount[]) => void): () => void;
  /**
   * Subscribe to meta refinements. Fires when body indexing discovers a
   * better title/createdAt/updatedAt than the cheap filename fallback from
   * the storage walk. The callback receives whichever fields changed for
   * the given id, including `size`/`mtimeMs` once known.
   */
  onMetaChange(cb: (id: string, patch: Partial<NoteMeta>) => void): () => void;
  /**
   * Wikilink index built alongside the full-text index. Fed from the same
   * body-indexing pass that extracts tags; consumers (backlinks panel,
   * graph view, unlinked mentions) read via the returned LinkIndex API.
   */
  getLinkIndex(): LinkIndex;
  dispose(): void;
}
