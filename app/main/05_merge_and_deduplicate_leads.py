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
from app_config import get_data_dir
DATA_DIR = get_data_dir()
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

    from collector_store import merge_files
    result = merge_files(output_file, [biorxiv_file, openalex_file])
    print(f"Merged {result['unique_master_leads']} unique emails into {output_file}")
    return output_file


if __name__ == "__main__":
    f1 = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BIORXIV
    f2 = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OPENALEX
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_OUTPUT

    merge_and_deduplicate(f1, f2, out)
