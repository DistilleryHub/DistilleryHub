import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Repo is DistilleryHub/DistilleryHub, and no custom domain was visible on
// the repo page, so GitHub Pages serves this from
// https://distilleryhub.github.io/DistilleryHub/  — hence base set below.
// CONFIRM in your repo: Settings → Pages (shows the exact live URL) and check
// whether a CNAME file exists in the repo root (means a custom domain IS set).
// - Custom domain (CNAME file exists) → change base to '/'
// - No custom domain (this is the default) → keep base as '/DistilleryHub/'
export default defineConfig({
  plugins: [react()],
  base: '/',
});
