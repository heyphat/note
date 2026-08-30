'use client';

// Mirror of the resolved light/dark variant in React state. The actual
// theme is owned by the inline pre-hydration script in layout.tsx
// (which sets `data-theme` on <html> before paint to avoid a flash);
// this hook just keeps a React copy in sync so palette swatches and
// the command-palette preview can render against the matching tokens.
//
// Listens for the custom `themechange` event that ThemeToggle dispatches
// on every theme cycle, plus reads the attribute on mount in case the
// script ran before React hydrated.

import { useEffect, useState } from 'react';
import type { ResolvedTheme } from '@/lib/palettes';

const readResolvedTheme = (): ResolvedTheme =>
  typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';

export function useResolvedTheme(): ResolvedTheme {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');
  useEffect(() => {
    setResolvedTheme(readResolvedTheme());
    const onThemeChange = () => setResolvedTheme(readResolvedTheme());
    window.addEventListener('themechange', onThemeChange);
    return () => window.removeEventListener('themechange', onThemeChange);
  }, []);
  return resolvedTheme;
}
