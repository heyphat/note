#!/usr/bin/env node
// Walks docs/<locale>/ and emits:
//   - public/docs-bundle/<locale>.json — `{ notes, skills, templates }` payload
//     the BundledDocsStore fetches at runtime when a first-launch user lands
//     without a saved FileSystemDirectoryHandle.
//     - `notes`: flat `{ relativePath: rawMarkdown }` map (every non-.assets
//       `.md` file in the vault).
//     - `skills`: scanned out of `.assets/skills/` and pre-parsed (frontmatter
//       extracted, aux files inlined) so the in-memory docs store can serve
//       listSkills / getSkill / readSkillFile without a second HTTP fetch.
//     - `templates`: scanned out of `.assets/templates/` — each is a single
//       `.md` file with `id`/`title` frontmatter. The body is preserved
//       verbatim (template-variable interpolation happens at usage time, not
//       build time).
//   - public/docs-bundle/<locale>/.assets/** — verbatim copy of the vault's
//     `.assets/` tree, so image references in the markdown resolve to
//     `/docs-bundle/<locale>/.assets/<file>` at runtime.
//
// Why public/<json> instead of a TS module:
//   - The docs are static at build time; embedding them in the JS bundle
//     means every server render, every Edge function, and every initial
//     client chunk pays the cost of parsing ~400KB of escaped string
//     literals. JSON files served from /public are downloaded by the
//     browser only when the docs vault is actually mounted, are
//     gzip/brotli-friendly, and are HTTP-cacheable.
//   - The data never reaches the server — first-launch detection runs in
//     useEffect, the fetch hits the static asset directly.
//
// Why assets are copied verbatim instead of inlined as base64:
//   - Keeps the JSON small (one HTTP request decides whether docs load at
//     all), and lets the browser cache each image independently.
//   - Skills are the exception: they're parsed and inlined because the
//     storage API hands callers fully-resolved `SkillFull` objects (body +
//     aux text), not paths. Round-tripping through HTTP for every aux file
//     read would be a perf cliff for AI tool calls.
//
// Re-run automatically by `predev` and `prebuild`. Safe to run by hand:
//   node scripts/build-docs-bundle.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED_LOCALES = ['en', 'vi'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(projectRoot, 'docs');
const outDir = path.join(projectRoot, 'public/docs-bundle');

// Minimal frontmatter parser — we don't want to pull a YAML lib into the
// build script for what is in practice flat `key: value` pairs. Matches the
// shape produced by `src/lib/frontmatter.ts` (the bundled-docs store uses
// the real parser at runtime; this is for build-time skill extraction only).
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // Strip wrapping quotes if present — handles `name: "weekly-recap"`.
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[m[1]] = value;
  }
  return { meta, content: match[2] };
}

// Build the `skills` array by scanning `.assets/skills/` inside the locale
// root. Mirrors `SkillStore.enumerateSkillRecords` in src/lib/storage/browser-fs/skills.ts —
// keep the shape compatible.
async function collectSkills(localeRoot) {
  const skillsRoot = path.join(localeRoot, '.assets', 'skills');
  try { await fs.access(skillsRoot); }
  catch { return []; }

  const out = [];
  // `inSkillFolder` is the same gate the runtime walker uses: inside a folder
  // skill, loose `.md` files and aux subdirectories never count as their own
  // skills — they're references for the parent SKILL.md.
  async function walk(dir, relPath, inSkillFolder) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;

      if (entry.isFile()) {
        if (inSkillFolder) continue;
        if (!entry.name.endsWith('.md') || entry.name === 'SKILL.md') continue;
        const raw = await fs.readFile(abs, 'utf8');
        const { meta, content } = parseFrontmatter(raw);
        const name = (meta.name || '').trim();
        if (!name) continue;
        out.push({
          id: childRel.replace(/\.md$/, ''),
          name,
          description: (meta.description || '').trim(),
          uuid: (meta.id || '').trim() || undefined,
          isFolder: false,
          path: childRel,
          content,
          frontmatter: meta,
        });
        continue;
      }

      if (entry.isDirectory()) {
        const skillMdPath = path.join(abs, 'SKILL.md');
        let hasSkill = false;
        try { await fs.access(skillMdPath); hasSkill = true; } catch { /* category */ }

        if (hasSkill) {
          const raw = await fs.readFile(skillMdPath, 'utf8');
          const { meta, content } = parseFrontmatter(raw);
          const name = (meta.name || '').trim() || entry.name;
          const files = await collectSkillAuxFiles(abs, skillMdPath);
          out.push({
            id: childRel,
            name,
            description: (meta.description || '').trim(),
            uuid: (meta.id || '').trim() || undefined,
            isFolder: true,
            path: `${childRel}/SKILL.md`,
            content,
            frontmatter: meta,
            files,
          });
          // Descend INSIDE the skill folder with inSkillFolder=true so any
          // further SKILL.md is picked up as a nested skill.
          await walk(abs, childRel, true);
          continue;
        }

        if (inSkillFolder) continue;
        await walk(abs, childRel, false);
      }
    }
  }

  await walk(skillsRoot, '', false);
  // Sort by id (path-shaped) so categories cluster — matches SkillStore.list().
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

// Build the `templates` array by scanning `.assets/templates/`. Each template
// is a single `.md` file with frontmatter `id` (the external template id) and
// `title` (the display name). Mirrors TemplateStore.list() in
// src/lib/storage/browser-fs/templates.ts.
async function collectTemplates(localeRoot) {
  const templatesRoot = path.join(localeRoot, '.assets', 'templates');
  try { await fs.access(templatesRoot); }
  catch { return []; }

  const out = [];
  const entries = await fs.readdir(templatesRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(templatesRoot, entry.name);
    const raw = await fs.readFile(abs, 'utf8');
    const { meta, content } = parseFrontmatter(raw);
    const id = (meta.id || '').trim();
    const name = (meta.title || '').trim() || entry.name.replace(/\.md$/, '');
    // Skip templates with no frontmatter id — they have nowhere to anchor
    // against in the bundled vault and would be unreachable by URL.
    if (!id) continue;
    out.push({ id, name, content });
  }
  // Sort by name like TemplateStore.list() does.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Inline every aux file in a folder skill (everything beside SKILL.md, and
// inside non-skill subdirectories) into `{ size, raw }` records keyed by
// path relative to the skill folder. Mirrors SkillStore.listSkillFolderFiles
// in the runtime — same depth/count caps + same "skip nested skills" rule.
const SKILL_MAX_FILES = 64;
const SKILL_MAX_DEPTH = 4;

async function collectSkillAuxFiles(folderAbs, skillMdAbs) {
  const out = {};
  let count = 0;
  async function visit(dir, prefix, depth) {
    if (depth > SKILL_MAX_DEPTH) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (count >= SKILL_MAX_FILES) return;
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isFile()) {
        // Don't inline SKILL.md as its own aux file; it's the primary body.
        if (abs === skillMdAbs) continue;
        const stat = await fs.stat(abs);
        // Read as text. Bundled skills are author-controlled — they're
        // expected to be markdown / code / schemas. Binary aux files in a
        // bundled skill are not supported (readSkillFile returns text only).
        const raw = await fs.readFile(abs, 'utf8');
        out[rel] = { size: stat.size, raw };
        count++;
      } else if (entry.isDirectory()) {
        // Skip nested skill folders — they have their own identity. Matches
        // listSkillFolderFiles' nested-SKILL.md exclusion.
        try {
          await fs.access(path.join(abs, 'SKILL.md'));
          continue;
        } catch { /* not a nested skill */ }
        await visit(abs, rel, depth + 1);
      }
    }
  }
  await visit(folderAbs, '', 0);
  return out;
}

async function buildLocale(locale) {
  const root = path.join(docsRoot, locale);
  try {
    await fs.access(root);
  } catch {
    return null;
  }
  // Wipe the per-locale asset directory so files deleted from .assets/ in
  // source don't linger in public/. The sibling <locale>.json is left alone
  // and overwritten below.
  const assetsOutDir = path.join(outDir, locale);
  await fs.rm(assetsOutDir, { recursive: true, force: true });

  const notes = {};
  let assetCount = 0;

  async function visit(dir, base) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Allowlist dotdirs: `.assets/` is the vault convention for embedded
      // images; everything else (`.history/`, `.git/`, editor metadata) is
      // skipped so it doesn't leak into the served bundle.
      if (entry.name.startsWith('.') && entry.name !== '.assets') continue;
      const abs = path.join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(abs, rel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (rel.startsWith('.assets/')) {
        // Anything under .assets/ — images, fonts, whatever — is copied
        // verbatim. We don't filter by extension; the markdown decides what
        // it actually references.
        const dest = path.join(assetsOutDir, rel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(abs, dest);
        assetCount++;
      } else if (entry.name.endsWith('.md')) {
        notes[rel] = await fs.readFile(abs, 'utf8');
      }
    }
  }

  await visit(root, '');
  const sortedNotes = {};
  for (const key of Object.keys(notes).sort()) sortedNotes[key] = notes[key];
  const skills = await collectSkills(root);
  const templates = await collectTemplates(root);
  return {
    manifest: { notes: sortedNotes, skills, templates },
    assetCount,
    skillCount: skills.length,
    templateCount: templates.length,
  };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  let totalFiles = 0;
  let totalAssets = 0;
  let totalSkills = 0;
  let totalTemplates = 0;
  const wrote = [];
  for (const locale of SUPPORTED_LOCALES) {
    const result = await buildLocale(locale);
    if (!result) continue;
    const outPath = path.join(outDir, `${locale}.json`);
    await fs.writeFile(outPath, JSON.stringify(result.manifest), 'utf8');
    totalFiles += Object.keys(result.manifest.notes).length;
    totalAssets += result.assetCount;
    totalSkills += result.skillCount;
    totalTemplates += result.templateCount;
    wrote.push(path.relative(projectRoot, outPath));
  }

  console.log(`[docs-bundle] wrote ${wrote.join(', ')} (${totalFiles} notes, ${totalSkills} skills, ${totalTemplates} templates, ${totalAssets} assets)`);
}

main().catch(err => {
  console.error('[docs-bundle] failed:', err);
  process.exit(1);
});
