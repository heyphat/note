/**
 * User-hidden tags. Persisted per vault under `notes:hidden-tags:{vaultId}`.
 * Hiding a tag is a UI affordance — the tag still exists in the index, the
 * cloud just omits its chip.
 */

function sanitize(id: string): string {
  return id.replace(/[:\s]+/g, '_') || 'default';
}

function key(vaultId: string): string {
  return `notes:hidden-tags:${sanitize(vaultId)}`;
}

function read(vaultId: string): string[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(key(vaultId));
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

function write(vaultId: string, list: string[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key(vaultId), JSON.stringify(list)); } catch { /* ignore */ }
}

export function getHiddenTags(vaultId: string): string[] {
  return read(vaultId);
}

export function addHiddenTag(vaultId: string, tag: string): string[] {
  const t = tag.toLowerCase();
  const list = read(vaultId);
  if (list.includes(t)) return list;
  const next = [...list, t];
  write(vaultId, next);
  return next;
}

export function removeHiddenTag(vaultId: string, tag: string): string[] {
  const t = tag.toLowerCase();
  const next = read(vaultId).filter(x => x !== t);
  write(vaultId, next);
  return next;
}
