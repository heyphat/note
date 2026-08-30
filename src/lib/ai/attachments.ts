// Chat composer attachments. The user drops files into the chat drawer;
// each file is classified, validated, uploaded to the chat-scoped asset
// folder, and woven into the user message body so a) the model sees the
// content on send and b) reloading the thread re-attaches bytes for
// follow-up turns.
//
// Three kinds of attachments are supported:
//   - image: png/jpeg/gif/webp — attached inline to the user turn for
//     every provider (already battle-tested via collectNoteImages).
//   - pdf: native document blocks for Anthropic and Google; OpenAI does
//     client-side text extraction (pdfjs-dist) since chat-completions
//     in-browser doesn't accept binary PDFs.
//   - text: read as UTF-8 and inlined as a fenced code block; never sent
//     as a binary part. Limits prevent megabyte pastes.

import type { NoteStore } from '@/lib/storage';

export type ChatAttachmentKind = 'image' | 'pdf' | 'text';

export interface ChatAttachment {
  /** Local-only id for React keying; not persisted. */
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  /** Vault-relative URL once uploaded; absent for in-memory pending entries. */
  url?: string;
}

export interface ResolvedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  bytes: Uint8Array;
  /** UTF-8 contents for kind=text; otherwise undefined. */
  textContent?: string;
}

export const SUPPORTED_IMAGE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
]);

export const SUPPORTED_PDF_MIME = 'application/pdf';

// Text-ish mimes we accept. Anything not on these lists is rejected with a
// toast — keeps the surface small and predictable.
const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_EXTRAS = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
  'application/x-shellscript',
]);

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'yml', 'yaml',
  'xml', 'html', 'htm', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp',
  'cs', 'sh', 'bash', 'zsh', 'sql', 'toml', 'ini', 'env', 'conf',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB per file
export const MAX_TEXT_INLINE_BYTES = 200 * 1024;       // 200KB inlined as code block
export const MAX_ATTACHMENTS_PER_TURN = 6;

export type ClassifyResult =
  | { ok: true; kind: ChatAttachmentKind }
  | { ok: false; reason: 'unsupported' | 'too_large' | 'text_too_large'; mimeType: string };

export function classifyFile(file: File): ClassifyResult {
  const mime = (file.type || '').toLowerCase();
  const ext = filenameExt(file.name);

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: 'too_large', mimeType: mime };
  }

  if (SUPPORTED_IMAGE_MIME.has(mime) || IMAGE_EXTENSIONS.has(ext)) {
    return { ok: true, kind: 'image' };
  }
  if (mime === SUPPORTED_PDF_MIME || ext === 'pdf') {
    return { ok: true, kind: 'pdf' };
  }
  if (isTextMime(mime) || TEXT_EXTENSIONS.has(ext)) {
    if (file.size > MAX_TEXT_INLINE_BYTES) {
      return { ok: false, reason: 'text_too_large', mimeType: mime };
    }
    return { ok: true, kind: 'text' };
  }
  return { ok: false, reason: 'unsupported', mimeType: mime };
}

function isTextMime(mime: string): boolean {
  if (!mime) return false;
  for (const prefix of TEXT_MIME_PREFIXES) {
    if (mime.startsWith(prefix)) return true;
  }
  return TEXT_MIME_EXTRAS.has(mime);
}

function filenameExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Build the markdown prefix that goes on the user message body so the
 * thread persists references to the uploaded files. Images use `![]()`
 * (also picked up by note-image collectors), PDFs use a regular link tagged
 * `(PDF)`, and text files inline their content as a fenced code block.
 */
export function buildAttachmentBlock(parts: Array<{
  filename: string;
  url: string;
  kind: ChatAttachmentKind;
  textContent?: string;
}>): string {
  if (parts.length === 0) return '';
  const lines: string[] = [];
  for (const p of parts) {
    if (p.kind === 'image') {
      lines.push(`![${p.filename}](${p.url})`);
    } else if (p.kind === 'pdf') {
      lines.push(`[${p.filename}](${p.url}) — PDF attachment`);
    } else {
      const lang = languageHint(p.filename);
      const fence = '```';
      lines.push(`Attached \`${p.filename}\`:`);
      lines.push(`${fence}${lang}`);
      lines.push((p.textContent ?? '').trimEnd());
      lines.push(fence);
    }
  }
  return `${lines.join('\n\n')}\n\n`;
}

function languageHint(filename: string): string {
  const ext = filenameExt(filename);
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    kt: 'kotlin', swift: 'swift', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    cs: 'csharp', sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', json: 'json', xml: 'xml',
    html: 'html', css: 'css', scss: 'scss', md: 'markdown', csv: 'csv',
  };
  return map[ext] || '';
}

/**
 * Scan a user message body for attachment references that point at this
 * chat's asset folder, load each from disk, and return resolved bytes the
 * provider adapters can splice into the request. Mirrors the design of
 * collectNoteImages but keyed off chatId / chat-files dir.
 */
export async function collectChatAttachments(
  store: NoteStore,
  chatId: string,
  messageBody: string,
): Promise<ResolvedAttachment[]> {
  const refs = parseAttachmentRefs(chatId, messageBody);
  if (refs.length === 0) return [];
  const out: ResolvedAttachment[] = [];
  for (const ref of refs) {
    if (out.length >= MAX_ATTACHMENTS_PER_TURN) break;
    try {
      const resolved = await store.getChatAssetBytes(chatId, ref.url);
      if (!resolved) continue;
      const kind = kindFromMime(resolved.mimeType, ref.filename);
      if (!kind) continue;
      out.push({
        filename: ref.filename,
        mimeType: resolved.mimeType,
        size: resolved.bytes.byteLength,
        kind,
        bytes: resolved.bytes,
      });
    } catch {
      // Missing files don't break the turn — the model still sees the link
      // text in the message body.
      continue;
    }
  }
  return out;
}

interface AttachmentRef {
  url: string;
  filename: string;
}

const ATTACHMENT_LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function parseAttachmentRefs(chatId: string, body: string): AttachmentRef[] {
  const prefix = `.assets/chat-files/${chatId}/`;
  const seen = new Set<string>();
  const out: AttachmentRef[] = [];
  const re = new RegExp(ATTACHMENT_LINK_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const url = m[3];
    if (!url) continue;
    const cleaned = url.startsWith('./') ? url.slice(2) : url;
    if (!cleaned.startsWith(prefix)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    const filename = filenameFromUrl(cleaned, m[2] || '');
    out.push({ url: cleaned, filename });
  }
  return out;
}

function filenameFromUrl(url: string, alt: string): string {
  // Stored names are `<8-uuid>-<original>` — peel the prefix off so the
  // user-facing label matches what they dropped in. Fall back to alt or
  // the raw filename if the pattern doesn't match.
  const last = url.split('/').pop() || alt || url;
  const stripped = last.replace(/^[a-f0-9]{8}-/i, '');
  return stripped || alt || last;
}

function kindFromMime(mime: string, filename: string): ChatAttachmentKind | null {
  if (SUPPORTED_IMAGE_MIME.has(mime)) return 'image';
  if (mime === SUPPORTED_PDF_MIME) return 'pdf';
  if (isTextMime(mime)) return 'text';
  const ext = filenameExt(filename);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

export async function readFileAsText(file: File): Promise<string> {
  return await file.text();
}

export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
