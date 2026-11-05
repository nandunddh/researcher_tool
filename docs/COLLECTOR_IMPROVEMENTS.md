# Data collector changes

Production collection now uses collector_store.py for its central archive. A SQLite
file alongside central_master_leads.csv stores unique email records and distinct
original source payloads. The CSV is a canonical export for the existing dashboard.
Do not edit the CSV to change database records after initial import.

The first save imports and backs up a valid legacy master. Inconsistent columns or
invalid contacts stop conversion; originals remain available for manual recovery.
No existing user dataset was migrated during development. Deleting the CSV alone
does not clear the database; use the dashboard clear operation after stopping jobs.
Backups are retained separately and can contain earlier contacts.

Production OpenAlex, bioRxiv, NIH and scholarly enrichment share master persistence.
Repeated enrichment checkpoints upsert instead of repeatedly appending duplicates.
Merge operations normalize aliases and retain original payloads in SQLite evidence.
Records are deduplicated by email; identity resolution across multiple emails is
still future work. CSV export is atomic and SQLite serializes archive writers.

Name-only email heuristics are stricter and remain marked for review. bioRxiv XML
contacts require contributor/email or explicit correspondence links. Unlinked
fallback contacts require name matching and are not labelled author-linked.
Author-linked does not mean deliverable. ORCID links inherit source identity quality.
The default score remains 50/100; score is not a calibrated probability.

OpenAlex and bioRxiv discovery stop after five failed attempts. OpenAlex permanent
client errors stop immediately. Backoff replaces constant-delay retries. Worker
errors and archive failures are surfaced. Some enrichment adapters still return
empty results on source failure; full structured source-health reporting remains.

UI changes clarify score units and email confidence without changing Studio.
A full visual redesign, live-source validation, durable job cursor resume,
shared enrichment adapters, comprehensive evidence URL capture, and a measured
accuracy benchmark remain planned work. Trial product scripts are separate and
have not been migrated to the production archive format.

Validation: python -m unittest discover -s tests; node --check web/static/app.js;
Python AST syntax validation and isolated backend-import smoke check. No live
collection, mail delivery testing, or cloud database validation was performed.

## One-click collection

The collector defaults to automatic mode and 100 contacts. Enter a topic and click
Collect contacts. OpenAlex discovery and enrichment run first, followed by bioRxiv
for the remaining count. Score/date settings are preserved. NIH remains a separate
grant-specific search because its criteria differ. Existing archive emails are
excluded from the run export. A unique collection CSV and JSON summary are written
in the daily data folder, and the UI shows a download link. Source failures and
shortfalls are recorded; quality filters are not lowered to fill the target.
Automated tests use simulated sources. Live yield, UI appearance, and latency
still need validation. Automatic mode currently waits for the first source to
finish before starting fallback; it does not guarantee a completion time.
