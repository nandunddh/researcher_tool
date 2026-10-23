"""
02_collect_scholarly_emails_test.py
===================================
Evaluation Edition - Stage 2: Verified Scholarly Enrichment.
Enriches candidate pool with genuine author emails (ORCID, Crossref, Europe PMC XML).

Strict Trial Enforcement:
1. Active 7-day trial verification.
2. Max 1,000 verified emails PER CALENDAR DAY.
3. Automatically stops and saves when the 1,000 daily verified limit is reached.
"""

import csv
import json
import os
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from threading import Lock

import requests

from trial_manager import trial_engine

# Check trial validity
status = trial_engine.check_status()
if not status["active"]:
    print("\n" + "!" * 65)
    print("❌ TRIAL EXPIRED")
    print(f"Reason: {status.get('reason')}")
    print("Please contact support to upgrade to a commercial license.")
    print("!" * 65 + "\n")
    sys.exit(1)

# Check daily quota
remaining_today = status["remaining_verified_today"]
if remaining_today <= 0:
    print("\n" + "=" * 65)
    print("⚠️ DAILY TRIAL LIMIT REACHED (1,000 / 1,000 Verified Leads Today)")
    print("Your 1,000 daily verified email quota has been exhausted for today.")
    print("It will automatically reset tomorrow, or upgrade to Pro for unlimited processing.")
    print(f"Trial Time Remaining: {status['days_left']} days (Expires: {status['expires_on']})")
    print("=" * 65 + "\n")
    sys.exit(0)

# Settings
FOLDER = Path(__file__).parent / "data"
FOLDER.mkdir(parents=True, exist_ok=True)
MASTER_POOL_FILE = FOLDER / "Physical_Chemistry_needto_extract.csv"
CENTRAL_MASTER_FILE = FOLDER / "central_master_leads.csv"

TODAY_STR = datetime.now().strftime("%Y-%m-%d")
TODAY_DIR = FOLDER / TODAY_STR
TODAY_DIR.mkdir(parents=True, exist_ok=True)

TARGET_DAILY_EMAILS = remaining_today  # Cap at exactly the remaining quota (up to 1,000)
MAX_WORKERS = 15
SAVE_EVERY = 25

HEADERS = {
    "User-Agent": "ResearcherContactFinder-Trial/1.0 (academic mailto:trial@openalex-tool.org)"
}

EMAIL_PATTERN = re.compile(
    r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
    re.IGNORECASE
)

IGNORED_DOMAINS = {
    "example.com", "domain.com", "email.com", "none.com",
    "s-corp.com", "github.com", "openalex.org", "wiley.com",
    "elsevier.com", "springer.com", "nature.com"
}

print_lock = Lock()


def normalize_text(text):
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", str(text))
    return normalized.encode("ASCII", "ignore").decode("utf-8").lower().strip()


def extract_name_parts(full_name):
    clean = normalize_text(full_name)
    clean = re.sub(r"\b(dr|prof|phd|md|bsc|msc|mr|mrs|ms)\b\.?", "", clean)
    words = re.findall(r"[a-z]+", clean)
    if not words:
        return "", "", [], ""
    return words[0], words[-1], words, "".join(w[0] for w in words[:-1])


def is_name_match(author_name, email):
    if not author_name or not email:
        return False
    local_part = email.split("@")[0].lower()
    first, last, words, initials = extract_name_parts(author_name)
    if last and len(last) >= 3 and last in local_part:
        return True
    if first and len(first) >= 4 and first in local_part:
        return True
    return False


def fetch_orcid_email(orcid_str):
    if not orcid_str:
        return None
    orcid_id = orcid_str.strip().rstrip("/").split("/")[-1]
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/email"
    try:
        r = requests.get(url, headers={"Accept": "application/json"}, timeout=8)
        if r.status_code == 200:
            for em in r.json().get("email", []):
                e = em.get("email", "").strip().lower()
                if EMAIL_PATTERN.match(e) and e.split("@")[-1] not in IGNORED_DOMAINS:
                    return e
    except Exception:
        pass
    return None


def fetch_europepmc_email(doi, author_name):
    if not doi:
        return None
    clean_doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "")
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    try:
        r = requests.get(url, params={"query": f'DOI:"{clean_doi}"', "format": "json", "resultType": "core"}, timeout=8)
        if r.status_code == 200:
            results = r.json().get("resultList", {}).get("result", [])
            for res in results:
                for auth in res.get("authorList", {}).get("author", []):
                    aff = auth.get("affiliation", "")
                    found = EMAIL_PATTERN.findall(aff)
                    for em in found:
                        em_clean = em.lower().strip(".,;:()")
                        if is_name_match(author_name, em_clean):
                            return em_clean
    except Exception:
        pass
    return None


def process_candidate(row):
    name = row.get("researcher_name", "")
    orcid = row.get("orcid", "")
    dois = row.get("example_paper_dois", "")

    # 1. ORCID check
    em = fetch_orcid_email(orcid)
    if em:
        return em, "ORCID Public Profile", "Verified Name Match"

    # 2. Europe PMC XML lookup
    if dois:
        for doi in dois.split(";")[:2]:
            em = fetch_europepmc_email(doi.strip(), name)
            if em:
                return em, f"Europe PMC XML ({doi.strip()})", "Verified Name Match"

    return "", "", "No email found in available sources"


def main():
    print("=" * 65)
    print("STAGE 2: SCHOLARLY EMAIL ENRICHMENT (EVALUATION BUILD)")
    print(f"Trial Days Left: {status['days_left']} (Expires: {status['expires_on']})")
    print(f"Verified Today  : {status['today_verified']} / 1,000 leads")
    print(f"Target For Run  : Collecting up to {TARGET_DAILY_EMAILS} fresh verified leads")
    print("=" * 65 + "\n")

    # Locate pool file
    pool_file = None
    if len(sys.argv) > 1 and sys.argv[1].strip():
        cand = Path(sys.argv[1].strip())
        if cand.exists():
            pool_file = cand

    if not pool_file:
        queues = sorted(FOLDER.glob("*_needto_extract.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
        if queues:
            pool_file = queues[0]
        elif MASTER_POOL_FILE.exists():
            pool_file = MASTER_POOL_FILE
        else:
            print("❌ No candidate queue file found. Please run 01_extract_researchers_test.py first!")
            return

    with pool_file.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    for col in ["professional_email", "email_source_url", "review_status", "email_status"]:
        if col not in fieldnames:
            fieldnames.append(col)

    pending = [i for i, r in enumerate(rows) if r.get("review_status") != "found"]
    print(f"Loaded candidate pool: {pool_file.name} ({len(rows):,} total, {len(pending):,} pending)")

    topic_name = pool_file.name.replace("_needto_extract.csv", "").replace(".csv", "")
    found_output = TODAY_DIR / f"{topic_name}_found_{TODAY_STR}.csv"

    new_found_today = 0
    start_time = time.time()

    def save_progress():
        # Update pool file
        with pool_file.open("w", encoding="utf-8-sig", newline="") as pf:
            w = csv.DictWriter(pf, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)

        # Append to found file
        found_rows = [r for r in rows if r.get("review_status") == "found"]
        with found_output.open("w", encoding="utf-8-sig", newline="") as ff:
            w = csv.DictWriter(ff, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(found_rows)

    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_idx = {executor.submit(process_candidate, rows[i]): i for i in pending}

            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                email, source, status_str = future.result()

                if email:
                    rows[idx]["professional_email"] = email
                    rows[idx]["email_source_url"] = source
                    rows[idx]["review_status"] = "found"
                    rows[idx]["email_status"] = status_str
                    new_found_today += 1
                    trial_engine.record_verified_lead(1)

                    with print_lock:
                        print(f"✔ [VERIFIED] {rows[idx]['researcher_name']} -> {email} ({new_found_today}/{TARGET_DAILY_EMAILS})")

                    if new_found_today >= TARGET_DAILY_EMAILS:
                        print("\n" + "=" * 65)
                        print(f"🎯 DAILY QUOTA REACHED: {new_found_today} verified emails collected today!")
                        print("Daily test limit (1,000 leads) reached. Resets tomorrow at 00:00 UTC.")
                        print("=" * 65)
                        for f in future_to_idx:
                            f.cancel()
                        break
                else:
                    rows[idx]["email_status"] = "Checked (no email)"

                if new_found_today % SAVE_EVERY == 0 and new_found_today > 0:
                    save_progress()

    finally:
        save_progress()

    elapsed = (time.time() - start_time) / 60.0
    print("\n" + "=" * 65)
    print("SESSION SUMMARY")
    print(f"Verified Leads Collected Today : {new_found_today:,}")
    print(f"Processing Time                : {elapsed:.1f} minutes")
    print(f"Saved Output CSV               : {found_output}")
    print(f"Trial Time Remaining           : {status['days_left']} days")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
