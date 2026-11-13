# SciProspect & SciStudio Workspace

This repository contains both the **Web Application & SciStudio** and the **Desktop Lead Prospecting Pipeline**.

---

## 📁 Repository Structure

```text
researcher_tool/
│
├── frontend/                      # ⚛️ Next.js 16 + React 19 Frontend (Single UI on Port 3000)
├── backend/                       # 🌐 FastAPI Backend API & Services (Port 8000)
│   ├── app.py                     # FastAPI web backend & API routes
│   ├── builder_manager.py         # SciStudio website engine & 15 templates
│   ├── license_manager.py         # Authentication, sessions & permissions
│   ├── licenses.json              # Client accounts & licenses database
│   ├── app_config.py              # Dynamic data folder configuration
│   └── static/                    # Static assets & standalone HTML renderer
├── app/                           # 💻 Desktop Application Suite
│   ├── main/                      # Production Lead Extraction Pipeline
│   │   ├── 01_extract_researchers.py
│   │   ├── 02_collect_scholarly_emails.py
│   │   ├── 03_unified_lead_pipeline.py
│   │   ├── 04_extract_nih_researchers.py
│   │   ├── 05_merge_and_deduplicate_leads.py
│   │   ├── 06_extract_biorxiv_researchers.py
│   │   ├── filter_today_leads.py
│   │   ├── run_pro_dashboard.py   # Desktop GUI launcher
│   │   ├── start_pro_app.bat      # 1-click desktop start
│   │   ├── assets/                # App brand assets
│   │   └── data/                  # Output extraction datasets
│   │
│   └── test/                      # Trial / Evaluation Desktop App & Installer
│       ├── 01_extract_researchers_test.py
│       ├── trial_manager.py       # Evaluation license & limit tracker
│       ├── run_trial_dashboard.py
│       ├── build_setup.bat        # PyInstaller build automation
│       └── installer.iss          # Inno Setup Windows installer script
│
├── docs/                          # 📚 Guides & Documentation
│   ├── PIPELINE_FLOWCHART.md      # Data pipeline flow diagrams
│   ├── RESEARCH_DATA_SOURCES.md   # OpenAlex, CrossRef, NIH source specs
│   ├── RUN_COMMANDS.md            # Command line cheatsheet
│   ├── SCIPROSPECT_GUIDE.txt      # User onboarding manual
│   └── login_details.txt          # Default access keys & root credentials
│
├── run_web.bat                    # 🚀 1-Click Launch Web App & SciStudio
├── run_desktop.bat                # 🚀 1-Click Launch Desktop Pipeline
├── requirements.txt               # Python package dependencies
└── .gitignore                     # Git ignore rules
```

---

## 🚀 Quick Start

### 1. Launch Services Locally

**Backend API (Port 8000):**
Double click `run_web.bat` or run:
```bash
cd backend
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

**Frontend (Port 3000):**
```bash
cd frontend
npm run dev
```
- **Single Frontend Entrypoint:** [http://127.0.0.1:3000](http://127.0.0.1:3000)
- **Backend API:** [http://127.0.0.1:8000/api](http://127.0.0.1:8000/api)
- **Administrator:** username `admin`; set `SCIPROSPECT_ROOT_PASS` before launch. There is no default password.

### 2. Launch Desktop Application
Double click `run_desktop.bat` or run:
```bash
cd app/main
python run_pro_dashboard.py
```


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
`app/test` contains the trial product, while `tests` contains automated checks.
Production and trial pipelines remain separate because trial quota behavior differs.
