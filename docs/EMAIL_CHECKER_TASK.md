# Task for Codex: email checker for the data collector (P1-2)

## Goal
Every collected contact gets a **delivery status**, so users can see which emails are worth contacting. Today the field `delivery_status` exists in each contact record but is always `"unknown"` (see `app/main/collector_store.py` `normalize()` and `backend/collector_archive.py`).

This is about **deliverability**. The existing "email matched to the author" check (ORCID, Crossref, Europe PMC name matching in `app/main/02_collect_scholarly_emails.py`) stays as it is: it answers a different question.

## What to build
1. **A new module `backend/email_check.py`, with no network calls in the pure parts.** Its main function is `check(email: str, resolver=None) -> dict`, which returns:
   ```python
   {"delivery_status": "<status>", "checks": {"format": bool, "domain": bool, "mail_server": bool, "role": bool, "disposable": bool}, "checked_at": "<ISO time>"}
   ```
   The statuses, in this order of priority:
   - `invalid_format`: not a valid address
   - `disposable`: a throwaway domain (mailinator.com, 10minutemail, guerrillamail…). Keep a small built-in list in the module, plus a hook to load a bigger list from a text file later.
   - `no_domain`: the domain does not exist
   - `no_mail_server`: the domain exists but has no MX record, and no A record to fall back on
   - `role`: the mailbox is a role, not a person (`info, admin, contact, office, support, sales, noreply, no-reply, webmaster, hello, team, secretary, postmaster`)
   - `deliverable_domain`: everything above passed. It means "very likely reachable", **not** "verified mailbox".
2. **DNS lookups through `dnspython`** (add it to `requirements.txt`):
   - MX, then fall back to A
   - a 3-second timeout per lookup
   - **cache results per domain** for the whole run, so 500 contacts at one university cost one lookup
   - pass the resolver as a parameter, so tests can use a fake
3. **Wire it into the collector:**
   - **New contacts:** check the email when a contact is saved (`Archive.save` in `backend/collector_archive.py`, or just before it), and store `delivery_status` plus `checks` in the contact `record`.
   - **Existing contacts:** add an endpoint `POST /api/collector/contacts/check` that checks the current owner's contacts in batches (owner only, rate limited), plus a **"Check emails"** button in `frontend/src/features/collector/collector.tsx`.
   - **Leads table:** show the status as a small coloured badge (deliverable / role / disposable / invalid / unknown) and allow **filtering by status**. Include the status in the CSV export.
4. **Never send email and never open SMTP connections from our server.** Mailbox checks (SMTP) can get the server's IP blacklisted, which would break our sign-up and receipt emails. If they are wanted later, use a paid API (ZeroBounce / NeverBounce) behind a setting.

## Rules
- Follow the rules at the top of `docs/HANDOFF_NEXT_TASKS.md`:
  - new migration numbered **101+** if a table changes (it probably doesn't, because the status lives in the JSON `record`)
  - no `npm run build`
  - plain UI text
  - one commit
- Lookups must not slow the collector down noticeably: cache, set timeouts, and treat any lookup error as `unknown`, never as a crash.

## Tests (`tests/test_email_check.py`)
- Format: good and bad addresses.
- Role and disposable detection, case-insensitive.
- A fake resolver for each case: has MX / no MX but an A record / no domain (NXDOMAIN) / timeout. A timeout must give `unknown`.
- Each domain is looked up once even when it appears many times.
- The endpoint is owner-only and updates `delivery_status` in stored records. Use a fake DB or the opt-in DB test pattern with `SCIPROSPECT_DB_SCHEMA=test_*`.

## Done when
- New and re-checked contacts show a delivery status badge.
- The leads table filters by status, and the CSV includes it.
- The tests above pass along with the full suite.
- The `docs/ROADMAP.md` line "Email checker after the web rebuild" is ticked.
