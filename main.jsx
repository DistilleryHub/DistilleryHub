import React from 'react';
// Applied synchronously before first paint so there's no flash of the
// wrong theme/accent/layout while React boots up.
const VALID_THEMES = ['navy-dark', 'light', 'distillery-green', 'amber-dark'];
let savedTheme = localStorage.getItem('dh-theme') || 'navy-dark';
if (savedTheme === 'dark') savedTheme = 'navy-dark'; // migrate pre-4-theme installs
if (!VALID_THEMES.includes(savedTheme)) savedTheme = 'navy-dark';
document.documentElement.setAttribute('data-theme', savedTheme);
const savedAccent = localStorage.getItem('dh-accent');
if (savedAccent) {
  document.documentElement.style.setProperty('--primary', savedAccent);
  // Also seed the RGB-triplet var Tailwind's `brand` color depends on
  // (see tailwind.config.js), so the very first paint already matches —
  // without this, bg-brand/text-brand would flash the theme's default
  // accent for a frame before ThemeContext's effect catches up.
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(savedAccent);
  if (m) {
    document.documentElement.style.setProperty(
      '--primary-rgb',
      `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`
    );
  }
}
const savedCompact = localStorage.getItem('dh-compact') === '1';
if (savedCompact) document.documentElement.style.setProperty('--radius', '10px');
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { ThemeProvider } from './ThemeContext.jsx';
import { LanguageProvider } from './LanguageContext.jsx';
import { NotificationProvider } from './src/context/NotificationContext.jsx';
import './styles.css';
import './tailwind.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <LanguageProvider>
            <ToastProvider>
              <AuthProvider>
                <NotificationProvider>
                  <App />
                </NotificationProvider>
              </AuthProvider>
            </ToastProvider>
          </LanguageProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
