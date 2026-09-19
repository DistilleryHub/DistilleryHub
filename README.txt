DistilleryHub — fixes in this batch
=====================================

1. Chat.jsx
   - Removed the stray `setShowManageGroup(false);` line inside the
     "reset per-chat UI state" useEffect. This function/state was never
     declared anywhere in the file and had no UI attached to it — calling
     it threw `ReferenceError: setShowManageGroup is not defined` every
     time a chat was opened, which crashed BOTH the Chat screen and the
     Calls screen (Calls lives inside Chat.jsx as a tab). This was the
     root cause of the "Kuch gadbad ho gayi" error screen.

2. styles.css
   - Fixed `.post-actions` (the Like / Comments / Share / Save row under
     each feed post) so the buttons stay on one line instead of wrapping
     onto two ("Share 0" breaking awkwardly). Buttons now shrink their
     padding/font first and ellipsize text as a last resort instead of
     wrapping.

3. MainLayout.jsx
   - The main content column was capped at max-w-2xl (672px) on every
     screen size, so on desktop browsers / a maximized PWA window the
     whole app rendered as a narrow strip with large empty margins on
     both sides. Added md:/lg:/xl: breakpoints so the column grows on
     wider viewports (up to ~1024px on large desktop) while staying the
     same comfortable width on phones. If you'd rather it go fully
     edge-to-edge with NO max width at all, remove `max-w-2xl` (and the
     md/lg/xl variants) from the <main> className entirely — happy to
     redo this file that way if you prefer.

How to apply
------------
Replace the same-named files in your GitHub repo with these three,
commit to main, wait ~1-2 min for the GitHub Pages / Cloudflare Pages
build to finish, then hard-refresh the site.
