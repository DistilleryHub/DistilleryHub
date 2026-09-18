import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

const THEME_KEY = 'dh-theme';     // 'navy-dark' | 'light' | 'distillery-green' | 'amber-dark'
const ACCENT_KEY = 'dh-accent';   // hex color override, layered on top of the active theme
const COMPACT_KEY = 'dh-compact'; // '1' | '0'

// The 4 supported themes. `swatch` is used purely for the picker UI preview
// in Settings.jsx (bg / card / accent dots) — it is NOT injected into CSS,
// the real colors live in styles.css under [data-theme="..."].
export const THEMES = [
  {
    id: 'navy-dark',
    label: 'Navy Dark',
    swatch: { bg: '#0b1325', card: '#131e36', accent: '#4f7fff' },
  },
  {
    id: 'light',
    label: 'Light',
    swatch: { bg: '#f4f2ee', card: '#ffffff', accent: '#0369a1' },
  },
  {
    id: 'distillery-green',
    label: 'Distillery Green',
    swatch: { bg: '#071a14', card: '#0f2e23', accent: '#10b981' },
  },
  {
    id: 'amber-dark',
    label: 'Amber Dark',
    swatch: { bg: '#1a1508', card: '#262015', accent: '#f59e0b' },
  },
];

const VALID_THEME_IDS = THEMES.map((t) => t.id);
const DEFAULT_THEME = 'navy-dark';

export const ACCENT_COLORS = [
  { key: 'blue', value: '#4f7fff', label: 'Blue' },
  { key: 'teal', value: '#0ea5a4', label: 'Teal' },
  { key: 'green', value: '#22c55e', label: 'Green' },
  { key: 'orange', value: '#f97316', label: 'Orange' },
  { key: 'purple', value: '#a855f7', label: 'Purple' },
  { key: 'pink', value: '#ec4899', label: 'Pink' },
];

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : '79, 127, 255';
}

// Space-separated variant (no commas) — required by Tailwind's
// `rgb(var(--x-rgb) / <alpha-value>)` color syntax (see tailwind.config.js).
function hexToRgbSpace(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : '79 127 255';
}

// Old installs may still have 'dark' or 'light' saved from before the
// 4-theme system shipped. Migrate 'dark' -> 'navy-dark' transparently so
// nobody's saved preference silently breaks or resets.
function normalizeThemeId(raw) {
  if (raw === 'dark') return 'navy-dark';
  if (VALID_THEME_IDS.includes(raw)) return raw;
  return DEFAULT_THEME;
}

function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const preset = THEMES.find((t) => t.id === themeId);
    meta.setAttribute('content', preset ? preset.swatch.bg : '#0b1325');
  }
}

function applyAccent(hex) {
  if (!hex) return;
  document.documentElement.style.setProperty('--primary', hex);
  document.documentElement.style.setProperty('--primary-hover', hex);
  document.documentElement.style.setProperty('--primary-soft', `rgba(${hexToRgb(hex)}, 0.12)`);
  // Keep the RGB-triplet var in sync too, or Tailwind's `brand` color
  // (rgb(var(--primary-rgb) / <alpha-value>)) would silently keep showing
  // the previous/theme-default accent after a custom one is picked.
  document.documentElement.style.setProperty('--primary-rgb', hexToRgbSpace(hex));
}

function applyCompact(isCompact) {
  document.documentElement.style.setProperty('--radius', isCompact ? '10px' : '14px');
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => normalizeThemeId(localStorage.getItem(THEME_KEY)));
  const [accent, setAccentState] = useState(() => localStorage.getItem(ACCENT_KEY) || '');
  const [compact, setCompactState] = useState(() => localStorage.getItem(COMPACT_KEY) === '1');

  useEffect(() => { applyTheme(theme); localStorage.setItem(THEME_KEY, theme); }, [theme]);
  useEffect(() => { if (accent) applyAccent(accent); localStorage.setItem(ACCENT_KEY, accent); }, [accent]);
  useEffect(() => { applyCompact(compact); localStorage.setItem(COMPACT_KEY, compact ? '1' : '0'); }, [compact]);

  function setTheme(id) {
    if (!VALID_THEME_IDS.includes(id)) {
      console.warn(`[ThemeContext] Unknown theme "${id}", ignoring.`);
      return;
    }
    setThemeState(id);
  }
  function setAccent(hex) { setAccentState(hex); }
  function setCompact(v) { setCompactState(!!v); }

  const value = { theme, setTheme, themes: THEMES, accent, setAccent, compact, setCompact, ACCENT_COLORS };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
