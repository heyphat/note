import { describe, it, expect } from 'vitest';
import type { SkillMeta } from '@/lib/storage';
import { buildSkillTree } from './tree';

function meta(id: string, name = id, isFolder = false): SkillMeta {
  return {
    id,
    name,
    description: '',
    isFolder,
    path: isFolder ? `${id}/SKILL.md` : `${id}.md`,
  };
}

describe('buildSkillTree', () => {
  it('returns an empty tree for an empty list', () => {
    expect(buildSkillTree([])).toEqual([]);
  });

  it('keeps top-level skills flat', () => {
    const t = buildSkillTree([
      meta('alpha'),
      meta('beta'),
    ]);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ kind: 'skill', path: 'alpha' });
    expect(t[1]).toMatchObject({ kind: 'skill', path: 'beta' });
  });

  it('groups nested skills under category nodes', () => {
    const t = buildSkillTree([
      meta('coding/python'),
      meta('coding/typescript'),
      meta('writing/copy'),
    ]);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ kind: 'category', name: 'coding', path: 'coding' });
    expect(t[1]).toMatchObject({ kind: 'category', name: 'writing', path: 'writing' });
    if (t[0].kind !== 'category') throw new Error('unreachable');
    expect(t[0].children).toHaveLength(2);
    expect(t[0].children[0]).toMatchObject({ kind: 'skill', path: 'coding/python' });
  });

  it('orders categories before skill leaves at the same level', () => {
    const t = buildSkillTree([
      meta('zzz-leaf'),
      meta('aaa-cat/a'),
    ]);
    expect(t[0].kind).toBe('category');
    expect(t[1].kind).toBe('skill');
  });

  it('handles deep nesting', () => {
    const t = buildSkillTree([meta('a/b/c/leaf')]);
    expect(t).toHaveLength(1);
    if (t[0].kind !== 'category') throw new Error('unreachable');
    expect(t[0].name).toBe('a');
    if (t[0].children[0].kind !== 'category') throw new Error('unreachable');
    expect(t[0].children[0].name).toBe('b');
    if (t[0].children[0].children[0].kind !== 'category') throw new Error('unreachable');
    expect(t[0].children[0].children[0].name).toBe('c');
    expect(t[0].children[0].children[0].children[0]).toMatchObject({
      kind: 'skill', path: 'a/b/c/leaf',
    });
  });

  it('mixes leaves and categories at the same level', () => {
    const t = buildSkillTree([
      meta('coding/python'),
      meta('top-level'),
    ]);
    expect(t).toHaveLength(2);
    expect(t[0].kind).toBe('category');
    expect(t[1].kind).toBe('skill');
  });

  it('promotes a skill to selfSkill when its path is also a parent category', () => {
    // `pdf` is a skill AND a parent of nested `pdf/form` and `pdf/ocr`. The
    // result should be a single category node with `skill: <pdf>` plus two
    // child leaves — no duplicate "pdf" entry hovering at the top level.
    const t = buildSkillTree([
      meta('pdf', 'pdf', true),
      meta('pdf/form', 'form', true),
      meta('pdf/ocr', 'ocr', true),
    ]);
    expect(t).toHaveLength(1);
    if (t[0].kind !== 'category') throw new Error('unreachable');
    expect(t[0].name).toBe('pdf');
    expect(t[0].skill).toBeDefined();
    expect(t[0].skill?.id).toBe('pdf');
    expect(t[0].children).toHaveLength(2);
    expect(t[0].children[0]).toMatchObject({ kind: 'skill', path: 'pdf/form' });
    expect(t[0].children[1]).toMatchObject({ kind: 'skill', path: 'pdf/ocr' });
  });

  it('still works when the parent skill is encountered AFTER its children', () => {
    // Order shouldn't matter — the reconcile pass moves the parent into the
    // category bucket even if the children were inserted first.
    const t = buildSkillTree([
      meta('pdf/form', 'form', true),
      meta('pdf', 'pdf', true),
    ]);
    expect(t).toHaveLength(1);
    if (t[0].kind !== 'category') throw new Error('unreachable');
    expect(t[0].skill?.id).toBe('pdf');
  });
});
