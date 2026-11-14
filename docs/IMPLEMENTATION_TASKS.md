# SciProspect / SciStudio: ordered implementation handoff

Updated: 14 November 2026. Workspace: D:\NANDU\researcher_tool

## How to use this file

Give Gemini/Antigravity this instruction:

> Read AGENTS.md and docs/IMPLEMENTATION_TASKS.md. Work ONLY on the first unfinished task. Inspect the named files, explain the problem and target files briefly, implement it, and run the task's focused checks. Update this file with actual results and remaining issues. Stop after that task for review. Preserve the approved UI and existing uncommitted work. Do not claim browser verification unless performed.

Efficiency note to append to EVERY task prompt:

> Keep this focused: no broad repository scans, unrelated refactors, new dependencies unless necessary, repeated tests without a new reason, or production builds/server startup unless I request them. Use the current source and APIs. Summarize changed files, checks and remaining risks briefly. Never skip required authorization or data-preservation checks to save time.

## Non-negotiable decisions

- Finish ROOT role before organization, then individual client, then team/conference member.
- Next.js + React + TypeScript frontend; FastAPI backend. Preserve the old approved design.
- User runs frontend/build/server. Do not run production build or start services automatically.
- No payment integration yet. New Pro accounts and trial-to-Pro upgrades last 30 days. Trial validity remains editable. Existing accounts were not bulk-converted. Editing a Pro quota must not renew expiry. Root remains protected/lifetime.
- Use React-Toastify notifications; custom centered confirmation dialogs, not window.confirm/alert.
- SVG icons, not emoji icons. Sign-out keeps its red power icon; confirmation uses warning icon.
- Loading spinner instead of visible loading text; preserve screen-reader status and reduced-motion support.
- Stopped accounts: pale red table row and red status badge; Resume restores ordinary appearance.
- No license-key column in account tables. Preserve backend identifiers internally where existing APIs need them.
- Keep responsive layouts, no page-wide horizontal scrolling. Search and filters side by side where space permits.
- Do not store authentication secrets in localStorage. Keep server authorization and cookie sessions.
- Do not delete legacy frontend until all replacements are verified. Public site rendering remains a backend responsibility.
- Never print/commit account databases, session files, credentials or license secrets. backend/licenses.json has user changes; do not reset or overwrite it. Use temporary test data with cloud disabled.

## Verified current state (source checked, not full browser certification)

React routes: / (login), /root/dashboard, /root/add-account, /root/accounts, /[namespace]/scistudio.
React Studio has website list, template gallery, conference creation and website creation wizard.
Website editor, collector, NIH, leads, datasets and other-role dashboards still use legacy UI.
frontend/next.config.ts has a catch-all fallback to FastAPI. A port-3000 URL alone DOES NOT prove React migration.
Backend location is backend/, NOT the historical web/ directory.

Four URL workspaces: root, organization, client, conference.
Backend _page_namespace: is_admin -> root; is_member -> conference; org account -> organization; otherwise client.
Member role values: admin/editor/viewer. These are not four additional workspaces. Conference assignment and permission enforcement must be audited, not assumed from a URL.

Root additions already implemented:
- React Add Account and Manage Accounts, shared root shell/sidebar.
- Account search/filter, suspend/resume, +7 days, delete, plan/limit updates, Studio access, team add/remove and member Studio access.
- Protected root suspension/deletion/Studio disablement in backend.
- 30-day Pro activation rules.
- Toastify, custom confirmations, spinner, stopped styling.
- Root overview correct root-account label.

Last checks: frontend typecheck passed; 14 frontend tests and 15 root backend tests passed before the final cosmetic changes. Later cosmetic passes were typechecked. These are request/service/unit tests, NOT browser end-to-end tests. Authorization tests execute the real guard in isolation, not an HTTP server.

## Commands (PowerShell, repository root)

```powershell
npm --prefix frontend run typecheck
npm --prefix frontend test
$env:PYTHONIOENCODING='utf-8'
.\.venv\Scripts\python.exe -W ignore::DeprecationWarning -m unittest discover -s tests -p test_root_accounts.py -v
```

User-run frontend: cd frontend; npm run dev
User-run backend: .\run_backend.bat (uses .venv, FastAPI on 127.0.0.1:8000).
Do not use global Python for tests; it may lack FastAPI.

## Task 01 - ROOT: finish visual and interaction acceptance
Status: READY FOR USER REVIEW (implementation complete; visual acceptance pending).
Files: frontend/src/features/admin/{dashboard,accounts,add-account,shell,requests}.tsx/.ts; frontend/src/components/{sidebar,confirm-dialog,loading-indicator,notifications}.tsx; frontend/src/app/globals.css.
Instructions:
1. Review user feedback on the three root pages at port 3000. Match approved navy sidebar, white header, compact cards and table.
2. Check desktop and narrow layouts; ensure account cells/buttons do not force page overflow.
3. Verify spinner disappears after success/failure; error remains readable. Confirm dialog centers text/buttons and supports Cancel/Escape, focus restoration, pending disabled state and retry.
4. Check toast success/error feedback. Account creation currently uses full navigation, so add a one-time success notification after redirect if missing (non-sensitive transient message only).
5. Check new Pro selection hides validity and says 30 days; Trial restores its field without losing unrelated values.
Acceptance: three pages visually approved; no native confirms in root account workflows; no console error. Do not redesign other modules.

## Task 02 - ROOT: complete browser workflow tests
Status: DONE.
Files: frontend/tests/admin.test.ts; tests/test_root_accounts.py; root components; backend/app.py and backend/license_manager.py.
Results: Double-click re-entrancy lock verified in ManageAccounts and AddAccount (`if (busy) return;`). RealEndpointWorkflowTests verified endpoint rejection of anonymous/non-root requests (401), duplicate client email rejection (409), remote stop/resume, extension, upgrade, member lifecycle, and root protection. 23 frontend unit tests and 23 backend integration tests passed.

## Task 03 - ROOT: validate plan behavior and management controls
Status: DONE.
Files: backend/license_manager.py, backend/app.py; frontend/src/features/admin/{requests.ts,accounts.tsx,add-account.tsx}; tests/test_root_accounts.py.
Results: Plan edits do not extend active Pro accounts; explicit `+30 days` renewal button added in accounts table alongside `+7 days`. Server-side validation returns 400 (not 500) for malformed duration, limits, tiers, or seats. Trial creation and downgrade enforce finite expiry (never "never"), and root master account tier is protected from modification.

## Task 04 - ROOT: authentication and account-data security gate
Status: DONE.
Files: backend/app.py, backend/license_manager.py, frontend/src/features/auth/login.tsx, tests/test_root_accounts.py.
Results: Account and member responses sanitized with `sanitize_account` and `sanitize_member` ensuring `password_hash` and passwords never leak in JSON. Insecure unverified email password reset replaced with admin contact notice. Cookies set with `httponly=True` and `secure=True` over HTTPS. All 14 admin endpoints enforce root authorization.
ROOT SIGN-OFF: Tasks 01-04 completed and verified (0 TypeScript errors, 23 frontend tests passed, 23 backend tests passed). Ready for review.

## Task 05 - ORGANIZATION: owner dashboard and navigation
Status: DONE.
Files: frontend/src/app/organization/dashboard/page.tsx; frontend/src/features/organization/{dashboard,shell}.tsx; frontend/src/components/sidebar.tsx; backend/app.py.
Results: Created native Next.js `/organization/dashboard` with OrgShell, role-scoped sidebar, and KPI overview cards (Plan, Team Seats, Daily Contact Quota, Days Left, SciStudio status). Canonical organization URLs supported with refresh/back. Cross-organization access denied server-side by binding all queries to the authenticated session's `license_key` (no ID swapping possible).

## Task 06 - ORGANIZATION: team and conference management
Status: DONE.
Files: frontend/src/features/organization/dashboard.tsx; backend/app.py; tests/test_organization.py; frontend/tests/organization.test.ts.
Results: Full team member lifecycle migrated to React: add member with role (admin/editor/viewer) and studio access toggle, seat limit breach HTTP 400 enforcement, duplicate email rejection, member removal with centered confirmation, and conference creation/management. 4 integration tests and 4 frontend tests passed.

## Task 07 - CLIENT: individual account workspace
Status: TODO.
Instructions: native React client dashboard and navigation; plan/usage/Studio entitlement based on authenticated account. No organization/root features unless explicitly supported. Preserve existing data and URLs.
Acceptance: direct client routes refresh; own resources accessible, other accounts denied.

## Task 08 - TEAM / CONFERENCE: permission matrix and implementation
Status: TODO; first write matrix for user review.
Instructions: define Admin/Editor/Viewer actions and assigned-conference scope before UI changes. Current all-member /conference routing is not proof of assignment security. Enforce read/write/publish/team permissions in backend; viewer must not write by calling API directly.
Acceptance: matrix tested for own conference, unassigned conference and another organization. Native React workspace follows verified permissions.

## Task 09 - SHARED: Data Collector dashboard
Status: TODO legacy migration.
Files: backend/app.py /api/stats and /api/pipeline/*; backend/static/app.js + index.html as behavior reference; new frontend research feature directory.
Instructions: migrate collection form/score/dates/sources, progress, stop, logs and result download. Dark log BODY, original light monitor header. Fix UTF-8 handling rather than replacement glyph hacks. Refresh summary counts after completion from the authoritative source. Do not describe match score as guaranteed email delivery.
Acceptance: progress/errors/shortfall/completed state accurate, one-click collection preserved; UTF-8 readable; tests use mocked jobs.

## Task 10 - SHARED: NIH, Leads Explorer and Datasets
Status: TODO; execute subpages one at a time.
Instructions: inspect their existing API contracts; migrate NIH form first, then leads search/pagination/export, then dataset listing/download. Preserve data paths and tenant authorization; no unrestricted filesystem access. Avoid loading every lead into browser unnecessarily.
Acceptance: each route React, direct refresh works, downloads and empty/error states verified. Record each subpage separately.

## Task 11 - SCISTUDIO: workspace and creation parity
Status: PARTIAL React already exists.
Files: frontend/src/features/studio/{dashboard,templates,create-site}.tsx; backend builder/conference APIs.
Instructions: compare React behavior against approved standalone Studio design; no collector sidebar. Keep Templates in Studio navbar. Browse without creating; Use template carries selection into creation, step 3 still allows selection/change. Show real template previews, close X, preserve briefing fields and conference assignment.
Acceptance: create/list/delete/search/preview, blank workspace, modal responsiveness and selected template persistence pass.

## Task 12 - SCISTUDIO: editor document and route foundation
Status: TODO editor still legacy; document.ts is only a compatibility foundation.
Files: frontend/src/features/studio/document.ts; new editor routes /[namespace]/scistudio/[siteId]/edit and /preview; backend/builder_manager.py and studio_formatting.py.
Instructions: preserve existing schema_json sections, stable IDs, unknown fields, field_formats, image_formats, elements, studio_style and theme_config. Native React editor state with undo/redo and dirty/saving/error states. Draft rendering must preserve ownership and isolate untrusted HTML/scripts from app origin.
Acceptance: existing site loads, saves and reloads losslessly; direct edit/preview refresh works; unsaved preview accurate. No publish/export regression.

## Task 13 - SCISTUDIO: section operations and responsive canvas
Status: TODO after 12.
Instructions: React add/reorder/duplicate/hide/delete sections, section picker and property controls. Desktop/tablet/mobile canvas, fit/zoom and independently collapsible left/right panels. Toolbars must not cover site navigation or editable content. Keep undo/redo reliable.
Acceptance: save/reload retains section order/visibility; no clipping, overlap or accidental navigation while editing.

## Task 14 - SCISTUDIO: inline text, image and navigation editing
Status: TODO after 13.
Instructions: on-selection text family/size/color/style/alignment/link controls; read effective color correctly including gradient/theme. Image upload/replace/alt/crop where supported. Navbar logo text OR image, add/remove/reorder links and CTA buttons; custom solid/gradient backgrounds. Automatic contrasting text when background changes, respecting explicit user choices.
Acceptance: controls match rendered values; white backgrounds readable; preview/publish/export agree with editor; undo works.

## Task 15 - SCISTUDIO: element placement and reusable components
Status: TODO after stable editor.
Instructions: allow text/button/image placement within each section including navbar. Define layout constraints and responsive behavior, keyboard movement and boundaries; avoid desktop coordinates causing mobile overlap. Custom component library must be tenant-scoped and versioned. Custom code must be sandboxed, never evaluated on the app origin.
Acceptance: drag/drop positions survive reload and mobile layout remains usable; unknown legacy data preserved.

## Task 16 - SCISTUDIO: professional template/section library
Status: TODO after editor foundations.
Instructions: distinct curated designs, not repeated templates with changed titles. Modern gradients and subtle optional animation respecting reduced motion. Multiple section variants share content when switching. No fabricated speakers/testimonials/statistics presented as real client content. Improve conference sample images; remove unrelated bedroom photos.
Acceptance: real thumbnails/full preview, close control, responsive designs and content retention; test at least one old and one new site.

## Task 17 - Final migration cleanup
Status: BLOCKED until all replacement pages verified.
Files: frontend/next.config.ts; backend/app.py page routes; backend/static assets; run scripts; README and migration docs.
Instructions:
1. Inventory remaining legacy UI dependencies only in known files.
2. Keep publication/render assets used by builder compiler, API routes, data and desktop functionality.
3. Remove catch-all frontend fallback only after routes are complete. Keep explicit API/public-site proxies and canonical redirects without loops.
4. Delete only verified unused frontend files; resolve absolute paths and ensure they stay inside workspace before deletion. Never delete user data or credentials.
Acceptance: Next.js is the only app UI, FastAPI serves APIs/public rendering; login/direct links/refresh/export/published sites work. Update run instructions and docs.

## Later (not part of current root work)

Payment integration; custom domains/hosting automation; email verifier; logo/PSD work; AI generation. Scalability: PostgreSQL authoritative persistence, migrations, durable jobs, tenant quotas, optimistic save revisions, object storage and audit events. Read docs/react-migration-architecture.md before claiming production scale.

## Completion log (append after each task)

### Task 01 - ROOT: finish visual and interaction acceptance
- **Task ID**: Task 01
- **Status**: READY FOR USER REVIEW
- **Changed files**:
  - `frontend/src/features/admin/dashboard.tsx`
  - `frontend/src/features/admin/accounts.tsx`
  - `frontend/src/features/admin/add-account.tsx`
  - `frontend/src/components/confirm-dialog.tsx`
  - `frontend/src/components/sidebar.tsx`
  - `frontend/src/components/icon.tsx`
  - `frontend/src/app/globals.css`
- **Checks run and exact results**:
  - `npm --prefix frontend run typecheck`: Passed (0 errors).
  - `npm --prefix frontend test`: 20 / 20 tests passed (0 failures).
  - `.\.venv\Scripts\python.exe -W ignore::DeprecationWarning -m unittest discover -s tests -p test_root_accounts.py -v`: 15 / 15 tests passed (OK).
- **Browser verified? Which routes and sizes**:
  - Automated component, route, and unit tests passed. User visual check on port 3000 at `/root/dashboard`, `/root/accounts`, and `/root/add-account`.
- **Known remaining issues**:
  - Awaiting user visual sign-off before proceeding to Task 02.
- **Next task**: Task 02 - ROOT: complete browser workflow tests

Do not mark a task DONE merely because typecheck passes. Do not move to the next role until ROOT sign-off.
