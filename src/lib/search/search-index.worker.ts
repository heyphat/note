// Off-main-thread MiniSearch host.
//
// Why this worker exists: on a huge vault (30k–100k notes) a full-body
// MiniSearch index can eat 300 MB–1 GB of heap — enough to push Chrome
// past the per-tab memory ceiling during a cold index pass and crash the
// tab with "Aw, Snap!".
// Moving the MiniSearch instance into this dedicated worker means the
// entire index lives in a *separate* renderer process with its own heap,
// and the main thread keeps only the cheap bookkeeping (noteMeta, tag
// maps, link index). The UI — React, Crepe, DOM — stays responsive even
// while the worker grinds through a giant reindex.
//
// The parser worker (index-parser.worker.ts) still runs in parallel; it
// reads files and tokenises metadata. This worker just owns the searchable
// index and the snapshot round-trip. Messages between the main thread and
// this worker are simple postMessage RPC — structured-cloneable JSON.

import MiniSearch, { type SearchResult, type Options as MiniSearchOptions } from 'minisearch';

export interface IndexDoc {
  id: string;
  title: string;
  /** Searchable body prefix. Small vaults send the full body; mid/large
   *  vaults send only the first N bytes so the inverted index stays bounded. */
  body: string;
  /** Stored preview prefix used for result snippets. This can be larger than
   *  the searchable body slice because it affects only stored-field memory,
   *  not the inverted index. */
  bodySnippet: string;
  path: string;
  updatedAt: string;
  createdAt: string;
}

type InitMsg = {
  type: 'init';
  options: MiniSearchOptions<IndexDoc>;
  snapshotIndexJson?: unknown;
};
type UpsertMsg = { type: 'upsert'; doc: IndexDoc };
type UpsertBatchMsg = { type: 'upsertBatch'; docs: IndexDoc[]; reqId?: number };
type DiscardMsg = { type: 'discard'; id: string };
type SearchMsg = { type: 'search'; reqId: number; query: string; options?: Record<string, unknown> };
type ToJsonMsg = { type: 'toJSON'; reqId: number };
type GetStoredFieldsMsg = { type: 'getStoredFields'; reqId: number; id: string };
type DisposeMsg = { type: 'dispose' };

type InboundMsg =
  | InitMsg
  | UpsertMsg
  | UpsertBatchMsg
  | DiscardMsg
  | SearchMsg
  | ToJsonMsg
  | GetStoredFieldsMsg
  | DisposeMsg;

type InitDoneMsg = { type: 'init-done' };
type InitErrorMsg = { type: 'init-error'; error: string };
type UpsertBatchDoneMsg = { type: 'upsertBatch-done'; reqId: number };
type SearchDoneMsg = { type: 'search-done'; reqId: number; hits: SearchResult[] };
type ToJsonDoneMsg = { type: 'toJSON-done'; reqId: number; indexJson: unknown };
type GetStoredFieldsDoneMsg = { type: 'getStoredFields-done'; reqId: number; fields: IndexDoc | null };
export type OutboundMsg =
  | InitDoneMsg
  | InitErrorMsg
  | UpsertBatchDoneMsg
  | SearchDoneMsg
  | ToJsonDoneMsg
  | GetStoredFieldsDoneMsg;

let ms: MiniSearch<IndexDoc> | null = null;

function post(msg: OutboundMsg): void {
  (self as unknown as Worker).postMessage(msg);
}

function upsert(doc: IndexDoc): void {
  if (!ms) return;
  if (ms.has(doc.id)) ms.replace(doc);
  else ms.add(doc);
}

self.addEventListener('message', (e: MessageEvent<InboundMsg>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init': {
        // Hydration is tried first. If the snapshot's index JSON can't be
        // re-loaded (schema drift, corruption), fall back to an empty index
        // — the caller will resync from notesMeta and backfill.
        if (msg.snapshotIndexJson) {
          try {
            ms = MiniSearch.loadJS<IndexDoc>(
              msg.snapshotIndexJson as Parameters<typeof MiniSearch.loadJS>[0],
              msg.options,
            );
          } catch (err) {
            console.warn('[search-worker] hydrate failed, starting fresh', err);
            ms = new MiniSearch<IndexDoc>(msg.options);
          }
        } else {
          ms = new MiniSearch<IndexDoc>(msg.options);
        }
        post({ type: 'init-done' });
        return;
      }
      case 'upsert': {
        upsert(msg.doc);
        return;
      }
      case 'upsertBatch': {
        // Single postMessage amortises the RPC cost across a whole
        // adaptive batch so idle indexing bursts aren't chatty.
        // When reqId is present the caller wants an ack — used for
        // back-pressure: the main-thread drain awaits the ack before
        // producing more work, so the main thread can't out-produce the
        // search worker and pile up messages in the worker's incoming queue
        // (which used to balloon into hundreds of MB on huge vaults).
        for (const doc of msg.docs) upsert(doc);
        if (msg.reqId != null) post({ type: 'upsertBatch-done', reqId: msg.reqId });
        return;
      }
      case 'discard': {
        if (ms?.has(msg.id)) ms.discard(msg.id);
        return;
      }
      case 'search': {
        if (!ms) {
          post({ type: 'search-done', reqId: msg.reqId, hits: [] });
          return;
        }
        const hits = ms.search(msg.query, msg.options) as SearchResult[];
        post({ type: 'search-done', reqId: msg.reqId, hits });
        return;
      }
      case 'toJSON': {
        const indexJson = ms ? ms.toJSON() : null;
        post({ type: 'toJSON-done', reqId: msg.reqId, indexJson });
        return;
      }
      case 'getStoredFields': {
        // MiniSearch's TS types don't expose getStoredFields publicly, but
        // the method exists on v6+. Cast to reach it.
        const accessor = ms as unknown as { getStoredFields?: (id: string) => IndexDoc | undefined } | null;
        const fields = accessor?.getStoredFields?.(msg.id) ?? null;
        post({ type: 'getStoredFields-done', reqId: msg.reqId, fields });
        return;
      }
      case 'dispose': {
        ms = null;
        (self as unknown as { close(): void }).close();
        return;
      }
    }
  } catch (err) {
    // A thrown handler would otherwise silently drop the message. Log and
    // — if this was the init message — reject so the client can give up.
    console.warn('[search-worker] handler error', err);
    if ((msg as InboundMsg).type === 'init') {
      post({ type: 'init-error', error: err instanceof Error ? err.message : String(err) });
    }
  }
});
