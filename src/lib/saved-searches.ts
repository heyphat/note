/**
 * Saved searches ("smart folders"). Stored as raw palette input so the
 * same string round-trips — users can edit a saved search by opening
 * the palette with its input pre-populated, then saving back. Parsing
 * to `SearchQuery` happens at execution time via `parseQuery`.
 *
 * Persistence shape under `notes:saved-searches:{vaultId}`:
 *   [{ id, name, input, createdAt }, ...]
 */

import { generateNoteId } from './frontmatter';

export interface SavedSearch {
  id: string;
  name: string;
  /** The raw palette input text, e.g. `tag:swing updated:>7d sort:updated`. */
  input: string;
  /** ISO timestamp. Used for "most recent first" ordering. */
  createdAt: string;
}

function sanitize(id: string): string {
  return id.replace(/[:\s]+/g, '_') || 'default';
}

function key(vaultId: string): string {
  return `notes:saved-searches:${sanitize(vaultId)}`;
}

function read(vaultId: string): SavedSearch[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(key(vaultId));
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is SavedSearch =>
      x && typeof x.id === 'string'
      && typeof x.name === 'string'
      && typeof x.input === 'string'
      && typeof x.createdAt === 'string');
  } catch { return []; }
}

function write(vaultId: string, list: SavedSearch[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key(vaultId), JSON.stringify(list)); } catch { /* ignore */ }
}

export function getSavedSearches(vaultId: string): SavedSearch[] {
  return read(vaultId);
}

/**
 * Add a new saved search. `name` is trimmed and defaults to the input text
 * when blank so the list never shows an unlabeled entry.
 */
export function addSavedSearch(
  vaultId: string,
  partial: { name?: string; input: string },
): SavedSearch[] {
  const name = (partial.name || '').trim() || partial.input.trim() || 'Untitled';
  const item: SavedSearch = {
    id: generateNoteId(),
    name,
    input: partial.input,
    createdAt: new Date().toISOString(),
  };
  const list = [...read(vaultId), item];
  write(vaultId, list);
  return list;
}

export function renameSavedSearch(vaultId: string, id: string, name: string): SavedSearch[] {
  const trimmed = name.trim();
  if (!trimmed) return read(vaultId);
  const list = read(vaultId).map(x => x.id === id ? { ...x, name: trimmed } : x);
  write(vaultId, list);
  return list;
}

export function removeSavedSearch(vaultId: string, id: string): SavedSearch[] {
  const list = read(vaultId).filter(x => x.id !== id);
  write(vaultId, list);
  return list;
}

export function updateSavedSearchInput(
  vaultId: string,
  id: string,
  input: string,
): SavedSearch[] {
  const list = read(vaultId).map(x => x.id === id ? { ...x, input } : x);
  write(vaultId, list);
  return list;
}
