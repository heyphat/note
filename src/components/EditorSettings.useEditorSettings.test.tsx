import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useEditorSettings, DEFAULT_SETTINGS, saveSettings } from './EditorSettings';

const STORAGE_KEY = 'notes:editor-settings';

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(STORAGE_KEY);
});

describe('useEditorSettings', () => {
  it('returns DEFAULT_SETTINGS when localStorage is empty', () => {
    const { result } = renderHook(() => useEditorSettings());
    const [settings] = result.current;
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('lazy-inits from localStorage when present', () => {
    saveSettings({ ...DEFAULT_SETTINGS, fontSize: 22, focusMode: true });
    const { result } = renderHook(() => useEditorSettings());
    const [settings] = result.current;
    expect(settings.fontSize).toBe(22);
    expect(settings.focusMode).toBe(true);
  });

  it('cross-tab storage event patches state', () => {
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current[0].fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: JSON.stringify({ fontSize: 30 }),
      }));
    });
    const [settings] = result.current;
    expect(settings.fontSize).toBe(30);
    // Other fields keep their defaults — we MERGE, not replace.
    expect(settings.focusMode).toBe(DEFAULT_SETTINGS.focusMode);
  });

  it('ignores storage events for other keys', () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'unrelated',
        newValue: JSON.stringify({ fontSize: 999 }),
      }));
    });
    expect(result.current[0].fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });

  it('ignores storage events with no newValue (item cleared)', () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: null,
      }));
    });
    expect(result.current[0]).toEqual(DEFAULT_SETTINGS);
  });

  it('swallows invalid JSON in storage event', () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: 'not json {',
      }));
    });
    expect(result.current[0]).toEqual(DEFAULT_SETTINGS);
  });

  it('exposes a setter that updates state', () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => { result.current[1](prev => ({ ...prev, focusMode: true })); });
    expect(result.current[0].focusMode).toBe(true);
  });
});
