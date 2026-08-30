// Collects image attachments from a note's markdown so the assistant can
// see the actual pixels, not just the `![alt](path)` syntax. Runs at
// send-time so images always reflect the current note content.
//
// Provider coverage: we emit PNG / JPEG / GIF / WEBP only. SVG is skipped
// because Anthropic + OpenAI don't accept it; users who embed SVG still
// get the markdown link text in the system prompt.

import type { NoteStore } from '@/lib/storage';

export interface ImageAttachment {
  bytes: Uint8Array;
  mimeType: string;
  /** Filename or alt text, purely for debug / future labeling. */
  label?: string;
}

const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
// Cap how many images we send per turn to keep requests reasonable. First
// N by document order — enough for most notes, not a cost surprise on a
// note with 50 screenshots.
const MAX_IMAGES_PER_TURN = 8;

// Standard markdown image syntax. Handles optional title:
//   ![alt](path)
//   ![alt](path "title")
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export async function collectNoteImages(
  store: NoteStore,
  noteId: string | null | undefined,
  text: string | null | undefined,
): Promise<ImageAttachment[]> {
  if (!noteId || !text) return [];
  const urls = uniqueImageUrls(text);
  if (urls.length === 0) return [];
  const out: ImageAttachment[] = [];
  for (const { url, alt } of urls) {
    if (out.length >= MAX_IMAGES_PER_TURN) break;
    try {
      const resolved = await store.getAssetBytes(noteId, url);
      if (!resolved) continue;
      if (!SUPPORTED.has(resolved.mimeType)) continue;
      out.push({ bytes: resolved.bytes, mimeType: resolved.mimeType, label: alt || url });
    } catch {
      // A single missing asset shouldn't break the whole turn.
      continue;
    }
  }
  return out;
}

function uniqueImageUrls(text: string): Array<{ url: string; alt: string }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; alt: string }> = [];
  const re = new RegExp(IMAGE_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const alt = m[1] || '';
    const url = m[2];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, alt });
  }
  return out;
}
