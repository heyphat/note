import type { NoteMeta } from '@/lib/storage';

type HydratedNoteMeta = Pick<NoteMeta, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'size' | 'mtimeMs'>;

// Merge a cheap filesystem walk into the current note list without wiping
// titles / dates that were previously refined from frontmatter or body
// indexing. The walk still provides the authoritative order + file revision.
export function mergeListedNotes(previous: NoteMeta[], walked: NoteMeta[]): NoteMeta[] {
  const byId = new Map(previous.map(note => [note.id, note]));
  return walked.map(note => {
    const existing = byId.get(note.id);
    return existing
      ? {
        ...note,
        title: existing.title,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      }
      : note;
  });
}

// Replace the displayed metadata for a single note with freshly-read values
// from store.get(). Used after cross-tab saves so the passive tab shows the
// real title immediately instead of the UUID filename placeholder.
export function patchListedNote(previous: NoteMeta[], fresh: HydratedNoteMeta): NoteMeta[] {
  return previous.map(note => (
    note.id === fresh.id
      ? {
        ...note,
        title: fresh.title || note.title,
        createdAt: fresh.createdAt || note.createdAt,
        updatedAt: fresh.updatedAt || note.updatedAt,
        size: fresh.size,
        mtimeMs: fresh.mtimeMs,
      }
      : note
  ));
}
