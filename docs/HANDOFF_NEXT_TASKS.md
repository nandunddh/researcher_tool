# SciProspect: plan to launch (handoff for Codex and the team)

**Read this first.** It replaces earlier handoff notes. The feature list and status live in `docs/ROADMAP.md`; this file says **what to do next, in which order, and how to know it is done**.

- **Main branch for this work:** `codex/react-nextjs-migration`, at commit `9c84c3c` or later. It is **79+ commits ahead of GitHub and not pushed yet**.
- **Codex collector branch:** `codex/scistudio-design`, a worktree at `C:\Users\nandu\.codex\worktrees\scistudio-design`. It is based on `869619f`.
- **Payments:** test mode. See `docs/PAYMENTS.md` for the switch to Stripe.

---

## Where we are (snapshot)

| Area | State |
|---|---|
| Public website, pricing (4 plans), sign-up with email code, Terms and Privacy | Built 🧪 |
| Two-step sign-in, **required for everyone**; password reset by email code; change password | Built 🧪 |
| Billing: test checkout like Stripe, invoices, renew, cancel, switch, invoice emails | Built 🧪 |
| SciStudio editor, templates, design library import, multi-page, publish / unpublish | Built 🧪 |
| Event details: tickets, price periods, add-ons, codes, speakers, tracks, key dates | Built 🧪 |
| Forms: contact, registration with payment and receipts, abstract submission with files | Built 🧪 |
| Plans and limits enforced on the server; root Plans page; Manage Accounts usage | Built 🧪 |
| Team members by role (viewer / editor / admin) on the organization's websites | Built 🧪 |
| Data collector in the web app | **Codex branch, not merged** |
| Real payments (Stripe), custom domains, deployment | **Not done** |

🧪 means built and covered by automated tests, but **not yet clicked through by a person**.

---

## How to work (rules for every task)

1. **One task, one commit,** with a clear message. Run the checks before committing:
   - `cd frontend; npm run typecheck; npm test`
   - `.venv\Scripts\python.exe -m unittest discover -s tests`, with `SCIPROSPECT_DB_HOST` empty so tests never touch the real database.
2. **Never run `npm run build` while developing.** Only the server runs it, during deployment (task P0-3).
3. **Database changes go in new migration files.** Use `backend/migrations/NNN_name.sql` and never edit an applied migration.
   - Main branch: 001–013 are used, so take the next free number.
   - Codex: 100+.
4. **Secrets only in `backend/.env`.** Never put them in git or chat. This covers the database, Brevo SMTP and Stripe keys.
5. **Server-side checks for anything from visitors:** forms, prices, files, plan limits.
6. **Plain, friendly UI text.** The public pages use the dark style, Bricolage Grotesque and Geist fonts, and **one lime accent, no gradients**.
7. **Definition of done:** works in the browser, tests added or updated, checks pass, roadmap line ticked.

---

## P0: must be done before real customers (in this order)

### P0-1 Click-through test of everything 🧪 (owner: you)
Use two browsers (root, and a new user). Note every problem with a screenshot, then fix them one by one.
1. **Sign-up:** home → **Choose Business** → sign up (use `you+test1@gmail.com`) → email code → **two-step setup** (QR, code, backup codes) → checkout with `4242 4242 4242 4242` → Billing shows Business, an invoice, and the **invoice email arrives**.
2. **Billing changes:** switch to Pro, cancel, then "Keep my plan". Try a declined card, `4000 0000 0000 0002`.
3. **Sign in again:** sign out and back in. You should be asked for the authenticator code. Test "Forgot password" too.
4. **Event setup:** create a website from a template → Event details: "Use a sample conference" → add a Registration section and tick tickets → Publish → open the live address.
5. **Register and pay:** on the live site, register → pay (test) → receipt page → **receipt email**. The Inbox shows "paid (test)" and the receipt number.
6. **Abstracts:** add a track in Event details → submit an abstract with a PDF → check the Inbox status and file download.
7. **Team member:** as the organization owner, add an editor → sign in as the editor (it asks for two-step setup) → they can edit but not publish.
8. **Root:** Manage Accounts shows the plan, usage and "Self sign-up". Change a plan, reset a member's two-step sign-in, edit a price on the Plans page, import a design.
9. **Phone width:** check the home page, sign-up, the setup screen and billing at phone width.

**Done when:** every step works, or has a ticket below.

### P0-2 Push and protect the code (owner: you)
- Push `codex/react-nextjs-migration` to GitHub. It is the only copy today.
- Merge Codex's `codex/scistudio-design` into it. This is low risk: it changes collector files and 4 lines of `backend/app.py`, and its migration is `100_collector_storage.sql`. Run all tests after merging.
- Then open a pull request into `main` and merge it once P0-1 passes.

### P0-3 Deploy to the server (owner: Codex + you)
**Goal:** `https://<your-domain>` serves the site, the backend runs behind it, and everything restarts on its own.

- **Server:** Ubuntu on Oracle Cloud. Open ports 80 and 443 only. PostgreSQL is already on Oracle Cloud.
- **Install:** Python 3.12 with a venv (`pip install -r requirements.txt`), and Node 20.
- **Build the frontend on the server:** `cd frontend && npm ci && npm run build`.
- **Two services (systemd), both restarting on failure:**
  - Backend: `uvicorn app:app --host 127.0.0.1 --port 8000 --workers 1`. **Keep one worker for now**: rate limits and sign-in challenges are kept in memory (see P1-6).
  - Frontend: `npm start` on port 3000, with `FASTAPI_ORIGIN=http://127.0.0.1:8000`.
- **Nginx:** route `/` to port 3000. Let's Encrypt (certbot) for HTTPS, with forced redirect to HTTPS.
- **`backend/.env` on the server:** database settings, `SCIPROSPECT_APP_URL=https://<domain>`, the Brevo SMTP settings and `SCIPROSPECT_MAIL_FROM`.
- **Persistent storage plus backups:**
  - the websites folder: `media/` holds images and `uploads/` holds abstract files; both are private
  - a nightly database backup
- **Write `docs/DEPLOY.md`** covering setup, how to update (`git pull`, build, restart) and how to roll back.

**Done when:**
- the site works over HTTPS
- a server reboot brings everything back
- sign-up emails come from your domain

### P0-4 Email from your own domain (owner: you)
In Brevo, verify your domain (add the SPF and DKIM DNS records it gives you), set `SCIPROSPECT_MAIL_FROM` to `SciProspect <no-reply@your-domain>`, and test with Gmail and Outlook so emails don't land in spam.

### P0-5 Legal (owner: you)
- Fill in the company name, address and email in `frontend/src/features/marketing/legal.tsx` (marked `TODO`).
- Have a lawyer review `/terms` and `/privacy`. Researcher data rules (GDPR) need extra care.

### P0-6 Stripe for subscriptions (owner: you, then Codex checks)
Follow `docs/PAYMENTS.md`: test keys first, a price id per paid plan on the Plans page, the webhook, `pip install stripe`. Run P0-1 steps 1–2 again with Stripe test cards, then switch to live keys.

---

## P1: important, soon after launch

| # | Task | Brief | Done when |
|---|---|---|---|
| P1-1 | **Registration payments through Stripe** | Event registrations still use their own test step (`/pay-test` in `backend/app.py`, `forms.mark_test_payment`). Add a Stripe Checkout session per registration (a one-off payment), mark the registration paid from the webhook, and keep receipts and numbering as they are. Organisers will later need Stripe Connect to get paid directly. **Decide first:** do you collect the money and pay organisers, or does each organiser connect their own Stripe? | A live site registration is paid through Stripe and the receipt email is sent |
| P1-2 | **Email checker for the data collector** (collector merged on 22 Nov) | Full brief: `docs/EMAIL_CHECKER_TASK.md`. Add a module that checks each email's domain and mail server and flags role (`info@`) and disposable addresses. It fills `delivery_status`, which is always "unknown" today. No mailbox (SMTP) checks from our server. | Every lead shows a delivery status; tests cover each rule |
| P1-3 | **Workspace pages in the new design** | Dashboards, Manage Accounts, Plans, Design Library and the SciStudio dashboard are still the old light style. Restyle them to the dark and lime look. **Fix the global styles that leak** (`label`, `small`, `th`): they caused the bugs we fixed on the public pages. | Every workspace page matches; no unstyled text |
| P1-4 | **Enterprise plan + Contact sales** | A 5th pricing card, "Custom", with a dedicated server. A Contact sales form (name, organization, event size, message) emails you. No checkout. | The form reaches your inbox; the card shows on pricing |
| P1-5 | **Inbox improvements** | Filter by form, search, a "new" badge, and an email to the organiser for each new registration or abstract. | An organiser can find any entry in seconds and gets notified |
| P1-6 | **Ready for more than one worker** | Move the rate limits (`FormRateLimit`) and the in-memory sign-in challenges (`_mfa_challenges`) into PostgreSQL or Redis, so the backend can run several workers. | Two workers run with no lost sign-ins and limits shared |
| P1-7 | **Seat limits and waitlist per ticket** | A capacity per ticket type in Event details, enforced on the server, then "Sold out" or a waitlist. | Registrations stop at capacity |

## P2: later

- **Custom domains:** DNS instructions, a check, and HTTPS per domain. The plan setting already exists.
- **Abstract reviewers and scoring,** plus emailing authors when their status changes.
- **Badges with QR codes** for check-in, plus offline or bank-transfer payments.
- **Program / agenda** linked to speakers, and a sponsors section.
- **Delete the old desktop app** (`app/`, `.bat` files, `backend/static/app.js`) once the web collector fully replaces it.
- **Clean-up:**
  - files attached to submission forms but never submitted (marked `shortcut:` in the code)
  - the untracked `docs/SciProspect_Motion_Walkthrough.mp4`: keep it out of git or use Git LFS

---

## Risks to watch (manager's view)

1. **Untested features.** Almost everything new is 🧪. P0-1 is the most valuable next day of work.
2. **Single copy of the code.** Nothing is pushed. Do P0-2 today.
3. **Email deliverability.** Sign-up and two-step sign-in depend on email. A free Brevo sender on Gmail will hit spam; P0-4 fixes that.
4. **Mandatory two-step sign-in.** Users who lose their phone need their backup codes or an admin reset (Manage Accounts → "Reset two-step"). Make sure support knows the steps.
5. **Legal exposure** from researcher data and payments. Do P0-5 before marketing.
6. **Scaling:** one backend worker for now (P1-6). That's fine for launch traffic.

## Useful facts

- **Run locally:**
  - backend: `cd backend; ..\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload`
  - frontend: `cd frontend; npm run dev`
- **Migrations** run automatically when the backend starts, so restart after pulling.
- **Database tests:** 23 tests are skipped unless you set `SCIPROSPECT_DB_SCHEMA=test_<name>`, which runs them against an isolated schema. Never point them at the live schema.
- **Samples** of the invoice, invoice email and registration receipt email are in `docs/samples/`.
- **Daily designs:** prompts are in `docs/DESIGN_PROMPT.md`; import them on Root → Design Library.
