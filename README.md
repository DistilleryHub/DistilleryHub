# DistilleryHub — DistilleryHub (Phase 0: Setup)

Ye purane `index.html` (5000+ lines, vanilla JS) app ka **React + Vite** skeleton hai. Ab sirf structure/navigation ready hai — har feature page ek placeholder hai jo apne apne phase mein migrate hoga.

## Migration plan

- **Phase 0 (ye)** — Project setup, Firebase connect, routing, GitHub Pages deploy
- **Phase 1** — Auth (login/signup)
- **Phase 2** — Feed, Profile/Sidebar, Network/Connections
- **Phase 3** — Jobs, Articles, Marketplace, Videos, Files, Learning, Notifications
- **Phase 4** — Chat/Messaging, WebRTC audio-video calls, Admin reports

Har phase alag se, chhote steps mein karenge — taaki purana app tab tak live rahe.

## Local me chalane ke liye

Node.js (v18+) installed hona chahiye. Phir:
Ye local dev server chalu karega (usually http://localhost:5173) jaha browser me live changes dikhenge.

## Production build
Isse `dist/` folder banega jisme final static files hongi.

## GitHub Pages par deploy

`.github/workflows/deploy.yml` already setup hai — jab bhi `main` branch par push karoge, GitHub Actions automatically build karke Pages par deploy kar dega.

Ek baar ka setup GitHub par:
1. Repo → Settings → Pages
2. "Build and deployment" → Source → **GitHub Actions** select karo (Branch wala option nahi)

**Important — base path check karo:** `vite.config.js` me `base: '/'` set hai. Agar aapki site `https://username.github.io/distilleryhub/` jaisi URL (project page) pe hai to `/distilleryhub/` karna hoga. Agar custom domain hai ya `<username>.github.io` naam wala hi repo hai, to `/` hi sahi hai.

## Firebase

`src/firebase.js` me wahi config hai jo purane `index.html` me tha — kuch change nahi kiya gaya. Isi liye `auth`, `db`, `storage` poore app me import honge.

## File structure
## Progress

- **Phase 0** — Project setup ✅
- **Phase 1** — Auth ✅
- **Phase 2** — Feed, Network/Connections ✅
- **Phase 3** — Jobs, Articles, Marketplace, Videos, Files, Learning, Notifications ✅
- **Phase 4** — Chat/Messaging, WebRTC, Admin ✅

Sab phases migrate ho chuke hain 🎉
