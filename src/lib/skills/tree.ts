// Convert the flat `SkillMeta[]` list (where each skill carries a
// path-shaped id, e.g. `coding/python`) into a nested tree of categories +
// skill leaves. The recursive sidebar uses this directly; no React-aware
// state lives here so it's straightforward to unit-test.
//
// A category node carries an optional `skill` when a path is BOTH a skill
// itself AND a parent of nested skills (e.g. `pdf/SKILL.md` exists while
// `pdf/form/SKILL.md` and `pdf/ocr/SKILL.md` also exist). The sidebar
// renders such a node with a clickable label that opens the skill AND a
// chevron that toggles the children — see SkillList.

import type { SkillMeta } from '@/lib/storage';

export type SkillTreeNode =
  | { kind: 'skill'; skill: SkillMeta; path: string }
  | {
      kind: 'category';
      name: string;
      path: string;
      children: SkillTreeNode[];
      /** When set, the category is also a skill at this exact path — the
       *  sidebar shows its name as a single clickable row that opens the
       *  skill, with a chevron beside it to expand/collapse the nested
       *  children. */
      skill?: SkillMeta;
    };

/** Group a flat list of skills into a nested tree by their path-shaped id.
 *  Categories emerge for every path segment that isn't the leaf. Within each
 *  level, categories sort before standalone skills (alphabetically) so the
 *  tree reads like a file browser. */
export function buildSkillTree(skills: SkillMeta[]): SkillTreeNode[] {
  // Internal mutable tree node — convert to the closed-shape SkillTreeNode at
  // the end. Using a Map per level keeps the build O(n * depth) and stable
  // across insertion order. `selfSkill` captures the case where a category's
  // exact path is also a skill (the `pdf` + `pdf/form` pattern).
  interface Bucket {
    name: string;
    path: string;
    selfSkill?: SkillMeta;
    skills: Array<{ skill: SkillMeta; key: string }>;
    children: Map<string, Bucket>;
  }
  const root: Bucket = { name: '', path: '', skills: [], children: new Map() };

  // First pass: place each skill. We walk the segments and stop at the leaf
  // — the leaf either becomes a leaf-skill child of its parent bucket, or
  // (if a child bucket already exists at that path because some other skill
  // is nested under it) attaches to the bucket as `selfSkill`.
  for (const skill of skills) {
    const segments = skill.id.split('/').filter(Boolean);
    if (segments.length === 0) continue;
    const leafKey = segments[segments.length - 1];
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const childPath = cursor.path ? `${cursor.path}/${seg}` : seg;
      let child = cursor.children.get(seg);
      if (!child) {
        child = { name: seg, path: childPath, skills: [], children: new Map() };
        cursor.children.set(seg, child);
      }
      cursor = child;
    }
    // Now `cursor` is the parent bucket; the skill itself sits at
    // `cursor.path/leafKey`. If a category bucket already exists there
    // (because some other skill is nested deeper), promote this skill to be
    // that category's `selfSkill`. Otherwise add it as a regular leaf.
    const existingCategory = cursor.children.get(leafKey);
    if (existingCategory) {
      existingCategory.selfSkill = skill;
    } else {
      cursor.skills.push({ skill, key: leafKey });
    }
  }

  // Second pass: a skill we already placed as a leaf-skill might later have
  // been shadowed by a category bucket (because another skill nests under it
  // and was processed AFTER it). Walk the buckets and move any leaf-skill
  // whose key collides with a sibling category into the category as
  // `selfSkill`. Insertion order doesn't matter for input — we always end up
  // with the same tree.
  const reconcile = (bucket: Bucket): void => {
    const remaining: typeof bucket.skills = [];
    for (const entry of bucket.skills) {
      const collidingCategory = bucket.children.get(entry.key);
      if (collidingCategory) {
        collidingCategory.selfSkill = entry.skill;
      } else {
        remaining.push(entry);
      }
    }
    bucket.skills = remaining;
    for (const child of Array.from(bucket.children.values())) reconcile(child);
  };
  reconcile(root);

  const finalize = (bucket: Bucket): SkillTreeNode[] => {
    const out: SkillTreeNode[] = [];
    // Categories first, alphabetical by name.
    const categoryEntries = Array.from(bucket.children.values())
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const cat of categoryEntries) {
      out.push({
        kind: 'category',
        name: cat.name,
        path: cat.path,
        children: finalize(cat),
        skill: cat.selfSkill,
      });
    }
    // Then standalone skill leaves, alphabetical by the leaf segment of the
    // path so the visible order matches what's on disk.
    const skillEntries = [...bucket.skills].sort((a, b) => a.key.localeCompare(b.key));
    for (const s of skillEntries) {
      out.push({ kind: 'skill', skill: s.skill, path: s.skill.id });
    }
    return out;
  };

  return finalize(root);
}
