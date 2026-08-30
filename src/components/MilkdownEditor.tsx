'use client';

import { useRef, useEffect } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { findParent } from '@milkdown/kit/prose';
import { Plugin, PluginKey, TextSelection, type EditorState, type Selection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { clearTextInCurrentBlockCommand, createCodeBlockCommand } from '@milkdown/kit/preset/commonmark';
import { $prose, replaceAll } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
// Frame theme provides clean structural defaults; colors are overridden by
// the --crepe-color-* CSS variables in globals.css, which in turn map to
// the app's light/dark theme tokens.
import '@milkdown/crepe/theme/frame.css';
import {
  updateFocusOverlay,
  clearFocusOverlay,
  findHoveredFocusBlock,
  findSelectionFocusBlock,
  centerCaretLine,
  handleFootnoteClick,
} from '@/lib/editor-enhancements';
import {
  normalizeTaskListMarkdownForEditor,
  serializeTaskListMarkdownForStorage,
  unescapeWikilinkBracketsForStorage,
  wrapInCompactTaskListInputRule,
} from '@/lib/task-list-syntax';
import { renderExcalidrawBlocks } from '@/lib/excalidraw-render';
import { renderMermaidBlocks } from '@/lib/mermaid-render';
import { renderCanvasBlocks, type CanvasRenderDeps } from '@/lib/canvas-render';
import { createCalloutEditorPlugin } from '@/lib/callout-plugin';
import { createBookmarkEditorPlugin } from '@/lib/embed-blocks';
import { createYoutubeEmbedEditorPlugin } from '@/lib/youtube-render';
import { createPriceChartEditorPlugin } from '@/lib/price-chart-plugin';
import {
  createWikilinkEditorPlugin,
  refreshWikilinkDecorations,
  type WikilinkPluginOptions,
} from '@/lib/wikilink/wikilink-plugin';
import {
  createWikilinkAutocompleteEditorPlugin,
  type WikilinkAutocompleteOptions,
  type WikilinkAutocompleteTarget,
} from '@/lib/wikilink/wikilink-autocomplete';
import {
  createTransclusionEditorPlugin,
  type TransclusionOptions,
} from '@/lib/wikilink/transclusion-plugin';

interface TemplateOption {
  id: string;
  name: string;
}

interface TemplateHintConfig {
  enabled: boolean;
  templates: TemplateOption[];
  onPick: (id: string) => void;
}

export interface MilkdownEditorApi {
  getMarkdown: () => string;
  replaceMarkdown: (markdown: string, opts?: { revealChange?: boolean }) => boolean;
}

interface Props {
  defaultValue: string;
  noteKey: string;
  // API prefix for asset upload/serving. Defaults to '/api/notes'.
  // Pass '/api/general-notes' for general notes. Ignored if `onUpload`/`proxyUrl`
  // are provided (e.g. for browser-fs mode where there's no API).
  apiPrefix?: string;
  placeholder?: string;
  // Custom upload function. When provided, bypasses `apiPrefix` POST.
  onUpload?: (file: File) => Promise<string>;
  // Custom URL resolver. When provided, bypasses `apiPrefix` GET translation.
  // MUST be synchronous — Milkdown's proxyDomURL does not await Promises.
  // Callers that need async resolution should pre-populate a cache and have
  // this function read from it.
  proxyUrl?: (url: string) => string;
  onReady?: (getMarkdown: () => string, api: MilkdownEditorApi) => void;
  // Called on every edit with the current markdown. Use for auto-save.
  // Not debounced — the parent is expected to debounce as appropriate.
  onChange?: (markdown: string) => void;
  // Called when headings in the document change (for table of contents).
  onHeadingsChange?: (headings: { level: number; text: string; index: number }[]) => void;
  // Called from the selected-text toolbar when the user wants to ask AI about
  // the highlighted chunk. The parent owns opening the drawer and preserving
  // this text after focus leaves the editor.
  onAskAi?: (selection: string) => void;
  // Dim everything except the current Milkdown block. Toggleable at runtime.
  focusMode?: boolean;
  // Keep the caret block vertically centered in the nearest scrollable ancestor.
  typewriterMode?: boolean;
  // Read-only: swallows all input. Toggleable at runtime without remounting.
  locked?: boolean;
  // Minimal render path for history / snapshot viewers. Skips all edit-time
  // plugins (wikilink, autocomplete, transclusion, template hint, task-list
  // input rule), edit-time Crepe features (slash menu, selection toolbar,
  // link tooltip, smooth cursor, top bar), and the mutation/resize/selection
  // observers that drive autosave, focus mode, typewriter, and heading sync.
  // Implies read-only in spirit; callers should still pass `locked` if they
  // want Crepe to swallow input. Fixed at mount — remount (change `key`) to
  // flip it, not re-render.
  preview?: boolean;
  // Strip the in-editor chrome that fights with a small embedded surface:
  // slash menu (BlockEdit), selection toolbar, link tooltip, top bar, and
  // image block. Image upload is disabled because compact embeds (e.g. the
  // task description) don't have a valid `noteKey` route to upload against.
  // Editing, placeholder, and smooth cursor stay enabled. Distinct from
  // `preview` (which is read-only). Fixed at mount.
  compact?: boolean;
  // Focus the editor once ProseMirror has mounted. Used for freshly-created
  // notes so the user can start typing immediately. Read once at mount — flip
  // to false for routine note-switching so we don't steal focus unexpectedly.
  autoFocus?: boolean;
  templateHint?: TemplateHintConfig | null;
  // Wikilink navigation/resolution. When provided, [[...]] / ![[...]] spans
  // get decorated and clicking them invokes `onNavigateLink(target)`. The
  // `isKnownLinkTarget` function resolves a normalized wikilink target against
  // the vault — unknown links are styled as broken.
  // A bump of `linkTargetsVersion` tells the editor to re-scan decorations
  // (e.g. after the note list changes so previously-broken links resolve).
  onNavigateLink?: (target: string, opts: { section: string; isTransclusion: boolean; event: MouseEvent }) => void;
  isKnownLinkTarget?: (target: string) => boolean;
  linkTargetsVersion?: number;
  // Supplies filtered autocomplete candidates for the wikilink popup.
  // Must be a pure function of `query` — caller should memoize behind a ref
  // to avoid re-triggering the popup on unrelated renders.
  getWikilinkCandidates?: (query: string) => WikilinkAutocompleteTarget[];
  // Transclusion hooks. `resolveLinkId` maps a normalized wikilink target to
  // a concrete note id; `readNoteBody` reads that note's raw markdown. When
  // both are present, `![[note#section]]` references render a read-only
  // embedded preview of the target section beneath their containing block.
  resolveLinkId?: (target: string) => string | null;
  readNoteBody?: (id: string) => Promise<string>;
  // Resolve a wikilink target to its canonical URL (e.g.
  // `/en/Skills%20Audit%20Report`). Currently only consumed by canvas
  // file nodes for their "open in new tab" affordance — same-tab
  // navigation still goes through `onNavigateLink`.
  getNoteHref?: (target: string) => string | null;
}

const YOUTUBE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="6" width="18" height="12" rx="3" />
    <path d="M10 9.5v5l4.5-2.5L10 9.5Z" />
  </svg>
`;

const PRICE_CHART_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 4v6m0-2h-2m2 0h2" />
    <path d="M15 8v8m0-6h-2m2 0h2" />
    <path d="M9 14v6m0-4h-2m2 0h2" />
    <path d="M15 18v2" />
  </svg>
`;

const CALLOUT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 5h14v10H8l-3 3V5Z" />
    <path d="M9 9h6" />
    <path d="M9 12h4" />
  </svg>
`;

const FOOTNOTE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 5h12" />
    <path d="M6 19h12" />
    <path d="M8 9h5" />
    <path d="M8 13h8" />
    <path d="M16 8v4" />
    <path d="M14 10h4" />
  </svg>
`;

const BOOKMARK_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1Z" />
    <path d="M9 8h6" />
  </svg>
`;

const CANVAS_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="7" height="6" rx="1" />
    <rect x="14" y="4" width="7" height="6" rx="1" />
    <rect x="3" y="14" width="7" height="6" rx="1" />
    <rect x="14" y="14" width="7" height="6" rx="1" />
    <path d="M10 7h4" />
    <path d="M17 10v4" />
  </svg>
`;

const CHECKLIST_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="m5 7 1.5 1.5L9 5.5" />
    <path d="M12 7h7" />
    <path d="m5 14 1.5 1.5L9 12.5" />
    <path d="M12 14h7" />
    <path d="M12 19h5" />
  </svg>
`;

const AI_CHAT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3.5l1.35 3.15L16.5 8l-3.15 1.35L12 12.5l-1.35-3.15L7.5 8l3.15-1.35L12 3.5Z" />
    <path d="M18 12l.9 2.1L21 15l-2.1.9L18 18l-.9-2.1L15 15l2.1-.9L18 12Z" />
    <path d="M6 13.5l.75 1.75L8.5 16l-1.75.75L6 18.5l-.75-1.75L3.5 16l1.75-.75L6 13.5Z" />
  </svg>
`;

const DEFAULT_CALLOUT_MARKER = '[!NOTE]';
const FOOTNOTE_PLACEHOLDER = 'Write footnote text here';
const BOOKMARK_PLACEHOLDER = 'https://example.com';
const DEFAULT_CANVAS_JSON = '{\n  "nodes": [],\n  "edges": []\n}';
const CHECKLIST_ITEMS = ['First task', 'Second task', 'Third task'] as const;

type EditorViewLike = EditorView & { isDestroyed?: boolean };

function isInCodeBlock(selection: Selection) {
  return selection.$from.parent.type.name === 'code_block';
}

function isInList(selection: Selection) {
  return selection.$from.node(selection.$from.depth - 1)?.type?.name === 'list_item';
}

function isDocEmpty(doc: EditorState['doc']) {
  return doc.childCount <= 1 && !doc.firstChild?.content.size;
}

function createCalloutNode(state: EditorState, marker: string, body = '') {
  const blockquote = state.schema.nodes.blockquote;
  const paragraph = state.schema.nodes.paragraph;
  if (!blockquote || !paragraph) return null;

  const bodyContent = body ? state.schema.text(body) : undefined;
  return blockquote.create(null, [
    paragraph.create(null, state.schema.text(marker)),
    paragraph.create(null, bodyContent ?? null),
  ]);
}

function findCalloutBodyPosition(doc: EditorState['doc'], anchor: number, marker: string): number | null {
  let closestPos: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  doc.descendants((node, pos) => {
    if (node.type.name !== 'blockquote') return true;
    if (node.childCount < 2) return true;

    const title = node.child(0);
    if (title.type.name !== 'paragraph' || title.textContent.trim() !== marker) {
      return true;
    }

    const bodyPos = pos + 1 + title.nodeSize + 1;
    const distance = Math.abs(pos - anchor);
    if (distance < closestDistance) {
      closestPos = bodyPos;
      closestDistance = distance;
    }

    return false;
  });

  return closestPos;
}

function insertCalloutBlock(ctx: Ctx, marker = DEFAULT_CALLOUT_MARKER, body = '') {
  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);

  commands.call(clearTextInCurrentBlockCommand.key);

  const state = view.state;
  const callout = createCalloutNode(state, marker, body);
  if (!callout) return;

  const from = state.selection.from;
  const tr = state.tr.replaceSelectionWith(callout).scrollIntoView();
  const bodyPos = findCalloutBodyPosition(tr.doc, tr.mapping.map(from), marker);

  if (bodyPos != null) {
    try {
      tr.setSelection(TextSelection.create(tr.doc, bodyPos, bodyPos + body.length));
    } catch {
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(bodyPos, tr.doc.content.size))));
    }
  }

  view.dispatch(tr);
  view.focus();
}

function currentBlockRange(state: EditorState): { from: number; to: number } {
  const { $from } = state.selection;
  return {
    from: $from.depth > 0 ? $from.before() : state.selection.from,
    to: $from.depth > 0 ? $from.after() : state.selection.to,
  };
}

function insertCodeBlock(ctx: Ctx, language: string, content: string) {
  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);

  commands.call(clearTextInCurrentBlockCommand.key);

  const state = view.state;
  const codeBlock = state.schema.nodes.code_block;
  if (!codeBlock) return;

  const { from, to } = currentBlockRange(state);
  const node = codeBlock.create({ language }, content ? state.schema.text(content) : null);
  let tr = state.tr;
  try {
    tr = tr.replaceWith(from, to, node).scrollIntoView();
  } catch {
    return;
  }

  const textStart = from + 1;
  if (content) {
    try {
      tr.setSelection(TextSelection.create(tr.doc, textStart, textStart + content.length));
    } catch {
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(textStart, tr.doc.content.size))));
    }
  }

  view.dispatch(tr);
  view.focus();
}

function insertChecklist(ctx: Ctx) {
  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);

  commands.call(clearTextInCurrentBlockCommand.key);

  const state = view.state;
  const bulletList = state.schema.nodes.bullet_list;
  const listItem = state.schema.nodes.list_item;
  const paragraph = state.schema.nodes.paragraph;
  if (!bulletList || !listItem || !paragraph) return;

  const items = CHECKLIST_ITEMS.map(item => listItem.create(
    { checked: false },
    paragraph.create(null, state.schema.text(item)),
  ));
  const checklist = bulletList.create(null, items);
  const { from, to } = currentBlockRange(state);
  let tr = state.tr;
  try {
    tr = tr.replaceWith(from, to, checklist).scrollIntoView();
  } catch {
    return;
  }

  const textStart = from + 3;
  try {
    tr.setSelection(TextSelection.create(tr.doc, textStart, textStart + CHECKLIST_ITEMS[0].length));
  } catch {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(textStart, tr.doc.content.size))));
  }

  view.dispatch(tr);
  view.focus();
}

function changedRange(before: EditorState['doc'], after: EditorState['doc']): { from: number; to: number } | null {
  const start = before.content.findDiffStart(after.content);
  if (start == null) return null;
  const end = before.content.findDiffEnd(after.content);
  const max = after.content.size;
  const from = Math.max(0, Math.min(start, max));
  const rawTo = end ? Math.max(0, Math.min(end.b, max)) : from;
  const to = rawTo > from && rawTo - from <= 2000 ? rawTo : from;
  return { from, to };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scrollBehaviorForReveal(): ScrollBehavior {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  } catch {
    return 'smooth';
  }
}

function findScrollPane(el: HTMLElement): HTMLElement | null {
  const appPane = el.closest<HTMLElement>('.overflow-y-auto');
  if (appPane) return appPane;
  let node = el.parentElement;
  while (node && node !== document.body) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

function scrollChangedBlockIntoView(block: HTMLElement) {
  const behavior = scrollBehaviorForReveal();
  const pane = findScrollPane(block);
  const blockRect = block.getBoundingClientRect();
  const documentScroller = document.scrollingElement;

  if (!pane || pane === documentScroller || pane === document.body || pane === document.documentElement) {
    const offset = Math.max(64, Math.round(window.innerHeight * 0.28));
    const maxTop = Math.max(0, (documentScroller?.scrollHeight ?? 0) - window.innerHeight);
    const top = clampNumber(window.scrollY + blockRect.top - offset, 0, maxTop);
    window.scrollTo({ top, behavior });
    return;
  }

  const paneRect = pane.getBoundingClientRect();
  const offset = Math.max(48, Math.round(pane.clientHeight * 0.28));
  const maxTop = Math.max(0, pane.scrollHeight - pane.clientHeight);
  const top = clampNumber(pane.scrollTop + blockRect.top - paneRect.top - offset, 0, maxTop);
  pane.scrollTo({ top, behavior });
}

function revealRange(view: EditorViewLike, range: { from: number; to: number }): HTMLElement | null {
  const doc = view.state.doc;
  const max = doc.content.size;
  const from = Math.max(0, Math.min(range.from, max));
  const to = Math.max(from, Math.min(range.to, max));

  let tr = view.state.tr;
  try {
    tr = to > from
      ? tr.setSelection(TextSelection.create(doc, from, to))
      : tr.setSelection(TextSelection.near(doc.resolve(from), 1));
  } catch {
    try {
      tr = view.state.tr.setSelection(TextSelection.near(doc.resolve(from), 1));
    } catch {
      tr = view.state.tr;
    }
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
  return findBlockAtPos(view, from);
}

function findBlockAtPos(view: EditorViewLike, pos: number): HTMLElement | null {
  const root = view.dom;
  if (!(root instanceof HTMLElement)) return null;
  const childCount = root.children.length;
  if (childCount > 0) {
    try {
      const max = view.state.doc.content.size;
      const $pos = view.state.doc.resolve(clampNumber(pos, 0, max));
      const index = clampNumber($pos.index(0), 0, childCount - 1);
      const child = root.children[index];
      if (child instanceof HTMLElement) return child;
    } catch {
      /* fall through */
    }
  }
  let node: Node | null = null;
  try { node = view.domAtPos(pos).node; } catch { /* ignore */ }
  let el = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  if (el === root) return root.lastElementChild instanceof HTMLElement ? root.lastElementChild : null;
  while (el && el.parentElement !== root) {
    if (el === root) return null;
    el = el.parentElement;
  }
  return el instanceof HTMLElement ? el : null;
}

function getNextFootnoteLabel(doc: EditorState['doc']): string {
  const labels = new Set<string>();

  doc.descendants((node) => {
    if (node.type.name !== 'footnote_reference' && node.type.name !== 'footnote_definition') {
      return true;
    }

    const label = String(node.attrs.label ?? '').trim();
    if (label) labels.add(label);
    return true;
  });

  let next = 1;
  while (labels.has(String(next))) next += 1;
  return String(next);
}

function insertFootnote(ctx: Ctx) {
  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);

  commands.call(clearTextInCurrentBlockCommand.key);

  const state = view.state;
  const paragraph = state.schema.nodes.paragraph;
  const reference = state.schema.nodes.footnote_reference;
  const definition = state.schema.nodes.footnote_definition;
  if (!paragraph || !reference || !definition) return;

  const label = getNextFootnoteLabel(state.doc);
  const referenceParagraph = paragraph.create(null, [
    state.schema.text('Footnote reference '),
    reference.create({ label }),
  ]);
  const definitionParagraph = paragraph.create(null, state.schema.text(FOOTNOTE_PLACEHOLDER));
  const definitionNode = definition.create({ label }, definitionParagraph);
  const { $from } = state.selection;
  const replaceFrom = $from.depth > 0 ? $from.before() : state.selection.from;
  const replaceTo = $from.depth > 0 ? $from.after() : state.selection.to;

  let tr = state.tr;
  try {
    tr = tr.replaceWith(replaceFrom, replaceTo, [referenceParagraph, definitionNode]).scrollIntoView();
  } catch {
    return;
  }

  const definitionPos = replaceFrom + referenceParagraph.nodeSize;
  const textStart = definitionPos + 2;
  const textEnd = textStart + FOOTNOTE_PLACEHOLDER.length;
  try {
    tr.setSelection(TextSelection.create(tr.doc, textStart, textEnd));
  } catch {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(textStart, tr.doc.content.size))));
  }

  view.dispatch(tr);
  view.focus();
}

function createPlaceholderDecoration(state: EditorState, placeholderText: string) {
  const $pos = state.selection.$anchor;
  const node = $pos.parent;
  const before = $pos.before();

  return Decoration.node(before, before + node.nodeSize, {
    class: 'crepe-placeholder',
    'data-placeholder': placeholderText,
  });
}

function createTemplateHintWidget(
  getConfig: () => TemplateHintConfig | null,
  placeholderText: string
): HTMLElement {
  const root = document.createElement('span');
  root.className = 'milkdown-template-hint';
  root.contentEditable = 'false';

  const label = document.createElement('span');
  label.className = 'milkdown-template-hint-label';
  label.textContent = `${placeholderText} or use`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'milkdown-template-hint-button';
  button.textContent = 'Templates';

  const menu = document.createElement('div');
  menu.className = 'milkdown-template-hint-menu';
  menu.hidden = true;

  const teardown = { current: () => {} };

  const closeMenu = () => {
    menu.hidden = true;
    teardown.current();
    teardown.current = () => {};
  };

  const renderMenu = () => {
    menu.replaceChildren();
    const config = getConfig();
    const templates = config?.templates ?? [];
    if (!templates.length) {
      const empty = document.createElement('span');
      empty.className = 'milkdown-template-hint-empty';
      empty.textContent = 'No templates yet';
      menu.appendChild(empty);
      return;
    }
    for (const template of templates) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'milkdown-template-hint-item';
      item.textContent = template.name;
      item.addEventListener('mousedown', e => e.preventDefault());
      item.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        getConfig()?.onPick(template.id);
      });
      menu.appendChild(item);
    }
  };

  button.addEventListener('mousedown', e => e.preventDefault());
  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (!menu.hidden) {
      closeMenu();
      return;
    }
    renderMenu();
    menu.hidden = false;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!root.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    teardown.current = () => document.removeEventListener('mousedown', onDocumentMouseDown, true);
  });

  root.append(label, button, menu);
  (root as HTMLElement & { __cleanup?: () => void }).__cleanup = closeMenu;
  return root;
}

export default function MilkdownEditor({ defaultValue, noteKey, apiPrefix = '/api/notes', placeholder, onUpload, proxyUrl, onReady, onChange, onHeadingsChange, onAskAi, focusMode = false, typewriterMode = false, locked = false, preview = false, compact = false, autoFocus = false, templateHint = null, onNavigateLink, isKnownLinkTarget, linkTargetsVersion, getWikilinkCandidates, resolveLinkId, readNoteBody, getNoteHref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Stash the latest onChange/upload/proxy in refs so the once-only create
  // effect below can call them without re-creating Crepe on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onUploadRef = useRef(onUpload);
  onUploadRef.current = onUpload;
  const proxyUrlRef = useRef(proxyUrl);
  proxyUrlRef.current = proxyUrl;
  const onHeadingsChangeRef = useRef(onHeadingsChange);
  onHeadingsChangeRef.current = onHeadingsChange;
  const onAskAiRef = useRef(onAskAi);
  onAskAiRef.current = onAskAi;
  const templateHintRef = useRef<TemplateHintConfig | null>(templateHint);
  templateHintRef.current = templateHint;
  // Wikilink handlers. Kept in a single ref object so the plugin sees live
  // latest versions without having to re-mount the editor.
  const wikilinkOptsRef = useRef<WikilinkPluginOptions>({
    isKnown: target => isKnownLinkTarget?.(target) ?? true,
    onNavigate: (target, opts) => onNavigateLink?.(target, opts),
  });
  wikilinkOptsRef.current = {
    isKnown: target => isKnownLinkTarget?.(target) ?? true,
    onNavigate: (target, opts) => onNavigateLink?.(target, opts),
  };
  const autocompleteOptsRef = useRef<WikilinkAutocompleteOptions>({
    getCandidates: query => getWikilinkCandidates?.(query) ?? [],
  });
  autocompleteOptsRef.current = {
    getCandidates: query => getWikilinkCandidates?.(query) ?? [],
  };
  const transclusionOptsRef = useRef<TransclusionOptions>({
    resolveId: target => resolveLinkId?.(target) ?? null,
    readBody: id => readNoteBody?.(id) ?? Promise.resolve(''),
    onOpen: target => onNavigateLink?.(target, { section: '', isTransclusion: true, event: new MouseEvent('click') }),
  });
  transclusionOptsRef.current = {
    resolveId: target => resolveLinkId?.(target) ?? null,
    readBody: id => readNoteBody?.(id) ?? Promise.resolve(''),
    onOpen: target => onNavigateLink?.(target, { section: '', isTransclusion: true, event: new MouseEvent('click') }),
  };
  // Canvas blocks reuse the same wikilink resolver / note body reader, so a
  // `file` node in a canvas resolves the same way a `[[note]]` transclusion
  // does. Held in a ref so renderCanvasBlocks sees live values without
  // re-mounting Crepe.
  // Mirror of the editor's in-effect `proxyDomURL` (see line ~757) so a
  // canvas file node pointed at e.g. `.assets/foo.png` resolves the same
  // way an inline markdown `![](.assets/foo.png)` does.
  const proxyAssetUrl = (url: string): string => {
    if (proxyUrlRef.current) return proxyUrlRef.current(url);
    if (url.startsWith('.assets/')) {
      return `${apiPrefix}/_assets/${url.slice('.assets/'.length)}`;
    }
    const prefix = `./${noteKey}.assets/`;
    if (url.startsWith(prefix)) {
      return `${apiPrefix}/${noteKey}/asset/${url.slice(prefix.length)}`;
    }
    return url;
  };
  const canvasDepsRef = useRef<CanvasRenderDeps>({
    resolveLinkId: target => resolveLinkId?.(target) ?? null,
    readNoteBody: id => readNoteBody?.(id) ?? Promise.resolve(''),
    isKnownLinkTarget: target => isKnownLinkTarget?.(target) ?? true,
    onNavigateLink: target => onNavigateLink?.(target, { section: '', isTransclusion: false, event: new MouseEvent('click') }),
    getNoteCandidates: query => getWikilinkCandidates?.(query) ?? [],
    getNoteHref: target => getNoteHref?.(target) ?? null,
    proxyAssetUrl,
    getEditorView: () => editorViewRef.current,
  });
  canvasDepsRef.current = {
    resolveLinkId: target => resolveLinkId?.(target) ?? null,
    readNoteBody: id => readNoteBody?.(id) ?? Promise.resolve(''),
    isKnownLinkTarget: target => isKnownLinkTarget?.(target) ?? true,
    onNavigateLink: target => onNavigateLink?.(target, { section: '', isTransclusion: false, event: new MouseEvent('click') }),
    getNoteCandidates: query => getWikilinkCandidates?.(query) ?? [],
    getNoteHref: target => getNoteHref?.(target) ?? null,
    proxyAssetUrl,
    getEditorView: () => editorViewRef.current,
  };
  // Enhancement flags — read via refs so the once-only create effect picks
  // up the latest values without remounting the editor.
  const focusModeRef = useRef(focusMode);
  focusModeRef.current = focusMode;
  const typewriterModeRef = useRef(typewriterMode);
  typewriterModeRef.current = typewriterMode;
  // Stashed for the create-effect to read after `crepe.create()` resolves so
  // the initial readonly state is applied without remounting.
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  // Handle to the live Crepe instance — used by the separate `locked` effect
  // below to toggle readonly at runtime.
  const crepeRef = useRef<Crepe | null>(null);
  // Live ProseMirror view reference. Reading this directly avoids reaching
  // back into Milkdown's context during selection changes or teardown.
  const editorViewRef = useRef<EditorViewLike | null>(null);
  // Hook that reads ProseMirror's authoritative selection and returns the DOM
  // node of the top-level block the caret sits in. Bypasses the browser's
  // `window.getSelection()` — which is unreliable after the user clicks
  // toolbar buttons or toggles a setting.
  const findBlockFromPMRef = useRef<(() => HTMLElement | null) | null>(null);
  // Caret viewport-Y resolver — set once the ProseMirror view is available.
  // Used by the typewriter toggle effect so enabling the mode snaps the
  // current caret to center immediately, without needing a selection change.
  const getCaretClientYRef = useRef<(() => number | null) | null>(null);
  // Hovered Milkdown block for focus mode. When null, focus mode falls back
  // to the current text selection / nearest visible block.
  const hoveredFocusBlockRef = useRef<HTMLElement | null>(null);
  const focusOverlayDriverRef = useRef<'hover' | 'selection'>('selection');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const getMarkdown = () => unescapeWikilinkBracketsForStorage(
      serializeTaskListMarkdownForStorage(crepe.getMarkdown()),
    );
    const normalizedDefaultValue = normalizeTaskListMarkdownForEditor(defaultValue || '');

    // Image upload: either delegate to the caller-provided upload function
    // (browser-fs mode writes to user's local folder) or POST to the per-note
    // asset endpoint (server mode). The markdown stores a relative path
    // (./{key}.assets/{uuid}.{ext}) — keeping the .md + assets folder a
    // portable, self-contained pair (Typora-style).
    const uploadImage = async (file: File): Promise<string> => {
      if (onUploadRef.current) {
        return onUploadRef.current(file);
      }
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiPrefix}/${noteKey}/asset`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed: ${res.status}`);
      }
      const json = await res.json();
      return json.url as string;
    };

    // Display-time URL translation: the markdown stores a relative path, but
    // the browser needs something it can fetch (HTTP URL or blob: URL).
    // Must be synchronous — Milkdown reads the return value directly.
    const proxyDomURL = (url: string): string => {
      if (proxyUrlRef.current) return proxyUrlRef.current(url);
      // Global assets (new style)
      if (url.startsWith('.assets/')) {
        return `${apiPrefix}/_assets/${url.slice('.assets/'.length)}`;
      }
      // Legacy per-note assets
      const prefix = `./${noteKey}.assets/`;
      if (url.startsWith(prefix)) {
        return `${apiPrefix}/${noteKey}/asset/${url.slice(prefix.length)}`;
      }
      return url;
    };

    let destroyed = false;
    // Match Crepe's default editing surface — CodeMirror code blocks,
    // image block with caption, LaTeX, tables, slash menu (BlockEdit),
    // selection toolbar, link tooltip, smooth cursor, and list item handles.
    // Preview mode strips edit-only features to shave mount time for the
    // history snapshot viewer.
    const crepeFeatures: Partial<Record<CrepeFeature, boolean>> = preview
      ? {
          [CrepeFeature.Placeholder]: false,
          [CrepeFeature.BlockEdit]: false,
          [CrepeFeature.Toolbar]: false,
          [CrepeFeature.LinkTooltip]: false,
          [CrepeFeature.Cursor]: false,
          [CrepeFeature.TopBar]: false,
        }
      : compact
        ? {
            [CrepeFeature.Placeholder]: false,
            [CrepeFeature.BlockEdit]: false,
            [CrepeFeature.Toolbar]: false,
            [CrepeFeature.LinkTooltip]: false,
            [CrepeFeature.TopBar]: false,
            // ImageBlock is enabled when the caller provides an `onUpload`
            // handler — without it, pasted images would fall through to
            // ProseMirror's default and end up as transient `blob:` URLs.
            // Compact callers that don't set onUpload (none today) keep
            // images disabled to match the old behaviour.
            [CrepeFeature.ImageBlock]: !!onUpload,
          }
        : { [CrepeFeature.Placeholder]: false };
    const crepe = new Crepe({
      root: el,
      defaultValue: normalizedDefaultValue,
      features: crepeFeatures,
      // Preview skips the upload wiring — the editor is locked and images in
      // a snapshot's body don't need per-note uploaders attached.
      ...(preview
        ? {}
        : {
            featureConfigs: {
              [CrepeFeature.ImageBlock]: {
                onUpload: uploadImage,
                blockOnUpload: uploadImage,
                inlineOnUpload: uploadImage,
                proxyDomURL,
              },
              [CrepeFeature.BlockEdit]: {
                buildMenu: builder => {
                  const advancedGroup = builder.getGroup('advanced');
                  advancedGroup.addItem('callout', {
                    label: 'Callout',
                    icon: CALLOUT_ICON,
                    onRun: ctx => insertCalloutBlock(ctx),
                  });
                  advancedGroup.addItem('bookmark', {
                    label: 'Bookmark',
                    icon: BOOKMARK_ICON,
                    onRun: ctx => insertCodeBlock(ctx, 'bookmark', BOOKMARK_PLACEHOLDER),
                  });
                  builder.getGroup('list').addItem('checklist-starter', {
                    label: 'Checklist',
                    icon: CHECKLIST_ICON,
                    onRun: insertChecklist,
                  });
                  advancedGroup.addItem('footnote', {
                    label: 'Footnote',
                    icon: FOOTNOTE_ICON,
                    onRun: insertFootnote,
                  });
                  advancedGroup.addItem('youtube', {
                    label: 'YouTube',
                    icon: YOUTUBE_ICON,
                    onRun: ctx => {
                      const commands = ctx.get(commandsCtx);
                      commands.call(clearTextInCurrentBlockCommand.key);
                      commands.call(createCodeBlockCommand.key, 'youtube');
                      ctx.get(editorViewCtx).focus();
                    },
                  });
                  advancedGroup.addItem('price-chart', {
                    label: 'Price Chart',
                    icon: PRICE_CHART_ICON,
                    onRun: ctx => insertCodeBlock(ctx, 'price-chart', 'datetime,open,high,low,close,volume\n'),
                  });
                  advancedGroup.addItem('canvas', {
                    label: 'Canvas',
                    icon: CANVAS_ICON,
                    onRun: ctx => insertCodeBlock(ctx, 'canvas', DEFAULT_CANVAS_JSON),
                  });
                },
              },
              [CrepeFeature.Toolbar]: {
                buildToolbar: builder => {
                  const askAi = onAskAiRef.current;
                  if (!askAi) return;
                  builder.addGroup('ai', 'AI').addItem('ask-ai', {
                    icon: AI_CHAT_ICON,
                    active: () => false,
                    onRun: ctx => {
                      const handler = onAskAiRef.current;
                      if (!handler) return;
                      const view = ctx.get(editorViewCtx);
                      const { from, to } = view.state.selection;
                      const selectedText = view.state.doc.textBetween(from, to, '\n').trim();
                      if (selectedText) handler(selectedText);
                    },
                  });
                },
              },
            },
          }),
    });
    crepe.editor.use(createCalloutEditorPlugin());
    crepe.editor.use(createBookmarkEditorPlugin());

    // Most custom plugins are edit-time concerns (autocomplete popup, clickable
    // wikilinks, transclusion resolution, template hint widget, task-list input
    // rule, and media editing). Skipping them in preview mode cuts meaningful
    // startup cost.
    if (!preview) {
      crepe.editor.use(wrapInCompactTaskListInputRule);
      crepe.editor.use(createWikilinkEditorPlugin(wikilinkOptsRef));
      crepe.editor.use(createWikilinkAutocompleteEditorPlugin(autocompleteOptsRef));
      crepe.editor.use(createTransclusionEditorPlugin(transclusionOptsRef));
      crepe.editor.use(createYoutubeEmbedEditorPlugin());
      crepe.editor.use(createPriceChartEditorPlugin());
      crepe.editor.use($prose(() => {
      return new Plugin({
        key: new PluginKey('NOTES_TEMPLATE_HINT'),
        props: {
          decorations: (state) => {
            if (lockedRef.current) return null;
            const placeholderText = placeholder || 'Start writing — type / for commands';
            const config = templateHintRef.current;
            if (!state.selection.empty) return null;
            if (isInCodeBlock(state.selection) || isInList(state.selection)) return null;

            const $pos = state.selection.$anchor;
            const node = $pos.parent;
            if (node.content.size > 0) return null;

            const inTable = findParent((node2) => node2.type.name === 'table')($pos);
            if (inTable) return null;

            const placeholderDecoration = createPlaceholderDecoration(state, placeholderText);
            const showTemplateHint = !!config?.enabled
              && isDocEmpty(state.doc)
              && $pos.depth === 1
              && $pos.index(0) === 0;

            if (!showTemplateHint) {
              return DecorationSet.create(state.doc, [placeholderDecoration]);
            }

            return DecorationSet.create(state.doc, [
              createPlaceholderDecoration(state, ''),
              Decoration.widget(
                state.selection.from,
                () => createTemplateHintWidget(
                  () => templateHintRef.current,
                  placeholderText
                ),
                {
                  side: 1,
                  ignoreSelection: true,
                  key: `notes-template-hint:${config.templates.length}`,
                  stopEvent: () => true,
                  destroy: (nodeDom) => {
                    const dom = nodeDom as HTMLElement & { __cleanup?: () => void };
                    dom.__cleanup?.();
                  },
                },
              ),
            ]);
          },
        },
      });
      }));
    }

    // Reads PM's authoritative selection and returns the DOM node of the
    // top-level block the caret is in — i.e. the direct child of
    // `.ProseMirror` at the caret's top-level index. Uses Crepe's underlying
    // Milkdown editor via editorViewCtx so it never races with browser
    // selection quirks (stale selection after a click on the settings cog).
    //
    // Why `$pos.index(0)` + `view.dom.children[…]`:
    //   `$pos.index(0)` is the child index of the depth-1 block within the
    //   document. PM renders each top-level block as a direct child of
    //   `view.dom` (the `.ProseMirror` element), so indexing directly gives
    //   the exact DOM node — no `domAtPos()` offset math, no walker, no
    //   risk of landing on PM itself.
    const findBlockFromPM = (): HTMLElement | null => {
      const view = editorViewRef.current;
      if (!view?.state || !view.dom) return null;
      const $pos = view.state.doc.resolve(view.state.selection.from);
      if ($pos.depth < 1) return null;
      const blockIndex = $pos.index(0);
      const child = view.dom.children[blockIndex];
      return child instanceof HTMLElement ? child : null;
    };
    findBlockFromPMRef.current = findBlockFromPM;

    // Caret's viewport Y from ProseMirror's authoritative selection. Returns
    // the midpoint of the caret rect so centering targets the caret line
    // itself, not the top or bottom of the cursor. Used by typewriter mode.
    const getCaretClientY = (): number | null => {
      const view = editorViewRef.current;
      if (!view?.state || !view.coordsAtPos) return null;
      try {
        const pos = view.state.selection.head ?? view.state.selection.from;
        const coords = view.coordsAtPos(pos);
        return (coords.top + coords.bottom) / 2;
      } catch {
        return null;
      }
    };
    getCaretClientYRef.current = getCaretClientY;

    // Change detection: use a MutationObserver on the ProseMirror content.
    // The DOM `input` event only fires on user-typed input — it does NOT fire
    // when Milkdown programmatically inserts nodes (e.g. an <img> after an
    // async upload resolves), so using `input` alone causes silent data loss:
    // the image is written to disk but the markdown is never saved. Observing
    // DOM mutations catches every change (typed, pasted, programmatic).
    let proseMirrorEl: HTMLElement | null = null;
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let changeTimer: number | null = null;
    let highlightTimer: number | null = null;
    let revealTimer: number | null = null;

    // Typewriter spacers live on the outer `.milkdown-wrapper`, not on this
    // inner `.milkdown-root`, so mode classes/CSS vars must be applied there
    // or the ::before/::after slack never affects layout.
    const getTypewriterHost = (): HTMLElement => (
      el.closest<HTMLElement>('.milkdown-wrapper') ?? el
    );

    const syncTypewriterSlack = () => {
      const host = getTypewriterHost();
      const pm = el.querySelector<HTMLElement>('.ProseMirror');
      const target = pm ?? host;
      const container = pm ? target.parentElement : host.parentElement;
      const scrollContainer = target.closest<HTMLElement>('.overflow-y-auto');
      const base = scrollContainer ?? container;
      const height = base?.clientHeight ?? window.innerHeight;
      // Half the pane on each side, so an empty doc (or a doc shorter than
      // the pane) has enough room for the first and last lines to sit at
      // vertical center. 45% overshoots for the last line but undershoots
      // the first line — 50% works for both.
      const slack = Math.max(200, Math.round(height / 2));
      host.style.setProperty('--typewriter-end-slack', `${slack}px`);
      if (host !== el) el.style.removeProperty('--typewriter-end-slack');
    };

    const extractHeadings = () => {
      if (!onHeadingsChangeRef.current) return;
      // Always re-query the ProseMirror element — it may have been recreated
      const pm = el.querySelector('.ProseMirror');
      if (!pm) return;
      const els = pm.querySelectorAll('h1, h2, h3, h4, h5, h6');
      // Skip headings that live inside a canvas preview (the rendered
      // markdown of file/text nodes is embedded content of *other* notes,
      // not headings of this note — letting them through would pollute
      // the TOC with the linked note's structure).
      const headings = Array.from(els)
        .filter(headingEl => !headingEl.closest('.canvas-preview'))
        .map((headingEl, index) => ({
          level: parseInt(headingEl.tagName[1]),
          text: headingEl.textContent || '',
          index,
        }));
      onHeadingsChangeRef.current(headings);
    };

    const resolveFocusOverlayTarget = () => {
      const pm = el.querySelector<HTMLElement>('.ProseMirror');
      const hovered = hoveredFocusBlockRef.current;
      if (
        focusOverlayDriverRef.current === 'hover'
        && hovered
        && hovered.isConnected
        && pm?.contains(hovered)
      ) {
        return hovered;
      }
      if (hovered && (!hovered.isConnected || !pm?.contains(hovered))) {
        hoveredFocusBlockRef.current = null;
      }
      focusOverlayDriverRef.current = 'selection';
      return findSelectionFocusBlock(el);
    };

    const refreshFocusOverlay = () => {
      if (!focusModeRef.current) return;
      updateFocusOverlay(el, resolveFocusOverlayTarget());
    };

    const renderCodeBlockPreviews = () => {
      void Promise.all([
        renderMermaidBlocks(el),
        renderExcalidrawBlocks(el),
        renderCanvasBlocks(el, canvasDepsRef.current),
      ]);
    };

    const notifyChange = () => {
      if (changeTimer) window.clearTimeout(changeTimer);
      // Small internal debounce to coalesce mutation bursts (a single edit
      // can produce many mutations). Parent adds its own 800ms debounce on
      // top so this stays cheap.
      changeTimer = window.setTimeout(() => {
        changeTimer = null;
        onChangeRef.current?.(getMarkdown());
        extractHeadings();
        // Re-render live code-block previews such as Mermaid and Excalidraw.
        // Each renderer caches by source, so unchanged blocks are a no-op.
        renderCodeBlockPreviews();
        if (focusModeRef.current) refreshFocusOverlay();
        // Don't recenter here. Selection-change fires 1-2 frames after every
        // keystroke and handles typing. Running again from the mutation
        // debounce (30ms later) double-scrolls when layout has settled
        // slightly between the two calls, producing visible jitter.
        if (typewriterModeRef.current) syncTypewriterSlack();
      }, 30);
    };

    const flashChangedBlock = (block: HTMLElement) => {
      block.classList.remove('ai-edit-flash');
      void block.offsetWidth;
      block.classList.add('ai-edit-flash');
      if (highlightTimer) window.clearTimeout(highlightTimer);
      highlightTimer = window.setTimeout(() => {
        block.classList.remove('ai-edit-flash');
        highlightTimer = null;
      }, 1800);
    };

    const revealChangedDocRange = (before: EditorState['doc'], after: EditorState['doc']) => {
      const range = changedRange(before, after);
      const view = editorViewRef.current;
      if (!range || !view) return;

      const revealOnce = (shouldFlash: boolean, setSelection: boolean) => {
        const liveView = editorViewRef.current;
        if (!liveView) return;
        const block = setSelection
          ? revealRange(liveView, range)
          : findBlockAtPos(liveView, range.from);
        if (!block) return;
        scrollChangedBlockIntoView(block);
        if (shouldFlash) flashChangedBlock(block);
      };

      window.requestAnimationFrame(() => revealOnce(true, true));
      if (revealTimer) window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => {
        revealTimer = null;
        window.requestAnimationFrame(() => revealOnce(false, false));
      }, 140);
    };

    const replaceMarkdown = (markdown: string, opts?: { revealChange?: boolean }): boolean => {
      const view = editorViewRef.current;
      if (!view || preview) return false;
      const before = view.state.doc;
      try {
        crepe.editor.action(replaceAll(normalizeTaskListMarkdownForEditor(markdown || '')));
      } catch (err) {
        console.error('[editor] replace markdown failed', err);
        return false;
      }
      const afterView = editorViewRef.current;
      if (opts?.revealChange && afterView) {
        revealChangedDocRange(before, afterView.state.doc);
      }
      window.requestAnimationFrame(() => {
        extractHeadings();
        renderCodeBlockPreviews();
        if (focusModeRef.current) refreshFocusOverlay();
        if (typewriterModeRef.current) syncTypewriterSlack();
      });
      return true;
    };

    const onFootnoteClick = (e: Event) => handleFootnoteClick(el, e);

    // Focus-mode + typewriter: update the hover/selection overlay and active
    // block on every selection change. Rate-limit with rAF so caret-sweeping
    // or fast mouse movement doesn't thrash layout.
    let selectionRaf = 0;
    let hoverRaf = 0;
    const onSelectionChange = () => {
      if (selectionRaf) return;
      selectionRaf = window.requestAnimationFrame(() => {
        selectionRaf = 0;
        if (focusModeRef.current) refreshFocusOverlay();
        if (typewriterModeRef.current) {
          syncTypewriterSlack();
          centerCaretLine(el, getCaretClientY());
        }
      });
    };
    const onMouseMove = (e: MouseEvent) => {
      hoveredFocusBlockRef.current = findHoveredFocusBlock(el, e.target, e.clientY);
      focusOverlayDriverRef.current = hoveredFocusBlockRef.current ? 'hover' : 'selection';
      if (!focusModeRef.current) return;
      if (hoverRaf) return;
      hoverRaf = window.requestAnimationFrame(() => {
        hoverRaf = 0;
        refreshFocusOverlay();
      });
    };
    const onKeyDown = () => {
      hoveredFocusBlockRef.current = null;
      focusOverlayDriverRef.current = 'selection';
    };
    const onMouseLeave = () => {
      hoveredFocusBlockRef.current = null;
      focusOverlayDriverRef.current = 'selection';
      if (!focusModeRef.current) return;
      if (hoverRaf) window.cancelAnimationFrame(hoverRaf);
      hoverRaf = 0;
      refreshFocusOverlay();
    };
    let headingsInterval: number | null = null;

    crepe.create().then(() => {
      if (destroyed) return;
      crepeRef.current = crepe;
      // Apply the initial lock state. Crepe doesn't accept readonly in its
      // config, so this is the earliest point where it can be set.
      if (lockedRef.current) crepe.setReadonly(true);
      if (onReady) onReady(getMarkdown, { getMarkdown, replaceMarkdown });
      proseMirrorEl = el.querySelector('.ProseMirror');
      if (proseMirrorEl) {
        try {
          editorViewRef.current = crepe.editor.ctx.get(editorViewCtx) as unknown as EditorViewLike;
        } catch {
          editorViewRef.current = null;
        }
        // Preview renders a static snapshot — skip autosave, heading sync,
        // focus/typewriter overlays, diagram renders, and the MutationObserver
        // that drives them. The caller expects a read-only view.
        if (!preview) {
          // Belt-and-braces: some PM input paths (typing into a still-empty
          // heading block after mount) update the DOM without producing a
          // characterData mutation the observer below catches, so the title
          // sync in onChange never fires until a save path writes it later.
          // Listening for the `input` event catches those keystrokes too.
          proseMirrorEl.addEventListener('input', notifyChange);
          // Auto-focus for freshly-created notes. ProseMirror seeds the initial
          // selection at the start of the doc, so calling focus() alone lands
          // the caret inside the first block (the `## ` heading for new notes).
          if (autoFocus) {
            try { editorViewRef.current?.focus?.(); } catch { /* ignore */ }
          }
          extractHeadings(); // initial heading extraction
          // Existing diagram blocks need an initial pass on mount; otherwise
          // previews only appear after a later edit mutates the editor DOM.
          renderCodeBlockPreviews();
          // If either mode is already on when the editor finishes mounting,
          // apply its initial marker immediately rather than waiting for the
          // first selection change.
          if (focusModeRef.current) refreshFocusOverlay();
          if (typewriterModeRef.current) {
            syncTypewriterSlack();
            centerCaretLine(el, getCaretClientY());
          }
          mutationObserver = new MutationObserver(notifyChange);
          mutationObserver.observe(proseMirrorEl, {
            childList: true,    // new/removed nodes (images, blocks, etc.)
            subtree: true,      // watch everything under ProseMirror
            characterData: true, // text edits
            attributes: true,
            attributeFilter: ['src', 'href'], // caught URL updates on img/a
          });
          resizeObserver = new ResizeObserver(() => {
            if (focusModeRef.current) refreshFocusOverlay();
            if (typewriterModeRef.current) {
              syncTypewriterSlack();
              centerCaretLine(el, getCaretClientY());
            }
          });
          resizeObserver.observe(proseMirrorEl);
          const scrollPane = el.closest<HTMLElement>('.overflow-y-auto');
          if (scrollPane) resizeObserver.observe(scrollPane);
        }
      }
      if (!preview) {
        // Periodic heading extraction as a safety net — catches cases where
        // ProseMirror recreates the DOM element or mutations aren't observed.
        headingsInterval = window.setInterval(extractHeadings, 1000);
      }
    }).catch((err) => {
      // Without this, a failed Crepe init is swallowed silently — the editor
      // pane stays blank and onReady never fires, so autosave stays disabled
      // and the user sees a loading state that never resolves. Surface the
      // error to the console so the failure is diagnosable.
      if (destroyed) return;
      console.error('[editor] crepe init failed', err);
    });

    // All of these drive focus-mode / typewriter / footnote navigation —
    // none of which run in preview mode. Teardown below is safe to call
    // unconditionally (removeEventListener on a listener that wasn't added
    // is a no-op).
    if (!preview) {
      document.addEventListener('selectionchange', onSelectionChange);
      el.addEventListener('click', onFootnoteClick, true);
      el.addEventListener('keydown', onKeyDown);
      el.addEventListener('mousemove', onMouseMove);
      el.addEventListener('mouseleave', onMouseLeave);
    }

    return () => {
      destroyed = true;
      crepeRef.current = null;
      const view = editorViewRef.current as (EditorViewLike & { dispatch?: (tr: unknown) => void }) | null;
      editorViewRef.current = null;
      findBlockFromPMRef.current = null;
      getCaretClientYRef.current = null;
      hoveredFocusBlockRef.current = null;
      focusOverlayDriverRef.current = 'selection';
      if (changeTimer) window.clearTimeout(changeTimer);
      if (highlightTimer) window.clearTimeout(highlightTimer);
      if (revealTimer) window.clearTimeout(revealTimer);
      if (headingsInterval) window.clearInterval(headingsInterval);
      if (selectionRaf) window.cancelAnimationFrame(selectionRaf);
      if (hoverRaf) window.cancelAnimationFrame(hoverRaf);
      document.removeEventListener('selectionchange', onSelectionChange);
      el.removeEventListener('click', onFootnoteClick, true);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mouseleave', onMouseLeave);
      if (mutationObserver) mutationObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      if (proseMirrorEl) proseMirrorEl.removeEventListener('input', notifyChange);
      // Blur the caret before destroy so ProseMirror doesn't dispatch any
      // focus-related transactions against a torn-down state.
      const active = document.activeElement;
      if (active instanceof HTMLElement && el.contains(active)) active.blur();
      // Neuter the view's dispatch BEFORE calling crepe.destroy().
      //
      // Milkdown's list-item-block NodeView queues a `requestAnimationFrame`
      // in its `onMount` that calls `view.dispatch(tr.setSelection(...))`
      // to sync the selection after Vue finishes mounting. If the editor
      // is unmounted before that rAF fires, the rAF still runs — but by
      // then Crepe's teardown has started tearing down the Milkdown ctx,
      // and the state-sync plugin's `apply()` throws
      // `MilkdownError: Context "editorState" not found`.
      // Replacing `dispatch` with a no-op turns stale rAFs into silent
      // no-ops. Safe because Crepe's own destroy uses editor-level APIs
      // (not this dispatch) to tear down.
      if (view) {
        try { view.dispatch = () => { /* view destroyed */ }; } catch { /* sealed object */ }
      }
      // DOM-side decorations. Safe to run while the editor is still alive.
      clearFocusOverlay(el);
      // Do NOT call `editorView.destroy()` here. Crepe's own destroy path
      // tears the PM view down via the Milkdown editor, in the correct order
      // (ctx teardown → plugin destroy → view destroy). Destroying the view
      // manually first leaves the Milkdown ctx without `editorState`, and
      // the very next transaction Crepe dispatches during its own teardown
      // crashes inside the state-sync plugin's `apply()`.
      crepe.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle block-focused dimming without remounting the editor.
  // Kept in its own effect so the editor doesn't remount just to flip a mode.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (focusMode) {
      el.classList.add('focus-mode');
      const pm = el.querySelector<HTMLElement>('.ProseMirror');
      const hovered = hoveredFocusBlockRef.current;
      const target = (
        focusOverlayDriverRef.current === 'hover'
        && hovered
        && hovered.isConnected
        && pm?.contains(hovered)
      )
        ? hovered
        : findSelectionFocusBlock(el);
      if (target !== hovered) {
        hoveredFocusBlockRef.current = null;
        focusOverlayDriverRef.current = 'selection';
      }
      updateFocusOverlay(el, target);
    } else {
      el.classList.remove('focus-mode');
      clearFocusOverlay(el);
    }
  }, [focusMode]);

  // Typewriter mode: pin the caret line to the vertical center of the
  // scroll pane. The ::before and ::after slack pseudo-elements give the
  // document enough padding top and bottom so the first, last, and any
  // line in between can sit at center.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const host = el.closest<HTMLElement>('.milkdown-wrapper') ?? el;
    let centerRaf = 0;
    if (typewriterMode) {
      const scrollPane = host.closest<HTMLElement>('.overflow-y-auto');
      const height = scrollPane?.clientHeight ?? window.innerHeight;
      const slack = Math.max(200, Math.round(height / 2));
      host.style.setProperty('--typewriter-end-slack', `${slack}px`);
      host.classList.add('typewriter-mode');
      if (host !== el) {
        el.style.removeProperty('--typewriter-end-slack');
        el.classList.remove('typewriter-mode');
      }
      // Let the wrapper class/style apply first so short documents can
      // actually scroll enough for the caret to reach the centered line.
      centerRaf = window.requestAnimationFrame(() => {
        centerCaretLine(el, getCaretClientYRef.current?.() ?? null);
      });
    } else {
      host.classList.remove('typewriter-mode');
      host.style.removeProperty('--typewriter-end-slack');
      if (host !== el) {
        el.classList.remove('typewriter-mode');
        el.style.removeProperty('--typewriter-end-slack');
      }
    }
    return () => {
      if (centerRaf) window.cancelAnimationFrame(centerRaf);
      host.classList.remove('typewriter-mode');
      host.style.removeProperty('--typewriter-end-slack');
      if (host !== el) {
        el.classList.remove('typewriter-mode');
        el.style.removeProperty('--typewriter-end-slack');
      }
    };
  }, [typewriterMode]);

  // Flip readonly at runtime. Safe to call before `crepe.create()` resolves —
  // the create-effect also reads `lockedRef` and applies the initial state.
  useEffect(() => {
    crepeRef.current?.setReadonly(locked);
    const el = containerRef.current;
    if (el) el.classList.toggle('locked', locked);
  }, [locked]);

  // Rebuild wikilink decorations when the host signals that the set of known
  // targets has changed (a new note was indexed, a link target renamed, etc).
  useEffect(() => {
    const view = editorViewRef.current as unknown as import('@milkdown/kit/prose/view').EditorView | null;
    refreshWikilinkDecorations(view);
  }, [linkTargetsVersion]);

  return <div ref={containerRef} className="milkdown-root" />;
}
