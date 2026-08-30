// Skill importers. Every flow converges on the same canonical multi-skill
// result so the dialog has one happy path:
//
//   { ok: true, skills: [{ skill, targetDir }, ...] }
//
// `targetDir` is the parent directory the imported skill should land in,
// relative to `.assets/skills/`. It's empty for single-skill imports (paste,
// URL, single file) and populated when a bulk GitHub import mirrors a source
// repo's nested layout (e.g. `coding/python`).

import { parseSkillMarkdown, type ParsedSkill } from './parse';
import type { SkillCreateSpec } from '@/lib/storage';

export interface ImportedSkill extends ParsedSkill {
  /** Auxiliary files for folder skills. Empty for single-file imports. */
  files: { path: string; bytes: Uint8Array }[];
}

/** A single imported skill plus enough metadata for the dialog to place it
 *  correctly on disk. `targetDir` is the literal parent directory under
 *  `.assets/skills/` for top-level entries; for skills nested under ANOTHER
 *  skill in the same import batch, `parentRef` carries the actual placement
 *  intent and `targetDir` is ignored. Storing the link as a `parentToken`
 *  instead of a pre-computed path lets the dialog use the real returned
 *  `meta.id` of the parent (which may include a collision suffix like
 *  `my-skill 1`) — pre-computing the path off `sanitizeNoteTitle(name)`
 *  would silently misplace children when collisions happen. */
export interface ImportedSkillWithTarget {
  skill: ImportedSkill;
  /** Stable token unique within the import batch. Other entries reference
   *  this skill via `parentRef.parentToken` when they nest underneath. */
  token: string;
  /** Literal parent directory under `.assets/skills/` (empty = root).
   *  Used only when `parentRef` is unset. */
  targetDir: string;
  /** When set, this skill is nested under another entry in the same batch.
   *  The dialog resolves the actual on-disk target as `<parent.id>/<relPath>`
   *  AFTER the parent is created — so collision-suffixed parent folders
   *  still receive their children correctly. */
  parentRef?: {
    parentToken: string;
    /** Path within the parent (between parent's dir root and this skill's
     *  PARENT directory). Empty when this skill sits directly inside the
     *  parent. E.g. for `pdf/deep/inner/SKILL.md` imported alongside
     *  `pdf/SKILL.md`, `inner`'s relPath is `deep`. */
    relPath: string;
  };
  /** Marker propagated to `SkillCreateSpec.forceFolder` so a parent skill
   *  that contains only nested children (no aux files) is still created as
   *  a folder bundle on disk — otherwise children would land under a stray
   *  category folder while the parent ended up as a sibling single-file. */
  forceFolder?: boolean;
}

/** Generate a stable per-entry token. Used only inside the import batch —
 *  never persisted to disk or surfaced to the model. */
let __nextImportToken = 1;
function makeImportToken(): string {
  return `imp-${(__nextImportToken++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface ImportError {
  ok: false;
  reason: string;
}

export interface ImportMultiResult {
  ok: true;
  skills: ImportedSkillWithTarget[];
}

export type ImportResult = ImportMultiResult | ImportError;

/** Convert an imported skill + target into the storage create spec. The
 *  consumer loops over `result.skills` and passes each entry through here.
 *  The full frontmatter map (custom keys like `version`, `author`, etc.)
 *  rides along so the storage layer can preserve it in the on-disk YAML.
 *
 *  Callers that handle batches with nested skills should resolve
 *  `entry.parentRef` to a concrete `targetDir` BEFORE calling this — see
 *  `SkillImportDialog`. The `token` / `parentRef` fields are local to the
 *  dialog and never reach storage. */
export function toCreateSpec(entry: ImportedSkillWithTarget): SkillCreateSpec {
  return {
    name: entry.skill.name,
    description: entry.skill.description,
    content: entry.skill.content,
    files: entry.skill.files,
    targetDir: entry.targetDir || undefined,
    frontmatter: entry.skill.frontmatter,
    forceFolder: entry.forceFolder,
  };
}

function singleSkill(skill: ImportedSkill): ImportResult {
  return { ok: true, skills: [{ skill, token: makeImportToken(), targetDir: '' }] };
}

// --- Paste markdown -------------------------------------------------------

export function importFromMarkdown(raw: string): ImportResult {
  const parsed = parseSkillMarkdown(raw);
  if (!parsed.ok) return parsed;
  return singleSkill({ ...parsed.skill, files: [] });
}

// --- Fetch URL ------------------------------------------------------------

export interface ImportSignal {
  /** Optional abort signal. When the consumer (dialog) aborts mid-import,
   *  in-flight fetches stop and the importer returns a cancelled error. */
  signal?: AbortSignal;
}

export async function importFromUrl(url: string, opts: ImportSignal = {}): Promise<ImportResult> {
  let u: URL;
  try { u = new URL(url); }
  catch { return { ok: false, reason: 'That doesn\'t look like a valid URL.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'Only http(s) URLs are supported.' };
  }
  let res: Response;
  try {
    res = await fetch(u.toString(), { redirect: 'follow', signal: opts.signal });
  } catch (err) {
    if (isAbortError(err)) return CANCELLED;
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, reason: `Fetch failed: ${msg}. Many hosts block cross-origin requests — try the "raw" URL (e.g. raw.githubusercontent.com).` };
  }
  if (!res.ok) {
    return { ok: false, reason: `Fetch failed with HTTP ${res.status}.` };
  }
  const text = await res.text();
  return importFromMarkdown(text);
}

const CANCELLED: ImportError = { ok: false, reason: '__cancelled__' };

/** Test whether a thrown value represents an aborted fetch. */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/** Type-guard helper for consumers (the dialog) — lets them suppress the
 *  cancelled-import reason instead of showing it as an error. */
export function isCancelledImport(result: ImportResult): boolean {
  return !result.ok && result.reason === '__cancelled__';
}

// --- Local file picker ----------------------------------------------------
// Handles three cases the user can produce with a single `<input type=file>`:
//   1. One .md file → single-file skill.
//   2. A folder containing exactly one SKILL.md → folder skill with the
//      rest as aux files.
//   3. A folder containing MULTIPLE SKILL.md files at different depths →
//      multi-skill import. The top-most SKILL.md becomes the parent skill;
//      each deeper SKILL.md becomes a nested child, referenced via
//      `parentRef` so the dialog can resolve their actual targetDir off the
//      parent's returned `meta.id`.
//
// Paths come from `webkitRelativePath` (set when the input has
// `webkitdirectory`) or the bare file name.

export async function importFromFiles(files: FileList | File[]): Promise<ImportResult> {
  const list = Array.from(files);
  if (list.length === 0) return { ok: false, reason: 'No files selected.' };

  // Single .md picked → treat as paste-equivalent.
  if (list.length === 1 && list[0].name.toLowerCase().endsWith('.md')) {
    const text = await list[0].text();
    return importFromMarkdown(text);
  }

  // Multi-file. Find every SKILL.md (case-insensitive) and figure out the
  // path of its containing folder relative to the common upload prefix.
  const skillFiles = list.filter(f => baseName(getRelPath(f)).toLowerCase() === 'skill.md');
  if (skillFiles.length === 0) {
    return { ok: false, reason: 'A folder import must include at least one SKILL.md file.' };
  }

  // The browser file picker includes one top-level folder segment in each
  // path (e.g. `weekly-recap/SKILL.md`). Strip the longest shared folder
  // prefix so all paths are relative to the skill root, not to the user's
  // filesystem.
  const commonPrefix = computeCommonFolderPrefix(list.map(getRelPath));
  const skillRootOf = (f: File): string => {
    const rel = stripPrefix(getRelPath(f), commonPrefix);
    return rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  };

  // Sort skill files by directory depth (shortest first) so parents are
  // processed before children — required for `parentRef` to point at an
  // already-registered token.
  const sortedSkills = [...skillFiles].sort((a, b) =>
    skillRootOf(a).split('/').filter(Boolean).length
    - skillRootOf(b).split('/').filter(Boolean).length,
  );

  // Reject literal duplicates at the same path (the file picker can repeat
  // entries when the user re-selects a folder).
  const seenRoots = new Set<string>();
  const entries: ImportedSkillWithTarget[] = [];
  const tokenByRoot = new Map<string, string>();

  for (const skillFile of sortedSkills) {
    const root = skillRootOf(skillFile);
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);

    const text = await skillFile.text();
    const parsed = parseSkillMarkdown(text);
    if (!parsed.ok) return parsed;

    // Pick the longest already-registered skill root that's an ancestor of
    // this one. That's the nearest parent in the same import batch.
    let bestParentRoot: string | null = null;
    for (const otherRoot of Array.from(tokenByRoot.keys())) {
      if (otherRoot === root) continue;
      const isAncestor = otherRoot === '' || root.startsWith(`${otherRoot}/`);
      if (isAncestor && (bestParentRoot === null || otherRoot.length > bestParentRoot.length)) {
        bestParentRoot = otherRoot;
      }
    }

    // relPath within the parent: the portion of this skill's root path
    // BETWEEN the parent's root and this skill's own folder. For
    // `weekly-recap/form/SKILL.md` nested under `weekly-recap/SKILL.md`,
    // relPath is '' (form is directly inside weekly-recap). For a deeper
    // case like `weekly-recap/deep/inner/SKILL.md`, relPath is 'deep'.
    let parentRef: ImportedSkillWithTarget['parentRef'] | undefined;
    if (bestParentRoot !== null) {
      const stripped = bestParentRoot === ''
        ? root
        : root.slice(bestParentRoot.length + 1);
      const relPath = stripped.includes('/')
        ? stripped.slice(0, stripped.lastIndexOf('/'))
        : '';
      parentRef = { parentToken: tokenByRoot.get(bestParentRoot)!, relPath };
    }

    const token = makeImportToken();
    entries.push({
      skill: { ...parsed.skill, files: [] }, // aux files attached below
      token,
      targetDir: '',
      parentRef,
      forceFolder: false, // recomputed once we know which entries have children
    });
    tokenByRoot.set(root, token);
  }

  // Attach each non-SKILL.md file to the DEEPEST owning skill — i.e. the
  // skill root that's an ancestor of the file's path AND has no other,
  // longer skill root between them.
  const sortedRoots = Array.from(tokenByRoot.keys()).sort((a, b) => b.length - a.length);
  for (const f of list) {
    if (skillFiles.includes(f)) continue;
    const filePath = stripPrefix(getRelPath(f), commonPrefix);
    if (!filePath) continue;
    if (filePath.split('/').some(seg => seg === '..' || seg.startsWith('.'))) continue;

    let owningRoot: string | null = null;
    for (const root of sortedRoots) {
      const belongs = root === '' || filePath.startsWith(`${root}/`) || filePath === root;
      if (belongs) { owningRoot = root; break; } // sortedRoots is deepest-first
    }
    if (owningRoot === null) continue;

    const pathInsideSkill = owningRoot === '' ? filePath : filePath.slice(owningRoot.length + 1);
    if (!pathInsideSkill || pathInsideSkill === 'SKILL.md') continue;

    const owningEntry = entries.find(e => e.token === tokenByRoot.get(owningRoot));
    if (!owningEntry) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    owningEntry.skill.files.push({ path: pathInsideSkill, bytes });
  }

  // Any entry that has at least one child must be a folder skill on disk —
  // otherwise the child's `<parent>/<child-name>/SKILL.md` write would fail
  // (parent is a flat file, not a directory).
  for (const entry of entries) {
    if (!entry.parentRef) continue;
    const parent = entries.find(e => e.token === entry.parentRef!.parentToken);
    if (parent) parent.forceFolder = true;
  }

  return { ok: true, skills: entries };
}

/** Longest folder prefix shared by every input path (always ends in `/`,
 *  or is empty when no common prefix exists). Used to strip the leading
 *  segment the browser inserts when uploading a folder. */
function computeCommonFolderPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  const first = paths[0];
  let candidate = first.includes('/') ? `${first.slice(0, first.lastIndexOf('/'))}/` : '';
  while (candidate) {
    if (paths.every(p => p.startsWith(candidate))) return candidate;
    // Strip the deepest segment off and try again.
    const trimmed = candidate.slice(0, -1); // drop trailing '/'
    candidate = trimmed.includes('/') ? `${trimmed.slice(0, trimmed.lastIndexOf('/'))}/` : '';
  }
  return '';
}

function getRelPath(file: File): string {
  // `webkitRelativePath` is populated when the input has `webkitdirectory`.
  // Fall back to the plain name when the user picked individual files.
  const wkRel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return wkRel && wkRel.length > 0 ? wkRel : file.name;
}

function baseName(p: string): string {
  return p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p;
}

function stripPrefix(p: string, prefix: string): string {
  return prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

// --- GitHub repo ----------------------------------------------------------
// Accepts a URL of the form:
//   https://github.com/<owner>/<repo>
//   https://github.com/<owner>/<repo>/tree/<branch>
//   https://github.com/<owner>/<repo>/tree/<branch>/<path>
//
// Behaviour:
//   - If the URL points at a folder containing SKILL.md → single skill.
//   - If the URL points at a folder that does NOT contain SKILL.md → recurse,
//     treating every subfolder with a SKILL.md as a skill to import. The
//     relative parent path becomes each skill's `targetDir` so the resulting
//     vault tree mirrors the source repo (e.g.
//     `anthropics/skills/tree/main/skills` imports every SKILL.md under it at
//     the top level — categories appear if the user picks a higher-up URL).
//   - Calls the unauthenticated GitHub Contents API. Rate-limited at 60
//     req/hour; the dialog surfaces that error clearly.

export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  /** Heuristic ref — the first path segment after `/tree/`, or `HEAD`.
   *  GitHub URLs are ambiguous when a branch name contains `/` (e.g.
   *  `feature/foo`): the heuristic guesses the SHORTEST ref. The actual
   *  branch may be longer; resolution walks `refPathSegments` to find the
   *  right split when the heuristic 404s. */
  ref: string;
  /** Heuristic path — segments after the heuristic ref. */
  path: string;
  /** Raw path segments after `/tree/`, used by the slash-ref resolver to
   *  walk alternative {ref, path} splits. Empty for non-/tree/ URLs. */
  refPathSegments: readonly string[];
}

export function parseGithubUrl(input: string): ParsedGithubUrl | null {
  let u: URL;
  try { u = new URL(input.trim()); }
  catch { return null; }
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
  const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  if (!owner || !repo) return null;
  // /tree/<ref>/<path...> shape — anything else means "repo root @ default branch".
  if (parts.length >= 4 && parts[2] === 'tree') {
    const refPathSegments = parts.slice(3);
    const ref = refPathSegments[0];
    const path = refPathSegments.slice(1).join('/');
    return { owner, repo, ref, path, refPathSegments };
  }
  return { owner, repo, ref: 'HEAD', path: '', refPathSegments: [] };
}

interface GhContent {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  name: string;
  path: string;
  download_url: string | null;
}

// Caps for the bulk walk. The first protects against accidentally importing
// a whole repo full of unrelated docs; the second against pathological
// nesting. Anthropic's skills repo has ~20 skills two levels deep, so these
// are comfortably above the typical bulk import.
const GH_MAX_SKILLS = 64;
const GH_MAX_DEPTH = 6;
const GH_MAX_AUX_PER_SKILL = 48;

/** Sentinel returned by the raw contents fetch when GitHub answers 404. We
 *  need a distinguishable value (not a generic `ImportError`) so the slash-
 *  ref resolver can tell "this branch/path doesn't exist, try a longer ref"
 *  apart from rate limits / network errors / etc. */
const NOT_FOUND = Symbol('github-not-found');
type NotFound = typeof NOT_FOUND;

export async function importFromGithub(url: string, opts: ImportSignal = {}): Promise<ImportResult> {
  const parsed = parseGithubUrl(url);
  if (!parsed) {
    return { ok: false, reason: 'Not a recognized GitHub URL. Expected github.com/<owner>/<repo>[/tree/<branch>/<path>].' };
  }
  const { signal } = opts;

  // Raw contents fetcher — distinguishes 404 (returns NOT_FOUND) from other
  // errors so the slash-ref resolver below can try longer refs without
  // confusing a network failure for "branch doesn't exist".
  const fetchContentsRaw = async (ref: string, subPath: string): Promise<GhContent[] | NotFound | ImportError> => {
    if (signal?.aborted) return CANCELLED;
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/contents/${encodePath(subPath)}${ref && ref !== 'HEAD' ? `?ref=${encodeURIComponent(ref)}` : ''}`;
    let res: Response;
    try { res = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' }, signal }); }
    catch (err) {
      if (isAbortError(err)) return CANCELLED;
      const msg = err instanceof Error ? err.message : 'Network error';
      return { ok: false, reason: `GitHub API request failed: ${msg}` };
    }
    if (res.status === 403) {
      return { ok: false, reason: 'GitHub API rate limit reached (60 requests / hour for unauthenticated traffic). Try again later, or paste the SKILL.md content instead.' };
    }
    if (res.status === 404) return NOT_FOUND;
    if (!res.ok) {
      return { ok: false, reason: `GitHub API returned HTTP ${res.status}.` };
    }
    const body = await res.json();
    return Array.isArray(body) ? body as GhContent[] : [body as GhContent];
  };

  // Resolve the {ref, path} split. GitHub URLs are ambiguous when a branch
  // contains `/` (e.g. `/tree/feature/foo/path/to/skill` could mean
  // ref=`feature`+path=`foo/path/to/skill` OR ref=`feature/foo`+path=`path/to/skill`).
  //
  // We walk candidate splits **longest-ref first**. The user explicitly
  // typed the additional segments into the URL bar, so the more-specific
  // interpretation is what they actually meant. Going shortest-first risks
  // silently importing the *wrong* directory tree if a short ref happens to
  // contain a same-named subdirectory.
  //
  // The cost: for single-segment refs (the common case, `tree/main/...`),
  // longest-first wastes N-1 API calls walking down to the real ref. For
  // typical 3-segment Anthropic URLs that's 2 wasted calls — acceptable
  // tradeoff for correctness. A non-404 error (rate limit, network) bails
  // immediately so retries don't burn the rest of the budget.
  let ref = parsed.ref;
  let path = parsed.path;
  let top: GhContent[];
  {
    const segs = parsed.refPathSegments;
    const candidates: Array<{ ref: string; path: string }> = segs.length > 0
      ? Array.from({ length: segs.length }, (_, i) => {
          const refLen = segs.length - i; // longest → shortest
          return {
            ref: segs.slice(0, refLen).join('/'),
            path: segs.slice(refLen).join('/'),
          };
        })
      : [{ ref: parsed.ref, path: parsed.path }];

    let resolved: GhContent[] | null = null;
    for (const cand of candidates) {
      const r = await fetchContentsRaw(cand.ref, cand.path);
      if (r === NOT_FOUND) continue;
      if (!Array.isArray(r)) return r;
      ref = cand.ref;
      path = cand.path;
      resolved = r;
      break;
    }
    if (resolved == null) {
      return {
        ok: false,
        reason: segs.length > 1
          ? `Not found at any ref split of ${parsed.owner}/${parsed.repo}/${segs.join('/')}. Check the branch name (slash-containing branches like \`feature/foo\` are supported but must actually exist).`
          : `Not found: ${parsed.owner}/${parsed.repo}/${parsed.path}@${parsed.ref}.`,
      };
    }
    top = resolved;
  }

  // Helper wrapper for the rest of the flow: maps NOT_FOUND back to a
  // user-readable error since once we've resolved the ref, deeper 404s are
  // genuine missing paths, not slash-ref ambiguity.
  const fetchContents = async (subPath: string): Promise<GhContent[] | ImportError> => {
    const r = await fetchContentsRaw(ref, subPath);
    if (r === NOT_FOUND) return { ok: false, reason: `Not found: ${parsed.owner}/${parsed.repo}/${subPath}@${ref}.` };
    return r;
  };

  // Bind the resolved ref/path back onto `parsed` so existing helper
  // functions (importSingleSkillFolder, walkForSkills) that take `rootRepoPath`
  // off `parsed.path` continue to point at the actual root.
  parsed.ref = ref;
  parsed.path = path;

  // Case 1: URL points directly at a SKILL.md file. GitHub returns the single
  // object in `top`. Pull just that one skill, no aux files (the file is on
  // its own — there's no folder context).
  if (top.length === 1 && top[0].type === 'file' && top[0].name.toLowerCase() === 'skill.md') {
    const fetchedText = await fetchTextDownload(top[0].download_url || '', signal);
    if (typeof fetchedText !== 'string') return fetchedText;
    const parsedSkill = parseSkillMarkdown(fetchedText);
    if (!parsedSkill.ok) return parsedSkill;
    return singleSkill({ ...parsedSkill.skill, files: [] });
  }

  // Case 2: This folder contains SKILL.md → single-skill import with siblings
  // as aux files. Nested skills found inside (e.g. `pdf/form/SKILL.md` when
  // importing `pdf/`) are emitted alongside the parent with a composed
  // `targetDir`. The parent itself lands at the vault root.
  const skillHere = top.find(it => it.type === 'file' && it.name.toLowerCase() === 'skill.md');
  if (skillHere) {
    const single = await importSingleSkillFolder(top, parsed.path, '', fetchContents, signal);
    return single;
  }

  // Case 3: bulk — walk subdirectories looking for SKILL.md. Each one becomes
  // its own ImportedSkillWithTarget with `targetDir` capturing the path from
  // the import root.
  const collected: ImportedSkillWithTarget[] = [];
  const errors: string[] = [];
  const aborted = await walkForSkills(top, parsed.path, '', 0, fetchContents, collected, errors, signal);
  if (aborted) return CANCELLED;
  if (collected.length === 0) {
    return { ok: false, reason: 'No SKILL.md found at the given path or anywhere beneath it.' };
  }
  if (errors.length > 0) {
    console.warn('[skills/import] partial failures during bulk import', errors);
  }
  return { ok: true, skills: collected };
}

/** Import a folder we already know contains `SKILL.md`. Walks the folder for
 *  aux files alongside the parsed SKILL.md body, AND descends recursively
 *  into any subdirectory that has its own `SKILL.md` so a parent skill that
 *  contains nested child skills (e.g. `pdf/SKILL.md` plus `pdf/form/SKILL.md`)
 *  produces multiple import entries instead of silently dropping the child.
 *
 *  - `ownTargetDir` is the directory under `.assets/skills/` where THIS
 *    skill will land (the caller decides; '' for top-level).
 *  - Nested skill folders are skipped from the aux walk (their content is
 *    NOT copied as aux of the parent), then recursively imported with a
 *    `targetDir` composed as `<ownTargetDir>/<own-on-disk-basename>/<relPath>`
 *    so they land inside the parent on disk. */
async function importSingleSkillFolder(
  items: GhContent[],
  rootRepoPath: string,
  ownTargetDir: string,
  fetchContents: (subPath: string) => Promise<GhContent[] | ImportError>,
  signal: AbortSignal | undefined,
): Promise<ImportResult> {
  const skillEntry = items.find(it => it.type === 'file' && it.name.toLowerCase() === 'skill.md');
  if (!skillEntry || !skillEntry.download_url) {
    return { ok: false, reason: 'SKILL.md is missing a download URL.' };
  }
  const skillText = await fetchTextDownload(skillEntry.download_url, signal);
  if (typeof skillText !== 'string') return skillText;
  const parsed = parseSkillMarkdown(skillText);
  if (!parsed.ok) return parsed;

  // Token uniquely identifying THIS skill within the import batch. Nested
  // children below reference it via `parentRef.parentToken` so the dialog
  // can substitute the actual created `meta.id` (which may carry a
  // collision suffix) once we know it.
  const ownToken = makeImportToken();

  const aux: { path: string; bytes: Uint8Array }[] = [];
  const nested: ImportedSkillWithTarget[] = [];
  const queue: { items: GhContent[]; prefix: string }[] = [{ items, prefix: '' }];
  while (queue.length > 0) {
    if (signal?.aborted) return CANCELLED;
    const { items: curr, prefix } = queue.shift()!;
    for (const item of curr) {
      if (aux.length >= GH_MAX_AUX_PER_SKILL) break;
      if (item.type === 'file') {
        if (item.name.toLowerCase() === 'skill.md' && prefix === '') continue;
        if (!item.download_url) continue;
        const bytes = await fetchBytesDownload(item.download_url, signal);
        if (typeof bytes === 'object' && 'ok' in bytes && bytes.ok === false) return bytes;
        if (bytes instanceof Uint8Array) {
          aux.push({ path: prefix ? `${prefix}/${item.name}` : item.name, bytes });
        }
        continue;
      }
      if (item.type !== 'dir') continue;

      const subPath = rootRepoPath ? `${rootRepoPath}/${stripRootPrefix(item.path, rootRepoPath)}` : item.path;
      const subItems = await fetchContents(subPath);
      if (!Array.isArray(subItems)) return subItems;

      const subHasSkill = subItems.some(it => it.type === 'file' && it.name.toLowerCase() === 'skill.md');
      if (subHasSkill) {
        // Nested skill — import it separately. The recursive call yields
        // its own batch (with their own tokens); we stamp THIS skill's
        // token onto the nested top-level so the dialog rebuilds its
        // targetDir from our actual `meta.id` post-creation. Other
        // entries inside `nestedResult` already point at each other; we
        // don't touch their parentRef.
        const nestedResult = await importSingleSkillFolder(subItems, subPath, '', fetchContents, signal);
        if (!nestedResult.ok) return nestedResult;
        if (nestedResult.skills.length > 0) {
          const nestedTop = nestedResult.skills[0];
          nestedTop.parentRef = { parentToken: ownToken, relPath: prefix };
          nestedTop.targetDir = '';
          nested.push(...nestedResult.skills);
        }
        continue;
      }
      // Regular aux directory — descend and collect its files.
      queue.push({ items: subItems, prefix: prefix ? `${prefix}/${item.name}` : item.name });
    }
  }

  return {
    ok: true,
    skills: [
      {
        skill: { ...parsed.skill, files: aux },
        token: ownToken,
        targetDir: ownTargetDir,
        // Parents that contain nested children MUST become folder bundles
        // on disk — otherwise the nested children would land under a
        // category folder named after a single-file parent.
        forceFolder: nested.length > 0,
      },
      ...nested,
    ],
  };
}

/** Bulk-mode walker. Treats every subdirectory that contains SKILL.md as a
 *  skill (stops descending) and recurses through subdirectories that don't.
 *  Returns true when the walk was aborted so the caller can bail out cleanly. */
async function walkForSkills(
  items: GhContent[],
  rootRepoPath: string,
  relPath: string,
  depth: number,
  fetchContents: (subPath: string) => Promise<GhContent[] | ImportError>,
  collected: ImportedSkillWithTarget[],
  errors: string[],
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal?.aborted) return true;
  if (depth > GH_MAX_DEPTH) return false;
  if (collected.length >= GH_MAX_SKILLS) return false;
  for (const item of items) {
    if (signal?.aborted) return true;
    if (collected.length >= GH_MAX_SKILLS) break;
    if (item.type !== 'dir') continue;

    const subRepoPath = rootRepoPath ? `${rootRepoPath}/${stripRootPrefix(item.path, rootRepoPath)}` : item.path;
    const subItems = await fetchContents(subRepoPath);
    if (!Array.isArray(subItems)) {
      if (subItems === CANCELLED) return true;
      errors.push(`${item.path}: ${subItems.reason}`);
      continue;
    }
    const hasSkill = subItems.some(it => it.type === 'file' && it.name.toLowerCase() === 'skill.md');
    if (hasSkill) {
      // Import this folder as a skill, placing it at `relPath` (the parent
      // directory in the destination vault). importSingleSkillFolder is now
      // responsible for emitting any nested-skill subdirectories underneath
      // it with the right targetDir, so we just forward whatever it returns.
      const single = await importSingleSkillFolder(subItems, subRepoPath, relPath, fetchContents, signal);
      if (!single.ok) {
        if (single === CANCELLED) return true;
        errors.push(`${item.path}: ${single.reason}`);
        continue;
      }
      collected.push(...single.skills);
    } else {
      // Recurse into category directory.
      const nextRel = relPath ? `${relPath}/${item.name}` : item.name;
      const aborted = await walkForSkills(subItems, rootRepoPath, nextRel, depth + 1, fetchContents, collected, errors, signal);
      if (aborted) return true;
    }
  }
  return false;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function stripRootPrefix(full: string, prefix: string): string {
  return prefix && full.startsWith(`${prefix}/`) ? full.slice(prefix.length + 1) : full;
}

async function fetchTextDownload(url: string, signal?: AbortSignal): Promise<string | ImportError> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return { ok: false, reason: `GitHub download failed with HTTP ${res.status}.` };
    return await res.text();
  } catch (err) {
    if (isAbortError(err)) return CANCELLED;
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, reason: `GitHub download failed: ${msg}` };
  }
}

async function fetchBytesDownload(url: string, signal?: AbortSignal): Promise<Uint8Array | ImportError> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return { ok: false, reason: `GitHub download failed with HTTP ${res.status}.` };
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    if (isAbortError(err)) return CANCELLED;
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, reason: `GitHub download failed: ${msg}` };
  }
}
