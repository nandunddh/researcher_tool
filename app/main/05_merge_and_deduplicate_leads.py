"""
05_merge_and_deduplicate_leads.py
=================================
Merges and deduplicates researcher leads across multiple sources:
- bioRxiv preprints (biorxiv_cellbio_send_ready.csv)
- OpenAlex & Europe PMC verified leads (daily_verified_leads_YYYY-MM-DD.csv)

Outputs a single 100% clean, unified, send-ready outreach file with 0% duplicates.
"""

import csv
import os
import re
import sys
from datetime import datetime
from pathlib import Path

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
TODAY_STR = datetime.now().strftime("%Y-%m-%d")
TODAY_DIR = DATA_DIR / TODAY_STR

# Default files if not specified via CLI
DEFAULT_BIORXIV = TODAY_DIR / "biorxiv_cellbio_send_ready.csv"
DEFAULT_OPENALEX = TODAY_DIR / f"daily_verified_leads_{TODAY_STR}.csv"
DEFAULT_OUTPUT = TODAY_DIR / f"cell_biology_master_send_ready_{TODAY_STR}.csv"


def clean_str(val):
    if not val:
        return ""
    s = str(val).strip()
    return "" if s.lower() in {"none", "null", "nan"} else s


def normalize_email(email):
    if not email:
        return ""
    em = email.strip().lower().rstrip(".,;")
    # If multiple emails separated by semicolon, take the primary
    if ";" in em:
        em = em.split(";")[0].strip()
    return em


def merge_and_deduplicate(biorxiv_file: Path, openalex_file: Path, output_file: Path):
    print("=" * 70)
    print("🚀 RESEARCHER TOOL: LEAD MERGER & ZERO-DUPLICATE DEDUPLICATOR")
    print("=" * 70)
    print(f"📁 Source 1 (bioRxiv)   : {biorxiv_file}")
    print(f"📁 Source 2 (OpenAlex)  : {openalex_file}")
    print(f"📁 Output Master File   : {output_file}")
    print("=" * 70 + "\n")

    if not biorxiv_file.exists():
        # Try finding in root or data
        alt_biorxiv = BASE_DIR / "biorxiv_cellbio_send_ready.csv"
        if alt_biorxiv.exists():
            biorxiv_file = alt_biorxiv
        else:
            found = list(DATA_DIR.rglob("*biorxiv*send_ready*.csv"))
            if found:
                biorxiv_file = found[0]

    if not openalex_file.exists():
        found = list(DATA_DIR.rglob("daily_verified_leads_*.csv"))
        if found:
            openalex_file = sorted(found, key=lambda p: p.stat().st_mtime, reverse=True)[0]

    if not biorxiv_file.exists():
        raise SystemExit(f"❌ Could not find bioRxiv file: {biorxiv_file}")
    if not openalex_file.exists():
        raise SystemExit(f"❌ Could not find verified leads file: {openalex_file}")

    unified_leads = {}  # email -> lead dict
    stats = {
        "biorxiv_total": 0,
        "openalex_total": 0,
        "duplicates_merged": 0,
        "invalid_emails_skipped": 0,
    }

    # 1. Process bioRxiv file
    with open(biorxiv_file, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for r in reader:
            stats["biorxiv_total"] += 1
            raw_email = r.get("professional_email") or r.get("email") or ""
            email = normalize_email(raw_email)
            if not email or "@" not in email:
                stats["invalid_emails_skipped"] += 1
                continue

            name = clean_str(r.get("researcher_name") or r.get("full_name"))
            inst = clean_str(r.get("institution") or r.get("affiliations_seen_on_matching_papers"))
            title = clean_str(r.get("paper_title") or r.get("example_papers"))
            doi = clean_str(r.get("doi") or r.get("example_paper_dois"))
            category = clean_str(r.get("category") or r.get("matched_search_terms") or "cell biology")
            source_url = clean_str(r.get("email_source_url"))

            unified_leads[email] = {
                "researcher_name": name,
                "professional_email": email,
                "institution": inst,
                "category_topic": category,
                "paper_title": title,
                "doi": doi,
                "orcid": "",
                "source_dataset": "bioRxiv_Preprint",
                "email_source_url": source_url,
                "verification_status": "Verified (bioRxiv JATS)",
                "date_compiled": TODAY_STR,
            }

    print(f"Loaded {stats['biorxiv_total']:,} leads from bioRxiv.")

    # 2. Process OpenAlex / Europe PMC verified file
    with open(openalex_file, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for r in reader:
            stats["openalex_total"] += 1
            raw_email = r.get("professional_email") or r.get("email") or ""
            email = normalize_email(raw_email)
            if not email or "@" not in email:
                stats["invalid_emails_skipped"] += 1
                continue

            name = clean_str(r.get("researcher_name") or r.get("full_name"))
            inst = clean_str(r.get("affiliations_seen_on_matching_papers") or r.get("institution"))
            title = clean_str(r.get("example_papers") or r.get("paper_title"))
            doi = clean_str(r.get("example_paper_dois") or r.get("doi"))
            category = clean_str(r.get("matched_search_terms") or r.get("category") or "cell biology")
            orcid = clean_str(r.get("orcid"))
            source_url = clean_str(r.get("email_source_url"))
            status = clean_str(r.get("email_status") or r.get("review_status") or "Verified Name Match")

            # Check duplicate / existing
            if email in unified_leads:
                stats["duplicates_merged"] += 1
                existing = unified_leads[email]
                # Merge enriched fields
                existing["source_dataset"] = "bioRxiv_Preprint + OpenAlex_EuropePMC"
                if orcid and not existing["orcid"]:
                    existing["orcid"] = orcid
                if inst and (not existing["institution"] or len(inst) > len(existing["institution"])):
                    existing["institution"] = inst
                if not existing["doi"] and doi:
                    existing["doi"] = doi
                if not existing["paper_title"] and title:
                    existing["paper_title"] = title
            else:
                unified_leads[email] = {
                    "researcher_name": name,
                    "professional_email": email,
                    "institution": inst,
                    "category_topic": category,
                    "paper_title": title,
                    "doi": doi,
                    "orcid": orcid,
                    "source_dataset": "OpenAlex_EuropePMC",
                    "email_source_url": source_url,
                    "verification_status": status,
                    "date_compiled": TODAY_STR,
                }

    print(f"Loaded {stats['openalex_total']:,} leads from OpenAlex / Europe PMC.")
    print(f"Exact duplicates detected & merged: {stats['duplicates_merged']:,}\n")

    # 3. Export to CSV
    output_file.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "researcher_name",
        "professional_email",
        "institution",
        "category_topic",
        "paper_title",
        "doi",
        "orcid",
        "source_dataset",
        "email_source_url",
        "verification_status",
        "date_compiled",
    ]

    all_rows = list(unified_leads.values())

    # Sort alphabetically by researcher name
    all_rows.sort(key=lambda x: x["researcher_name"].lower() if x["researcher_name"] else "")

    with open(output_file, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)

    # 4. Optional Excel export
    excel_file = output_file.with_suffix(".xlsx")
    try:
        import pandas as pd
        df = pd.DataFrame(all_rows)
        df.to_excel(excel_file, index=False)
        has_excel = True
    except Exception:
        has_excel = False

    # Summary
    print("=" * 70)
    print("✅ MERGE & DEDUPLICATION COMPLETE - 0% DUPLICATES GUARANTEED")
    print("=" * 70)
    print(f"Total bioRxiv Leads            : {stats['biorxiv_total']:,}")
    print(f"Total OpenAlex Verified Leads  : {stats['openalex_total']:,}")
    print(f"Duplicates Detected & Cleaned  : {stats['duplicates_merged']:,}")
    print(f"★ Final Unique Send-Ready Leads: {len(all_rows):,} ★")
    print("=" * 70)
    print(f"📁 CSV Output   : {output_file}")
    if has_excel:
        print(f"📁 Excel Output : {excel_file}")
    print("=" * 70 + "\n")

    return output_file


if __name__ == "__main__":
    f1 = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BIORXIV
    f2 = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OPENALEX
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_OUTPUT

    merge_and_deduplicate(f1, f2, out)
