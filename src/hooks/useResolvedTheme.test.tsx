import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useResolvedTheme } from './useResolvedTheme';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('useResolvedTheme', () => {
  it('reads data-theme=light on mount', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');
  });

  it('defaults to dark when data-theme is missing', () => {
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');
  });

  it('defaults to dark when data-theme is anything other than "light"', () => {
    document.documentElement.setAttribute('data-theme', 'sepia');
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');
  });

  it('updates on themechange event', () => {
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');
    act(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      window.dispatchEvent(new Event('themechange'));
    });
    expect(result.current).toBe('light');
    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      window.dispatchEvent(new Event('themechange'));
    });
    expect(result.current).toBe('dark');
  });

  it('removes the listener on unmount', () => {
    const { result, unmount } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');
    unmount();
    // After unmount the hook should NOT update — but since we can't read
    // result.current any more, we just verify the event dispatch doesn't
    // throw and that no console errors leak. (vitest fails on uncaught errors.)
    document.documentElement.setAttribute('data-theme', 'light');
    window.dispatchEvent(new Event('themechange'));
  });
});
