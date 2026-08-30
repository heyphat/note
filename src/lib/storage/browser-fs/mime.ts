export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  log: 'text/plain',
  js: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  jsx: 'text/javascript',
  py: 'text/x-python',
  go: 'text/x-go',
  rs: 'text/x-rust',
  java: 'text/x-java',
  c: 'text/x-c',
  cpp: 'text/x-c',
  h: 'text/x-c',
  rb: 'text/x-ruby',
  sh: 'text/x-shellscript',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  xml: 'text/xml',
  html: 'text/html',
  css: 'text/css',
};

export const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function mimeFromFilename(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXT[ext] || null;
}

export function sanitizeAssetFilename(name: string): string {
  // Strip directory components and replace anything outside [A-Za-z0-9._-]
  // so the filename round-trips through OPFS / FAT / NTFS without surprises.
  const base = name.replace(/^.*[\\/]/, '');
  return base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_').slice(0, 120) || 'file';
}
