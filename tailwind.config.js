/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.jsx',
    './**/*.jsx',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // These all point at the CSS custom properties defined in
        // styles.css (:root / [data-theme="..."]) instead of fixed hex
        // values, so every Tailwind utility class below automatically
        // follows whichever of the 4 themes (navy-dark/light/distillery-green
        // /amber-dark) is active — previously these were hardcoded navy
        // hex values, so switching to the Light theme left the app shell
        // (TopBar, BottomNav, MainLayout) stuck dark while styles.css-driven
        // cards turned white, producing the "dark shell + white floating
        // cards, washed-out text" look.
        navy: {
          bg: 'var(--bg)',
          card: 'var(--card-bg)',
          cardAlt: 'var(--card-hover)',
          border: 'var(--border)',
        },
        brand: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          soft: 'var(--primary-soft)',
        },
        // Overriding these specific shades (rather than the whole Tailwind
        // slate scale) covers every text-slate-*/border-slate-*/bg-slate-*
        // class actually used in the app (TopBar, MainLayout, BottomNav,
        // PostCard, Videos) and makes them theme-aware too.
        slate: {
          100: 'var(--text)',
          200: 'var(--text)',
          300: 'var(--muted)',
          400: 'var(--muted)',
          500: 'var(--muted-2)',
          600: 'var(--muted-2)',
          700: 'var(--border)',
          800: 'var(--border)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      boxShadow: {
        card: '0 2px 10px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};
