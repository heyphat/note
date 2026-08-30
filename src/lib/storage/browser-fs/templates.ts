import { parseFrontmatter, serializeFrontmatter, generateNoteId } from '@/lib/frontmatter';
import type { TemplateMeta, TemplateFull } from '../types';
import { PermissionsController } from './permissions';
import { writeFile, safeRenameFile } from './fs-helpers';
import { GLOBAL_ASSETS_DIR, TEMPLATES_DIR } from './paths';
import { sanitizeNoteTitle, resolveUniqueFilename } from './sanitize-title';

/**
 * Templates live under `.assets/templates/`. Each is a markdown file with
 * `id` + `title` frontmatter; the on-disk filename is the human-readable
 * title (with collision suffix), but the external id is the frontmatter
 * UUID so URLs survive renames.
 */
export class TemplateStore {
  constructor(private perms: PermissionsController) {}

  async list(): Promise<TemplateMeta[]> {
    try {
      const dir = await this.getTemplatesDir();
      const out: TemplateMeta[] = [];
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.md')) continue;
        const record = await this.normalizeTemplateFile(dir, name);
        if (!record) continue;
        out.push({ id: record.id, name: record.name });
      }
      const unique = new Map<string, TemplateMeta>();
      for (const template of out) unique.set(template.id, template);
      return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<TemplateFull | null> {
    const found = await this.resolveTemplateRecord(id);
    return found ? { id: found.id, name: found.name, content: found.content } : null;
  }

  async create(name: string, content: string): Promise<TemplateMeta> {
    const dir = await this.getTemplatesDir(true);
    const id = generateNoteId();
    const base = sanitizeNoteTitle(name);
    const filename = await resolveUniqueFilename(dir, base, 'md');
    const fh = await dir.getFileHandle(filename, { create: true });
    await writeFile(fh, this.serializeTemplateRecord(id, name, content));
    return { id, name };
  }

  async save(id: string, content: string): Promise<void> {
    const dir = await this.getTemplatesDir(true);
    const existing = await this.resolveTemplateRecord(id);
    if (!existing) throw new Error(`Template not found: ${id}`);
    const fh = await dir.getFileHandle(existing.filename);
    await writeFile(fh, this.serializeTemplateRecord(existing.id, existing.name, content));
  }

  async delete(id: string): Promise<void> {
    try {
      const dir = await this.getTemplatesDir(true);
      const existing = await this.resolveTemplateRecord(id);
      if (!existing) return;
      await dir.removeEntry(existing.filename);
    } catch { /* already gone */ }
  }

  async rename(id: string, newName: string): Promise<TemplateMeta> {
    const dir = await this.getTemplatesDir(true);
    const existing = await this.resolveTemplateRecord(id);
    if (!existing) throw new Error(`Template not found: ${id}`);
    const newBase = sanitizeNoteTitle(newName);
    const newFilename = await resolveUniqueFilename(dir, newBase, 'md', existing.filename);
    const existingHandle = await dir.getFileHandle(existing.filename);
    const nextRaw = this.serializeTemplateRecord(existing.id, newName, existing.content);
    await safeRenameFile(dir, existing.filename, newFilename, nextRaw, existingHandle);
    return { id: existing.id, name: newName };
  }

  private async getTemplatesDir(create = false): Promise<FileSystemDirectoryHandle> {
    const root = this.perms.requireHandle();
    const assets = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR, { create });
    return assets.getDirectoryHandle(TEMPLATES_DIR, { create });
  }

  private serializeTemplateRecord(id: string, name: string, content: string, extraMeta?: Record<string, string>) {
    return serializeFrontmatter({ ...extraMeta, id, title: name }, content);
  }

  // Ensure frontmatter has both `id` and `title`. Never renames the file —
  // template basenames are now human-readable titles (with optional collision
  // suffix). The external "template id" returned to callers is still the
  // frontmatter UUID, so URLs and bookmarks survive renames.
  private async normalizeTemplateFile(dir: FileSystemDirectoryHandle, filename: string): Promise<{ id: string; name: string; content: string; filename: string } | null> {
    if (!filename.endsWith('.md')) return null;
    const fileHandle = await dir.getFileHandle(filename);
    const raw = await (await fileHandle.getFile()).text();
    const { meta, content } = parseFrontmatter(raw);
    const fallbackName = filename.replace(/\.md$/, '');
    const id = (meta.id || '').trim() || generateNoteId();
    const name = (meta.title || '').trim() || fallbackName;
    const normalizedRaw = this.serializeTemplateRecord(id, name, content, meta);
    if (raw !== normalizedRaw) {
      await writeFile(fileHandle, normalizedRaw);
    }
    return { id, name, content, filename };
  }

  private async resolveTemplateRecord(token: string): Promise<{ id: string; name: string; content: string; filename: string } | null> {
    try {
      const dir = await this.getTemplatesDir();
      // Templates can have any human-readable filename, so walk and match by
      // frontmatter id, title, or filename basename. (Legacy bookmarks may
      // pass any of those three.)
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.md')) continue;
        const record = await this.normalizeTemplateFile(dir, name);
        if (!record) continue;
        if (record.id === token || record.name === token || name.replace(/\.md$/, '') === token) {
          return record;
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
