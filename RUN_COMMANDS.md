# How to Run the Researcher Email Pipeline

This guide provides the exact commands, scripts, and output files for your conference data collection and email deliverability verification.

---

## Tool 1: bioRxiv CellBio Collector (Preprints)
* **Best for:** Cell Biology, Molecular Biology, Biochemistry.
* **Why use it:** bioRxiv preprints have very high author email coverage and represent researchers working right now (2024–2026).
* **Separate Output:** `biorxiv_cellbio_researchers.csv`

### Command:
```powershell
python biorxiv_cellbio_collector.py
```

---

## Tool 2: OpenAlex Pipeline (Published Journals & Global Research)
* **Best for:** Any conference topic (CellBio, AI, Polymers, Healthcare, etc.) across 3.4+ Million published papers.
* **Separate Output:** `researchers_with_emails.csv`

### Commands (In Order):

```powershell
# Step 1: Extract candidate researchers from OpenAlex
python 01_extract_researchers.py

# Step 2: Enrich with verified scholarly emails (ORCID, Crossref, Europe PMC XML)
python 02_collect_scholarly_emails.py
```

---

## Tool 3: Email Deliverability Verification (Anti-Bounce)
Before sending invitations, run this to test the DNS mail infrastructure of the collected emails and flag any dead domains to ensure a near **0% bounce rate**:

```powershell
# Verify OpenAlex emails:
python verify_email_deliverability.py

# Or verify bioRxiv CellBio emails:
python verify_email_deliverability.py biorxiv_cellbio_researchers.csv
```
* **What it adds to the CSV:**
  - `deliverability_status`: Tagged as `Valid / Active Mail Server` or `Dead Domain / Bounces`.
  - `mail_server_info`: The active host name handling their incoming email.

---

## How to Adjust Volume & Scale

In `01_extract_researchers.py` (lines 22–23):

| Target Volume | `PER_PAGE` | `MAX_PAGES_PER_TERM` | Output File |
| :--- | :--- | :--- | :--- |
| **~3,000 researchers** | `100` | `3` | `researchers_with_emails.csv` |
| **~15,000 researchers** | `100` | `15` | `researchers_with_emails.csv` |
| **~50,000 researchers** | `100` | `50` | `researchers_with_emails.csv` |

In `biorxiv_cellbio_collector.py` (line 30):
* Change `MAX_PREPRINTS_TO_SCAN = 1000` to `3000` or `5000` to pull more bioRxiv papers.

---

## Important Rules:
1. **Close CSVs in Excel Before Running:** Windows locks CSV files while open in Excel. Close `biorxiv_cellbio_researchers.csv` and `researchers_with_emails.csv` in Excel before running scripts to avoid `PermissionError`.
2. **API Keys:**
   * OpenAlex uses your configured API key (`5h8s0xhGxE1uL0ZJ5CdsT5`).
   * bioRxiv and the email verification tool are 100% free and anonymous (no keys needed).
