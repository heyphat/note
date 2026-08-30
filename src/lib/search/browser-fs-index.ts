import type { SearchResult, Options as MiniSearchOptions } from 'minisearch';
import type { NoteMeta, NoteStore } from '../storage';
import type { VaultSnapshot } from '../storage/vault-cache';
import { SNAPSHOT_VERSION } from '../storage/vault-cache';
import { parseFrontmatter } from '../frontmatter';
import { extractTags } from './tags';
import { LinkIndex } from '../links/link-index';
import type { IndexParserClient } from './index-parser-client';
import type { ParsedNote } from './index-parser.worker';
import { SearchIndexClient, type IndexDoc } from './search-index-client';
import type { IndexProgress, SearchHit, SearchIndex, SearchQuery, TagCount } from './types';

const SNIPPET_WINDOW = 80;
const IDLE_TIMEOUT_MS = 1000;
const BATCH_TARGET_BYTES = 384 * 1024;
const BATCH_MIN_NOTES = 16;
const BATCH_MAX_NOTES = 64;
const UNKNOWN_NOTE_SIZE = 4096;
const SLICE_SYNC_BUDGET_MS = 12;
// Cap on the stored preview kept alongside MiniSearch's storeFields. This is
// independent from the searchable body slice below: `bodySnippet` exists only
// so result rows can show a preview without reading the note back from disk.
//
// Tiered by vault size because the memory constraint is the *total* stored
// body volume, not per-note:
//   <5k notes    → no cap. Small vaults (the common case) get exact-match
//                  snippets inside long notes, same as before the refactor.
//   <30k notes   → 8 KB per note. Covers the vast majority of notes in full
//                  (most are small); only content-dense notes get clamped.
//   ≥30k notes   → 2 KB per note. Protection mode for the huge-vault OOM
//                  path that caused crashes on 70k-note vaults.
// A shorter note is stored in full regardless of tier — the cap only clamps
// outliers above it.
const SNIPPET_CAP_SMALL = Number.POSITIVE_INFINITY;
const SNIPPET_CAP_MEDIUM = 8 * 1024;
const SNIPPET_CAP_LARGE = 2 * 1024;

function snippetCapForVault(noteCount: number): number {
  if (noteCount < 5000) return SNIPPET_CAP_SMALL;
  if (noteCount < 30000) return SNIPPET_CAP_MEDIUM;
  return SNIPPET_CAP_LARGE;
}

function buildSnippet(body: string, cap: number): string {
  if (!body) return '';
  return body.length > cap ? body.slice(0, cap) : body;
}

// Cap on the *searchable* body sent to MiniSearch. This is the real memory
// bound for the worker heap: MiniSearch's inverted index cost is dominated by
// token count / unique-term count, not by the small stored preview above.
//
// The budgets below are raw text budgets, not heap budgets. MiniSearch turns
// each indexed term into nested maps and postings lists, so a few tens of MB
// of body text can easily become hundreds of MB of worker heap.
//
// For small vaults we keep full-body search. Once the vault is large enough to
// hit Chrome's per-process ceiling, body search degrades to a prefix search:
// titles + paths remain fully indexed, while only the first N bytes of each
// note body feed the inverted index.
const SEARCH_BODY_BUDGET_MEDIUM = 20 * 1024 * 1024;
const SEARCH_BODY_BUDGET_LARGE = 12 * 1024 * 1024;
const SEARCH_BODY_CAP_SMALL = Number.POSITIVE_INFINITY;
const SEARCH_BODY_CAP_MEDIUM_MIN = 1024;
const SEARCH_BODY_CAP_MEDIUM_MAX = 4 * 1024;
const SEARCH_BODY_CAP_LARGE_MIN = 256;
const SEARCH_BODY_CAP_LARGE_MAX = 1024;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function searchBodyCapForVault(noteCount: number): number {
  if (noteCount < 5000) return SEARCH_BODY_CAP_SMALL;
  if (noteCount < 30000) {
    return clamp(
      Math.floor(SEARCH_BODY_BUDGET_MEDIUM / Math.max(noteCount, 1)),
      SEARCH_BODY_CAP_MEDIUM_MIN,
      SEARCH_BODY_CAP_MEDIUM_MAX,
    );
  }
  return clamp(
    Math.floor(SEARCH_BODY_BUDGET_LARGE / Math.max(noteCount, 1)),
    SEARCH_BODY_CAP_LARGE_MIN,
    SEARCH_BODY_CAP_LARGE_MAX,
  );
}

function buildIndexedBody(body: string, cap: number): string {
  if (!body) return '';
  return body.length > cap ? body.slice(0, cap) : body;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isIndexDebugEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('notesIndexDebug') === '1';
  } catch {
    return false;
  }
}

type BatchMetrics = {
  notes: number;
  estimatedBytes: number;
  parseMs: number;
  applyMs: number;
  upsertMs: number;
  syncMs: number;
};

type DebugTotals = {
  startedAtMs: number;
  notes: number;
  bytes: number;
  parseMs: number;
  applyMs: number;
  upsertMs: number;
  slices: number;
};

function makeSnippet(body: string, terms: string[]): string | undefined {
  if (!body || !terms.length) return undefined;
  const lower = body.toLowerCase();
  let best = -1;
  for (const t of terms) {
    if (!t) continue;
    const idx = lower.indexOf(t.toLowerCase());
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  if (best === -1) return body.slice(0, SNIPPET_WINDOW * 2).replace(/\s+/g, ' ');
  const start = Math.max(0, best - Math.floor(SNIPPET_WINDOW / 2));
  const end = Math.min(body.length, best + SNIPPET_WINDOW);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return (prefix + body.slice(start, end) + suffix).replace(/\s+/g, ' ');
}

// Returns true when the walked file looks different from the indexed one.
// When both sides carry size+mtime (the fast walk in browser-fs.ts), that
// pair is authoritative. Otherwise fall back to updatedAt, which is the
// original diff key — still correct, just fuzzier when frontmatter
// updatedAt diverges from file mtime (e.g. after a rename-only save).
function fileChanged(prev: NoteMeta, next: NoteMeta): boolean {
  if (prev.size != null && next.size != null && prev.mtimeMs != null && next.mtimeMs != null) {
    return prev.size !== next.size || prev.mtimeMs !== next.mtimeMs;
  }
  return prev.updatedAt !== next.updatedAt;
}

type IdleFn = (cb: () => void) => number;
type CancelFn = (handle: number) => void;

function getScheduler(): { schedule: IdleFn; cancel: CancelFn } {
  if (typeof window === 'undefined') {
    return { schedule: () => 0, cancel: () => {} };
  }
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (h: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    return {
      schedule: cb => w.requestIdleCallback!(cb, { timeout: IDLE_TIMEOUT_MS }),
      cancel: h => w.cancelIdleCallback!(h),
    };
  }
  return {
    schedule: cb => window.setTimeout(cb, 50),
    cancel: h => window.clearTimeout(h),
  };
}

/**
 * In-memory full-text index backed by MiniSearch. Titles are indexed
 * synchronously on `sync`; bodies are fetched from the NoteStore during
 * idle time so the initial boot is non-blocking.
 */
export class BrowserFsSearchIndex implements SearchIndex {
  private store: NoteStore;
  private parser: IndexParserClient | null;
  // MiniSearch now lives in a dedicated worker so its inverted index and
  // stored bodies no longer count against the main-thread renderer's heap
  // budget (the cause of "Aw, Snap" OOMs on huge vaults). `ms` is the
  // main-thread RPC handle; every read/write is async.
  private ms: SearchIndexClient;
  private notesMeta = new Map<string, NoteMeta>();
  private bodyIndexed = new Set<string>();
  // Files that couldn't be indexed (worker error, file read failed, too
  // large to parse). Counted in progress() so the bar can actually reach
  // 100% instead of stalling at (indexed + failures) forever. Cleared on
  // re-sync when a file's size/mtime changes — a future on-disk change
  // might fix whatever caused the failure.
  private bodyFailures = new Set<string>();
  private pending: string[] = [];
  private pendingSet = new Set<string>();
  private idleHandle: number | null = null;
  private sliceRunning = false;
  private progressListeners = new Set<(p: IndexProgress) => void>();
  // Forward tag → ids and reverse id → tags. The reverse map lets us undo
  // a note's tag membership on update/remove without scanning every tag set.
  private tagIndex = new Map<string, Set<string>>();
  private noteTags = new Map<string, Set<string>>();
  private tagListeners = new Set<(tags: TagCount[]) => void>();
  private metaListeners = new Set<(id: string, patch: Partial<NoteMeta>) => void>();
  private linkIndex = new LinkIndex();
  private scheduler = getScheduler();
  private disposed = false;
  private debugTotals: DebugTotals | null = isIndexDebugEnabled()
    ? {
        startedAtMs: nowMs(),
        notes: 0,
        bytes: 0,
        parseMs: 0,
        applyMs: 0,
        upsertMs: 0,
        slices: 0,
      }
    : null;

  constructor(store: NoteStore, snapshot?: VaultSnapshot | null, parser?: IndexParserClient | null) {
    this.store = store;
    this.parser = parser ?? null;
    const opts = BrowserFsSearchIndex.msOptions();
    // Hydrate inside the worker — the snapshot's indexJson never touches
    // the main-thread heap. `loadJS` failure inside the worker falls back
    // to an empty MiniSearch, so the client always reaches init-done.
    this.ms = new SearchIndexClient(opts, snapshot?.indexJson ?? undefined);
    if (snapshot) {
      for (const n of snapshot.notes) this.notesMeta.set(n.id, n);
      for (const id of snapshot.bodyIndexed) this.bodyIndexed.add(id);
      for (const [tag, ids] of Object.entries(snapshot.tagForward)) {
        this.tagIndex.set(tag, new Set(ids));
      }
      for (const [id, tags] of Object.entries(snapshot.tagReverse)) {
        this.noteTags.set(id, new Set(tags));
      }
      if (snapshot.links) {
        this.linkIndex.hydrate({ forward: snapshot.links });
      }
    }
  }

  getLinkIndex(): LinkIndex {
    return this.linkIndex;
  }

  private static msOptions(): MiniSearchOptions<IndexDoc> {
    return {
      // `body` is indexed for search, but on mid/large vaults it is a capped
      // prefix chosen by searchBodyCapForVault(). Keeping full bodies here is
      // what pushed the worker heap into multi-GB territory.
      fields: ['title', 'body', 'path'],
      // `bodySnippet` stores a preview prefix for result rendering. It may be
      // larger than the searchable body slice because stored preview quality
      // and inverted-index memory are separate tradeoffs.
      storeFields: ['id', 'title', 'bodySnippet', 'updatedAt', 'createdAt'],
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: { title: 3, path: 1.5, body: 1 },
        combineWith: 'AND',
      },
      idField: 'id',
    };
  }

  /**
   * Serialize the current state to a snapshot suitable for IndexedDB storage.
   * Opaque to callers — they just round-trip it through vault-cache. Large:
   * at 70k notes with stored bodies, expect ~100-200 MB.
   *
   * Prefers `notesMeta` values over the caller's `notes` so refined titles
   * (which land in notesMeta the instant applyParsed / update runs) make it
   * into the snapshot even if the 250 ms meta-patch flush hasn't bubbled
   * them into the caller's React state yet. Without this merge, a snapshot
   * saved between applyParsed and the flush captures filename-based titles
   * and the next boot reloads them — the merge branch in sync() then locks
   * those stale titles in because bodyIndexed says "already done".
   */
  async serialize(notes: NoteMeta[], folders: string[]): Promise<VaultSnapshot> {
    const tagForward: Record<string, string[]> = {};
    this.tagIndex.forEach((ids, tag) => { tagForward[tag] = Array.from(ids); });
    const tagReverse: Record<string, string[]> = {};
    this.noteTags.forEach((tags, id) => { tagReverse[id] = Array.from(tags); });
    const { forward: linksForward } = this.linkIndex.serialize();
    const refined = notes.map(n => {
      const m = this.notesMeta.get(n.id);
      return m ? { ...n, ...m } : n;
    });
    // toJSON is an RPC to the worker — it serialises the MiniSearch index
    // there and ships the structured-cloned payload back for IDB write.
    const indexJson = await this.ms.toJSON();
    return {
      version: SNAPSHOT_VERSION,
      savedAt: Date.now(),
      notes: refined,
      folders,
      indexJson,
      tagForward,
      tagReverse,
      bodyIndexed: Array.from(this.bodyIndexed),
      links: linksForward,
    };
  }

  sync(notes: NoteMeta[]): void {
    const seen = new Set<string>();
    for (const n of notes) {
      seen.add(n.id);
      const prev = this.notesMeta.get(n.id);
      // Preserve a refined title (from body indexing) over the cheap
      // filename-derived title from a fresh walk — otherwise the next walk
      // would reset every title to its filename slug. size+mtime still
      // drive the "did the file change" decision below.
      const merged: NoteMeta = prev && this.bodyIndexed.has(n.id)
        ? { ...n, title: prev.title, createdAt: prev.createdAt, updatedAt: prev.updatedAt }
        : n;
      this.notesMeta.set(n.id, merged);
      if (!prev) {
        this.addTitleDoc(merged);
        this.enqueue(n.id);
      } else if (fileChanged(prev, n)) {
        // The file on disk differs from what we indexed — re-queue. The old
        // body doc stays in place so search results don't regress while we
        // re-read. Clear any prior failure so the change gets a fresh try.
        this.bodyIndexed.delete(n.id);
        this.bodyFailures.delete(n.id);
        this.enqueue(n.id);
      } else if (!this.bodyIndexed.has(n.id) && !this.bodyFailures.has(n.id)) {
        // Cached note whose body hasn't been indexed yet (previous session
        // didn't finish the cold pass before the snapshot saved). Resume
        // where it left off so titles/tags catch up. Skip if it previously
        // failed — retries happen on file change, not on resync.
        this.enqueue(n.id);
      } else if (prev.title !== merged.title) {
        // Pure title change (no body change). Rewrite the title doc using
        // whatever body we already have.
        this.replaceTitleDoc(merged);
      }
    }
    for (const id of Array.from(this.notesMeta.keys())) {
      if (!seen.has(id)) this.removeInternal(id);
    }
    this.kickIdle();
    this.emitProgress();
  }

  progress(): IndexProgress {
    // Count failures toward `indexed` so progress actually reaches total.
    // Without this, a single unreadable file stalls the bar at (total - 1)
    // forever — no feedback to the user that anything went wrong either.
    return { indexed: this.bodyIndexed.size + this.bodyFailures.size, total: this.notesMeta.size };
  }

  onProgress(cb: (p: IndexProgress) => void): () => void {
    this.progressListeners.add(cb);
    cb(this.progress());
    return () => { this.progressListeners.delete(cb); };
  }

  async search(q: SearchQuery): Promise<SearchHit[]> {
    const text = (q.text || '').trim();
    let raw: SearchResult[];
    if (text) {
      // Round-trips to the worker. Typical latency ~1–2 ms on top of the
      // query itself; indistinguishable from the old in-process path.
      raw = await this.ms.search(text);
    } else {
      // Empty text: return every note so date/sort filters still yield
      // useful results (e.g. `updated:>7d` with no free text).
      raw = Array.from(this.notesMeta.values()).map(n => ({
        id: n.id,
        score: 0,
        match: {},
        terms: [],
        queryTerms: [],
        title: n.title,
        body: '',
        updatedAt: n.updatedAt,
        createdAt: n.createdAt,
      } as unknown as SearchResult));
    }
    const sort = q.sort || (text ? 'relevance' : 'updated');
    const terms = text ? text.split(/\s+/).filter(Boolean) : [];
    const hits: SearchHit[] = [];
    for (const r of raw) {
      const id = r.id as string;
      const meta = this.notesMeta.get(id);
      if (!meta) continue;
      if (q.updatedAfter && meta.updatedAt < q.updatedAfter) continue;
      if (q.updatedBefore && meta.updatedAt > q.updatedBefore) continue;
      if (q.createdAfter && meta.createdAt < q.createdAfter) continue;
      if (q.createdBefore && meta.createdAt > q.createdBefore) continue;
      if (q.tags && q.tags.length) {
        const noteTags = this.noteTags.get(id);
        // AND semantics: note must carry every requested tag.
        let ok = !!noteTags;
        if (ok) {
          for (const t of q.tags) {
            if (!noteTags!.has(t.toLowerCase())) { ok = false; break; }
          }
        }
        if (!ok) continue;
      }
      // Result snippets come from the stored preview prefix. On mid/large
      // vaults the searchable body is also prefix-capped, so a result only
      // exists when the match was inside that searchable prefix. If the match
      // is outside the stored preview prefix, makeSnippet falls back to the
      // top-of-note preview.
      const snippetSource = typeof (r as unknown as { bodySnippet?: string }).bodySnippet === 'string'
        ? ((r as unknown as { bodySnippet: string }).bodySnippet)
        : '';
      hits.push({
        id,
        title: meta.title,
        score: r.score,
        snippet: terms.length ? makeSnippet(snippetSource, terms) : undefined,
        matchedTerms: terms,
        updatedAt: meta.updatedAt,
      });
    }
    hits.sort((a, b) => {
      const ma = this.notesMeta.get(a.id);
      const mb = this.notesMeta.get(b.id);
      switch (sort) {
        case 'title':
          return (ma?.title || '').localeCompare(mb?.title || '', undefined, { sensitivity: 'base' });
        case 'created':
          return (mb?.createdAt || '').localeCompare(ma?.createdAt || '');
        case 'updated':
          return (mb?.updatedAt || '').localeCompare(ma?.updatedAt || '');
        default:
          return b.score - a.score;
      }
    });
    return q.limit ? hits.slice(0, q.limit) : hits;
  }

  async update(id: string): Promise<void> {
    if (this.disposed) return;
    const meta = this.notesMeta.get(id);
    if (!meta) return;
    const data = await this.store.get(id);
    if (!data || this.disposed) return;
    const { metaList, content } = parseFrontmatter(data.text || '');
    const snippetCap = snippetCapForVault(this.notesMeta.size);
    const searchBodyCap = searchBodyCapForVault(this.notesMeta.size);
    const doc: IndexDoc = {
      id,
      title: data.title || meta.title,
      body: buildIndexedBody(content, searchBodyCap),
      bodySnippet: buildSnippet(content, snippetCap),
      path: id,
      updatedAt: data.updatedAt || meta.updatedAt,
      createdAt: data.createdAt || meta.createdAt,
    };
    // Fire-and-forget: the worker processes messages in FIFO order, so the
    // subsequent search() calls that await their RPC will see this upsert.
    void this.ms.upsert(doc);
    this.bodyIndexed.add(id);
    const prevMeta = meta;
    const nextMeta: NoteMeta = {
      ...prevMeta,
      title: doc.title,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
    this.notesMeta.set(id, nextMeta);
    // Surface title/date refinements back to the UI so filename-fallback
    // titles get replaced once frontmatter/headings have been read.
    const patch: Partial<NoteMeta> = {};
    if (prevMeta.title !== nextMeta.title) patch.title = nextMeta.title;
    if (prevMeta.createdAt !== nextMeta.createdAt) patch.createdAt = nextMeta.createdAt;
    if (prevMeta.updatedAt !== nextMeta.updatedAt) patch.updatedAt = nextMeta.updatedAt;
    if (Object.keys(patch).length) this.emitMetaChange(id, patch);
    const tags = extractTags(content, metaList.tags || []);
    this.reassignTags(id, tags);
    this.linkIndex.update(id, content);
    this.emitProgress();
  }

  remove(id: string): void {
    this.removeInternal(id);
    this.emitProgress();
  }

  getTags(): TagCount[] {
    const out: TagCount[] = [];
    this.tagIndex.forEach((ids, tag) => {
      if (ids.size > 0) out.push({ tag, count: ids.size });
    });
    out.sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));
    return out;
  }

  getNoteIdsForTag(tag: string): Set<string> {
    return this.tagIndex.get(tag.toLowerCase()) ?? new Set();
  }

  onTagsChange(cb: (tags: TagCount[]) => void): () => void {
    this.tagListeners.add(cb);
    cb(this.getTags());
    return () => { this.tagListeners.delete(cb); };
  }

  onMetaChange(cb: (id: string, patch: Partial<NoteMeta>) => void): () => void {
    this.metaListeners.add(cb);
    return () => { this.metaListeners.delete(cb); };
  }

  private emitMetaChange(id: string, patch: Partial<NoteMeta>): void {
    if (!this.metaListeners.size) return;
    for (const cb of Array.from(this.metaListeners)) cb(id, patch);
  }

  async rename(oldId: string, newId: string): Promise<void> {
    // Move the linkIndex entry first so backlink queries keep resolving
    // across the rename. removeInternal() below calls linkIndex.remove(oldId)
    // — a no-op since we just rewired the key — so the reverse map stays
    // pointed at newId. update() later replaces with fresh refs once the
    // post-rename body is read.
    this.linkIndex.rename(oldId, newId);
    this.removeInternal(oldId);
    if (this.notesMeta.has(newId)) await this.update(newId);
  }

  dispose(): void {
    this.disposed = true;
    if (this.idleHandle != null) {
      this.scheduler.cancel(this.idleHandle);
      this.idleHandle = null;
    }
    this.parser?.dispose();
    this.parser = null;
    this.ms.dispose();
    this.progressListeners.clear();
    this.tagListeners.clear();
    this.metaListeners.clear();
  }

  // --- internals ---

  private addTitleDoc(n: NoteMeta): void {
    // The worker's `upsert` does the add-vs-replace decision — we don't
    // need to round-trip for a `has` check. Body is empty here; the full
    // reparse happens during the adaptive idle slice that follows.
    void this.ms.upsert({
      id: n.id,
      title: n.title,
      body: '',
      bodySnippet: '',
      path: n.id,
      updatedAt: n.updatedAt,
      createdAt: n.createdAt,
    });
  }

  private replaceTitleDoc(n: NoteMeta): void {
    // Title-only change (file fingerprint unchanged but tracked title drifted).
    // Previously we pulled the stored body out of MiniSearch and rewrote the
    // doc inline; with MiniSearch now in a worker that would require a
    // round-trip read before every write, and title-only refreshes are rare
    // enough that re-queuing for a full reparse is simpler and correct.
    this.bodyIndexed.delete(n.id);
    this.bodyFailures.delete(n.id);
    this.enqueue(n.id);
  }

  private removeInternal(id: string): void {
    this.notesMeta.delete(id);
    this.bodyIndexed.delete(id);
    this.bodyFailures.delete(id);
    this.pendingSet.delete(id);
    // Worker guards against discarding an id it doesn't have; no need for
    // a has-check round trip.
    void this.ms.discard(id);
    // reassignTags is a no-op when the note had no tags (diff is empty), so
    // calling unconditionally is fine and keeps the bookkeeping in one place.
    this.reassignTags(id, []);
    this.linkIndex.remove(id);
  }

  /**
   * Replace the tag set for a note. Diffs against the previous set so listeners
   * only fire when the tag index actually changes. Keeps the forward tag→ids
   * map and the reverse id→tags map consistent.
   */
  private reassignTags(id: string, nextTags: string[]): void {
    const prev = this.noteTags.get(id) ?? new Set<string>();
    const next = new Set(nextTags.map(t => t.toLowerCase()).filter(Boolean));
    let changed = prev.size !== next.size;
    if (!changed) {
      const prevArr = Array.from(prev);
      for (const t of prevArr) if (!next.has(t)) { changed = true; break; }
    }
    if (!changed) return;
    const prevArr = Array.from(prev);
    for (const t of prevArr) {
      if (next.has(t)) continue;
      const bucket = this.tagIndex.get(t);
      if (!bucket) continue;
      bucket.delete(id);
      if (!bucket.size) this.tagIndex.delete(t);
    }
    const nextArr = Array.from(next);
    for (const t of nextArr) {
      if (prev.has(t)) continue;
      let bucket = this.tagIndex.get(t);
      if (!bucket) { bucket = new Set(); this.tagIndex.set(t, bucket); }
      bucket.add(id);
    }
    if (next.size) this.noteTags.set(id, next);
    else this.noteTags.delete(id);
    this.emitTagsChanged();
  }

  /**
   * Coalesce per-note tag emissions into one listener call per batch.
   *
   * Without this, a large indexing batch fires emitTagsChanged once per note
   * — each call rebuilds the full sorted tag list via getTags() and triggers
   * a downstream React re-render of the whole page. queueMicrotask runs once
   * at the end of the current synchronous burst (i.e. after the batch loop
   * finishes), collapsing those emissions into a single notification.
   */
  private tagsPending = false;
  private emitTagsChanged(): void {
    if (this.tagsPending) return;
    if (!this.tagListeners.size) return;
    this.tagsPending = true;
    queueMicrotask(() => {
      this.tagsPending = false;
      if (this.disposed) return;
      if (!this.tagListeners.size) return;
      const snapshot = this.getTags();
      for (const cb of Array.from(this.tagListeners)) cb(snapshot);
    });
  }

  private enqueue(id: string): void {
    if (this.pendingSet.has(id)) return;
    this.pendingSet.add(id);
    this.pending.push(id);
  }

  private kickIdle(): void {
    if (this.disposed || this.sliceRunning || this.idleHandle != null || !this.pending.length) return;
    this.idleHandle = this.scheduler.schedule(() => {
      this.idleHandle = null;
      void this.drainSlice();
    });
  }

  private takePendingBatch(): { ids: string[]; estimatedBytes: number } {
    if (!this.pending.length) return { ids: [], estimatedBytes: 0 };
    let count = 0;
    let estimatedBytes = 0;
    while (count < this.pending.length && count < BATCH_MAX_NOTES) {
      const id = this.pending[count];
      const size = this.notesMeta.get(id)?.size ?? UNKNOWN_NOTE_SIZE;
      if (count >= BATCH_MIN_NOTES && estimatedBytes + size > BATCH_TARGET_BYTES) break;
      estimatedBytes += size;
      count++;
    }
    if (count === 0) count = 1;
    const ids = this.pending.splice(0, count);
    for (const id of ids) this.pendingSet.delete(id);
    return { ids, estimatedBytes };
  }

  private async processFallbackBatch(batch: string[], estimatedBytes: number): Promise<BatchMetrics> {
    const metrics: BatchMetrics = {
      notes: batch.length,
      estimatedBytes,
      parseMs: 0,
      applyMs: 0,
      upsertMs: 0,
      syncMs: 0,
    };
    for (const id of batch) {
      if (this.disposed) break;
      const startedAt = nowMs();
      try {
        await this.update(id);
      } catch (err) {
        console.warn('[search] failed to index', id, err);
        this.bodyFailures.add(id);
        this.emitProgress();
      } finally {
        const elapsed = nowMs() - startedAt;
        metrics.applyMs += elapsed;
        metrics.syncMs += elapsed;
      }
    }
    return metrics;
  }

  private async processWorkerBatch(batch: string[], estimatedBytes: number): Promise<BatchMetrics> {
    const metrics: BatchMetrics = {
      notes: batch.length,
      estimatedBytes,
      parseMs: 0,
      applyMs: 0,
      upsertMs: 0,
      syncMs: 0,
    };
    const parseStartedAt = nowMs();
    const results = await this.parser!.parseBatch(batch);
    metrics.parseMs = nowMs() - parseStartedAt;
    if (this.disposed) return metrics;
    // The worker may omit ids for batches where a message was dropped; treat
    // anything that didn't come back as a failure so progress doesn't stall.
    const seen = new Set<string>();
    const docs: IndexDoc[] = [];
    const applyStartedAt = nowMs();
    for (const parsed of results) {
      seen.add(parsed.id);
      if (parsed.error) {
        console.warn('[search] parse failed', parsed.id, parsed.error);
        this.bodyFailures.add(parsed.id);
        this.emitProgress();
        continue;
      }
      const doc = this.applyParsed(parsed);
      if (doc) docs.push(doc);
    }
    metrics.applyMs = nowMs() - applyStartedAt;
    metrics.syncMs = metrics.applyMs;
    const upsertStartedAt = nowMs();
    if (docs.length) await this.ms.upsertBatch(docs);
    metrics.upsertMs = nowMs() - upsertStartedAt;
    for (const id of batch) {
      if (!seen.has(id)) this.bodyFailures.add(id);
    }
    if (batch.some(id => !seen.has(id))) this.emitProgress();
    return metrics;
  }

  private async processBatch(batch: string[], estimatedBytes: number): Promise<BatchMetrics> {
    if (this.parser) {
      try {
        return await this.processWorkerBatch(batch, estimatedBytes);
      } catch (err) {
        console.warn('[search] worker batch failed, falling back', err);
      }
    }
    return this.processFallbackBatch(batch, estimatedBytes);
  }

  private logSliceDebug(metrics: BatchMetrics): void {
    if (!this.debugTotals || metrics.notes === 0) return;
    const totals = this.debugTotals;
    totals.slices += 1;
    totals.notes += metrics.notes;
    totals.bytes += metrics.estimatedBytes;
    totals.parseMs += metrics.parseMs;
    totals.applyMs += metrics.applyMs;
    totals.upsertMs += metrics.upsertMs;
    const elapsedMs = Math.max(nowMs() - totals.startedAtMs, 1);
    const notesPerSec = totals.notes / (elapsedMs / 1000);
    const round = (value: number) => Math.round(value * 10) / 10;
    console.debug('[notes-index]', {
      slice: totals.slices,
      notes: metrics.notes,
      estimatedBytes: metrics.estimatedBytes,
      parseMs: round(metrics.parseMs),
      applyMs: round(metrics.applyMs),
      upsertMs: round(metrics.upsertMs),
      totalNotes: totals.notes,
      totalEstimatedBytes: totals.bytes,
      totalParseMs: round(totals.parseMs),
      totalApplyMs: round(totals.applyMs),
      totalUpsertMs: round(totals.upsertMs),
      notesPerSec: round(notesPerSec),
    });
  }

  private async drainSlice(): Promise<void> {
    if (this.disposed || this.sliceRunning) return;
    this.sliceRunning = true;
    let sliceNotes = 0;
    let sliceBytes = 0;
    let sliceParseMs = 0;
    let sliceApplyMs = 0;
    let sliceUpsertMs = 0;
    let sliceSyncMs = 0;
    try {
      while (!this.disposed && this.pending.length) {
        const { ids, estimatedBytes } = this.takePendingBatch();
        if (!ids.length) break;
        const metrics = await this.processBatch(ids, estimatedBytes);
        sliceNotes += metrics.notes;
        sliceBytes += metrics.estimatedBytes;
        sliceParseMs += metrics.parseMs;
        sliceApplyMs += metrics.applyMs;
        sliceUpsertMs += metrics.upsertMs;
        sliceSyncMs += metrics.syncMs;
        if (sliceSyncMs >= SLICE_SYNC_BUDGET_MS) break;
      }
    } finally {
      this.sliceRunning = false;
      this.logSliceDebug({
        notes: sliceNotes,
        estimatedBytes: sliceBytes,
        parseMs: sliceParseMs,
        applyMs: sliceApplyMs,
        upsertMs: sliceUpsertMs,
        syncMs: sliceSyncMs,
      });
      if (this.pending.length) this.kickIdle();
    }
  }

  // Apply a ParsedNote from the worker to the local MiniSearch + tag index.
  // Mirrors the final write-through of update() but skips the file-read and
  // parse steps, which the worker has already done.
  //
  // Returns the IndexDoc for drainSlice to send to the worker in a single
  // batch RPC (cheaper than N postMessages per slice). Returns null
  // when this id is no longer tracked on the main thread.
  private applyParsed(parsed: ParsedNote): IndexDoc | null {
    if (this.disposed) return null;
    const id = parsed.id;
    const meta = this.notesMeta.get(id);
    if (!meta) return null;
    const snippetCap = snippetCapForVault(this.notesMeta.size);
    const searchBodyCap = searchBodyCapForVault(this.notesMeta.size);
    const doc: IndexDoc = {
      id,
      title: parsed.title || meta.title,
      body: buildIndexedBody(parsed.body, searchBodyCap),
      bodySnippet: buildSnippet(parsed.body, snippetCap),
      path: id,
      updatedAt: parsed.updatedAt || meta.updatedAt,
      createdAt: parsed.createdAt || meta.createdAt,
    };
    this.bodyIndexed.add(id);
    const prevMeta = meta;
    const nextMeta: NoteMeta = {
      ...prevMeta,
      title: doc.title,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
    this.notesMeta.set(id, nextMeta);
    const patch: Partial<NoteMeta> = {};
    if (prevMeta.title !== nextMeta.title) patch.title = nextMeta.title;
    if (prevMeta.createdAt !== nextMeta.createdAt) patch.createdAt = nextMeta.createdAt;
    if (prevMeta.updatedAt !== nextMeta.updatedAt) patch.updatedAt = nextMeta.updatedAt;
    if (Object.keys(patch).length) this.emitMetaChange(id, patch);
    this.reassignTags(id, parsed.tags);
    this.linkIndex.updateRefs(id, parsed.links);
    this.emitProgress();
    return doc;
  }

  /**
   * Same coalescing pattern as emitTagsChanged — one progress emission per
   * synchronous burst (batch), not per-note. This is where the bulk of the
   * cold-indexing sluggishness came from: the React page component listens
   * to `onProgress` and each setState triggered a full tree re-render.
   */
  private progressPending = false;
  private emitProgress(): void {
    if (this.progressPending) return;
    if (!this.progressListeners.size) return;
    this.progressPending = true;
    queueMicrotask(() => {
      this.progressPending = false;
      if (this.disposed) return;
      if (!this.progressListeners.size) return;
      const p = this.progress();
      // Copy the listener set — a listener may detach itself during iteration.
      for (const cb of Array.from(this.progressListeners)) cb(p);
    });
  }
}
