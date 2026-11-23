# SciProspect & SciStudio Workspace

This repository contains the **SciProspect web app**: the SciProspect research-data collector and the
SciStudio no-code website builder. There is no desktop app; everything runs in the browser.

---

## 📁 Repository Structure

```text
researcher_tool/
├── frontend/                 # ⚛️ Next.js 16 + React 19 — the only UI (port 3000)
├── backend/                  # 🌐 FastAPI API (port 8000) — accounts, billing, SciStudio, collector
│   ├── app.py                # API routes
│   ├── collector_routes.py   # /api/collector (runs, contacts, export)
│   ├── collector_archive.py  # collector storage in PostgreSQL
│   ├── collector_sources/    # source scripts the collector runs (OpenAlex, PubMed, bioRxiv, NIH)
│   ├── migrations/           # SQL migrations, applied at startup
│   └── ...
├── tests/                    # Python tests
├── docs/                     # guides, roadmap, hand-off notes
└── requirements.txt
```

---

## 🚀 Quick Start

**Backend API (port 8000):**
```powershell
cd backend
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

**Frontend (port 3000):**
```powershell
cd frontend
npm run dev
```
- **App:** [http://127.0.0.1:3000](http://127.0.0.1:3000)
- **Backend API:** [http://127.0.0.1:8000/api](http://127.0.0.1:8000/api)
- **Administrator:** username `admin`; set `SCIPROSPECT_ROOT_PASS` before launch. There is no default password.

## Configuration and validation

Set environment variables in the same terminal that launches the app:

```powershell
$env:SCIPROSPECT_ROOT_PASS = '<choose-a-unique-password>'
.\run_web.bat
```

Cloud storage is optional. To enable it, set `SCIPROSPECT_DB_HOST`,
`SCIPROSPECT_DB_PORT`, `SCIPROSPECT_DB_NAME`, `SCIPROSPECT_DB_USER`, and
`SCIPROSPECT_DB_PASSWORD`. Without a host, local storage is used.
Environment variables must be set explicitly; `.env` files are not loaded automatically.
Previously embedded database credentials must be rotated on the database server.
Existing local account files are preserved. A saved legacy administrator password
is migrated to a secure hash on successful login. New installations require the
environment password.

Run regression checks with `python -m unittest discover -s tests`.
Frontend checks: `npm run typecheck` and `npm test` in `frontend/`.
