// Color palette presets.
//
// Each palette provides a full set of design tokens for BOTH dark and light
// modes. Selecting a palette is orthogonal to the light/dark toggle: the
// toggle decides which variant of the currently-selected palette to apply.
//
// The inline pre-hydrate script in layout.tsx reads the same PALETTES array
// so first paint and React stay in sync. DEFAULT palette colors must stay
// byte-identical to globals.css so existing users see no change.

export type PaletteTokens = {
  bg: string;
  panel: string;
  'panel-2': string;
  border: string;
  'border-strong': string;
  text: string;
  muted: string;
  good: string;
  bad: string;
  warn: string;
  accent: string;
  'accent-hover': string;
  'on-accent': string;
  'pill-buy-fg': string;
  'pill-buy-border': string;
  'pill-buy-bg': string;
  'pill-sell-fg': string;
  'pill-sell-border': string;
  'pill-sell-bg': string;
  'empty-cell-bg': string;
  'legend-no-trades': string;
  'color-scheme': 'dark' | 'light';
};

export type Palette = {
  id: string;
  name: string;
  dark: PaletteTokens;
  light: PaletteTokens;
};

export type ResolvedTheme = 'dark' | 'light';

export const STORAGE_KEY = 'notes-palette';
export const DEFAULT_PALETTE_ID = 'default';

export const PALETTES: Palette[] = [
  {
    id: 'default',
    name: 'Default',
    dark: {
      bg: '#0b0f17', panel: '#131a26', 'panel-2': '#1a2332',
      border: '#232e42', 'border-strong': '#2e3b54',
      text: '#e5ecf5', muted: '#8a99b3',
      good: '#22c55e', bad: '#ef4444', warn: '#f59e0b',
      accent: '#60a5fa', 'accent-hover': '#93c5fd', 'on-accent': '#0b0f17',
      'pill-buy-fg': '#93c5fd', 'pill-buy-border': '#1e3a8a', 'pill-buy-bg': 'rgba(30, 58, 138, .25)',
      'pill-sell-fg': '#fca5a5', 'pill-sell-border': '#7f1d1d', 'pill-sell-bg': 'rgba(127, 29, 29, .25)',
      'empty-cell-bg': 'rgba(255, 255, 255, .02)', 'legend-no-trades': 'rgba(255, 255, 255, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#f6f8fb', panel: '#ffffff', 'panel-2': '#eef2f7',
      border: '#d6deea', 'border-strong': '#b6c2d4',
      text: '#1a2332', muted: '#5b6577',
      good: '#15803d', bad: '#b91c1c', warn: '#b45309',
      accent: '#2563eb', 'accent-hover': '#1d4ed8', 'on-accent': '#ffffff',
      'pill-buy-fg': '#1d4ed8', 'pill-buy-border': '#93c5fd', 'pill-buy-bg': 'rgba(37, 99, 235, .10)',
      'pill-sell-fg': '#b91c1c', 'pill-sell-border': '#fca5a5', 'pill-sell-bg': 'rgba(220, 38, 38, .10)',
      'empty-cell-bg': 'rgba(0, 0, 0, .03)', 'legend-no-trades': 'rgba(0, 0, 0, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    dark: {
      bg: '#002b36', panel: '#073642', 'panel-2': '#0a3c49',
      border: '#0e4451', 'border-strong': '#586e75',
      text: '#eee8d5', muted: '#839496',
      good: '#859900', bad: '#dc322f', warn: '#b58900',
      accent: '#268bd2', 'accent-hover': '#2aa198', 'on-accent': '#fdf6e3',
      'pill-buy-fg': '#268bd2', 'pill-buy-border': '#1a5478', 'pill-buy-bg': 'rgba(38, 139, 210, .18)',
      'pill-sell-fg': '#dc322f', 'pill-sell-border': '#8b1e1c', 'pill-sell-bg': 'rgba(220, 50, 47, .18)',
      'empty-cell-bg': 'rgba(238, 232, 213, .03)', 'legend-no-trades': 'rgba(238, 232, 213, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#fdf6e3', panel: '#ffffff', 'panel-2': '#eee8d5',
      border: '#e4dcc0', 'border-strong': '#93a1a1',
      text: '#073642', muted: '#657b83',
      good: '#859900', bad: '#dc322f', warn: '#b58900',
      accent: '#268bd2', 'accent-hover': '#2aa198', 'on-accent': '#ffffff',
      'pill-buy-fg': '#1a5478', 'pill-buy-border': '#86b9dc', 'pill-buy-bg': 'rgba(38, 139, 210, .10)',
      'pill-sell-fg': '#b3281f', 'pill-sell-border': '#e8a9a6', 'pill-sell-bg': 'rgba(220, 50, 47, .10)',
      'empty-cell-bg': 'rgba(7, 54, 66, .03)', 'legend-no-trades': 'rgba(7, 54, 66, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    dark: {
      bg: '#282a36', panel: '#21222c', 'panel-2': '#343746',
      border: '#44475a', 'border-strong': '#6272a4',
      text: '#f8f8f2', muted: '#6272a4',
      good: '#50fa7b', bad: '#ff5555', warn: '#f1fa8c',
      accent: '#bd93f9', 'accent-hover': '#ff79c6', 'on-accent': '#282a36',
      'pill-buy-fg': '#bd93f9', 'pill-buy-border': '#6f4bc6', 'pill-buy-bg': 'rgba(189, 147, 249, .18)',
      'pill-sell-fg': '#ff5555', 'pill-sell-border': '#a12828', 'pill-sell-bg': 'rgba(255, 85, 85, .18)',
      'empty-cell-bg': 'rgba(248, 248, 242, .03)', 'legend-no-trades': 'rgba(248, 248, 242, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#f8f8f2', panel: '#ffffff', 'panel-2': '#ecebf3',
      border: '#ddd9eb', 'border-strong': '#b8b5c9',
      text: '#282a36', muted: '#6272a4',
      good: '#00a060', bad: '#c53030', warn: '#b7791f',
      accent: '#6f42c1', 'accent-hover': '#8a5bd7', 'on-accent': '#ffffff',
      'pill-buy-fg': '#6f42c1', 'pill-buy-border': '#c5b3e4', 'pill-buy-bg': 'rgba(111, 66, 193, .10)',
      'pill-sell-fg': '#c53030', 'pill-sell-border': '#eab0b0', 'pill-sell-bg': 'rgba(197, 48, 48, .10)',
      'empty-cell-bg': 'rgba(40, 42, 54, .03)', 'legend-no-trades': 'rgba(40, 42, 54, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    dark: {
      bg: '#2e3440', panel: '#3b4252', 'panel-2': '#434c5e',
      border: '#434c5e', 'border-strong': '#4c566a',
      text: '#eceff4', muted: '#7b88a1',
      good: '#a3be8c', bad: '#bf616a', warn: '#ebcb8b',
      accent: '#88c0d0', 'accent-hover': '#8fbcbb', 'on-accent': '#2e3440',
      'pill-buy-fg': '#88c0d0', 'pill-buy-border': '#4c7890', 'pill-buy-bg': 'rgba(136, 192, 208, .18)',
      'pill-sell-fg': '#bf616a', 'pill-sell-border': '#7a3c42', 'pill-sell-bg': 'rgba(191, 97, 106, .18)',
      'empty-cell-bg': 'rgba(236, 239, 244, .03)', 'legend-no-trades': 'rgba(236, 239, 244, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#eceff4', panel: '#ffffff', 'panel-2': '#e5e9f0',
      border: '#d8dee9', 'border-strong': '#aeb7c6',
      text: '#2e3440', muted: '#4c566a',
      good: '#4a7c3a', bad: '#a3303a', warn: '#b5851d',
      accent: '#5e81ac', 'accent-hover': '#81a1c1', 'on-accent': '#ffffff',
      'pill-buy-fg': '#5e81ac', 'pill-buy-border': '#b0c1d8', 'pill-buy-bg': 'rgba(94, 129, 172, .10)',
      'pill-sell-fg': '#a3303a', 'pill-sell-border': '#e0a8ae', 'pill-sell-bg': 'rgba(163, 48, 58, .10)',
      'empty-cell-bg': 'rgba(46, 52, 64, .03)', 'legend-no-trades': 'rgba(46, 52, 64, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    dark: {
      bg: '#282828', panel: '#32302f', 'panel-2': '#3c3836',
      border: '#3c3836', 'border-strong': '#504945',
      text: '#ebdbb2', muted: '#a89984',
      good: '#b8bb26', bad: '#fb4934', warn: '#fabd2f',
      accent: '#fe8019', 'accent-hover': '#d65d0e', 'on-accent': '#282828',
      'pill-buy-fg': '#fabd2f', 'pill-buy-border': '#8d6d1b', 'pill-buy-bg': 'rgba(250, 189, 47, .18)',
      'pill-sell-fg': '#fb4934', 'pill-sell-border': '#9d2b1f', 'pill-sell-bg': 'rgba(251, 73, 52, .18)',
      'empty-cell-bg': 'rgba(235, 219, 178, .03)', 'legend-no-trades': 'rgba(235, 219, 178, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#fbf1c7', panel: '#f9f5d7', 'panel-2': '#ebdbb2',
      border: '#e0d0a9', 'border-strong': '#bdae8a',
      text: '#3c3836', muted: '#7c6f64',
      good: '#79740e', bad: '#9d0006', warn: '#b57614',
      accent: '#af3a03', 'accent-hover': '#d65d0e', 'on-accent': '#fbf1c7',
      'pill-buy-fg': '#b57614', 'pill-buy-border': '#e0c48a', 'pill-buy-bg': 'rgba(181, 118, 20, .10)',
      'pill-sell-fg': '#9d0006', 'pill-sell-border': '#e0a5a5', 'pill-sell-bg': 'rgba(157, 0, 6, .10)',
      'empty-cell-bg': 'rgba(60, 56, 54, .03)', 'legend-no-trades': 'rgba(60, 56, 54, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    dark: {
      bg: '#272822', panel: '#2d2e27', 'panel-2': '#3e3d32',
      border: '#3e3d32', 'border-strong': '#75715e',
      text: '#f8f8f2', muted: '#75715e',
      good: '#a6e22e', bad: '#f92672', warn: '#fd971f',
      accent: '#66d9ef', 'accent-hover': '#a1efe4', 'on-accent': '#272822',
      'pill-buy-fg': '#66d9ef', 'pill-buy-border': '#2a88a0', 'pill-buy-bg': 'rgba(102, 217, 239, .18)',
      'pill-sell-fg': '#f92672', 'pill-sell-border': '#991848', 'pill-sell-bg': 'rgba(249, 38, 114, .18)',
      'empty-cell-bg': 'rgba(248, 248, 242, .03)', 'legend-no-trades': 'rgba(248, 248, 242, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#fafafa', panel: '#ffffff', 'panel-2': '#f0f0f0',
      border: '#e0e0e0', 'border-strong': '#bdbdbd',
      text: '#272822', muted: '#75715e',
      good: '#4d9b00', bad: '#d8125f', warn: '#d17308',
      accent: '#1897b1', 'accent-hover': '#2aa3bd', 'on-accent': '#ffffff',
      'pill-buy-fg': '#1897b1', 'pill-buy-border': '#9cd7e2', 'pill-buy-bg': 'rgba(24, 151, 177, .10)',
      'pill-sell-fg': '#d8125f', 'pill-sell-border': '#efa8c0', 'pill-sell-bg': 'rgba(216, 18, 95, .10)',
      'empty-cell-bg': 'rgba(39, 40, 34, .03)', 'legend-no-trades': 'rgba(39, 40, 34, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'one',
    name: 'One',
    dark: {
      bg: '#282c34', panel: '#21252b', 'panel-2': '#2c313a',
      border: '#3e4451', 'border-strong': '#5c6370',
      text: '#abb2bf', muted: '#5c6370',
      good: '#98c379', bad: '#e06c75', warn: '#e5c07b',
      accent: '#61afef', 'accent-hover': '#56b6c2', 'on-accent': '#282c34',
      'pill-buy-fg': '#61afef', 'pill-buy-border': '#2e6d9f', 'pill-buy-bg': 'rgba(97, 175, 239, .18)',
      'pill-sell-fg': '#e06c75', 'pill-sell-border': '#8c3d43', 'pill-sell-bg': 'rgba(224, 108, 117, .18)',
      'empty-cell-bg': 'rgba(171, 178, 191, .03)', 'legend-no-trades': 'rgba(171, 178, 191, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#fafafa', panel: '#ffffff', 'panel-2': '#f0f0f1',
      border: '#e1e1e3', 'border-strong': '#a0a1a7',
      text: '#383a42', muted: '#a0a1a7',
      good: '#50a14f', bad: '#e45649', warn: '#c18401',
      accent: '#4078f2', 'accent-hover': '#0184bc', 'on-accent': '#ffffff',
      'pill-buy-fg': '#4078f2', 'pill-buy-border': '#a8bef7', 'pill-buy-bg': 'rgba(64, 120, 242, .10)',
      'pill-sell-fg': '#e45649', 'pill-sell-border': '#f3aba4', 'pill-sell-bg': 'rgba(228, 86, 73, .10)',
      'empty-cell-bg': 'rgba(56, 58, 66, .03)', 'legend-no-trades': 'rgba(56, 58, 66, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    dark: {
      bg: '#1a1b26', panel: '#1f2335', 'panel-2': '#24283b',
      border: '#2f3549', 'border-strong': '#414868',
      text: '#c0caf5', muted: '#9aa5ce',
      good: '#9ece6a', bad: '#f7768e', warn: '#e0af68',
      accent: '#7aa2f7', 'accent-hover': '#bb9af7', 'on-accent': '#1a1b26',
      'pill-buy-fg': '#7aa2f7', 'pill-buy-border': '#3d5a97', 'pill-buy-bg': 'rgba(122, 162, 247, .18)',
      'pill-sell-fg': '#f7768e', 'pill-sell-border': '#993e4e', 'pill-sell-bg': 'rgba(247, 118, 142, .18)',
      'empty-cell-bg': 'rgba(192, 202, 245, .03)', 'legend-no-trades': 'rgba(192, 202, 245, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#e1e2e7', panel: '#eaeaee', 'panel-2': '#cbccd1',
      border: '#b6b8c4', 'border-strong': '#6172b0',
      text: '#343b58', muted: '#565a6e',
      good: '#385f0d', bad: '#8c4351', warn: '#8f5e15',
      accent: '#34548a', 'accent-hover': '#5a4a78', 'on-accent': '#ffffff',
      'pill-buy-fg': '#34548a', 'pill-buy-border': '#a3b2cc', 'pill-buy-bg': 'rgba(52, 84, 138, .10)',
      'pill-sell-fg': '#8c4351', 'pill-sell-border': '#d4a8b1', 'pill-sell-bg': 'rgba(140, 67, 81, .10)',
      'empty-cell-bg': 'rgba(52, 59, 88, .03)', 'legend-no-trades': 'rgba(52, 59, 88, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    dark: {
      bg: '#1e1e2e', panel: '#181825', 'panel-2': '#313244',
      border: '#313244', 'border-strong': '#45475a',
      text: '#cdd6f4', muted: '#a6adc8',
      good: '#a6e3a1', bad: '#f38ba8', warn: '#f9e2af',
      accent: '#cba6f7', 'accent-hover': '#f5c2e7', 'on-accent': '#1e1e2e',
      'pill-buy-fg': '#cba6f7', 'pill-buy-border': '#7f5bb8', 'pill-buy-bg': 'rgba(203, 166, 247, .18)',
      'pill-sell-fg': '#f38ba8', 'pill-sell-border': '#984a5f', 'pill-sell-bg': 'rgba(243, 139, 168, .18)',
      'empty-cell-bg': 'rgba(205, 214, 244, .03)', 'legend-no-trades': 'rgba(205, 214, 244, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#eff1f5', panel: '#ffffff', 'panel-2': '#e6e9ef',
      border: '#ccd0da', 'border-strong': '#acb0be',
      text: '#4c4f69', muted: '#6c6f85',
      good: '#40a02b', bad: '#d20f39', warn: '#df8e1d',
      accent: '#8839ef', 'accent-hover': '#ea76cb', 'on-accent': '#ffffff',
      'pill-buy-fg': '#8839ef', 'pill-buy-border': '#c8a8f7', 'pill-buy-bg': 'rgba(136, 57, 239, .10)',
      'pill-sell-fg': '#d20f39', 'pill-sell-border': '#eba1b3', 'pill-sell-bg': 'rgba(210, 15, 57, .10)',
      'empty-cell-bg': 'rgba(76, 79, 105, .03)', 'legend-no-trades': 'rgba(76, 79, 105, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    dark: {
      bg: '#0d1117', panel: '#161b22', 'panel-2': '#21262d',
      border: '#30363d', 'border-strong': '#484f58',
      text: '#c9d1d9', muted: '#8b949e',
      good: '#3fb950', bad: '#f85149', warn: '#d29922',
      accent: '#58a6ff', 'accent-hover': '#79c0ff', 'on-accent': '#0d1117',
      'pill-buy-fg': '#58a6ff', 'pill-buy-border': '#1f4b82', 'pill-buy-bg': 'rgba(88, 166, 255, .18)',
      'pill-sell-fg': '#f85149', 'pill-sell-border': '#982b27', 'pill-sell-bg': 'rgba(248, 81, 73, .18)',
      'empty-cell-bg': 'rgba(201, 209, 217, .03)', 'legend-no-trades': 'rgba(201, 209, 217, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#ffffff', panel: '#f6f8fa', 'panel-2': '#eaeef2',
      border: '#d0d7de', 'border-strong': '#afb8c1',
      text: '#1f2328', muted: '#59636e',
      good: '#1a7f37', bad: '#cf222e', warn: '#9a6700',
      accent: '#0969da', 'accent-hover': '#0550ae', 'on-accent': '#ffffff',
      'pill-buy-fg': '#0969da', 'pill-buy-border': '#a8c5ec', 'pill-buy-bg': 'rgba(9, 105, 218, .10)',
      'pill-sell-fg': '#cf222e', 'pill-sell-border': '#ebaaaf', 'pill-sell-bg': 'rgba(207, 34, 46, .10)',
      'empty-cell-bg': 'rgba(31, 35, 40, .03)', 'legend-no-trades': 'rgba(31, 35, 40, .08)',
      'color-scheme': 'light',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    dark: {
      bg: '#191724', panel: '#1f1d2e', 'panel-2': '#26233a',
      border: '#26233a', 'border-strong': '#6e6a86',
      text: '#e0def4', muted: '#908caa',
      good: '#9ccfd8', bad: '#eb6f92', warn: '#f6c177',
      accent: '#c4a7e7', 'accent-hover': '#ebbcba', 'on-accent': '#191724',
      'pill-buy-fg': '#c4a7e7', 'pill-buy-border': '#7c5aa8', 'pill-buy-bg': 'rgba(196, 167, 231, .18)',
      'pill-sell-fg': '#eb6f92', 'pill-sell-border': '#993e57', 'pill-sell-bg': 'rgba(235, 111, 146, .18)',
      'empty-cell-bg': 'rgba(224, 222, 244, .03)', 'legend-no-trades': 'rgba(224, 222, 244, .10)',
      'color-scheme': 'dark',
    },
    light: {
      bg: '#faf4ed', panel: '#fffaf3', 'panel-2': '#f2e9e1',
      border: '#dfdad9', 'border-strong': '#9893a5',
      text: '#575279', muted: '#797593',
      good: '#56949f', bad: '#b4637a', warn: '#ea9d34',
      accent: '#907aa9', 'accent-hover': '#d7827e', 'on-accent': '#ffffff',
      'pill-buy-fg': '#907aa9', 'pill-buy-border': '#cec0dc', 'pill-buy-bg': 'rgba(144, 122, 169, .10)',
      'pill-sell-fg': '#b4637a', 'pill-sell-border': '#e0b6c1', 'pill-sell-bg': 'rgba(180, 99, 122, .10)',
      'empty-cell-bg': 'rgba(87, 82, 121, .03)', 'legend-no-trades': 'rgba(87, 82, 121, .08)',
      'color-scheme': 'light',
    },
  },
];

export function readStoredPaletteId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_PALETTE_ID;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && PALETTES.some(p => p.id === v)) return v;
  } catch { /* ignore */ }
  return DEFAULT_PALETTE_ID;
}

export function findPalette(id: string): Palette {
  return PALETTES.find(p => p.id === id) ?? PALETTES[0];
}

/**
 * Apply a palette's tokens as CSS custom properties on <html>. `resolved`
 * is the current light/dark mode; each palette defines both. Persists the
 * palette id and dispatches `palettechange` so listeners (React state in
 * page.tsx, swatch previews in EditorSettings) can sync.
 */
export function applyPalette(id: string, resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const palette = findPalette(id);
  const tokens = palette[resolved];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--${k}`, v);
  }
  root.setAttribute('data-palette', palette.id);
  try {
    if (palette.id === DEFAULT_PALETTE_ID) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, palette.id);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('palettechange', { detail: { id: palette.id, theme: resolved } }));
}
