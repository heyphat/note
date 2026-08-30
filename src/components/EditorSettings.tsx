'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Tooltip from './Tooltip';
import { PALETTES, applyPalette, DEFAULT_PALETTE_ID, type ResolvedTheme } from '@/lib/palettes';

export interface Settings {
  fontFamily:
    | 'system' | 'serif' | 'mono'
    | 'sourceCodePro' | 'roboto' | 'openSans' | 'notoSans' | 'montserrat'
    | 'lato' | 'poppins' | 'robotoCondensed' | 'sourceSans3' | 'oswald' | 'raleway';
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  spellCheck: boolean;
  showToc: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  showWordCount: boolean;
  /** Dense note tree: hides the updated-at subtitle and tightens row padding. */
  denseSidebar: boolean;
  /** Pomodoro focus-session length (minutes). */
  pomodoroFocusMinutes: number;
  /** Pomodoro break length (minutes). */
  pomodoroBreakMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  fontFamily: 'system',
  fontSize: 16,
  lineHeight: 1.7,
  paragraphSpacing: 4,
  spellCheck: true,
  showToc: true,
  focusMode: false,
  typewriterMode: false,
  showWordCount: true,
  denseSidebar: true,
  pomodoroFocusMinutes: 25,
  pomodoroBreakMinutes: 5,
};

const STORAGE_KEY = 'notes:editor-settings';

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Stateful wrapper: lazy-init from localStorage + cross-tab sync via the
 *  `storage` event. Use this from page.tsx instead of a raw useState; the
 *  `storage` event only fires in OTHER tabs, so the saving tab still has
 *  to call `setSettings` directly (or `saveSettings`). */
export function useEditorSettings(): [Settings, React.Dispatch<React.SetStateAction<Settings>>] {
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
    return loadSettings();
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as Partial<Settings>;
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return [settings, setSettings];
}

/** CSS variable map applied to the editor wrapper. */
export function settingsToCss(s: Settings): Record<string, string> {
  const fonts: Record<string, string> = {
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
    sourceCodePro: "var(--font-source-code-pro), 'Source Code Pro', 'SF Mono', Menlo, monospace",
    roboto: "var(--font-roboto), Roboto, sans-serif",
    openSans: "var(--font-open-sans), 'Open Sans', sans-serif",
    notoSans: "var(--font-noto-sans), 'Noto Sans', sans-serif",
    montserrat: "var(--font-montserrat), Montserrat, sans-serif",
    lato: "var(--font-lato), Lato, sans-serif",
    poppins: "var(--font-poppins), Poppins, sans-serif",
    robotoCondensed: "var(--font-roboto-condensed), 'Roboto Condensed', sans-serif",
    sourceSans3: "var(--font-source-sans-3), 'Source Sans 3', sans-serif",
    oswald: "var(--font-oswald), Oswald, sans-serif",
    raleway: "var(--font-raleway), Raleway, sans-serif",
  };
  return {
    '--editor-font': fonts[s.fontFamily] || fonts.system,
    '--editor-font-size': `${s.fontSize}px`,
    '--editor-line-height': String(s.lineHeight),
    '--editor-p-spacing': `${s.paragraphSpacing}px`,
  };
}

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  narrowEditor: boolean;
  onToggleNarrow: () => void;
  paletteId: string;
  onPaletteChange: (id: string) => void;
}

function currentResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export default function EditorSettingsPanel({ settings, onChange, narrowEditor, onToggleNarrow, paletteId, onPaletteChange }: Props) {
  const t = useTranslations('editorSettings');
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Track which variant of each palette to preview — swatches should match
  // what the user will actually see right now. Re-reads on `themechange` so
  // the swatches flip live when the user toggles light/dark.
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');
  useEffect(() => {
    setResolvedTheme(currentResolvedTheme());
    const onThemeChange = () => setResolvedTheme(currentResolvedTheme());
    window.addEventListener('themechange', onThemeChange);
    return () => window.removeEventListener('themechange', onThemeChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    onChange(next);
    saveSettings(next);
  };

  const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button onClick={onToggle}
      className={`w-8 h-[18px] rounded-full transition-colors relative ${on ? 'bg-accent' : 'bg-[var(--border)]'}`}>
      <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all
        ${on ? 'left-[16px]' : 'left-[2px]'}`} />
    </button>
  );

  const labelClass = 'text-xs text-muted';
  const selectClass = 'bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-text outline-none';
  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <kbd className="ml-2 text-[10px] tracking-wide opacity-60 font-sans">{children}</kbd>
  );

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t('trigger')}
        className={`relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
          ${open ? 'text-accent bg-[var(--panel-2)]' : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {!open && <Tooltip label={t('trigger')} align="end" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[280px] bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-lg z-30 py-3 px-4 space-y-3 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-accent font-semibold">{t('sectionAppearance')}</div>
            <button
              type="button"
              onClick={() => {
                applyPalette(DEFAULT_PALETTE_ID, currentResolvedTheme());
                onPaletteChange(DEFAULT_PALETTE_ID);
              }}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--panel-2)] text-muted hover:text-text hover:border-[var(--border-strong)] transition-colors"
            >
              {t('reset')}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className={labelClass}>{t('colorPalette')}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {PALETTES.filter(p => p.id !== DEFAULT_PALETTE_ID).map(p => {
                const tokens = p[resolvedTheme];
                const selected = p.id === paletteId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      applyPalette(p.id, currentResolvedTheme());
                      onPaletteChange(p.id);
                    }}
                    className={`flex flex-col items-start gap-1 p-1.5 rounded-md border text-left transition-colors
                      ${selected
                        ? 'border-accent bg-[var(--panel-2)]'
                        : 'border-[var(--border)] hover:bg-[var(--panel-2)]'}`}
                    aria-pressed={selected}
                  >
                    <div className="flex gap-[2px] w-full">
                      <span className="flex-1 h-4 rounded-sm" style={{ background: tokens.bg, border: `1px solid ${tokens.border}` }} />
                      <span className="flex-1 h-4 rounded-sm" style={{ background: tokens.panel, border: `1px solid ${tokens.border}` }} />
                      <span className="flex-1 h-4 rounded-sm" style={{ background: tokens.accent }} />
                      <span className="flex-1 h-4 rounded-sm" style={{ background: tokens.text }} />
                    </div>
                    <span className="text-[11px] text-text truncate w-full">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[10px] uppercase tracking-wide text-accent font-semibold">{t('sectionTypography')}</div>
            <button
              type="button"
              onClick={() => update({
                fontFamily: DEFAULT_SETTINGS.fontFamily,
                fontSize: DEFAULT_SETTINGS.fontSize,
                lineHeight: DEFAULT_SETTINGS.lineHeight,
                paragraphSpacing: DEFAULT_SETTINGS.paragraphSpacing,
              })}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--panel-2)] text-muted hover:text-text hover:border-[var(--border-strong)] transition-colors"
            >
              {t('reset')}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('font')}</span>
            <select value={settings.fontFamily} onChange={e => update({ fontFamily: e.target.value as Settings['fontFamily'] })} className={selectClass}>
              <option value="system">{t('fontSystem')}</option>
              <option value="serif">{t('fontSerif')}</option>
              <option value="mono">{t('fontMono')}</option>
              <option value="roboto">Roboto</option>
              <option value="openSans">Open Sans</option>
              <option value="notoSans">Noto Sans</option>
              <option value="montserrat">Montserrat</option>
              <option value="lato">Lato</option>
              <option value="poppins">Poppins</option>
              <option value="robotoCondensed">Roboto Condensed</option>
              <option value="sourceSans3">Source Sans 3</option>
              <option value="oswald">Oswald</option>
              <option value="raleway">Raleway</option>
              <option value="sourceCodePro">Source Code Pro</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('fontSize')}</span>
            <select value={settings.fontSize} onChange={e => update({ fontSize: Number(e.target.value) })} className={selectClass}>
              {[13, 14, 15, 16, 18, 20].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="text-[10px] uppercase tracking-wide text-accent font-semibold pt-1">{t('sectionEditor')}</div>

          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('focusedWidth')}<Kbd>⇧⌘M</Kbd></span>
            <Toggle on={narrowEditor} onToggle={onToggleNarrow} />
          </div>

          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('spellCheck')}<Kbd>⇧⌘S</Kbd></span>
            <Toggle on={settings.spellCheck} onToggle={() => update({ spellCheck: !settings.spellCheck })} />
          </div>

          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('tableOfContents')}<Kbd>⇧⌘O</Kbd></span>
            <Toggle on={settings.showToc} onToggle={() => update({ showToc: !settings.showToc })} />
          </div>

          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('focusMode')}<Kbd>⇧⌘F</Kbd></span>
            <Toggle on={settings.focusMode} onToggle={() => update({ focusMode: !settings.focusMode })} />
          </div>

          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('typewriterMode')}<Kbd>⇧⌘T</Kbd></span>
            <Toggle on={settings.typewriterMode} onToggle={() => update({ typewriterMode: !settings.typewriterMode })} />
          </div>

          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('wordCount')}<Kbd>⇧⌘Y</Kbd></span>
            <Toggle on={settings.showWordCount} onToggle={() => update({ showWordCount: !settings.showWordCount })} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={labelClass}>{t('lineHeight')}</span>
              <span className="text-[10px] text-muted tabular-nums">{settings.lineHeight.toFixed(1)}</span>
            </div>
            <input type="range" min="1.2" max="2.4" step="0.1" value={settings.lineHeight}
              onChange={e => update({ lineHeight: Number(e.target.value) })}
              className="w-full h-1 accent-accent" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={labelClass}>{t('paragraphSpacing')}</span>
              <span className="text-[10px] text-muted tabular-nums">{settings.paragraphSpacing}px</span>
            </div>
            <input type="range" min="0" max="12" step="1" value={settings.paragraphSpacing}
              onChange={e => update({ paragraphSpacing: Number(e.target.value) })}
              className="w-full h-1 accent-accent" />
          </div>
        </div>
      )}
    </div>
  );
}
