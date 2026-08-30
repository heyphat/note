import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVaultScopedState } from './useVaultScopedState';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useVaultScopedState', () => {
  it('namespaces keys by vault id', () => {
    const { result } = renderHook(() => useVaultScopedState('MyVault'));
    expect(result.current.scopedKey('notes:pinned'))
      .toBe('notes:pinned:MyVault');
  });

  it('sanitizes vault ids containing colons / whitespace', () => {
    const { result } = renderHook(() => useVaultScopedState('Scary: Vault  Name'));
    // Whitespace + colons collapse to `_` so the key is deterministic and
    // round-trips safely through localStorage.
    expect(result.current.scopedKey('x')).toBe('x:Scary_Vault_Name');
  });

  it('falls back to "default" for empty vault ids', () => {
    // Pre-init (before bfsLabel resolves) the id is "" — the sanitizer
    // maps that to "default" so reads still land on a known namespace.
    const { result } = renderHook(() => useVaultScopedState(''));
    expect(result.current.scopedKey('x')).toBe('x:default');
  });

  it('loads pinned / locked / last-opened from localStorage per vault', () => {
    window.localStorage.setItem(
      'notes:pinned:V1',
      JSON.stringify(['a', 'b']),
    );
    window.localStorage.setItem(
      'notes:locked:V1',
      JSON.stringify(['c']),
    );
    window.localStorage.setItem('notes:last-opened:V1', 'a.md');

    const { result } = renderHook(() => useVaultScopedState('V1'));
    expect(Array.from(result.current.pinned)).toEqual(['a', 'b']);
    expect(Array.from(result.current.lockedNotes)).toEqual(['c']);
    expect(result.current.savedLastId).toBe('a.md');
  });

  it('re-reads when the vault id changes', () => {
    window.localStorage.setItem('notes:pinned:V1', JSON.stringify(['a']));
    window.localStorage.setItem('notes:pinned:V2', JSON.stringify(['b']));

    const { result, rerender } = renderHook(
      ({ vaultId }) => useVaultScopedState(vaultId),
      { initialProps: { vaultId: 'V1' } },
    );
    expect(Array.from(result.current.pinned)).toEqual(['a']);

    rerender({ vaultId: 'V2' });
    expect(Array.from(result.current.pinned)).toEqual(['b']);
  });

  it('resets restoredLastOpened on vault change', () => {
    const { result, rerender } = renderHook(
      ({ vaultId }) => useVaultScopedState(vaultId),
      { initialProps: { vaultId: 'V1' } },
    );
    act(() => { result.current.setRestoredLastOpened(true); });
    expect(result.current.restoredLastOpened).toBe(true);

    rerender({ vaultId: 'V2' });
    // Each vault gets its own restore attempt — the gate has to re-close.
    expect(result.current.restoredLastOpened).toBe(false);
  });

  it('togglePin adds/removes + persists under the scoped key', () => {
    const { result } = renderHook(() => useVaultScopedState('V1'));
    act(() => { result.current.togglePin('foo'); });
    expect(Array.from(result.current.pinned)).toEqual(['foo']);
    expect(JSON.parse(window.localStorage.getItem('notes:pinned:V1') || '[]'))
      .toEqual(['foo']);

    act(() => { result.current.togglePin('foo'); });
    expect(Array.from(result.current.pinned)).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem('notes:pinned:V1') || '[]'))
      .toEqual([]);
  });

  it('persistPinned writes directly without mutating state', () => {
    const { result } = renderHook(() => useVaultScopedState('V1'));
    act(() => { result.current.persistPinned(new Set(['x', 'y'])); });
    expect(JSON.parse(window.localStorage.getItem('notes:pinned:V1') || '[]'))
      .toEqual(['x', 'y']);
    // persistPinned is for callers who compute the next set externally
    // (rename / delete / move flows) — it shouldn't push state updates
    // that would race with the caller's setPinned.
    expect(Array.from(result.current.pinned)).toEqual([]);
  });
});
