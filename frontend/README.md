# SciProspect React frontend

Next.js App Router, React and strict TypeScript. FastAPI remains the only owner of
business logic, account permissions, sessions and stored websites.

## Run locally

Use Node 22.20 or later. Start FastAPI on port 8000 (`cd backend; python -m uvicorn app:app --port 8000`).
Then, from this folder:

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:3000** (use the same hostname for both services).
This is the only UI. Port 8000 serves the API only.
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

## Scope

React owns every page: the public website, sign-in, dashboards, billing, SciStudio
(editor, preview, publish, ZIP export) and the SciProspect collector. FastAPI owns
business logic, permissions, sessions and storage. The old built-in UI (`backend/static`)
and the desktop app were removed.

## Modules

- `src/app`: route composition and server session checks.
- `src/features/auth`: sign-in form.
- `src/features/admin`: root overview.
- `src/features/studio`: website workspace, brief, templates and document contract.
- `src/components`: shared accessible controls and SVG icons.
- `src/lib`: API transport, contracts and server-only session handling.
- `tests`: route safety, API transport and document compatibility.

See `../docs/react-migration-architecture.md` for the scale-up plan and release gates.
