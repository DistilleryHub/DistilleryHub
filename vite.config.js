import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cloudflare Pages automatically sets the CF_PAGES=1 environment variable
// during its build step — no manual config needed on the Cloudflare side.
// GitHub Actions does NOT set this, so the same codebase picks the right
// base path for whichever platform is building it:
//   - Cloudflare Pages (distilleryhub.pages.dev, served from domain root)
//     -> base '/'
//   - GitHub Pages (distilleryhub.github.io/DistilleryHub/, subfolder)
//     -> base '/DistilleryHub/'
export default defineConfig({
  plugins: [react()],
  base: process.env.CF_PAGES ? '/' : '/DistilleryHub/',
});
