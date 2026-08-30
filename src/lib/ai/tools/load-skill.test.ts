import { describe, it, expect } from 'vitest';
import { FakeNoteStore } from '@/utils/test/fake-store';
import { buildLoadSkillExecutor } from './load-skill';

async function makeSkill(store: FakeNoteStore, name: string, description: string, content: string) {
  return store.createSkill({ name, description, content });
}

describe('load_skill executor', () => {
  it('returns body and (empty) files manifest for a single-file skill', async () => {
    const store = new FakeNoteStore();
    await makeSkill(store, 'weekly-recap', 'Weekly recap', 'Walk daily notes.');
    const exec = buildLoadSkillExecutor({ store });
    const raw = await exec('load_skill', { name: 'weekly-recap' });
    const result = JSON.parse(raw);
    expect(result.name).toBe('weekly-recap');
    expect(result.description).toBe('Weekly recap');
    expect(result.body).toMatch(/Walk daily notes/);
    expect(result.truncated).toBe(false);
    expect(result.files).toEqual([]);
  });

  it('reports a clear error when the skill is missing', async () => {
    const store = new FakeNoteStore();
    const exec = buildLoadSkillExecutor({ store });
    const raw = await exec('load_skill', { name: 'nope' });
    const result = JSON.parse(raw);
    expect(result.error).toMatch(/No skill named/);
  });

  it('rejects empty / non-string names with a structured error', async () => {
    const store = new FakeNoteStore();
    const exec = buildLoadSkillExecutor({ store });
    expect(JSON.parse(await exec('load_skill', {})).error).toMatch(/non-empty string/);
    expect(JSON.parse(await exec('load_skill', { name: '' })).error).toMatch(/non-empty string/);
    expect(JSON.parse(await exec('load_skill', { name: 12 })).error).toMatch(/non-empty string/);
  });

  it('throws if invoked with a different tool name', async () => {
    const store = new FakeNoteStore();
    const exec = buildLoadSkillExecutor({ store });
    await expect(exec('search_vault' as never, {})).rejects.toThrow(/Unsupported/);
  });
});
