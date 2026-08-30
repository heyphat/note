const MAX = 20;

// Sanitize vault identifiers for use in localStorage keys. Colons would
// collide with our key separator; whitespace is flattened to keep keys
// human-readable in devtools. Empty → 'default' so pre-init reads land
// somewhere deterministic.
function sanitize(id: string): string {
  return id.replace(/[:\s]+/g, '_') || 'default';
}

function key(vaultId: string): string {
  return `notes:recent:${sanitize(vaultId)}`;
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

export function getRecent(vaultId: string): string[] {
  return read(vaultId);
}

export function pushRecent(vaultId: string, id: string): string[] {
  const list = read(vaultId);
  const next = [id, ...list.filter(x => x !== id)].slice(0, MAX);
  write(vaultId, next);
  return next;
}

export function removeRecent(vaultId: string, id: string): string[] {
  const next = read(vaultId).filter(x => x !== id);
  write(vaultId, next);
  return next;
}

export function renameRecent(vaultId: string, oldId: string, newId: string): string[] {
  const list = read(vaultId);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const x of list) {
    const mapped = x === oldId ? newId : x;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    next.push(mapped);
  }
  write(vaultId, next);
  return next;
}
