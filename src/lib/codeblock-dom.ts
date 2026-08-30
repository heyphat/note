// Shared helpers for Milkdown `.milkdown-code-block` NodeViews. Both the
// Mermaid and Excalidraw renderers need to (a) pull the authoritative source
// off the live CodeMirror view, and (b) read the currently-selected language
// off Crepe's language picker. Extracted to keep those two renderers in lock
// step — a behavioural divergence between them (e.g. one of them starts
// handling a new variant) should be opt-in, not accidental.

import { EditorView as CodeMirrorView } from '@codemirror/view';

/**
 * Read the current source text of a Milkdown code block. Prefers the live
 * CodeMirror view (reflects in-flight edits), and falls back to scraping
 * `.cm-line` DOM for the rare case where the CM view isn't mounted yet
 * (e.g. during the very first render pass).
 */
export function extractCodeFromBlock(block: HTMLElement): string {
  const editor = block.querySelector<HTMLElement>('.cm-editor');
  if (editor) {
    const cmView = CodeMirrorView.findFromDOM(editor);
    if (cmView) return cmView.state.doc.toString();
  }
  const content = block.querySelector('.cm-content');
  if (!content) return '';
  const lines = content.querySelectorAll('.cm-line');
  if (lines.length === 0) return content.textContent ?? '';
  return Array.from(lines).map(line => line.textContent ?? '').join('\n');
}

/** Currently-selected language for a Milkdown code block (lowercased). */
export function getBlockLanguage(block: HTMLElement): string {
  // Crepe renders a language picker button whose text is the current language.
  const btn = block.querySelector('.language-button');
  return (btn?.textContent ?? '').trim().toLowerCase();
}
