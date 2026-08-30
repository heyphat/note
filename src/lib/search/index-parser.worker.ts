// Off-main-thread parser for the body-indexing loop.
//
// The search index tokenizes 70k notes during a cold prime. Each file's
// `file.text()` (UTF-8 decode of ~1 KB body), frontmatter parse, and
// tag-extraction regex would otherwise run on the main thread inside
// requestIdleCallback bursts, stealing ~30–80 ms at a time from user
// interactions. Moving that work here keeps MiniSearch (and every other
// piece of main-thread state) on the main thread while the CPU-heavy
// read/parse happens in parallel.
//
// The worker owns a cloned FileSystemDirectoryHandle so it can read files
// directly — no request/response round-trip back to main thread for I/O.
// FS handles survive structured clone in Chromium/Brave/Edge; Safari's
// FS Access API is behind a flag, and the main thread falls back to the
// in-process parser when worker construction fails.

import { parseFrontmatter } from '../frontmatter';
import { buildLinkRefs, type LinkRefWithContext } from '../links/link-refs';
import { extractTags } from './tags';

export interface ParsedNote {
  id: string;
  /** Best-available title: frontmatter → first-# heading → filename slug. */
  title: string;
  /** Body prefix with frontmatter stripped (empty string when read fails). */
  body: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  /** Wikilinks extracted from the same truncated body prefix carried in `body`. */
  links: LinkRefWithContext[];
  /** Present on failure paths so the caller can log without blocking indexing. */
  error?: string;
}

type InitMsg = { type: 'init'; handle: FileSystemDirectoryHandle };
type ParseMsg = { type: 'parse'; reqId: number; ids: string[] };
type DisposeMsg = { type: 'dispose' };
type InboundMsg = InitMsg | ParseMsg | DisposeMsg;

type InitDoneMsg = { type: 'init-done' };
type ParseDoneMsg = { type: 'parse-done'; reqId: number; results: ParsedNote[] };
export type OutboundMsg = InitDoneMsg | ParseDoneMsg;

let rootHandle: FileSystemDirectoryHandle | null = null;

// Hard ceiling on per-file size to prevent a single pathological file
// (pasted CSV dump, base64 blob, log archive accidentally saved as .md)
// from allocating gigabytes into the worker and tripping a tab crash.
// Files over this cap are returned with an `error` marker so the main
// thread can count them as failures in progress without retrying.
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
// Additional truncation on the body string passed to MiniSearch. Files
// this side of MAX_FILE_SIZE but still >200 KB get indexed on their
// first slice only — the inverted index growth is roughly linear in
// token count, and at ~200 KB you still cover the first ~30k words.
const MAX_INDEX_BODY = 256 * 1024;
const PARSE_CONCURRENCY = 8;

async function readOne(id: string): Promise<ParsedNote> {
  if (!rootHandle) {
    return {
      id,
      title: '',
      body: '',
      createdAt: '',
      updatedAt: '',
      tags: [],
      links: [],
      error: 'no handle',
    };
  }
  try {
    const parts = id.split('/').filter(Boolean);
    const filename = parts.pop()!;
    let dir = rootHandle;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part);
    }
    const fh = await dir.getFileHandle(filename);
    const file = await fh.getFile();
    if (file.size > MAX_FILE_SIZE) {
      // Skip — too expensive to read/parse, would blow up memory.
      const filenameTitle = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
      return {
        id,
        title: filenameTitle,
        body: '',
        createdAt: new Date(file.lastModified).toISOString(),
        updatedAt: new Date(file.lastModified).toISOString(),
        tags: [],
        links: [],
        error: `too-large: ${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      };
    }
    const raw = await file.text();
    const { meta, content } = parseFrontmatter(raw);
    const isNative = !!meta.id;
    const filenameTitle = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
    const firstLine = raw.split('\n').find(l => l.trim().length > 0) || '';
    const headingTitle = firstLine.startsWith('# ') ? firstLine.slice(2).trim() : '';
    const title = meta.title || (isNative ? 'Untitled' : headingTitle || filenameTitle);
    const body = isNative ? content : raw;
    // Same signature as the main-thread path — frontmatter `tags:` (if any)
    // plus inline #hashtags from the body.
    const fmTags: string[] = [];
    if (meta.tags) {
      const trimmed = meta.tags.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        for (const s of trimmed.slice(1, -1).split(',')) {
          const t = s.trim().replace(/^['"]|['"]$/g, '');
          if (t) fmTags.push(t);
        }
      } else if (trimmed.includes(',')) {
        for (const s of trimmed.split(',')) {
          const t = s.trim();
          if (t) fmTags.push(t);
        }
      }
    }
    const tags = extractTags(body, fmTags);
    // Truncate the body sent back to the main thread if it's huge — the
    // inverted index cost scales with token count, so unbounded bodies
    // would bloat MiniSearch even though the file itself passed the
    // 2 MB gate. Links are extracted from the same prefix so the existing
    // "only first 256 KB contributes backlinks/graph edges" behavior does
    // not change.
    const indexBody = body.length > MAX_INDEX_BODY ? body.slice(0, MAX_INDEX_BODY) : body;
    const links = buildLinkRefs(indexBody);
    return {
      id,
      title,
      body: indexBody,
      createdAt: meta.createdAt || new Date(file.lastModified).toISOString(),
      updatedAt: meta.updatedAt || new Date(file.lastModified).toISOString(),
      tags,
      links,
    };
  } catch (err) {
    return {
      id,
      title: '',
      body: '',
      createdAt: '',
      updatedAt: '',
      tags: [],
      links: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function readBatch(ids: string[]): Promise<ParsedNote[]> {
  if (!ids.length) return [];
  const out = new Array<ParsedNote>(ids.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(PARSE_CONCURRENCY, ids.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= ids.length) return;
      out[index] = await readOne(ids[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

self.addEventListener('message', async (e: MessageEvent<InboundMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    rootHandle = msg.handle;
    (self as unknown as Worker).postMessage({ type: 'init-done' } satisfies InitDoneMsg);
    return;
  }
  if (msg.type === 'parse') {
    // Bounded parallelism lets larger logical batches overlap file decode work
    // without fanning out dozens of concurrent reads for one request.
    const results = await readBatch(msg.ids);
    (self as unknown as Worker).postMessage({ type: 'parse-done', reqId: msg.reqId, results } satisfies ParseDoneMsg);
    return;
  }
  if (msg.type === 'dispose') {
    rootHandle = null;
    (self as unknown as { close(): void }).close();
    return;
  }
});
