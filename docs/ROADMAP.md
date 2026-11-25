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
- [x] Collector in the Next.js web app, own page in the original design: summary cards, live monitor with dark log
- [x] Search filters: country and institution (topic, years and score exist)
- [x] NIH Grant PIs in the web collector (/{namespace}/collector/nih)
- [x] Collected data stored in PostgreSQL (runs, contacts, evidence, results)
- [x] Saved searches and scheduled runs (daily or weekly; scheduler runs only where SCIPROSPECT_SCHEDULER=on)
- [x] PubMed source (author emails printed in the record's own affiliation)
- [ ] ⏸ PENDING (before launch): add a free OpenAlex API key (openalex.org/settings/api, $1/day = 1,000 searches) as `OPENALEX_API_KEY` in `backend/.env` on the PC and the server, then restart the backend. Without it every request shares a tiny no-key budget
- [ ] 💡 More sources (e.g. Crossref)

## A2. Leads
- [x] Leads list, CSV export
- [x] Merge and remove duplicates, clear all
- [x] 🧪 Leads Explorer: search, sort, filter, select, copy emails, export selected; All contacts (central archive)
- [x] 🧪 Daily contact limit from the license (trial 100/day), shown on the page
- [x] 🧪 Manage collections: rename, run again, delete
- [x] Email discovery matched to the author's name (ORCID, Crossref, Europe PMC), format check
- [x] Web collector checks mail domains, flags role and disposable addresses, and shows delivery status in the leads table and CSV. Owners can recheck existing contacts.
- [ ] ⏸ PENDING (decide later): Mailbox check (SMTP) via a paid API (ZeroBounce/NeverBounce), never from our mail server
- [x] Send selected researchers to SciStudio: private "Invited speakers" shortlist per event (Leads Explorer → Add to event; Event details → Speakers → Add to website). Nothing is public or emailed until the organiser adds a person
- [ ] ⏸ PENDING (needs unsubscribe link, per-person sending and a legal check): email an invitation or call for abstracts to shortlisted researchers

## A3. Desktop app (to retire)
- [x] Desktop app with auto-update (check, download, install)
- [x] After the web rebuild: delete `app/`, the `.bat` files and `backend/static/app.js`

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

## 2a. Block library (our own original blocks)
Ready-made sections people drag into a page. We write every block ourselves; free libraries (shadcn/ui, HyperUI, Flowbite, Magic UI, Aceternity free) are inspiration only, no code is copied, so no third-party notices are needed. Never copy Pro or paid designs; do not reuse their images, icons or fonts.
- [x] 🧪 Audit: `frontend/tests/component-audit.test.ts` checks every block (complete text, no dummy words, safe links, every promise backed by code). Run it with `npm test`
- [x] 🧪 Headers: mobile menu without scripts, headers that stay at the top, Conference and Dark headers; false promises (dropdown, mega menu, search) removed
- [x] 🧪 Effects and assets that were promised but missing: hover lift, animated gradient (respects reduced motion), 12 outline icons with a picker, orbit illustration, gradient band
- [x] 🧪 Schedule by day (time, room, track, speaker), Sponsors by tier (logos that link out), Countdown (from Event details), Venue and directions (from Event details, Open in maps)
- [ ] Header dropdown (sub-menus): needs sub-items in the menu schema, the editor and the mobile menu
- [x] 🧪 Speakers in three layouts (cards, list, large portraits) with a talk title, Organising committee, Simple and Column footers with social links
- [x] 🧪 Event in numbers (large figures), Testimonials with photo and role, Logo strip, Video (YouTube and Vimeo, privacy mode, only real video ids), Downloads, Travel and stay; every card can carry a link
- [ ] Footer newsletter box (needs an email list first)
- [ ] More heroes: background image, video-free animated, with countdown or key dates
- [ ] Look at every block in a browser (desktop, tablet, phone) and fix spacing; so far blocks are checked by test cases only
- [ ] A few new blocks every week through the daily designs workflow
- [ ] 💡 Catalog page with thumbnails and categories in the Design Library

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
- [x] 🧪 Custom domains: the Domain dialog on each website (Pro and Ultra) shows the DNS records, checks ownership (TXT token) and whether the name points to us
- [ ] Serve a verified domain: Apache virtual host, HTTPS certificate and host-to-site routing (server-side, needs a decision on certificates)

## 7a. Print tools — STAGE 2 (v2, after the current version is finished and live)
One PDF engine: Program, Badges, Certificates, Abstract book.
Same editor feel as websites: pick a template, drag and drop blocks, upload images, export a PDF. Counts under the Studio limits, no new plan.
- [ ] **Phase 1: Program PDF.** Fixed A4 / Letter page, templates, editable text, speaker photo upload, simple schedule table, export one PDF. Server renders the PDF with a headless browser (install it in `deploy/update.sh` and `docs/DEPLOY.md`)
- [ ] Program Phase 2: drag-and-drop blocks (cover, schedule by day and time, speaker cards, sponsor logos), several page layouts, fill speakers and sessions from the event website so a change is made once
- [ ] Page breaks that never split a session across pages
- [ ] **Badges / ID cards.** Sizes A6, 4×3 in, CR80 and how many fit on an A4 sheet; fields name, title, institution, photo, QR code; role colour bands (attendee, speaker, organiser, sponsor)
- [ ] Badge people from registrations, the speaker list or a CSV upload; bulk PDF (500+ cards) made on the server
- [ ] Badge limit per event by plan (for example 200 on Basic, more on Pro and Ultra)
- [ ] 💡 Certificates, abstract book, QR check-in page for the day

---

# Part C: Platform (shared by SciProspect and SciStudio)

## 7b. Public website, sign-up and billing
- [x] 🧪 Public home page: both tools, live pricing from the Plans page, FAQ
- [x] 🧪 Self sign-up with plan choice and 6-digit email code
- [x] 🧪 Billing: test checkout like Stripe, invoices, renew, cancel, switch plans (see `docs/PAYMENTS.md`)
- [x] 🧪 Root: payment status and self sign-ups in Manage Accounts; Stripe price ids on the Plans page
- [ ] Switch subscriptions to Stripe (keys + webhook, no code changes)
- [x] New pricing, phase 1 (docs/PRICING_PROPOSAL.md): 7-day trial instead of Free, Basic / Pro / Ultra / Custom, monthly and annual billing, per-plan daily contact limit, an ended trial or plan can only open Billing
- [ ] Pricing phase 2: daily contact limit per team member, and team members who can collect (several collections at once in one workspace)
- [ ] Pricing phase 3: measure file and data storage, storage add-ons, "expandable" websites add-on (price still to decide)
- [ ] ⏸ PENDING: pricing phase 4, mailbox verification packs (500 / 2,000 / 10,000 checks), together with the paid mailbox check
- [ ] 💡 Pricing later: own workspace database for Ultra, own application instance for Custom, a custom domain per event
- [ ] Registration payments on event websites through Stripe Checkout
- [x] 🧪 Terms of service and privacy policy pages (draft: lawyer review + company details needed)

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
- [x] Merge the Codex branch `codex/scistudio-design` (merged into main and deleted 2026-11-22)
- [ ] Clean up files attached to submission forms that were never submitted
- [ ] 💡 Demo video with sound, polished deck
