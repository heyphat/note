/**
 * ProseMirror decoration-based wikilink rendering.
 *
 * Rather than extending Milkdown's schema (which would require a custom
 * markdown parser + serializer to keep round-tripping clean), we scan
 * every text node for `[[...]]` / `![[...]]` patterns and draw inline
 * decorations over the matched positions. The source text stays as raw
 * markdown so on-disk files remain Obsidian-compatible.
 *
 * The plugin emits three states via decorations:
 *   - .wikilink            regular [[target]]
 *   - .wikilink.broken     target doesn't resolve to a known note id
 *   - .wikilink-transclude ![[target]] (transclusion marker only — the
 *                           actual embedded content is rendered by the
 *                           transclusion node view elsewhere)
 *
 * Click handling: a single-click on a wikilink calls `onNavigate(target)`,
 * passing the unresolved target string. The host (page.tsx) is responsible
 * for resolving it to a note id and calling selectNote.
 */

import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { parseWikiLinks, normalizeWikiTarget } from '@/lib/links/link-parser';

export interface WikilinkPluginOptions {
  /** Returns true if `target` resolves to a known note (by title, filename, or id). */
  isKnown: (target: string) => boolean;
  /** Fired on click of a wikilink. Receives the raw (unresolved) target string. */
  onNavigate: (target: string, opts: { section: string; isTransclusion: boolean; event: MouseEvent }) => void;
}

const key = new PluginKey('NOTES_WIKILINK');

interface Match {
  from: number;
  to: number;
  target: string;
  section: string;
  isTransclusion: boolean;
  known: boolean;
}

// Scan every inline text node in the doc and collect wikilink matches with
// their absolute positions. Parser runs on the text, which guarantees the
// offsets returned are relative to that text node — we offset by the node's
// `pos` to get doc positions.
function collectMatches(doc: import('@milkdown/kit/prose/model').Node, isKnown: (t: string) => boolean): Match[] {
  const out: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const text = node.text ?? '';
    if (!text || text.indexOf('[[') === -1) return true;
    const refs = parseWikiLinks(text);
    for (const r of refs) {
      out.push({
        from: pos + r.start,
        to: pos + r.end,
        target: r.target,
        section: r.section,
        isTransclusion: r.isTransclusion,
        known: isKnown(normalizeWikiTarget(r.target)),
      });
    }
    return true;
  });
  return out;
}

function findMatchAt(matches: Match[], pos: number): Match | null {
  for (const m of matches) {
    if (pos >= m.from && pos <= m.to) return m;
  }
  return null;
}

export function createWikilinkPlugin(optsRef: { current: WikilinkPluginOptions }): Plugin {
  return new Plugin({
    key,
    state: {
      init(_config, state) {
        const matches = collectMatches(state.doc, t => optsRef.current.isKnown(t));
        return { matches, deco: DecorationSet.create(state.doc, buildDecoList(matches)) };
      },
      apply(tr, value, _oldState, newState) {
        // Only rescan when the doc actually changed OR when the known-set
        // might have changed (signalled via a meta flag). The external meta
        // is dispatched by the host when linksVersion bumps.
        const refresh = tr.docChanged || tr.getMeta(key) === 'refresh';
        if (!refresh) {
          return {
            matches: value.matches,
            deco: value.deco.map(tr.mapping, tr.doc),
          };
        }
        const matches = collectMatches(newState.doc, t => optsRef.current.isKnown(t));
        return { matches, deco: DecorationSet.create(newState.doc, buildDecoList(matches)) };
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)?.deco ?? null;
      },
      handleClick(view, pos, event) {
        const st = key.getState(view.state) as { matches: Match[] } | undefined;
        if (!st) return false;
        const hit = findMatchAt(st.matches, pos);
        if (!hit) return false;
        // Only navigate when the user explicitly asks. A bare click places
        // the caret (ProseMirror's default) so the user can edit the link
        // text without losing their place. ⌘ (mac) / Ctrl (other) opens.
        const isMod = event.metaKey || event.ctrlKey;
        if (!isMod) return false;
        event.preventDefault();
        optsRef.current.onNavigate(hit.target, {
          section: hit.section,
          isTransclusion: hit.isTransclusion,
          event,
        });
        return true;
      },
      handleKeyDown(view, event) {
        // ⌘/Ctrl+Enter navigates when the caret is inside a wikilink.
        // Mirrors the click modifier so both hands agree on the gesture.
        if (event.key !== 'Enter') return false;
        if (!(event.metaKey || event.ctrlKey)) return false;
        const sel = view.state.selection;
        if (!sel.empty) return false;
        const st = key.getState(view.state) as { matches: Match[] } | undefined;
        if (!st) return false;
        const hit = findMatchAt(st.matches, sel.from);
        if (!hit) return false;
        event.preventDefault();
        optsRef.current.onNavigate(hit.target, {
          section: hit.section,
          isTransclusion: hit.isTransclusion,
          event: new MouseEvent('click'),
        });
        return true;
      },
    },
  });
}

// Platform-aware hint string shown on hover. Evaluated once at module load;
// safe for SSR because createDecoration runs client-side only (the plugin
// only mounts after the editor hydrates).
const NAV_HINT = (() => {
  if (typeof navigator === 'undefined') return '⌘-click to open';
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  return isMac ? '⌘-click to open' : 'Ctrl-click to open';
})();

function buildDecoList(matches: Match[]): Decoration[] {
  const decos: Decoration[] = [];
  for (const m of matches) {
    const classes = ['wikilink'];
    if (m.isTransclusion) classes.push('wikilink-transclude');
    if (!m.known) classes.push('broken');
    decos.push(
      Decoration.inline(m.from, m.to, {
        class: classes.join(' '),
        nodeName: 'span',
        'data-wikilink-target': m.target,
        'data-wikilink-section': m.section,
        'data-wikilink-transclude': m.isTransclusion ? '1' : '0',
        'data-wikilink-hint': m.known
          ? NAV_HINT
          : (NAV_HINT.startsWith('⌘') ? '⌘-click to create' : 'Ctrl-click to create'),
      }),
    );
  }
  return decos;
}

/** Force the wikilink plugin to rebuild its decorations (e.g. after the
 *  set of known note ids changes). Safe to call on a destroyed view — no-op. */
export function refreshWikilinkDecorations(view: EditorView | null | undefined): void {
  if (!view || view.isDestroyed) return;
  view.dispatch(view.state.tr.setMeta(key, 'refresh'));
}

/** Milkdown plugin wrapper — ready to hand to `crepe.editor.use(...)`. */
export function createWikilinkEditorPlugin(optsRef: { current: WikilinkPluginOptions }) {
  return $prose(() => createWikilinkPlugin(optsRef));
}

// Re-export the key so callers that need to dispatch the refresh meta can import it.
export const wikilinkPluginKey = key;
