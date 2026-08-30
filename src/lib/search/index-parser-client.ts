import type { ParsedNote } from './index-parser.worker';

/**
 * Main-thread handle to the index-parser worker. Keeps track of pending
 * parse requests and resolves them as the worker replies. Spawn once per
 * vault and reuse — construction is the expensive part (webpack emits a
 * separate bundle that has to be fetched+parsed on first use).
 *
 * This is an *optional* accelerator for BrowserFsSearchIndex. The fallback
 * path keeps working when the worker can't be constructed (non-Chromium
 * browsers without FS handle transfer support, test environments, etc).
 */
export class IndexParserClient {
  private worker: Worker;
  private nextReqId = 1;
  private pending = new Map<number, (results: ParsedNote[]) => void>();
  private initDone: Promise<void>;
  private disposed = false;

  constructor(handle: FileSystemDirectoryHandle) {
    // next/webpack picks up the new URL(...) pattern and emits the worker
    // as a separate chunk. Must be a static literal (not a variable) or
    // webpack can't statically analyze the reference.
    this.worker = new Worker(
      new URL('./index-parser.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.addEventListener('message', e => this.onMessage(e));
    this.initDone = new Promise(resolve => {
      const once = (e: MessageEvent) => {
        if (e.data?.type === 'init-done') {
          this.worker.removeEventListener('message', once);
          resolve();
        }
      };
      this.worker.addEventListener('message', once);
    });
    // Cloning the FS handle into the worker is structured-clone, which
    // doesn't consume the original on the main thread — both sides can
    // read the same directory tree concurrently.
    this.worker.postMessage({ type: 'init', handle });
  }

  private onMessage(e: MessageEvent): void {
    const msg = e.data;
    if (msg?.type === 'parse-done') {
      const cb = this.pending.get(msg.reqId);
      if (cb) {
        this.pending.delete(msg.reqId);
        cb(msg.results);
      }
    }
  }

  async parseBatch(ids: string[]): Promise<ParsedNote[]> {
    if (this.disposed) return ids.map(id => ({
      id, title: '', body: '', createdAt: '', updatedAt: '', tags: [], links: [], error: 'worker disposed',
    }));
    await this.initDone;
    const reqId = this.nextReqId++;
    // 30s ceiling on any single batch — if the worker wedges on a bad file
    // or stops posting 'parse-done' for any reason, reject so the caller
    // can fall back to the main-thread parse path for this batch. Without
    // this, a single stuck batch hangs the entire indexing pass forever and
    // the progress bar freezes.
    return new Promise<ParsedNote[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId);
          reject(new Error(`worker parse timeout (reqId=${reqId}, ${ids.length} ids)`));
        }
      }, 30_000);
      this.pending.set(reqId, (results) => {
        clearTimeout(timer);
        resolve(results);
      });
      this.worker.postMessage({ type: 'parse', reqId, ids });
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

/**
 * Factory that gracefully returns null when a worker can't be constructed
 * (older browsers, no FS Access API support, unexpected runtime errors).
 * Callers should always check the result and fall back to the in-process
 * parser.
 */
export function tryCreateParserClient(handle: FileSystemDirectoryHandle): IndexParserClient | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new IndexParserClient(handle);
  } catch (err) {
    console.warn('[search] worker unavailable, falling back to main-thread parse', err);
    return null;
  }
}
