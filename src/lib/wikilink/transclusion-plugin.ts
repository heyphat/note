/**
 * Read-only transclusion rendering for `![[target#heading]]` references.
 *
 * Rather than extending Milkdown's schema to own a transclusion node (which
 * would complicate the markdown round-trip), we leave the source as raw
 * `![[...]]` text and paint a widget decoration directly after each block
 * that contains at least one transclusion. The widget DOM is static HTML —
 * a header linking back to the source note and a <pre>-rendered slice of
 * the section body. Fetches are async and cached per target+section.
 */

import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { parseWikiLinks, normalizeWikiTarget } from '@/lib/links/link-parser';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';

export interface TransclusionOptions {
  /**
   * Resolve a target string to the corresponding note id. Return null when
   * nothing matches. The host typically wraps a built-in resolver around the
   * known notes list.
   */
  resolveId: (target: string) => string | null;
  /**
   * Read a note's raw body from the store. Returns empty string if missing.
   * The plugin caches results — short bursts of the same target won't re-fetch.
   */
  readBody: (id: string) => Promise<string>;
  /**
   * Navigate to the transcluded source on header-link click. Optional.
   */
  onOpen?: (target: string, section: string) => void;
}

interface TransclusionRef {
  /** Doc position immediately AFTER the block that contains the `![[...]]`. */
  insertAt: number;
  target: string;
  section: string;
  /** Stable key per block: multiple embeds in the same block collapse into
   *  one widget to keep DOM stable across edits. */
  blockKey: string;
  /** All refs in the block, in source order. */
  refs: { target: string; section: string }[];
}

const key = new PluginKey('NOTES_TRANSCLUSION');

// Extract the content under a `# Heading`-style section from a markdown
// string. Matches at any heading level; the returned slice runs from just
// after the heading line to the start of the next heading of the same
// level-or-higher (or EOF). Empty section name means "return the full body".
function sliceSection(body: string, section: string): string {
  if (!section) return body;
  const target = section.trim().toLowerCase();
  const lines = body.split('\n');
  let startIdx = -1;
  let level = 6;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    if (m[2].trim().toLowerCase() === target) {
      startIdx = i + 1;
      level = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx).join('\n').trim();
}

function collectTransclusions(doc: ProseNode): TransclusionRef[] {
  const out: TransclusionRef[] = [];
  doc.descendants((node, pos) => {
    if (!node.isBlock || !node.isTextblock) return true;
    const text = node.textContent;
    if (!text || text.indexOf('![[') === -1) return true;
    const refs = parseWikiLinks(text).filter(r => r.isTransclusion);
    if (!refs.length) return true;
    const blockEnd = pos + node.nodeSize;
    out.push({
      insertAt: blockEnd,
      target: refs[0].target,
      section: refs[0].section,
      blockKey: `block:${pos}`,
      refs: refs.map(r => ({ target: r.target, section: r.section })),
    });
    return true;
  });
  return out;
}

class EmbedCache {
  private map = new Map<string, Promise<string>>();
  private readBody: (id: string) => Promise<string>;

  constructor(readBody: (id: string) => Promise<string>) {
    this.readBody = readBody;
  }

  get(id: string): Promise<string> {
    const cached = this.map.get(id);
    if (cached) return cached;
    const p = this.readBody(id).catch(() => '');
    this.map.set(id, p);
    return p;
  }

  invalidate(id: string): void {
    this.map.delete(id);
  }
}

function renderEmbed(
  root: HTMLElement,
  refs: { target: string; section: string }[],
  opts: TransclusionOptions,
  cache: EmbedCache,
): void {
  root.replaceChildren();
  for (const r of refs) {
    const wrap = document.createElement('div');
    wrap.className = 'transclusion-embed';
    const header = document.createElement('div');
    header.className = 'transclusion-header';
    header.textContent = '⧉ ';
    const link = document.createElement('a');
    link.textContent = r.target + (r.section ? ` › ${r.section}` : '');
    link.addEventListener('mousedown', e => e.preventDefault());
    link.addEventListener('click', e => {
      e.preventDefault();
      opts.onOpen?.(r.target, r.section);
    });
    header.appendChild(link);
    wrap.appendChild(header);

    const content = document.createElement('div');
    content.className = 'transclusion-content';
    content.textContent = 'Loading…';
    wrap.appendChild(content);
    root.appendChild(wrap);

    const id = opts.resolveId(normalizeWikiTarget(r.target));
    if (!id) {
      const missing = document.createElement('div');
      missing.className = 'transclusion-missing';
      missing.textContent = 'Source not found.';
      content.replaceChildren(missing);
      continue;
    }
    void cache.get(id).then(body => {
      const slice = sliceSection(body, r.section);
      if (!slice) {
        const missing = document.createElement('div');
        missing.className = 'transclusion-missing';
        missing.textContent = r.section ? `Heading “${r.section}” not found.` : 'Empty note.';
        content.replaceChildren(missing);
        return;
      }
      // Plain-text preview — rendering full markdown here would require
      // spinning up another ProseMirror which is more than this read-only
      // surface needs. Preserve hard breaks and leave the rest as-is.
      content.textContent = slice;
    });
  }
}

export function createTransclusionPlugin(optsRef: { current: TransclusionOptions }): Plugin {
  const cache = new EmbedCache(id => optsRef.current.readBody(id));

  function buildDecorations(state: EditorState): DecorationSet {
    const refs = collectTransclusions(state.doc);
    const decos: Decoration[] = [];
    for (const r of refs) {
      decos.push(Decoration.widget(r.insertAt, () => {
        const root = document.createElement('div');
        root.className = 'transclusion-widget';
        root.contentEditable = 'false';
        renderEmbed(root, r.refs, optsRef.current, cache);
        return root;
      }, { side: 1, key: `${r.blockKey}:${r.refs.map(x => x.target + x.section).join('|')}` }));
    }
    return DecorationSet.create(state.doc, decos);
  }

  return new Plugin({
    key,
    state: {
      init(_cfg, state) { return { deco: buildDecorations(state) }; },
      apply(tr, value, _old, newState) {
        if (tr.docChanged || tr.getMeta(key) === 'refresh') {
          return { deco: buildDecorations(newState) };
        }
        return { deco: value.deco.map(tr.mapping, tr.doc) };
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)?.deco ?? null;
      },
    },
  });
}

export function createTransclusionEditorPlugin(optsRef: { current: TransclusionOptions }) {
  return $prose(() => createTransclusionPlugin(optsRef));
}
