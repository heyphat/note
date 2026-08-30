import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppearanceSync from './AppearanceSync';
import { findPalette } from '@/lib/palettes';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.style.cssText = '';
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('AppearanceSync', () => {
  it('restores the stored theme and palette on mount', () => {
    window.localStorage.setItem('notes-theme', 'light');
    window.localStorage.setItem('notes-palette', 'rose-pine');
    document.documentElement.setAttribute('data-theme', 'dark');

    render(<AppearanceSync locale="en" />);

    const root = document.documentElement;
    const palette = findPalette('rose-pine');
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root).toHaveAttribute('data-palette', 'rose-pine');
    expect(root.style.getPropertyValue('--bg')).toBe(palette.light.bg);
    expect(root.style.getPropertyValue('--accent')).toBe(palette.light.accent);
  });

  it('reapplies the stored appearance when the locale changes', () => {
    window.localStorage.setItem('notes-theme', 'light');
    window.localStorage.setItem('notes-palette', 'rose-pine');

    const { rerender } = render(<AppearanceSync locale="en" />);

    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.cssText = '';

    rerender(<AppearanceSync locale="vi" />);

    const root = document.documentElement;
    const palette = findPalette('rose-pine');
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root).toHaveAttribute('data-palette', 'rose-pine');
    expect(root.style.getPropertyValue('--bg')).toBe(palette.light.bg);
  });
});
