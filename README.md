SemDiff
========

Quickstart
- Install deps: `pnpm install`
- Run dev: `pnpm dev`

Backend API (optional)
- Requires Python 3.11+.
- Install: `pip install -r server/requirements.txt`
- Run: `make run` (serves on http://localhost:8000, OpenAPI at http://localhost:8000/api/docs)
- Docker: `make run-docker`

Routes
- `/` Home
- `/student/:id`
- `/dashboard`
- `/settings`

Notes
- Tailwind is configured via `tailwind.config.js`, styles in `src/index.css`.
- Basic PWA: `public/manifest.webmanifest` and `public/sw.js` with registration in `src/main.tsx`.
- State store: `src/store/search.ts` (Zustand), DB: `src/db.ts` (Dexie), i18n: `src/i18n.ts`.
