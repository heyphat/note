// Render mermaid fenced code blocks as live previews inside the editor.
//
// Approach: post-process the Milkdown DOM after each mutation. Find
// `.milkdown-code-block` NodeViews whose language is "mermaid", extract the
// source from the CodeMirror lines, lazy-load the `mermaid` package, and
// inject a preview <div> inside the NodeView's outer dom.
//
// Idempotent: the last-rendered source is stored on the preview element's
// dataset so repeated calls with unchanged source are a no-op. This keeps us
// safe in the tight mutation-observer loop used by MilkdownEditor.

import { extractCodeFromBlock, getBlockLanguage } from './codeblock-dom';
import { escapeHtml } from './html-escape';

type MermaidLib = {
  initialize: (config: Record<string, unknown>) => void;
  parse: (code: string) => Promise<unknown>;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidLib> | null = null;
let rendererId = 0;

/** Lazy-load mermaid on first need; cache the module. */
function loadMermaid(theme: 'dark' | 'light'): Promise<MermaidLib> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(mod => {
      const lib = (mod.default ?? mod) as MermaidLib;
      lib.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      return lib;
    });
  }
  return mermaidPromise;
}

function normalizeMermaidCode(code: string): string {
  return code
    .replace(/\r\n?/g, '\n')
    // Copy/paste from docs/apps often brings in BOM, zero-width chars, or NBSP.
    // Mermaid treats these as real tokens, which can turn valid-looking text
    // into opaque parser failures.
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ');
}

function formatMermaidError(err: unknown): string {
  if (!err) return 'Unknown Mermaid error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const maybe = err as {
      message?: string;
      str?: string;
      hash?: {
        line?: number;
        loc?: { first_line?: number; first_column?: number };
      };
    };
    const base = maybe.message || maybe.str;
    const line = maybe.hash?.loc?.first_line ?? maybe.hash?.line;
    const col = maybe.hash?.loc?.first_column;
    if (base && line != null && col != null) return `${base}\n\nLine ${line}, column ${col + 1}`;
    if (base && line != null) return `${base}\n\nLine ${line}`;
    if (base) return base;
  }
  return String(err);
}

/**
 * Walk the editor root, find mermaid code blocks, and render/refresh an SVG
 * preview inside each. Safe to call on every mutation: renders are cached
 * by source, so unchanged blocks are a no-op.
 */
export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.milkdown-code-block'))
    .filter(b => getBlockLanguage(b) === 'mermaid');

  if (blocks.length === 0) return;

  // Detect theme from :root[data-theme] so the diagram picks the right palette.
  const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const mermaid = await loadMermaid(theme);

  for (const block of blocks) {
    const code = normalizeMermaidCode(extractCodeFromBlock(block));
    let preview = block.querySelector<HTMLElement>(':scope > .mermaid-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'mermaid-preview';
      preview.setAttribute('contenteditable', 'false');
      block.appendChild(preview);
    }
    if (preview.dataset.source === code) continue;
    preview.dataset.source = code;

    if (!code.trim()) {
      preview.innerHTML = '<div class="mermaid-empty">Empty diagram</div>';
      continue;
    }

    const id = `mermaid-${++rendererId}`;
    try {
      await mermaid.parse(code);
      const { svg } = await mermaid.render(id, code);
      // Guard against the source changing while we awaited the render.
      if (preview.dataset.source !== code) continue;
      preview.innerHTML = svg;
    } catch (err) {
      preview.innerHTML = `<div class="mermaid-error">${escapeHtml(formatMermaidError(err))}</div>`;
    }
  }
}
