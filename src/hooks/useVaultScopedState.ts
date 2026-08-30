'use client';

// Per-vault state persisted in localStorage under `{base}:{vault}` keys.
// Pinned paths, locked note ids, and the last-opened note id each live under
// their own scope so switching folders doesn't cross-wire the restoration.
//
// The vault key is derived from bfsLabel (the picked folder's name).
// An empty id before `initialize()` resolves is sanitized to `default`, so
// pre-init reads still land deterministically.

import { useCallback, useEffect, useState } from 'react';

function sanitizeVault(id: string) {
  return id.replace(/[:\s]+/g, '_') || 'default';
}

function persistSet(key: string, set: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch { /* ignore */ }
}

export type VaultScopedState = {
  /** `${base}:${sanitized-vault-id}` — exposed so callers can read bespoke keys. */
  scopedKey: (base: string) => string;
  pinned: Set<string>;
  setPinned: React.Dispatch<React.SetStateAction<Set<string>>>;
  persistPinned: (next: Set<string>) => void;
  togglePin: (path: string) => void;
  lockedNotes: Set<string>;
  setLockedNotes: React.Dispatch<React.SetStateAction<Set<string>>>;
  persistLocked: (next: Set<string>) => void;
  savedLastId: string | null;
  setSavedLastId: (id: string | null) => void;
  /**
   * Set once the boot-time restore attempt has run for the current vault
   * (success or miss). Gates downstream persistence so pre-init nulls can't
   * wipe the stored id.
   */
  restoredLastOpened: boolean;
  setRestoredLastOpened: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useVaultScopedState(vaultId: string): VaultScopedState {
  const scopedKey = useCallback(
    (base: string) => `${base}:${sanitizeVault(vaultId)}`,
    [vaultId],
  );

  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [lockedNotes, setLockedNotes] = useState<Set<string>>(new Set());
  const [savedLastId, setSavedLastIdState] = useState<string | null>(null);
  const [restoredLastOpened, setRestoredLastOpened] = useState(false);

  // Re-read every scoped value whenever the vault changes, and reset the
  // restore gate so each vault gets its own restore attempt.
  useEffect(() => {
    try {
      const rawPinned = window.localStorage.getItem(scopedKey('notes:pinned'));
      setPinned(rawPinned ? new Set(JSON.parse(rawPinned)) : new Set());
      const rawLocked = window.localStorage.getItem(scopedKey('notes:locked'));
      setLockedNotes(rawLocked ? new Set(JSON.parse(rawLocked)) : new Set());
      setSavedLastIdState(window.localStorage.getItem(scopedKey('notes:last-opened')));
    } catch { /* ignore */ }
    setRestoredLastOpened(false);
  }, [scopedKey]);

  const persistPinned = useCallback((next: Set<string>) => {
    persistSet(scopedKey('notes:pinned'), next);
  }, [scopedKey]);

  const persistLocked = useCallback((next: Set<string>) => {
    persistSet(scopedKey('notes:locked'), next);
  }, [scopedKey]);

  const togglePin = useCallback((path: string) => {
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      persistPinned(next);
      return next;
    });
  }, [persistPinned]);

  const setSavedLastId = useCallback((id: string | null) => {
    setSavedLastIdState(id);
    try {
      const k = scopedKey('notes:last-opened');
      if (id) window.localStorage.setItem(k, id);
      else window.localStorage.removeItem(k);
    } catch { /* ignore */ }
  }, [scopedKey]);

  return {
    scopedKey,
    pinned, setPinned, persistPinned, togglePin,
    lockedNotes, setLockedNotes, persistLocked,
    savedLastId, setSavedLastId,
    restoredLastOpened, setRestoredLastOpened,
  };
}
