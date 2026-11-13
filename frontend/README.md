# SciProspect React frontend

Next.js App Router, React and strict TypeScript. FastAPI remains the only owner of
business logic, account permissions, sessions and stored websites.

## Run locally

Use Node 22.20 or later. Start FastAPI with the existing `run_web.bat` on port 8000.
Then, from this folder:

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:3000** (use the same hostname for both services).
This is the migration frontend. Port 8000 continues to serve the original UI.
Restart FastAPI once after this change to load `workspace_namespace` in `/api/auth/me`.
No password/token is saved in browser storage. Existing HttpOnly cookies are forwarded
to FastAPI; private responses are not cached.

Optional production build, when ready:

```powershell
npm run typecheck
npm test
npm run build
npm start
```

Copy `.env.example` to `.env.local` only if FastAPI runs somewhere else.
`FASTAPI_ORIGIN` is server-only; do not prefix it with `NEXT_PUBLIC_`.

## Migration boundary

React now owns sign-in, `/root/dashboard`, and `/{namespace}/scistudio`, including
website listing/search, conference creation, templates, the three-step brief and
website creation/deletion. The same palette and navigation patterns are retained.

Unmigrated routes are explicitly forwarded to FastAPI: the editor, preview,
collector, account management, public sites and assets. Links crossing this boundary
use full navigation. This is **not yet a complete rewrite of the editor**. The
fallback preserves its working functionality and saved data while the React editor
is implemented in the next stage. Avoid deleting `web/static`.

`features/studio/document.ts` defines the versioned boundary for that next stage;
it is tested but is not yet used to rewrite or migrate production website records.
Unknown components/settings survive conversion. The Python compiler remains the
authoritative preview/export renderer until parity is tested.

## Modules

- `src/app`: route composition and server session checks.
- `src/features/auth`: sign-in form.
- `src/features/admin`: root overview.
- `src/features/studio`: website workspace, brief, templates and document contract.
- `src/components`: shared accessible controls and SVG icons.
- `src/lib`: API transport, contracts and server-only session handling.
- `tests`: route safety, API transport and document compatibility.

See `../docs/react-migration-architecture.md` for the scale-up plan and release gates.
