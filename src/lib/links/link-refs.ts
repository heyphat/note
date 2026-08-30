import { parseWikiLinks, type WikiLinkRef } from './link-parser';

export interface LinkRefWithContext extends WikiLinkRef {
  /** Short snippet of surrounding source text (for backlinks display). */
  context: string;
}

// Window on each side of a wikilink for the context snippet stored in the
// forward map. 40 chars per side (80 total) keeps the surrounding phrase
// visible in the Backlinks panel without multiplying the heap footprint on
// heavily-linked vaults.
const LINK_CONTEXT_WINDOW = 40;

export function makeLinkContext(body: string, start: number, end: number): string {
  const from = Math.max(0, start - LINK_CONTEXT_WINDOW);
  const to = Math.min(body.length, end + LINK_CONTEXT_WINDOW);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < body.length ? '…' : '';
  return (prefix + body.slice(from, to) + suffix).replace(/\s+/g, ' ').trim();
}

export function buildLinkRefs(body: string): LinkRefWithContext[] {
  if (!body) return [];
  const refs = parseWikiLinks(body);
  return refs.map(ref => ({
    ...ref,
    context: makeLinkContext(body, ref.start, ref.end),
  }));
}
