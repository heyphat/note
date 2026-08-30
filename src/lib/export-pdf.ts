/**
 * Lightweight markdown-to-HTML converter + browser print-to-PDF.
 * No external dependencies — uses regex for common markdown patterns
 * and the browser's native print dialog (which offers "Save as PDF").
 */

import { markdownToHtml } from './markdown-to-html';

const PRINT_CSS = `
  @page { margin: 2cm; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.7;
    color: #1a1a1a;
    max-width: 720px;
    margin: 0 auto;
    padding: 20px;
  }
  h1 { font-size: 1.8em; margin: 1em 0 0.4em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.3em; }
  h2 { font-size: 1.4em; margin: 1em 0 0.4em; }
  h3 { font-size: 1.2em; margin: 1em 0 0.4em; }
  h4, h5, h6 { font-size: 1em; margin: 1em 0 0.4em; }
  p { margin: 0.5em 0; }
  img { max-width: 100%; height: auto; }
  pre { background: #f5f5f5; padding: 12px 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
  code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #d0d0d0; margin: 0.8em 0; padding: 0.4em 1em; color: #555; }
  ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
  li { margin: 0.2em 0; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }
  a { color: #0066cc; }
  sup a { text-decoration: none; }
  del { text-decoration: line-through; color: #888; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
  th, td { border: 1px solid #d0d0d0; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  .footnotes { margin-top: 1.5em; font-size: 0.9em; color: #555; }
  .footnotes ol { padding-left: 1.5em; }
  .footnotes li { margin: 0.35em 0; }
  .title { margin-bottom: 0.2em; }
  .meta { font-size: 12px; color: #888; margin-bottom: 1.5em; }
  @media print {
    body { padding: 0; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
  }
`;

export function exportNoteToPdf(title: string, markdown: string, date?: string, resolveUrl?: (url: string) => string) {
  const bodyHtml = resolveUrl
    ? markdownToHtml(markdown).replace(/(<img\s[^>]*src=")([^"]+)(")/g, (_m, pre, url, post) => `${pre}${resolveUrl(url)}${post}`)
    : markdownToHtml(markdown);
  const dateStr = date ? new Date(date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  }) : '';

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title}</title>
<style>${PRINT_CSS}</style>
</head><body>
<h1 class="title">${title}</h1>
${dateStr ? `<div class="meta">${dateStr}</div>` : ''}
${bodyHtml}
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    window.alert('Could not open print window. Please allow pop-ups for this site.');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Wait for images to load before triggering print
  win.onload = () => {
    win.focus();
    win.print();
  };
}
