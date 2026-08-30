// Main-thread handle for the MiniSearch-hosting worker. Mirrors the subset
// of MiniSearch API surface that BrowserFsSearchIndex actually uses, with
// every call translated into a postMessage RPC. Methods that don't return
// a value (`upsert`, `discard`, `upsertBatch`) are fire-and-forget — they
// await the init gate and then post without waiting for an ack, since the
// worker processes messages in FIFO order and returning void doesn't carry
// information the caller needs. Methods that do return a value (`search`,
// `toJSON`, `getStoredFields`) post a reqId and resolve on the matching
// response.

import type { SearchResult, Options as MiniSearchOptions } from 'minisearch';
import type { IndexDoc, OutboundMsg } from './search-index.worker';

export type { IndexDoc } from './search-index.worker';

export class SearchIndexClient {
  private worker: Worker;
  private initPromise: Promise<void>;
  private pending = new Map<number, (msg: OutboundMsg) => void>();
  private nextReqId = 1;
  private disposed = false;

  constructor(options: MiniSearchOptions<IndexDoc>, snapshotIndexJson?: unknown) {
    // next/webpack picks up the new URL(...) pattern and emits the worker
    // as a separate chunk. Must be a static literal or the bundler can't
    // statically analyse the reference.
    this.worker = new Worker(
      new URL('./search-index.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.addEventListener('message', e => this.onMessage(e));
    this.initPromise = new Promise<void>((resolve, reject) => {
      const once = (e: MessageEvent<OutboundMsg>) => {
        const m = e.data;
        if (m?.type === 'init-done') {
          this.worker.removeEventListener('message', once);
          resolve();
        } else if (m?.type === 'init-error') {
          this.worker.removeEventListener('message', once);
          reject(new Error(m.error));
        }
      };
      this.worker.addEventListener('message', once);
    });
    this.worker.postMessage({ type: 'init', options, snapshotIndexJson });
  }

  private onMessage(e: MessageEvent<OutboundMsg>): void {
    const msg = e.data;
    if (!msg) return;
    // Init messages are handled by the once-listener in the constructor,
    // not by the general dispatcher.
    if (msg.type === 'init-done' || msg.type === 'init-error') return;
    // Responses carry a reqId that maps back to the waiting caller.
    if ('reqId' in msg) {
      const cb = this.pending.get(msg.reqId);
      if (cb) {
        this.pending.delete(msg.reqId);
        cb(msg);
      }
    }
  }

  /** Resolve once the worker has finished constructing / hydrating the
   *  index. Callers don't need to call this explicitly — every method below
   *  awaits the same promise internally — but it's useful when the caller
   *  wants to know the index is live before issuing dependent work. */
  async ready(): Promise<void> {
    await this.initPromise;
  }

  async upsert(doc: IndexDoc): Promise<void> {
    await this.initPromise;
    if (this.disposed) return;
    this.worker.postMessage({ type: 'upsert', doc });
  }

  /** Batch equivalent of upsert — a single postMessage carries an array of
   *  docs. Used by the adaptive idle drain so per-file RPC chatter stays
   *  proportional to batch count, not doc count. Awaited by the caller so
   *  the main thread's indexing loop rate-limits itself to the search
   *  worker's actual throughput — stops pending messages from piling up in
   *  the worker's incoming queue (the primary OOM path on huge vaults). */
  async upsertBatch(docs: IndexDoc[]): Promise<void> {
    if (!docs.length) return;
    await this.initPromise;
    if (this.disposed) return;
    const reqId = this.nextReqId++;
    return new Promise<void>(resolve => {
      this.pending.set(reqId, m => {
        if (m.type === 'upsertBatch-done') resolve();
        else resolve();
      });
      this.worker.postMessage({ type: 'upsertBatch', docs, reqId });
    });
  }

  async discard(id: string): Promise<void> {
    await this.initPromise;
    if (this.disposed) return;
    this.worker.postMessage({ type: 'discard', id });
  }

  async search(query: string, options?: Record<string, unknown>): Promise<SearchResult[]> {
    await this.initPromise;
    if (this.disposed) return [];
    const reqId = this.nextReqId++;
    return new Promise<SearchResult[]>(resolve => {
      this.pending.set(reqId, m => {
        if (m.type === 'search-done') resolve(m.hits);
        else resolve([]);
      });
      this.worker.postMessage({ type: 'search', reqId, query, options });
    });
  }

  async toJSON(): Promise<unknown> {
    await this.initPromise;
    if (this.disposed) return null;
    const reqId = this.nextReqId++;
    return new Promise<unknown>(resolve => {
      this.pending.set(reqId, m => {
        if (m.type === 'toJSON-done') resolve(m.indexJson);
        else resolve(null);
      });
      this.worker.postMessage({ type: 'toJSON', reqId });
    });
  }

  async getStoredFields(id: string): Promise<IndexDoc | null> {
    await this.initPromise;
    if (this.disposed) return null;
    const reqId = this.nextReqId++;
    return new Promise<IndexDoc | null>(resolve => {
      this.pending.set(reqId, m => {
        if (m.type === 'getStoredFields-done') resolve(m.fields);
        else resolve(null);
      });
      this.worker.postMessage({ type: 'getStoredFields', reqId, id });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.clear();
    try { this.worker.postMessage({ type: 'dispose' }); } catch { /* already gone */ }
    this.worker.terminate();
  }
}
