'use client';

import { useLayoutEffect } from 'react';
import { applyTheme, readStoredPref } from '@/components/ThemeToggle';

export default function AppearanceSync({ locale }: { locale: string }) {
  useLayoutEffect(() => {
    applyTheme(readStoredPref());
  }, [locale]);

  return null;
}
