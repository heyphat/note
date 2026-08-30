/**
 * Milkdown plugin for markdown callouts.
 *
 * Source stays as portable blockquote markdown:
 * > [!NOTE]
 * > Body
 *
 * The plugin decorates matching blockquotes while leaving the text editable.
 */

import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';

const key = new PluginKey('NOTES_CALLOUT');
const CALLOUT_MARKER_RE = /^\[!([A-Za-z][\w-]*)\]([+-])?(?:\s+(.+))?$/;

const CALLOUT_TONES: Record<string, string> = {
  abstract: 'note',
  attention: 'warning',
  bug: 'danger',
  caution: 'warning',
  check: 'success',
  danger: 'danger',
  done: 'success',
  error: 'danger',
  example: 'example',
  fail: 'danger',
  failure: 'danger',
  faq: 'question',
  help: 'question',
  hint: 'success',
  idea: 'note',
  important: 'important',
  info: 'note',
  missing: 'danger',
  note: 'note',
  question: 'question',
  quote: 'quote',
  success: 'success',
  summary: 'note',
  tldr: 'note',
  tip: 'success',
  todo: 'note',
  warning: 'warning',
};

export interface CalloutMarker {
  type: string;
  tone: string;
  title: string;
  fold: 'open' | 'closed' | null;
}

export function parseCalloutMarker(source: string): CalloutMarker | null {
  const match = CALLOUT_MARKER_RE.exec(source.trim());
  if (!match) return null;

  const type = match[1].toLowerCase();
  const title = match[3]?.trim() || type.toUpperCase();
  const fold = match[2] === '+'
    ? 'open'
    : match[2] === '-'
      ? 'closed'
      : null;

  return {
    type,
    tone: CALLOUT_TONES[type] ?? 'note',
    title,
    fold,
  };
}

function collectCalloutDecorations(doc: ProseNode): Decoration[] {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'blockquote') return true;

    const firstChild = node.firstChild;
    if (!firstChild || firstChild.type.name !== 'paragraph') return true;

    const marker = parseCalloutMarker(firstChild.textContent);
    if (!marker) return true;

    const blockAttrs: Record<string, string> = {
      class: `callout callout-${marker.tone}`,
      'data-callout-type': marker.type,
      'data-callout-title': marker.title,
    };

    if (marker.fold) {
      blockAttrs['data-callout-fold'] = marker.fold;
    }

    decorations.push(Decoration.node(pos, pos + node.nodeSize, blockAttrs));
    decorations.push(Decoration.node(pos + 1, pos + 1 + firstChild.nodeSize, {
      class: 'callout-title',
      'data-callout-label': marker.title,
    }));

    return false;
  });

  return decorations;
}

export function createCalloutPlugin(): Plugin {
  function buildDecorations(state: EditorState): DecorationSet {
    return DecorationSet.create(state.doc, collectCalloutDecorations(state.doc));
  }

  return new Plugin({
    key,
    state: {
      init(_cfg, state) {
        return { deco: buildDecorations(state) };
      },
      apply(tr, value, _oldState, newState) {
        if (tr.docChanged) return { deco: buildDecorations(newState) };
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

export function createCalloutEditorPlugin() {
  return $prose(() => createCalloutPlugin());
}
