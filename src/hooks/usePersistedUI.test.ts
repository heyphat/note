import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistedBool, usePersistedUI } from './usePersistedUI';

beforeEach(() => {
  window.localStorage.clear();
});

describe('usePersistedBool', () => {
  it('uses the default value when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistedBool('notes:sidebar-open', true));
    const [value] = result.current;
    expect(value).toBe(true);
  });

  it('reads a previously-stored value on mount', () => {
    window.localStorage.setItem('notes:sidebar-open', '0');
    const { result } = renderHook(() => usePersistedBool('notes:sidebar-open', true));
    const [value] = result.current;
    expect(value).toBe(false);
  });

  it('treats unrecognised stored values as "not set" → default wins', () => {
    window.localStorage.setItem('notes:sidebar-open', 'garbage');
    const { result } = renderHook(() => usePersistedBool('notes:sidebar-open', true));
    const [value] = result.current;
    expect(value).toBe(true);
  });

  it('toggle flips the value and writes to localStorage', () => {
    const { result } = renderHook(() => usePersistedBool('notes:sidebar-open', true));
    act(() => {
      const [, , toggle] = result.current;
      toggle();
    });
    const [value] = result.current;
    expect(value).toBe(false);
    expect(window.localStorage.getItem('notes:sidebar-open')).toBe('0');
  });

  it('setValue writes the explicit value and persists', () => {
    const { result } = renderHook(() => usePersistedBool('notes:sidebar-open', true));
    act(() => {
      const [, setValue] = result.current;
      setValue(false);
    });
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem('notes:sidebar-open')).toBe('0');

    act(() => {
      const [, setValue] = result.current;
      setValue(true);
    });
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem('notes:sidebar-open')).toBe('1');
  });

  it('toggle is idempotent in pairs', () => {
    const { result } = renderHook(() => usePersistedBool('notes:zen-mode', false));
    act(() => { result.current[2](); });
    act(() => { result.current[2](); });
    expect(result.current[0]).toBe(false);
  });

  it('survives a rerender via the stored value', () => {
    const { result, unmount } = renderHook(() => usePersistedBool('notes:zen-mode', false));
    act(() => { result.current[1](true); });
    unmount();

    const { result: remounted } = renderHook(() => usePersistedBool('notes:zen-mode', false));
    expect(remounted.current[0]).toBe(true);
  });
});

describe('usePersistedUI', () => {
  it('exposes the full bundle with stable toggle identities across renders', () => {
    const { result, rerender } = renderHook(() => usePersistedUI());

    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.historyOpen).toBe(false);
    expect(result.current.backlinksOpen).toBe(false);
    expect(result.current.narrowEditor).toBe(true);
    expect(result.current.zenMode).toBe(false);

    const firstToggleSidebar = result.current.toggleSidebar;
    rerender();
    expect(result.current.toggleSidebar).toBe(firstToggleSidebar);
  });

  it('toggles write to the right scoped key', () => {
    const { result } = renderHook(() => usePersistedUI());
    act(() => { result.current.toggleHistory(); });
    act(() => { result.current.toggleBacklinks(); });
    act(() => { result.current.toggleZen(); });

    expect(window.localStorage.getItem('notes:history-open')).toBe('1');
    expect(window.localStorage.getItem('notes:backlinks-open')).toBe('1');
    expect(window.localStorage.getItem('notes:zen-mode')).toBe('1');
    // Untouched keys should not be written.
    expect(window.localStorage.getItem('notes:sidebar-open')).toBeNull();
  });
});
