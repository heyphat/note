// Shared HTML-entity escaper. The 5-char variant (`& < > " '`) is what the
// Mermaid + Excalidraw error surfaces want — anything that lands in an
// `innerHTML =` or a template-literal HTML string should go through this.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    c === '&' ? '&amp;'
    : c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '"' ? '&quot;'
    : '&#39;'
  ));
}
