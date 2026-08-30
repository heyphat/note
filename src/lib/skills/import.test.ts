import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  importFromMarkdown, importFromFiles, importFromGithub, parseGithubUrl,
} from './import';

const validSkill = `---
name: weekly-recap
description: Triggered when the user asks for a weekly recap of their daily notes.
---

Body.
`;

// jsdom's File polyfill omits `.text()` and `.arrayBuffer()` — shim them so
// the import code (which only needs string contents) can run unchanged.
function makeFile(content: string, name: string, relPath?: string): File {
  const file = new File([content], name);
  Object.defineProperty(file, 'text', { value: async () => content });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(content).buffer,
  });
  if (relPath) Object.defineProperty(file, 'webkitRelativePath', { value: relPath });
  return file;
}

describe('importFromMarkdown', () => {
  it('passes a well-formed skill through with empty files', () => {
    const r = importFromMarkdown(validSkill);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skills).toHaveLength(1);
      expect(r.skills[0].skill.name).toBe('weekly-recap');
      expect(r.skills[0].skill.files).toEqual([]);
      expect(r.skills[0].targetDir).toBe('');
    }
  });

  it('forwards a parse error', () => {
    const r = importFromMarkdown('no frontmatter here');
    expect(r.ok).toBe(false);
  });
});

describe('importFromFiles', () => {
  it('accepts a single .md file as a single-file skill', async () => {
    const file = makeFile(validSkill, 'SKILL.md');
    const r = await importFromFiles([file]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skills).toHaveLength(1);
      expect(r.skills[0].skill.name).toBe('weekly-recap');
      expect(r.skills[0].skill.files).toEqual([]);
      expect(r.skills[0].targetDir).toBe('');
    }
  });

  it('rejects multi-file imports without a SKILL.md', async () => {
    const a = makeFile('hi', 'reference.md');
    const b = makeFile('hi', 'extra.md');
    const r = await importFromFiles([a, b]);
    expect(r.ok).toBe(false);
  });

  it('imports a folder with SKILL.md plus aux files', async () => {
    // Simulate webkitdirectory upload: paths carry a leading folder segment.
    const skill = makeFile(validSkill, 'SKILL.md', 'weekly-recap/SKILL.md');
    const ref = makeFile('# Reference\n', 'reference.md', 'weekly-recap/references/reference.md');
    const r = await importFromFiles([skill, ref]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skills).toHaveLength(1);
      expect(r.skills[0].skill.name).toBe('weekly-recap');
      expect(r.skills[0].skill.files).toHaveLength(1);
      expect(r.skills[0].skill.files[0].path).toBe('references/reference.md');
      expect(r.skills[0].targetDir).toBe('');
    }
  });

  it('skips files whose paths contain traversal segments', async () => {
    const skill = makeFile(validSkill, 'SKILL.md', 'skill/SKILL.md');
    const bad = makeFile('x', 'evil.md', 'skill/../evil.md');
    const r = await importFromFiles([skill, bad]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skills[0].skill.files).toHaveLength(0);
  });

  it('discovers nested SKILL.md files and emits them as separate entries with parentRef', async () => {
    // Source layout (as the browser file picker exposes it):
    //   pdf/SKILL.md            ← parent
    //   pdf/references/note.md  ← aux of parent
    //   pdf/form/SKILL.md       ← nested child
    //   pdf/form/extra.md       ← aux of child
    const nestedSkill = `---\nname: pdf-form\ndescription: Nested form skill\n---\nNested.`;
    const parent = makeFile(validSkill, 'SKILL.md', 'pdf/SKILL.md');
    const aux = makeFile('# Note', 'note.md', 'pdf/references/note.md');
    const child = makeFile(nestedSkill, 'SKILL.md', 'pdf/form/SKILL.md');
    const childAux = makeFile('# Extra', 'extra.md', 'pdf/form/extra.md');

    const r = await importFromFiles([parent, aux, child, childAux]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skills).toHaveLength(2);

    // Parent: first entry. Aux file count excludes anything under the
    // nested skill's directory.
    const parentEntry = r.skills[0];
    expect(parentEntry.skill.name).toBe('weekly-recap');
    expect(parentEntry.forceFolder).toBe(true); // has children → must be folder
    expect(parentEntry.parentRef).toBeUndefined();
    expect(parentEntry.skill.files.map(f => f.path)).toEqual(['references/note.md']);

    // Child: second entry. parentRef references the parent token; relPath
    // is '' because `form/` is DIRECTLY inside the parent's folder.
    const childEntry = r.skills[1];
    expect(childEntry.skill.name).toBe('pdf-form');
    expect(childEntry.parentRef).toEqual({ parentToken: parentEntry.token, relPath: '' });
    expect(childEntry.skill.files.map(f => f.path)).toEqual(['extra.md']);
  });

  it('does NOT silently drop nested SKILL.md as an aux file of the parent', async () => {
    // Regression for the storage-skip-on-SKILL.md bug — before the
    // refactor, a nested SKILL.md was queued as aux and writeSkillAuxFile
    // dropped it.
    const nestedSkill = `---\nname: inner\ndescription: Inner skill\n---\nInner body.`;
    const parent = makeFile(validSkill, 'SKILL.md', 'outer/SKILL.md');
    const child = makeFile(nestedSkill, 'SKILL.md', 'outer/inner/SKILL.md');
    const r = await importFromFiles([parent, child]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Parent's aux should be empty — the child's SKILL.md and its dir
    // must not have been swept up.
    expect(r.skills[0].skill.files).toEqual([]);
    // Child must be its own entry.
    expect(r.skills.map(s => s.skill.name).sort()).toEqual(['inner', 'weekly-recap']);
  });
});

describe('parseGithubUrl', () => {
  it('parses a repo root URL', () => {
    const r = parseGithubUrl('https://github.com/anthropics/skills');
    expect(r).toEqual({
      owner: 'anthropics', repo: 'skills', ref: 'HEAD', path: '', refPathSegments: [],
    });
  });

  it('parses a tree URL with a path', () => {
    const r = parseGithubUrl('https://github.com/anthropics/skills/tree/main/finance/excel-create');
    expect(r).toEqual({
      owner: 'anthropics',
      repo: 'skills',
      ref: 'main',
      path: 'finance/excel-create',
      refPathSegments: ['main', 'finance', 'excel-create'],
    });
  });

  it('exposes refPathSegments for slash-containing branches so the resolver can walk splits', () => {
    // The heuristic returns the SHORTEST ref; the actual branch could be
    // `feature/foo` instead of just `feature`. importFromGithub uses
    // refPathSegments to try longer ref candidates if the heuristic 404s.
    const r = parseGithubUrl('https://github.com/owner/repo/tree/feature/foo/path/to/skill');
    expect(r).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      ref: 'feature',
      path: 'foo/path/to/skill',
      refPathSegments: ['feature', 'foo', 'path', 'to', 'skill'],
    });
  });

  it('strips .git from the repo name', () => {
    const r = parseGithubUrl('https://github.com/anthropics/skills.git');
    expect(r?.repo).toBe('skills');
  });

  it('rejects non-github hosts', () => {
    expect(parseGithubUrl('https://gitlab.com/owner/repo')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseGithubUrl('not a url')).toBeNull();
    expect(parseGithubUrl('https://github.com/onlyowner')).toBeNull();
  });
});

describe('importFromGithub — slash-ref resolution', () => {
  // Each test wires up a `fetch` mock that the importer's resolver will hit.
  // We script which `/contents/...?ref=<ref>` calls succeed so we can assert
  // the longest-first prefix walk picks the more-specific interpretation
  // over the more-general one.
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  function makeJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('prefers the LONGEST matching ref split (correct interpretation), even when a shorter ref also resolves', async () => {
    // URL: /tree/feature/foo/path/to/skill
    // Both interpretations would succeed at the GitHub contents endpoint:
    //   - ref=feature/foo, path=path/to/skill  ← the user's actual intent
    //   - ref=feature,     path=foo/path/to/skill  ← coincidental valid path
    // A shortest-first resolver would silently import the second tree
    // (wrong content). Longest-first picks the first.
    const calls: { ref: string; subPath: string }[] = [];
    const skillJson = `---\nname: example\ndescription: ok\n---\nbody`;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      // Contents listings — record ref+path requested
      const m = url.match(/repos\/owner\/repo\/contents\/([^?]+)(?:\?ref=([^&]+))?/);
      if (m) {
        const subPath = decodeURIComponent(m[1]);
        const ref = m[2] ? decodeURIComponent(m[2]) : 'HEAD';
        calls.push({ ref, subPath });
        // Resolve the LONGEST candidate (`feature/foo`) and the SHORTEST
        // (`feature`) both with 200 to verify the resolver picks longest.
        if (ref === 'feature/foo' || ref === 'feature') {
          // Return a single-file SKILL.md (so the importer skips the bulk-walk
          // and we exercise only the resolver path).
          return makeJsonResponse([
            { type: 'file', name: 'SKILL.md', path: `${subPath}/SKILL.md`, download_url: `https://raw/${ref}/SKILL.md` },
          ]);
        }
        return new Response('', { status: 404 });
      }
      // Raw download — return the same SKILL.md body regardless.
      if (url.startsWith('https://raw/')) {
        return new Response(skillJson, { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await importFromGithub('https://github.com/owner/repo/tree/feature/foo/path/to/skill');
    expect(result.ok).toBe(true);

    // First contents call should request the LONGEST candidate ref. Note:
    // for a 5-segment URL `feature/foo/path/to/skill`, longest-first walks
    // segs[0..5] (empty path) → segs[0..4] → ... → segs[0..1] (feature/foo).
    // `feature/foo` is the FIRST ref in the walk that returns 200, so the
    // resolver stops there.
    const acceptedCall = calls.find(c => c.ref === 'feature/foo');
    expect(acceptedCall).toBeDefined();
    // The accepted call's path corresponds to `path/to/skill` (the user's
    // intended path under the `feature/foo` branch).
    expect(acceptedCall!.subPath).toBe('path/to/skill');
    // Longest-first stops as soon as `feature/foo` returns 200, so the
    // resolver never falls down to `feature` (the shorter, wrong-content
    // interpretation).
    expect(calls.find(c => c.ref === 'feature')).toBeUndefined();
  });
});
