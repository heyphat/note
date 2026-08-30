/**
 * Forward + reverse wikilink index.
 *
 * Forward:  noteId → list of {target, ...} references that note contains.
 * Reverse:  normalized target → set of noteIds that link to that target.
 *
 * The index operates on *normalized* targets (see normalizeWikiTarget) so
 * `[[My Note]]` and `[[my note]]` collide onto the same bucket. Callers that
 * need to display a human target should pull one of the stored refs.
 *
 * No dependency on the search index — this object is standalone. The search
 * index (BrowserFsSearchIndex) drives the update/remove calls from its
 * body-indexing pass so linkages stay in sync with note bodies.
 */

import { normalizeWikiTarget } from './link-parser';
import { buildLinkRefs, type LinkRefWithContext } from './link-refs';

export type { LinkRefWithContext } from './link-refs';

export interface Backlink {
  /** Note id that contains the link. */
  sourceId: string;
  /** The normalized target of the link (matches what was queried). */
  target: string;
  /** Short surrounding snippet from the source note's body. */
  context: string;
  /** Heading fragment if the link pointed at `target#section`. */
  section: string;
  /** True when this is a transclusion (`![[...]]`). */
  isTransclusion: boolean;
}

export interface GraphEdge {
  sourceId: string;
  /** Normalized target; may or may not resolve to an actual note id. */
  target: string;
  isTransclusion: boolean;
}

export class LinkIndex {
  /** noteId → refs found in that note. Empty array means "indexed, no links". */
  private forward = new Map<string, LinkRefWithContext[]>();
  /** normalized target → set of sourceIds that link to it. */
  private reverse = new Map<string, Set<string>>();
  private listeners = new Set<() => void>();

  /** Replace the full ref set for a note. Diffs against the previous set to keep reverse map consistent. */
  update(noteId: string, body: string): void {
    this.updateRefs(noteId, buildLinkRefs(body));
  }

  /** Replace the full ref set for a note when refs were already derived elsewhere. */
  updateRefs(noteId: string, refs: LinkRefWithContext[]): void {
    this.replaceForward(noteId, refs.map(ref => ({ ...ref })));
  }

  /** Remove a note from the index entirely. */
  remove(noteId: string): void {
    this.replaceForward(noteId, []);
    this.forward.delete(noteId);
    this.emitChange();
  }

  /** Rewire the links belonging to an id after a move/rename. No re-parse needed. */
  rename(oldId: string, newId: string): void {
    if (oldId === newId) return;
    const refs = this.forward.get(oldId);
    if (refs == null) return;
    this.forward.delete(oldId);
    this.forward.set(newId, refs);
    // Rewire reverse entries that listed oldId as a source.
    this.reverse.forEach(set => {
      if (set.delete(oldId)) set.add(newId);
    });
    this.emitChange();
  }

  /** All backlinks pointing at `target` (target may be a normalized title OR a note id). */
  getBacklinks(target: string): Backlink[] {
    const key = normalizeWikiTarget(target);
    const sources = this.reverse.get(key);
    if (!sources || !sources.size) return [];
    const out: Backlink[] = [];
    for (const sourceId of Array.from(sources)) {
      const refs = this.forward.get(sourceId);
      if (!refs) continue;
      for (const r of refs) {
        if (normalizeWikiTarget(r.target) === key) {
          out.push({
            sourceId,
            target: r.target,
            context: r.context,
            section: r.section,
            isTransclusion: r.isTransclusion,
          });
        }
      }
    }
    return out;
  }

  /** Outgoing links from a note (in source order). */
  getForwardLinks(noteId: string): LinkRefWithContext[] {
    return this.forward.get(noteId) ?? [];
  }

  /** Every edge in the graph, for the graph view. */
  getAllEdges(): GraphEdge[] {
    const out: GraphEdge[] = [];
    this.forward.forEach((refs, sourceId) => {
      for (const r of refs) {
        out.push({
          sourceId,
          target: normalizeWikiTarget(r.target),
          isTransclusion: r.isTransclusion,
        });
      }
    });
    return out;
  }

  /** Ids with at least one outgoing link — useful for graph node filtering. */
  getLinkedIds(): string[] {
    return Array.from(this.forward.keys());
  }

  /** Snapshot for persistence. Re-hydrated via `hydrate()`. */
  serialize(): { forward: Record<string, LinkRefWithContext[]> } {
    const forward: Record<string, LinkRefWithContext[]> = {};
    this.forward.forEach((refs, id) => { forward[id] = refs; });
    return { forward };
  }

  /** Load a previously-serialized snapshot. Rebuilds the reverse map. */
  hydrate(snapshot: { forward: Record<string, LinkRefWithContext[]> } | null | undefined): void {
    this.forward.clear();
    this.reverse.clear();
    if (!snapshot || !snapshot.forward) return;
    for (const [id, refs] of Object.entries(snapshot.forward)) {
      if (!Array.isArray(refs)) continue;
      this.forward.set(id, refs);
      for (const r of refs) {
        const key = normalizeWikiTarget(r.target);
        let bucket = this.reverse.get(key);
        if (!bucket) { bucket = new Set(); this.reverse.set(key, bucket); }
        bucket.add(id);
      }
    }
    this.emitChange();
  }

  /** Subscribe to any mutation. Returns an unsubscribe fn. */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private replaceForward(noteId: string, next: LinkRefWithContext[]): void {
    const prev = this.forward.get(noteId) ?? [];
    const prevKeys = new Set(prev.map(r => normalizeWikiTarget(r.target)));
    const nextKeys = new Set(next.map(r => normalizeWikiTarget(r.target)));
    // Remove noteId from buckets no longer linked to.
    Array.from(prevKeys).forEach(k => {
      if (nextKeys.has(k)) return;
      const bucket = this.reverse.get(k);
      if (!bucket) return;
      bucket.delete(noteId);
      if (!bucket.size) this.reverse.delete(k);
    });
    // Add noteId to buckets newly linked to.
    Array.from(nextKeys).forEach(k => {
      if (prevKeys.has(k)) return;
      let bucket = this.reverse.get(k);
      if (!bucket) { bucket = new Set(); this.reverse.set(k, bucket); }
      bucket.add(noteId);
    });
    if (next.length) this.forward.set(noteId, next);
    else this.forward.delete(noteId);
    this.emitChange();
  }

  /**
   * Coalesce listener notifications via queueMicrotask — one fire per
   * synchronous burst instead of one per note. Without this, a 70k-note
   * cold-indexing pass fired setLinksVersion 70,000 times in quick
   * succession, triggering that many React reconciliations of the entire
   * page.tsx tree and piling up transient allocations faster than V8 could
   * GC them. `emitProgress` and `emitTagsChanged` in browser-fs-index.ts
   * use the same pattern.
   */
  private changePending = false;
  private emitChange(): void {
    if (this.changePending) return;
    if (!this.listeners.size) return;
    this.changePending = true;
    queueMicrotask(() => {
      this.changePending = false;
      if (!this.listeners.size) return;
      for (const cb of Array.from(this.listeners)) cb();
    });
  }
}
