# SciProspect platform roadmap

One list for the whole platform: **SciProspect** (research data collector), **SciStudio** (website builder) and the shared accounts.
What is done, what is next, and ideas for later.
Add a line anywhere: `- [ ]` for to do, `- [x]` when done. Keep each line short.

Legend: ✅ done · 🔜 next · 💡 idea · 🧪 built but not tested in the browser yet

---

# Part A: SciProspect (research data collector)

## A1. Data collection
- [x] Pipeline: run / stop with live progress (OpenAlex)
- [x] NIH data source page
- [x] Datasets and explorer views
- [ ] 🔜 Rebuild the collector in the Next.js web app (Codex, branch `codex/scistudio-design`)
- [ ] Search filters in the web app: topic, country, institution, years
- [ ] Store collected data in PostgreSQL (check: today it uses a data folder on disk)
- [ ] 💡 Saved searches and scheduled runs
- [ ] 💡 More sources (e.g. PubMed, Crossref)

## A2. Leads
- [x] Leads list, CSV export
- [x] Merge and remove duplicates, clear all
- [ ] Leads table in the web app: search, sort, filter, select
- [x] Email discovery matched to the author's name (ORCID, Crossref, Europe PMC), format check
- [ ] Email checker after the web rebuild: domain/mail-server check, role (info@) and disposable flags → fills `delivery_status` (today always "unknown")
- [ ] 💡 Mailbox check (SMTP) via a paid API (ZeroBounce/NeverBounce), never from our mail server
- [ ] 💡 Send selected researchers to SciStudio (invite as speakers, email a call for abstracts)

## A3. Desktop app (to retire)
- [x] Desktop app with auto-update (check, download, install)
- [ ] After the web rebuild: delete `app/`, the `.bat` files and `backend/static/app.js`

---

# Part B: SciStudio (website builder)

## 1. Editor and design
- [x] Visual editor: canvas, Add / Layers / Pages sidebar, inspector, quick toolbar
- [x] Drag and drop sections, undo / redo, desktop / tablet / mobile styles
- [x] Global theme: brand colors, fonts, button corners
- [x] Multi-page websites
- [x] Component library (sections, elements, assets)
- [x] SEO, social sharing, Google Analytics
- [ ] 💡 Animations and scroll effects
- [ ] 💡 Reusable "saved sections" per user

## 2. Design library (daily designs)
- [x] Root admin imports AI-made designs (JSON) on the Design Library page
- [x] Daily AI prompts in `docs/DESIGN_PROMPT.md`
- [x] Multi-page imported templates
- [ ] 💡 Preview a design before importing
- [ ] 💡 "Top rated" list from usage counts

## 3. Event details (one place for event facts)
- [x] 🧪 Basics: name, dates, venue, currency, organiser, address, tax number
- [x] 🧪 Price periods, ticket types, price grid (blank = not sold then)
- [x] 🧪 Add-ons, discount codes (% or fixed, expiry)
- [x] 🧪 Speakers, tracks / topics, other key dates
- [x] 🧪 "Event details" button on site cards and in the editor
- [ ] 💡 Program / agenda (sessions, rooms, times, linked speakers)
- [ ] 💡 Sponsors list

## 4. Forms
- [x] Contact forms (several designs), button that opens a form
- [x] Custom fields, field palette, drag to reorder
- [x] Spam protection (autofill bug fixed)
- [x] 🧪 Abstract submission: title, track, authors, word limit, PDF/Word file, IDs (ABS-0001)
- [ ] 🔜 Multi-step forms with automatic steps (details → tickets → payment → confirmation)
- [ ] More field types: radio, date, number, country list, consent, headings
- [ ] Conditional fields (show a field only when …)
- [ ] Open / close dates on every form
- [ ] 💡 Sponsor / exhibitor form with logo upload

## 5. Registration and payments
- [x] 🧪 Registration form picks tickets, add-ons and codes from Event details
- [x] 🧪 Prices and periods computed on the server
- [x] 🧪 Test payment
- [x] 🧪 Receipts: numbering, printable PDF page, email to the attendee
- [ ] 🔜 Real payments with Stripe
- [ ] Seat limits per ticket and waitlist
- [ ] Offline payment (bank transfer, marked paid by the organiser)
- [ ] Confirmation email text the organiser can edit
- [ ] Group registration (one person registers several attendees)
- [ ] 💡 Badges with QR codes for check-in

## 6. Inbox (submissions)
- [x] All submissions per website, CSV export
- [x] 🧪 Status for abstracts (received → under review → accepted / rejected), file download
- [ ] Tabs or filter per form, search
- [ ] Email notification to the organiser for new submissions
- [ ] 💡 Reviewers and scoring for abstracts
- [ ] 💡 Email authors when their status changes

## 7. Publishing
- [x] Published sites rendered by React, ZIP export
- [x] 🧪 Publish / Unpublish buttons, Draft / Live status, "not available" page
- [ ] Custom domains (DNS instructions and checks)

---

# Part C: Platform (shared by SciProspect and SciStudio)

## 7b. Public website, sign-up and billing
- [x] 🧪 Public home page: both tools, live pricing from the Plans page, FAQ
- [x] 🧪 Self sign-up with plan choice and 6-digit email code
- [x] 🧪 Billing: test checkout like Stripe, invoices, renew, cancel, switch plans (see `docs/PAYMENTS.md`)
- [x] 🧪 Root: payment status and self sign-ups in Manage Accounts; Stripe price ids on the Plans page
- [ ] Switch subscriptions to Stripe (keys + webhook, no code changes)
- [ ] Registration payments on event websites through Stripe Checkout
- [ ] Terms of service and privacy policy pages

## 8. Accounts and security
- [x] Passwords in a separate credentials table
- [x] Password reset with an emailed 6-digit code (Brevo)
- [x] Two-step sign-in with Google Authenticator
- [x] Root dashboard, organization dashboard, client overview
- [x] Licenses: create, extend, stop / resume, upgrade, trial, daily limits
- [x] Organization team members, SciStudio access per member
- [x] 🧪 "Change password" in the profile menu
- [x] 🧪 Admin button: reset two-step sign-in for a client
- [ ] One-click client creation (organization + admin user)
- [x] 🧪 Plans with limits (websites, pages, members, storage, submissions), usage in Manage Accounts, root Plans page

## 9. Housekeeping
- [ ] Update `docs/HANDOFF_NEXT_TASKS.md` (out of date)
- [ ] Merge the Codex branch `codex/scistudio-design` when ready (check conflicts, run tests)
- [ ] Clean up files attached to submission forms that were never submitted
- [ ] 💡 Demo video with sound, polished deck
