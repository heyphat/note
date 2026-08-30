// Attachment plumbing shared by all provider paths. `mergeAttachments`
// unifies the legacy images-only field with the newer mixed-attachment
// list. `bytesToBase64` is the JSON-safe encoding used by both the
// browser-direct Anthropic SSE body and the proxy wire format.

import type { StreamOpts, ProviderAttachment } from './types';

export function mergeAttachments(opts: StreamOpts): ProviderAttachment[] {
  const out: ProviderAttachment[] = [];
  if (opts.images) {
    for (const img of opts.images) {
      out.push({ kind: 'image', bytes: img.bytes, mimeType: img.mimeType, filename: img.label });
    }
  }
  if (opts.attachments) out.push(...opts.attachments);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
