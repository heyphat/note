// IndexedDB wrapper for storing the current FileSystemDirectoryHandle plus a
// stable opaque vault id. The id lets us namespace local state and cross-tab
// sync by the actual handle rather than the folder name, which avoids
// collisions when two different vaults share the same basename.
//
// Data model:
// - `handles` store: one pointer per user -> current vault id
// - `vaults` store: many known vault handles per user -> { vaultId, handle }
//
// Legacy v1 installs stored the raw handle directly under `notesDir:${userId}`.
// `loadHandle()` upgrades that record lazily the first time it is read.

declare global {
  interface FileSystemHandle {
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
  }
}

const DB_NAME = 'notes-handles';
const CURRENT_STORE = 'handles';
const VAULT_STORE = 'vaults';
const DB_VERSION = 2;

type CurrentPointer = {
  recordType: 'current';
  vaultId: string;
};

type VaultEntry = {
  recordType: 'vault';
  userId: string;
  vaultId: string;
  label: string;
  handle: FileSystemDirectoryHandle;
};

export type StoredHandle = {
  handle: FileSystemDirectoryHandle;
  vaultId: string;
  label: string;
};

function currentKey(userId: string): string {
  return `notesDir:${userId}`;
}

function vaultKey(userId: string, vaultId: string): string {
  return `vault:${userId}:${vaultId}`;
}

function isCurrentPointer(value: unknown): value is CurrentPointer {
  return !!value
    && typeof value === 'object'
    && (value as { recordType?: unknown }).recordType === 'current'
    && typeof (value as { vaultId?: unknown }).vaultId === 'string';
}

function isVaultEntry(value: unknown): value is VaultEntry {
  return !!value
    && typeof value === 'object'
    && (value as { recordType?: unknown }).recordType === 'vault'
    && typeof (value as { userId?: unknown }).userId === 'string'
    && typeof (value as { vaultId?: unknown }).vaultId === 'string'
    && typeof (value as { label?: unknown }).label === 'string'
    && isDirectoryHandle((value as { handle?: unknown }).handle);
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return !!value
    && typeof value === 'object'
    && (value as { kind?: unknown }).kind === 'directory';
}

function makeVaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `vault-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const locksApi = typeof navigator !== 'undefined'
    ? (navigator as Navigator & {
      locks?: { request: <R>(name: string, callback: () => Promise<R>) => Promise<R> };
    }).locks
    : undefined;
  if (!locksApi?.request) return fn();
  return locksApi.request(`notes-handle-db:${userId}`, fn);
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(CURRENT_STORE)) {
        req.result.createObjectStore(CURRENT_STORE);
      }
      if (!req.result.objectStoreNames.contains(VAULT_STORE)) {
        req.result.createObjectStore(VAULT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readValue<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function writeValue(store: IDBObjectStore, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteValue(store: IDBObjectStore, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function pickCanonicalVault(entries: VaultEntry[]): VaultEntry | null {
  if (!entries.length) return null;
  return entries.slice().sort((a, b) => a.vaultId.localeCompare(b.vaultId))[0] ?? null;
}

async function findMatchingVaults(
  db: IDBDatabase,
  userId: string,
  handle: FileSystemDirectoryHandle,
): Promise<VaultEntry[]> {
  const tx = db.transaction(VAULT_STORE, 'readonly');
  const store = tx.objectStore(VAULT_STORE);
  const all = await new Promise<unknown[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as unknown[]);
    req.onerror = () => reject(req.error);
  });
  const matches: VaultEntry[] = [];
  for (const item of all) {
    if (!isVaultEntry(item)) continue;
    const entry = item as VaultEntry;
    if (entry.userId !== userId) continue;
    if (entry.handle === handle) {
      matches.push(entry);
      continue;
    }
    try {
      if (typeof entry.handle.isSameEntry === 'function') {
        const same = await entry.handle.isSameEntry(handle);
        if (same) matches.push(entry);
      }
    } catch {
      // Ignore stale or unsupported handles and keep searching.
    }
  }
  return matches;
}

async function saveHandleUnlocked(
  db: IDBDatabase,
  userId: string,
  handle: FileSystemDirectoryHandle,
): Promise<StoredHandle> {
  const matches = await findMatchingVaults(db, userId, handle);
  const canonical = pickCanonicalVault(matches);
  const vaultId = canonical?.vaultId || makeVaultId();
  const label = handle.name || canonical?.label || 'Notes';
  const tx = db.transaction([CURRENT_STORE, VAULT_STORE], 'readwrite');
  const currentStore = tx.objectStore(CURRENT_STORE);
  const vaultStore = tx.objectStore(VAULT_STORE);
  await writeValue(vaultStore, vaultKey(userId, vaultId), {
    recordType: 'vault',
    userId,
    vaultId,
    label,
    handle,
  } satisfies VaultEntry);
  for (const entry of matches) {
    if (entry.vaultId === vaultId) continue;
    await deleteValue(vaultStore, vaultKey(userId, entry.vaultId));
  }
  await writeValue(currentStore, currentKey(userId), {
    recordType: 'current',
    vaultId,
  } satisfies CurrentPointer);
  await waitForTransaction(tx);
  return { handle, vaultId, label };
}

async function readCurrentRecordUnlocked(db: IDBDatabase, userId: string): Promise<StoredHandle | null> {
  const tx = db.transaction([CURRENT_STORE, VAULT_STORE], 'readonly');
  const currentStore = tx.objectStore(CURRENT_STORE);
  const vaultStore = tx.objectStore(VAULT_STORE);
  const current = await readValue<unknown>(currentStore, currentKey(userId));
  if (current == null) return null;
  if (isCurrentPointer(current)) {
    const entry = await readValue<unknown>(vaultStore, vaultKey(userId, current.vaultId));
    if (!isVaultEntry(entry)) return null;
    const matches = await findMatchingVaults(db, userId, entry.handle);
    const canonical = pickCanonicalVault(matches) || entry;
    const label = entry.label || entry.handle.name || canonical.label || canonical.handle.name || 'Notes';
    const needsRewrite = canonical.vaultId !== entry.vaultId
      || matches.some(match => match.vaultId !== canonical.vaultId)
      || label !== entry.label;
    if (!needsRewrite) {
      return { handle: entry.handle, vaultId: entry.vaultId, label };
    }
    return saveHandleUnlocked(db, userId, entry.handle);
  }
  if (isDirectoryHandle(current)) {
    // Legacy v1 migration: upgrade the raw handle to the v2 pointer + vault
    // entry while we already hold the user-scoped lock. Calling the public
    // saveHandle() here would try to re-enter the same Web Lock and hang.
    return saveHandleUnlocked(db, userId, current);
  }
  return null;
}

export async function saveHandle(userId: string, handle: FileSystemDirectoryHandle): Promise<StoredHandle> {
  return withUserLock(userId, async () => {
    const db = await open();
    return saveHandleUnlocked(db, userId, handle);
  });
}

export async function loadHandle(userId: string): Promise<StoredHandle | null> {
  return withUserLock(userId, async () => {
    const db = await open();
    return readCurrentRecordUnlocked(db, userId);
  });
}

/**
 * Forget the user's currently-selected vault. Removes both the
 * `current → vaultId` pointer AND the corresponding vault entry from
 * `VAULT_STORE` so a subsequent `loadHandle()` returns null and re-picking
 * the same folder mints a fresh vaultId. Used by the settings "Forget
 * current folder" action.
 */
export async function clearHandle(userId: string): Promise<void> {
  return withUserLock(userId, async () => {
    const db = await open();
    // Stage 1: read the current pointer to find which vault entry to remove.
    const readTx = db.transaction(CURRENT_STORE, 'readonly');
    const current = await readValue<unknown>(readTx.objectStore(CURRENT_STORE), currentKey(userId));
    const targetVaultId = isCurrentPointer(current) ? current.vaultId : null;
    await waitForTransaction(readTx);

    // Stage 2: delete both records in a single write transaction so the
    // pointer never lingers without its vault entry (or vice versa).
    const writeTx = db.transaction([CURRENT_STORE, VAULT_STORE], 'readwrite');
    await deleteValue(writeTx.objectStore(CURRENT_STORE), currentKey(userId));
    if (targetVaultId) {
      await deleteValue(writeTx.objectStore(VAULT_STORE), vaultKey(userId, targetVaultId));
    }
    await waitForTransaction(writeTx);
  });
}
