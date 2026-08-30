import { markdownToHtml } from '@/lib/markdown-to-html';

// Render a note/text-node markdown body to HTML, then rewrite every image
// `src` through the supplied resolver. Without this step, relative asset
// paths (e.g. `.assets/foo.png`, `./{noteKey}.assets/bar.jpg`) end up as
// literal `<img src=".assets/foo.png">` and the browser can't fetch them —
// the editor's inline markdown image pipeline goes through `proxyDomURL`,
// and the canvas preview needs the same translation.
//
// The `<template>` element holds inert DOM — images inside it do not start
// loading until the rewritten markup is moved into the live document, so
// we don't pay a doomed network request for the un-proxied URLs.
export function renderCanvasMarkdown(
  source: string,
  proxyAssetUrl?: (s: string) => string,
): string {
  const html = markdownToHtml(source);
  if (!proxyAssetUrl) return html;
  if (typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src) img.setAttribute('src', proxyAssetUrl(src));
  });
  return tpl.innerHTML;
}
