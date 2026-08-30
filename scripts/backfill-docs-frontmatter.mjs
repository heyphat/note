#!/usr/bin/env node
// One-shot: prepend YAML frontmatter (id/title/createdAt/updatedAt) to any
// docs/{en,vi}/**/*.md file that doesn't already have it, so the bundled
// docs vault renders every note with a stable UUID and a clean display
// title (instead of falling back to the filename slug).
//
// Title derivation:
//   - If the first non-blank body line is `# Heading`, that becomes the
//     title and the line is consumed (we don't want the H1 duplicated under
//     the title field after the editor renders it).
//   - Otherwise the filename stem is used as a fallback.
//
// Idempotent: files already starting with `---` are skipped.
//
// Usage:
//   node scripts/backfill-docs-frontmatter.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const STAMP = new Date().toISOString();

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip .history/ and friends
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(abs));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(abs);
    }
  }
  return out;
}

function deriveTitle(body, filename) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      // Drop the H1 line (and a single trailing blank if present) so the
      // title isn't duplicated when the editor renders frontmatter.
      const after = lines.slice(i + 1);
      if (after[0]?.trim() === '') after.shift();
      return { title: m[1], body: after.join('\n') };
    }
    break; // first non-blank line wasn't H1 — leave body alone
  }
  const stem = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
  return { title: stem, body };
}

function escapeYamlValue(s) {
  // The note app's flat YAML parser wants double-quotes only when the value
  // contains characters that would confuse it (colons, quotes, leading
  // hash, control chars). For plain titles, leave them bare.
  if (/[\r\n]/.test(s) || /^['"]/.test(s) || /^\s|\s$/.test(s) || /:\s/.test(s) || /(^|\s)#/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

async function process(filepath) {
  const raw = await fs.readFile(filepath, 'utf8');
  if (raw.trimStart().startsWith('---')) return false;
  const filename = path.basename(filepath);
  const { title, body } = deriveTitle(raw, filename);
  const fm = `---\nid: ${randomUUID()}\ntitle: ${escapeYamlValue(title)}\ncreatedAt: ${STAMP}\nupdatedAt: ${STAMP}\n---\n# ${title}\n\n${body.replace(/^\n+/, '')}`;
  await fs.writeFile(filepath, fm, 'utf8');
  return true;
}

async function main() {
  const roots = ['docs/en', 'docs/vi'].map(p => path.join(projectRoot, p));
  let added = 0;
  let skipped = 0;
  for (const root of roots) {
    try {
      await fs.access(root);
    } catch {
      continue;
    }
    const files = await walk(root);
    for (const f of files) {
      const wrote = await process(f);
      if (wrote) {
        added++;
        console.log(`  + ${path.relative(projectRoot, f)}`);
      } else {
        skipped++;
      }
    }
  }
  console.log(`\n[backfill] added frontmatter to ${added} file(s); ${skipped} already had it.`);
}

main().catch(err => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
