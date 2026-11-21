# SciStudio: next tasks (handoff)

Branch: `codex/react-nextjs-migration`. Last commit at handoff: `195ff3e`.

## How the project works now

- **Frontend (the only UI going forward):** Next.js 16 + React 19 in `frontend/`. Run: `cd frontend; npm run dev` → http://127.0.0.1:3000
- **Backend:** FastAPI in `backend/`. Run: `cd backend; ..\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload`
- **Database:** PostgreSQL (Oracle Cloud), settings in `backend/.env` (git-ignored, never commit). Tables live in schema `scistudio`; migrations are `backend/migrations/NNN_name.sql`, applied automatically on startup (`backend/db.py`). Add a new numbered file for schema changes; never edit an applied migration.
- **Old UI:** `backend/static/app.js` (classic editor, collector). Do not add features there. Port 8000 redirects SciStudio pages to port 3000.
- **Desktop app (`app/`) and `.bat` files:** keep for now (the data collector depends on them).

## Rules

- **Never run `npm run build`.** Check with `npm run typecheck` and `npm test` in `frontend/`.
- Python tests: `.venv\Scripts\python.exe -m unittest discover -s tests` from the repo root, with `SCIPROSPECT_DB_HOST` empty so tests never touch the real database.
- Two known failures in `tests/test_studio_editor_compiler.py` belong to the old Python renderer (to be removed). Ignore them.
- Live-server tests are opt-in (`SCIPROSPECT_LIVE_TESTS=1`), and database tests too (`SCIPROSPECT_DB_SCHEMA=test_*`). Never point tests at the live schema.
- Server-side validation for anything from visitors (forms, prices, uploads). Never trust client values.
- Plain-language UI text for non-technical users. Commit after each task.

## Key files (frontend/src/features/studio)

| File | What it is |
|---|---|
| `react-editor.tsx` | Editor screen: toolbar, Add/Layers/Pages sidebar, canvas, inspector, dialogs |
| `site-renderer.tsx` | One renderer for canvas, preview (and later the live site). Navbar/hero use `canvas_elements` |
| `section-blocks.tsx` | React versions of all content sections, forms (`WebsiteForm`), registration |
| `section-registry.ts` | Inspector fields per section type (drives the content editor) |
| `editor-model.ts` | Pure editing operations (sections, elements, lists, pages, styles) with undo-friendly copies |
| `site-schema.ts` | Data model, sanitizers (`safeUrl`, `safeImage`, `cleanStyle`), CSS builder |
| `quick-toolbar.tsx` | Floating toolbar above the selection |
| `inspector.tsx`, `inspector-fields.tsx` | Right panel and its controls |
| `component-catalog.ts`, `component-instance.ts` | Component library items and their starting data |
| `site-preview.tsx` | Preview page (`/[ns]/scistudio/[siteId]/preview[/page]`) |

Backend: `backend/forms.py` (form checks, registration pricing, test payment), `backend/builder_manager.py` (websites storage + old Python renderer), `backend/app.py` (routes).

## Tasks, in order

### 1. Check registration end to end (small)
Add "Registration with payment" to a page, save, open Preview, register, pay (test), and confirm the Inbox shows `paid (test)`. Fix anything broken. Note that `success_message` is shown after payment only if set; otherwise there's a default.

### 2. Form field palette with drag and drop
- In the inspector for form sections (`contact`, `form_button`, `registration`), add a small palette (Short text, Email, Phone, Long text, Dropdown, Checkbox). Clicking or dragging a type adds a field to `data.form_fields` (use `addListItem` / `setSectionField`; if the list is missing, copy the defaults first, as "Customize fields" does in `inspector.tsx`).
- On the canvas, allow dragging fields within a form to reorder them (`moveListItem`).
- Tests in `frontend/tests/`.

### 3. Global theme panel
- New "Theme" button or tab: brand color (accent), text color, heading font, body font (use `FONT_STACKS`), button corner radius.
- Store at the site level (for example `site.theme_config.studio`), save it with the site (backend `update_site` already accepts `theme_config`).
- Apply it as CSS variables on `.site` in `site-renderer.tsx` (`--accent`, `--ink`, fonts, radius). Existing sections already use `--accent`/`--ink`/`--muted`.

### 4. Publish on React (important)
- Public Next.js route for `/sites/[slug]` and `/sites/[slug]/[page]` (remove the `/sites` rewrite in `frontend/next.config.ts` for these) using `SiteRenderer` without `edit`.
- New public backend endpoint returning a **published** site only, and **stripping private data**: `discount_codes` in registration sections, `_payment*` fields, owner email, `meta_config` items not needed. Draft sites → 404.
- SEO in Next `generateMetadata` from `meta_config` (title, description, og image, robots, canonical) plus Google Analytics script when `ga_tracking_id` is set.
- Forms then work on the live site automatically (they post to `/api/public/forms/...`).

### 5. ZIP export on React
Keep the ZIP feature. Render each page to static HTML (React server rendering) plus CSS, replacing `builder_engine.export_site_zip`.

### 6. Remove the old Python renderer
After tasks 4–5: delete `compile_website_html` and helpers in `builder_manager.py`, `studio_formatting.py`, `studio_blocks.py`, the classic editor parts of `backend/static/app.js`, the old preview routes, and their tests. Stop storing `compiled_html` (keep the column or drop it in a new migration).

### 7. Publish/unpublish + status
Show the status and public address on site cards and in the editor; Publish / Unpublish buttons. Unpublished → a "not available" page.

### 8. One-click client creation + plans
Root admin creates a client (organization + admin user) in one click. Plans table with limits (websites, pages, members, storage, submissions, custom domain), enforced on the backend, plus an admin dashboard with usage. Extend the existing accounts in `license_manager.py`; store plans in a new migration.

### 9. Later
Abstract submission form (file upload, PDF/DOC, 20 MB), sponsor form (logo upload), email notifications, real Stripe, custom domains (DNS instructions + checks), data collector in the web app, then delete `app/` and `.bat` files.

## Known limits to keep in mind
- Discount codes are stored in the section data; the public site (task 4) must strip them.
- Forms have no rate limiting yet; add a simple per-IP limit when publishing goes live.
- The published `/sites/...` page still uses the Python renderer until task 4.
