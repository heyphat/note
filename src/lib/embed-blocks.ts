/**
 * Milkdown plugins for portable rich blocks backed by fenced code.
 *
 * Bookmark source:
 * ```bookmark
 * https://example.com
 * Optional title
 * Optional description
 * ```
 *
 */

import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';

const BOOKMARK_LANGUAGES = new Set(['bookmark', 'link-preview']);
const bookmarkKey = new PluginKey('NOTES_BOOKMARK_BLOCK');

interface CodeBlock {
  insertAt: number;
  code: string;
  blockKey: string;
}

export interface BookmarkBlock {
  url: string;
  title: string;
  description: string;
  hostname: string;
}

function lines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function normalizeUrl(value: string): URL | null {
  const candidate = value.trim();
  if (!candidate) return null;
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;

  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function hostTitle(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

export function parseBookmarkBlock(source: string): BookmarkBlock | null {
  const parsedLines = lines(source);
  const first = parsedLines[0];
  if (!first) return null;

  const url = normalizeUrl(first);
  if (!url || !/^https?:$/i.test(url.protocol)) return null;

  const hostname = hostTitle(url.hostname);
  return {
    url: url.toString(),
    title: parsedLines[1] ?? hostname,
    description: parsedLines.slice(2).join(' '),
    hostname,
  };
}

function collectCodeBlocks(doc: ProseNode, languages: Set<string>, keyPrefix: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true;
    const language = String(node.attrs.language ?? '').trim().toLowerCase();
    if (!languages.has(language)) return false;

    blocks.push({
      insertAt: pos + node.nodeSize,
      code: node.textContent,
      blockKey: `${keyPrefix}:${pos}`,
    });
    return false;
  });
  return blocks;
}

function createEmpty(message: string): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'rich-block-empty';
  empty.textContent = message;
  return empty;
}

function createBookmarkWidget(code: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'bookmark-preview';
  root.contentEditable = 'false';

  const bookmark = parseBookmarkBlock(code);
  if (!code.trim()) {
    root.replaceChildren(createEmpty('Paste a URL into this bookmark block.'));
    return root;
  }
  if (!bookmark) {
    root.replaceChildren(createEmpty('Enter a valid http(s) URL.'));
    return root;
  }

  const anchor = document.createElement('a');
  anchor.className = 'bookmark-card';
  anchor.href = bookmark.url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';

  const icon = document.createElement('span');
  icon.className = 'bookmark-icon';
  icon.textContent = bookmark.hostname.slice(0, 1).toUpperCase();

  const body = document.createElement('span');
  body.className = 'bookmark-body';

  const title = document.createElement('span');
  title.className = 'bookmark-title';
  title.textContent = bookmark.title;

  const url = document.createElement('span');
  url.className = 'bookmark-url';
  url.textContent = bookmark.hostname;

  body.append(title, url);
  if (bookmark.description) {
    const description = document.createElement('span');
    description.className = 'bookmark-description';
    description.textContent = bookmark.description;
    body.appendChild(description);
  }

  anchor.append(icon, body);
  root.replaceChildren(anchor);
  return root;
}

function createCodeBlockPreviewPlugin(
  key: PluginKey,
  languages: Set<string>,
  keyPrefix: string,
  render: (code: string) => HTMLElement,
): Plugin {
  function buildDecorations(state: EditorState): DecorationSet {
    const blocks = collectCodeBlocks(state.doc, languages, keyPrefix);
    const decos = blocks.map(block => Decoration.widget(
      block.insertAt,
      () => render(block.code),
      {
        side: 1,
        key: `${block.blockKey}:${block.code}`,
      },
    ));
    return DecorationSet.create(state.doc, decos);
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

export function createBookmarkPlugin(): Plugin {
  return createCodeBlockPreviewPlugin(
    bookmarkKey,
    BOOKMARK_LANGUAGES,
    'bookmark',
    createBookmarkWidget,
  );
}

export function createBookmarkEditorPlugin() {
  return $prose(() => createBookmarkPlugin());
}
