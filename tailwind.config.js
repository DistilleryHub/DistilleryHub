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
        // Wired to the live CSS custom properties from styles.css /
        // ThemeContext.jsx (--bg-rgb, --card-bg-rgb, etc.), NOT hardcoded
        // hex. Previously these were fixed to the navy-dark palette, so
        // any component using e.g. `bg-navy-card` or `text-brand` (BottomNav,
        // TopBar, MainLayout, PostCard, Videos, App) stayed navy-dark
        // forever no matter which theme was picked in Settings — that was
        // the permanent theme-color bug. The `rgb(var(...) / <alpha-value>)`
        // form is what lets Tailwind's opacity modifiers (e.g. `/95`, `/10`)
        // keep working on top of a variable color.
        navy: {
          bg: 'rgb(var(--bg-rgb) / <alpha-value>)',
          card: 'rgb(var(--card-bg-rgb) / <alpha-value>)',
          cardAlt: 'rgb(var(--card-hover-rgb) / <alpha-value>)',
          border: 'rgb(var(--border-rgb) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--primary-rgb) / <alpha-value>)',
          hover: 'var(--primary-hover)',
          soft: 'var(--primary-soft)',
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
