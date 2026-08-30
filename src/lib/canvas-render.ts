// Mounts an interactive canvas editor (React Flow + JSON Canvas) into each
// `.milkdown-code-block` whose language is `canvas`. Unlike the mermaid/
// excalidraw renderers, this one is two-way: edits made on the canvas
// surface are written back into the code block's CodeMirror source.
//
// Block layout: the CodeMirror source area is visually collapsed (see
// `.canvas-source-collapsed` in globals.css) so the JSON occupies only a
// couple of rows regardless of how many nodes the user adds — the canvas
// preview underneath is the real surface. The toolbar's expand button
// opens a `document.body`-level lightbox for working at full screen.

'use client';

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EditorView } from '@milkdown/kit/prose/view';
import { extractCodeFromBlock, getBlockLanguage } from './codeblock-dom';
import { escapeHtml } from './html-escape';
import { parseCanvas, serializeCanvas } from './canvas/parser';
import type { CanvasDoc } from './canvas/types';
import { CanvasBlockBoundary } from '@/components/canvas/CanvasBlockBoundary';

// Cap on the JSON source size we'll feed to the React Flow renderer. A
// pathological paste (thousands of nodes, megabytes of JSON) can freeze
// React Flow or trip ProseMirror's NodeView diff on adjacent list items
// — same failure mode that hit the price-chart plugin. Above this we
// leave the fence visible as plain code and show a hint to trim it.
const MAX_CANVAS_SOURCE_LENGTH = 100_000;

export interface CanvasRenderDeps {
  resolveLinkId?: (target: string) => string | null;
  readNoteBody?: (id: string) => Promise<string>;
  isKnownLinkTarget?: (target: string) => boolean;
  onNavigateLink?: (target: string) => void;
  getNoteCandidates?: (query: string) => { title: string; id: string }[];
  getNoteHref?: (target: string) => string | null;
  proxyAssetUrl?: (path: string) => string;
  // Provides the live ProseMirror editor view so the shim can write canvas
  // edits back through PM. Going through CodeMirror's own dispatch is a
  // dead end — Milkdown's CodeMirror NodeView only forwards CM changes to
  // PM when the CM editor has focus (see code-block/index.js → forwardUpdate
  // bails on `!this.cm.hasFocus`), and our canvas surface never gives focus
  // to the underlying CM editor.
  getEditorView?: () => EditorView | null;
}

const SOURCE_COLLAPSED_CLASS = 'canvas-source-collapsed';

// Per-block React root for the inline canvas.
const mounted = new WeakMap<HTMLElement, Root>();

// Per-block dirty flag — set when we just wrote into the CM view, so the
// next mutation pass can be ignored as our own echo.
const justWrote = new WeakMap<HTMLElement, string>();

// Per-block lightbox close handler, so a stale block (re-rendered by PM)
// can close its open lightbox during cleanup.
const openLightboxes = new WeakMap<HTMLElement, () => void>();

let CanvasEditorPromise: Promise<typeof import('@/components/canvas/CanvasEditor').CanvasEditor> | null = null;
function loadCanvasEditor() {
  if (!CanvasEditorPromise) {
    CanvasEditorPromise = import('@/components/canvas/CanvasEditor').then(m => m.CanvasEditor);
  }
  return CanvasEditorPromise;
}

function ensurePreview(block: HTMLElement): HTMLElement {
  let preview = block.querySelector<HTMLElement>(':scope > .canvas-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'canvas-preview';
    preview.setAttribute('contenteditable', 'false');
    block.appendChild(preview);
  }
  return preview;
}

function unmountBlock(block: HTMLElement, preview?: HTMLElement | null): void {
  const root = mounted.get(block);
  if (root) {
    root.unmount();
    mounted.delete(block);
  }
  if (preview) {
    delete preview.dataset.source;
  }
}

function cleanupStalePreviews(root: HTMLElement, active: ReadonlySet<HTMLElement>): void {
  root.querySelectorAll<HTMLElement>('.canvas-preview').forEach(preview => {
    const block = preview.closest<HTMLElement>('.milkdown-code-block');
    if (!block || !active.has(block)) {
      openLightboxes.get(block as HTMLElement)?.();
      unmountBlock(block as HTMLElement, preview);
      (block as HTMLElement | null)?.classList.remove(SOURCE_COLLAPSED_CLASS);
      preview.remove();
    }
  });
}

// Walk the PM doc to find the code_block whose NodeView outer DOM matches
// the given `.milkdown-code-block` element. We can't reuse `view.posAtDOM`
// reliably because the block's nested CM editor confuses the offset math —
// scanning code_block nodes and comparing `nodeDOM(pos)` is unambiguous.
function findBlockPosition(view: EditorView, blockEl: HTMLElement):
  | { pos: number; node: ReturnType<typeof view.state.doc.nodeAt> }
  | null
{
  let result: { pos: number; node: ReturnType<typeof view.state.doc.nodeAt> } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (result) return false;
    if (node.type.name !== 'code_block') return false;
    if (view.nodeDOM(pos) === blockEl) {
      result = { pos, node };
      return false;
    }
    return false;
  });
  return result;
}

function writeBackThroughProseMirror(view: EditorView, block: HTMLElement, next: string): boolean {
  const found = findBlockPosition(view, block);
  if (!found || !found.node) return false;
  const { pos, node } = found;
  if (next === node.textContent) return false;

  try {
    const from = pos + 1; // skip code_block open token
    const to = pos + node.nodeSize - 1; // skip close token
    const text = next ? view.state.schema.text(next) : null;
    const tr = text
      ? view.state.tr.replaceWith(from, to, text)
      : view.state.tr.delete(from, to);
    // Don't move the user's selection into the canvas's JSON; leave the PM
    // selection where it was (the canvas surface is the active UI).
    tr.setMeta('addToHistory', true);
    justWrote.set(block, next);
    view.dispatch(tr);
    return true;
  } catch (err) {
    // Constructing/dispatching the replacement transaction can fail if the
    // doc shifted under us between findBlockPosition and dispatch. Drop
    // this write rather than crashing the editor — the next mutation pass
    // will mount fresh against the current source.
    console.warn('[canvas] write-back transaction failed:', err);
    justWrote.delete(block);
    return false;
  }
}

function writeBack(block: HTMLElement, deps: CanvasRenderDeps, next: string): boolean {
  const view = deps.getEditorView?.();
  if (!view) {
    if (typeof console !== 'undefined') {
      console.warn('[canvas] no editor view available — canvas edits will not persist');
    }
    return false;
  }
  return writeBackThroughProseMirror(view, block, next);
}

function showError(preview: HTMLElement, message: string): void {
  preview.innerHTML = `<div class="canvas-error">${escapeHtml(message)}</div>`;
}

function openLightbox(
  block: HTMLElement,
  deps: CanvasRenderDeps,
  CanvasEditor: typeof import('@/components/canvas/CanvasEditor').CanvasEditor,
): void {
  // Only one lightbox per block at a time.
  openLightboxes.get(block)?.();

  // Tear down the inline mount FIRST so its unmount-flush (the
  // `flushNow()` in CanvasEditor's useEffect cleanup) runs and any
  // in-flight debounced edits land in the PM source. THEN read the
  // canonical source back from PM — capturing `parsed.doc` at inline
  // mount time would silently render the lightbox against a stale
  // snapshot, and the first lightbox edit would overwrite the user's
  // most recent inline edits.
  const inlinePreview = block.querySelector<HTMLElement>(':scope > .canvas-preview');
  unmountBlock(block, inlinePreview);
  if (inlinePreview) inlinePreview.replaceChildren();

  const freshSource = extractCodeFromBlock(block);
  const parsed = parseCanvas(freshSource);
  if (!parsed.ok) {
    // Source went invalid somehow — recover the inline canvas with an
    // error state instead of stranding the user behind a black overlay.
    void renderCanvasBlocksForRoot(block, deps);
    return;
  }
  const initialDoc = parsed.doc;
  const docExtras = parsed.doc.__extra;

  const overlay = document.createElement('div');
  overlay.className = 'canvas-lightbox';
  overlay.tabIndex = -1;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'canvas-lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';

  const inner = document.createElement('div');
  inner.className = 'canvas-lightbox-inner';
  // Mount target — CanvasEditor's `<ReactFlow>` needs a sized parent.
  const mount = document.createElement('div');
  mount.className = 'canvas-lightbox-stage';
  inner.appendChild(mount);

  overlay.append(closeBtn, inner);
  document.body.appendChild(overlay);
  overlay.focus();

  const lightboxRoot = createRoot(mount);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    lightboxRoot.unmount();
    overlay.remove();
    openLightboxes.delete(block);
    // The inline canvas was unmounted before the lightbox opened, so its
    // dataset.source is also gone — the next mutation pass (or the manual
    // call below) will mount a fresh inline canvas with whatever the user
    // ended up with.
    void renderCanvasBlocksForRoot(block, deps);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  openLightboxes.set(block, close);

  const onChange = (next: CanvasDoc) => {
    // Preserve any unknown top-level fields the lightbox doesn't model
    // (Obsidian-/future-spec extras at the doc level).
    const merged = docExtras ? { ...next, __extra: docExtras } : next;
    writeBack(block, deps, serializeCanvas(merged));
  };

  // Lightbox CanvasEditor gets no `onExpand` — already expanded. Wrap in
  // the same error boundary so a render crash here doesn't leave the user
  // stranded behind a fullscreen black overlay.
  lightboxRoot.render(
    createElement(
      CanvasBlockBoundary,
      { label: 'canvas lightbox' },
      createElement(CanvasEditor, {
        initialDoc,
        onChange,
        deps,
      }),
    ),
  );
}

async function mountBlock(block: HTMLElement, deps: CanvasRenderDeps, source: string): Promise<void> {
  const preview = ensurePreview(block);
  block.classList.add(SOURCE_COLLAPSED_CLASS);

  // Size guard: pathological paste → leave the fence visible as plain code
  // and show a hint. Don't even attempt to parse — adversarial input at
  // this scale isn't worth the risk to ProseMirror's NodeView diff.
  if (source.length > MAX_CANVAS_SOURCE_LENGTH) {
    unmountBlock(block, preview);
    block.classList.remove(SOURCE_COLLAPSED_CLASS);
    showError(
      preview,
      `Canvas source is too large to render inline (${source.length.toLocaleString()} chars; cap is ${MAX_CANVAS_SOURCE_LENGTH.toLocaleString()}). Trim the JSON to enable the preview.`,
    );
    return;
  }

  let parsed: ReturnType<typeof parseCanvas>;
  try {
    parsed = parseCanvas(source);
  } catch (err) {
    // parseCanvas shouldn't throw today, but guard anyway — keep the editor
    // alive even if a future parser refactor regresses.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[canvas] parseCanvas threw:', err);
    unmountBlock(block, preview);
    showError(preview, `Invalid canvas JSON: ${msg}`);
    return;
  }
  if (!parsed.ok) {
    unmountBlock(block, preview);
    showError(preview, `Invalid canvas JSON: ${parsed.error}`);
    return;
  }

  let CanvasEditor: Awaited<ReturnType<typeof loadCanvasEditor>>;
  try {
    CanvasEditor = await loadCanvasEditor();
  } catch (err) {
    // Dynamic import can fail (network blip in dev, broken chunk in prod).
    // Surface the failure instead of leaving the block silently blank.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[canvas] failed to load CanvasEditor:', err);
    showError(preview, `Could not load canvas editor: ${msg}`);
    return;
  }

  // Preview may have been replaced while the lazy import was in flight.
  const livePreview = block.querySelector<HTMLElement>(':scope > .canvas-preview');
  if (!livePreview) return;
  // Another mount may have raced ahead while awaiting the lazy import.
  if (mounted.has(block)) return;

  livePreview.dataset.source = source;
  const root = createRoot(livePreview);
  mounted.set(block, root);

  const docExtras = parsed.doc.__extra;

  const onChange = (next: CanvasDoc) => {
    // Preserve any unknown top-level fields seen at parse time so they
    // round-trip through every edit instead of being silently dropped.
    const merged = docExtras ? { ...next, __extra: docExtras } : next;
    let serialized: string;
    try {
      serialized = serializeCanvas(merged);
    } catch (err) {
      // serializeCanvas is defensive but if it ever throws on adversarial
      // node data, drop the write rather than poison the source.
      console.warn('[canvas] serializeCanvas threw:', err);
      return;
    }
    if (writeBack(block, deps, serialized)) {
      livePreview.dataset.source = serialized;
    }
  };

  const onExpand = () => openLightbox(block, deps, CanvasEditor);

  // Wrap CanvasEditor in an error boundary so a render crash inside React
  // Flow (bad coordinates, missing schema fields from a paste) shows an
  // inline notice instead of blanking the ProseMirror document.
  root.render(
    createElement(
      CanvasBlockBoundary,
      { label: 'canvas block' },
      createElement(CanvasEditor, {
        initialDoc: parsed.doc,
        onChange,
        deps: { ...deps, onExpand },
      }),
    ),
  );
}

// Refresh just one block — used after the lightbox closes so we don't have
// to rescan the entire editor surface.
async function renderCanvasBlocksForRoot(block: HTMLElement, deps: CanvasRenderDeps): Promise<void> {
  if (getBlockLanguage(block) !== 'canvas') return;
  const source = extractCodeFromBlock(block);
  await mountBlock(block, deps, source);
}

/**
 * Scan a Milkdown editor surface for `canvas` code blocks and mount /
 * update / tear down React Flow canvases for each. Idempotent: blocks
 * whose source matches `dataset.source` are skipped, and our own write-
 * backs are detected and short-circuited so we don't loop.
 *
 * When an external edit (hand-edited JSON in the source view) shifts the
 * source, the inline canvas is unmounted and re-mounted with the new
 * doc — React Flow's `useState` is seeded only at mount, so a full
 * remount is the simplest way to reflect external structural changes.
 */
export async function renderCanvasBlocks(root: HTMLElement, deps: CanvasRenderDeps): Promise<void> {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('.milkdown-code-block'))
    .filter(block => getBlockLanguage(block) === 'canvas');

  const activeBlocks = new Set(candidates);
  cleanupStalePreviews(root, activeBlocks);
  if (candidates.length === 0) return;

  await Promise.all(candidates.map(async block => {
    const source = extractCodeFromBlock(block);
    block.classList.add(SOURCE_COLLAPSED_CLASS);

    // Echo guard: if the source matches what we just wrote, skip re-render.
    const echoed = justWrote.get(block);
    if (echoed === source) {
      justWrote.delete(block);
      return;
    }

    const preview = block.querySelector<HTMLElement>(':scope > .canvas-preview');
    if (preview && preview.dataset.source === source && mounted.has(block)) {
      // No-op — preview is already up to date.
      return;
    }

    // Source has changed externally (or block is new). Tear down any
    // existing inline mount and create a fresh one with the new doc.
    if (mounted.has(block)) {
      unmountBlock(block, preview);
    }

    try {
      await mountBlock(block, deps, source);
    } catch (err) {
      // mountBlock catches its own known failure paths; this is a final
      // safety net so a single block can't reject the Promise.all and
      // skip the remaining blocks in the same pass.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[canvas] unexpected mount failure:', err);
      const livePreview = block.querySelector<HTMLElement>(':scope > .canvas-preview');
      if (livePreview) showError(livePreview, `Canvas block failed to render: ${msg}`);
    }
  }));
}
