// Client-side PDF text extraction. We pull this in only when an OpenAI
// user drops a PDF — Anthropic and Google accept PDF document blocks
// natively, so they never load this module. pdfjs-dist is heavy (~1MB
// minified), so the dynamic import keeps it out of the initial bundle.
//
// Worker source is loaded from jsDelivr at runtime instead of bundled.
// Using `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`
// causes webpack to copy the worker file into static/ and Terser then
// chokes on the worker's own `import.meta` references. Loading it from
// a pinned CDN sidesteps the bundle pipeline entirely. The version is
// read off the imported module so it always matches the installed dep.

let loaded: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfjs() {
  if (!loaded) {
    loaded = import('pdfjs-dist').then((mod) => {
      const version = (mod as { version?: string }).version || '5';
      mod.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return loaded;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs();
  // pdfjs mutates the buffer it's given; pass a copy so the caller's
  // bytes stay intact for any other provider path that reads them after.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const doc = await pdfjs.getDocument({ data: copy }).promise;
  const out: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) out.push(`--- page ${pageNum} ---\n${pageText}`);
  }
  return out.join('\n\n');
}
