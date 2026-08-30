'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { showToast } from './Toast';
import { applyPalette, readStoredPaletteId } from '@/lib/palettes';

export type Pref = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const STORAGE_KEY = 'notes-theme';

function systemTheme(): Resolved {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readStoredPref(): Pref {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch { return 'system'; }
}

export function applyTheme(pref: Pref) {
  const resolved: Resolved = pref === 'system' ? systemTheme() : pref;
  document.documentElement.setAttribute('data-theme', resolved);
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch { /* ignore */ }
  // Each palette supplies its own dark + light variants, so flipping the
  // theme has to re-apply the palette's tokens for the newly-resolved mode.
  applyPalette(readStoredPaletteId(), resolved);
  window.dispatchEvent(new CustomEvent('themechange', { detail: resolved }));
}

// system → light → dark → system. Used by both the button and the global
// Cmd+Shift+D shortcut — keep them in one place so the cycle doesn't drift.
export function cycleThemePref(current: Pref): Pref {
  return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
}

// Human-readable label for a Pref, used by the theme-change toast. For
// 'system' we also surface what it currently resolves to so the user
// isn't left guessing whether auto just handed them light or dark.
export type PrefLabels = {
  prefix: string;
  light: string;
  dark: string;
  auto: string;
};
const FALLBACK_LABELS: PrefLabels = { prefix: 'Theme', light: 'Light', dark: 'Dark', auto: 'Auto' };
export function prefLabel(pref: Pref, labels: PrefLabels = FALLBACK_LABELS): string {
  if (pref === 'light') return `${labels.prefix}: ${labels.light}`;
  if (pref === 'dark') return `${labels.prefix}: ${labels.dark}`;
  const resolved = systemTheme() === 'dark' ? labels.dark : labels.light;
  return `${labels.prefix}: ${labels.auto} (${resolved})`;
}

export default function ThemeToggle() {
  const tToast = useTranslations('toast');
  const tSettings = useTranslations('settings');
  const [pref, setPref] = useState<Pref>('system');
  const [mounted, setMounted] = useState(false);

  const labels: PrefLabels = {
    prefix: tToast('themePrefix'),
    light: tSettings('themeLight'),
    dark: tSettings('themeDark'),
    auto: tToast('themeAutoSuffix'),
  };

  useEffect(() => {
    setPref(readStoredPref());
    setMounted(true);
  }, []);

  // Sync our displayed icon when someone else changes the theme —
  // e.g. the Cmd+Shift+D global shortcut calls applyTheme() directly.
  useEffect(() => {
    const onExternal = () => setPref(readStoredPref());
    window.addEventListener('themechange', onExternal);
    return () => window.removeEventListener('themechange', onExternal);
  }, []);

  // When following the system, listen for OS-level theme changes and
  // re-apply so the UI updates without a refresh.
  useEffect(() => {
    if (!mounted || pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mounted, pref]);

  const cycle = () => {
    const next = cycleThemePref(pref);
    setPref(next);
    applyTheme(next);
    showToast(prefLabel(next, labels));
  };

  // Placeholder until mounted to avoid hydration mismatch
  const label = !mounted ? labels.prefix
    : pref === 'system' ? `${labels.auto} (${tSettings('themeAuto').toLowerCase()})`
    : pref === 'light' ? labels.light
    : labels.dark;
  const icon = !mounted ? '◐'
    : pref === 'system' ? '◐'
    : pref === 'light' ? '☀'
    : '☾';

  return (
    <button
      onClick={cycle}
      className="pager-btn relative group inline-flex items-center justify-center shrink-0 w-7 h-7 p-0 leading-none"
      aria-label={mounted ? `${labels.prefix}: ${label}` : labels.prefix}
    >
      <span aria-hidden="true">{icon}</span>
      {/* Hover tooltip — uses group-hover so it appears instantly (no native-title delay). */}
      {mounted && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
            whitespace-nowrap rounded border border-[var(--border)] bg-[var(--panel-2)]
            px-2 py-1 text-[10px] leading-tight text-text shadow-md
            opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100
            transition-opacity duration-100 z-50"
        >
          {label}
        </span>
      )}
    </button>
  );
}
