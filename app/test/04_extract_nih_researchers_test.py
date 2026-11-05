"""
04_extract_nih_researchers_test.py
==================================
Extracts funded Principal Investigators (Professors/Lab Heads) from the official
US Government NIH RePORTER API with active trial limits enforcement.
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

remaining_today = status["remaining_verified_today"]
if remaining_today <= 0:
    print("\n" + "=" * 65)
    print("⚠️ DAILY TRIAL LIMIT REACHED (1,000 / 1,000 Verified Leads Today)")
    print("Your 1,000 daily verified email quota has been exhausted for today.")
    print("It will automatically reset tomorrow, or upgrade to Pro for unlimited processing.")
    print(f"Trial Time Remaining: {status['days_left']} days (Expires: {status['expires_on']})")
    print("=" * 65 + "\n")
    sys.exit(0)

# Configuration
KEYWORDS = ["cell biology"]
FISCAL_YEARS = [2026, 2025]
TARGET_LEADS = min(100, remaining_today)
MAX_RESULTS_PER_KEYWORD = 300
MAX_WORKERS = 15

from app_config import get_data_dir

FOLDER = get_data_dir()
FOLDER.mkdir(parents=True, exist_ok=True)
CENTRAL_MASTER_FILE = FOLDER / "central_master_leads.csv"

TODAY_STR = datetime.now().strftime("%Y-%m-%d")
TODAY_DIR = FOLDER / TODAY_STR
TODAY_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_CSV = TODAY_DIR / f"nih_funded_leads_{TODAY_STR}.csv"

HEADERS = {
    "User-Agent": "AcademicConferenceOutreach/1.0 (academic-grants-directory; contact@conference-outreach.org)",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

STOP_REQUESTED = False


def request_stop():
    global STOP_REQUESTED
    STOP_REQUESTED = True


def reset_stop():
    global STOP_REQUESTED
    STOP_REQUESTED = False

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


def parse_nih_name(raw_name):
    if not raw_name:
        return "", "", ""
    clean = re.sub(r"\b(dr|prof|phd|md|bsc|msc)\b\.?", "", raw_name, flags=re.IGNORECASE).strip()
    if "," in clean:
        parts = clean.split(",", 1)
        last = parts[0].strip().title()
        first_part = parts[1].strip().split()
        first = first_part[0].strip().title() if first_part else ""
        middle = " ".join(first_part[1:]).strip().title() if len(first_part) > 1 else ""
        full_name = f"{first} {middle} {last}".strip() if middle else f"{first} {last}".strip()
    else:
        parts = clean.split()
        first = parts[0].strip().title() if parts else ""
        last = parts[-1].strip().title() if len(parts) > 1 else ""
        full_name = clean.title()
    return full_name, first, last


def is_same_person(author_name, candidate_name):
    if not author_name or not candidate_name:
        return False
    norm1 = normalize_text(author_name)
    norm2 = normalize_text(candidate_name)
    if norm1 == norm2:
        return True
    parts1 = [p for p in re.split(r"[^a-z0-9]+", norm1) if len(p) >= 2]
    parts2 = [p for p in re.split(r"[^a-z0-9]+", norm2) if len(p) >= 2]
    if not parts1 or not parts2:
        return False
    if parts1[-1] == parts2[-1]:
        if len(parts1[0]) >= 1 and len(parts2[0]) >= 1:
            if parts1[0][0] == parts2[0][0]:
                return True
    return False


def is_email_match(author_name, email):
    if not email or "@" not in email:
        return False
    local = email.split("@")[0].lower()
    norm_name = normalize_text(author_name)
    parts = [p for p in re.split(r"[^a-z0-9]+", norm_name) if len(p) >= 2]
    if not parts:
        return False
    last = parts[-1]
    first = parts[0]
    if last in local:
        return True
    if len(first) >= 1 and (first[0] + last) in local:
        return True
    if len(first) >= 1 and (last + first[0]) in local:
        return True
    if len(first) >= 4 and first in local:
        return True
    return False


def get_author_affiliations(author_dict):
    affs = []
    if author_dict.get("affiliation"):
        affs.append(author_dict.get("affiliation"))
    details = author_dict.get("authorAffiliationDetailsList", {})
    if isinstance(details, dict):
        aff_list = details.get("authorAffiliation", [])
        for item in aff_list:
            if isinstance(item, dict) and item.get("affiliation"):
                affs.append(item.get("affiliation"))
            elif isinstance(item, str):
                affs.append(item)
    return affs


def load_dedup_set():
    dedup = set()
    if CENTRAL_MASTER_FILE.exists():
        try:
            with open(CENTRAL_MASTER_FILE, "r", encoding="utf-8", errors="replace") as f:
                for row in csv.DictReader(f):
                    email = (row.get("email") or row.get("professional_email") or "").strip().lower()
                    if email:
                        dedup.add(email)
        except Exception:
            pass
    return dedup


def fetch_nih_projects(keyword, limit=300):
    url = "https://api.reporter.nih.gov/v2/projects/search"
    projects = []
    offset = 0
    page_size = 50
    clean_keyword = keyword.replace("_", " ")
    print(f"\n[NIH] Querying grants for keyword: '{clean_keyword}'...", flush=True)

    while offset < limit:
        if STOP_REQUESTED:
            print("\n[Stopped] NIH extraction halted by user request.")
            break
        payload = {
            "criteria": {
                "advanced_text_search": {
                    "operator": "and",
                    "search_field": "terms",
                    "search_text": clean_keyword
                },
                "fiscal_years": FISCAL_YEARS,
                "include_active_projects": True
            },
            "include_fields": [
                "ApplId", "ProjectNum", "ProjectTitle",
                "ContactPiName", "PrincipalInvestigators",
                "Organization", "AwardAmount", "FiscalYear"
            ],
            "offset": offset,
            "limit": page_size,
            "sort_field": "AwardAmount",
            "sort_order": "desc"
        }
        try:
            resp = requests.post(url, json=payload, headers=HEADERS, timeout=20)
            if resp.status_code != 200:
                break
            data = resp.json()
            results = data.get("results", [])
            if not results:
                break
            for r in results:
                pi_name = r.get("contact_pi_name") or ""
                org = r.get("organization") or {}
                org_name = org.get("org_name", "") if isinstance(org, dict) else str(org)
                org_city = org.get("org_city", "") if isinstance(org, dict) else ""
                org_state = org.get("org_state", "") if isinstance(org, dict) else ""
                full_name, first, last = parse_nih_name(pi_name)
                if not full_name:
                    continue
                projects.append({
                    "full_name": full_name,
                    "first_name": first,
                    "last_name": last,
                    "organization": org_name,
                    "city": org_city,
                    "state": org_state,
                    "award_amount": r.get("award_amount", 0),
                    "project_num": r.get("project_num", ""),
                    "project_title": r.get("project_title", ""),
                    "fiscal_year": r.get("fiscal_year", ""),
                    "keyword": clean_keyword
                })
            offset += page_size
            total = data.get("meta", {}).get("total", 0)
            print(f"  -> Fetched {len(projects)} PIs so far (Total matching grants: {total})", flush=True)
            if offset >= total:
                break
            time.sleep(0.3)
        except Exception as e:
            print(f"[ERROR] NIH API request failed: {e}", flush=True)
            break
    return projects


def find_pi_email(pi):
    author = pi["full_name"]
    first_name = pi.get("first_name", "")
    last_name = pi.get("last_name", "")
    org = pi.get("organization", "")

    # EuropePMC lookup
    try:
        query = f'AUTH:"{last_name} {first_name}"' if last_name and first_name else f'AUTH:"{author}"'
        if org:
            words = [w for w in org.split() if len(w) > 3 and w.lower() not in {"the", "and", "for", "with"}]
            if words:
                query += f' AND AFF:"{words[0]}"'
        url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
        params = {"query": query, "format": "json", "pageSize": 5, "resultType": "core"}
        res = requests.get(url, params=params, headers=HEADERS, timeout=8)
        if res.status_code == 200:
            entries = res.json().get("resultList", {}).get("result", [])
            for e in entries:
                author_list = e.get("authorList", {}).get("author", [])
                for a in author_list:
                    a_name = f"{a.get('firstName', '')} {a.get('lastName', '')}".strip() or a.get("fullName", "")
                    if is_same_person(author, a_name):
                        for aff in get_author_affiliations(a):
                            found = EMAIL_PATTERN.findall(aff)
                            for em in found:
                                em = em.lower().strip(".,;")
                                if is_email_match(author, em) and em.split("@")[-1] not in IGNORED_DOMAINS:
                                    return em
    except Exception:
        pass

    # OpenAlex profile lookup
    try:
        url = f"https://api.openalex.org/authors?search={requests.utils.quote(author)}&per-page=3"
        res = requests.get(url, headers=HEADERS, timeout=8)
        if res.status_code == 200:
            for r in res.json().get("results", []):
                if not is_same_person(author, r.get("display_name", "")):
                    continue
                orcid_url = r.get("orcid")
                if orcid_url:
                    orcid_id = orcid_url.rstrip("/").split("/")[-1]
                    try:
                        o_res = requests.get(f"https://pub.orcid.org/v3.0/{orcid_id}/email", headers={"Accept": "application/json"}, timeout=5)
                        if o_res.status_code == 200:
                            for entry in o_res.json().get("email", []):
                                em = (entry.get("email") or "").strip().lower()
                                if em and is_email_match(author, em) and em.split("@")[-1] not in IGNORED_DOMAINS:
                                    return em
                    except Exception:
                        pass
    except Exception:
        pass

    return ""


def main():
    reset_stop()
    print("=" * 70, flush=True)
    print("🚀 NIH RePORTER GRANT INVESTIGATOR EXTRACTOR (TRIAL EDITION)", flush=True)
    print(f"Target Keywords : {', '.join(KEYWORDS)}", flush=True)
    print(f"Target Leads    : {TARGET_LEADS} (Remaining today: {remaining_today})", flush=True)
    print("=" * 70, flush=True)

    dedup = load_dedup_set()
    all_pis = []
    for kw in KEYWORDS:
        pis = fetch_nih_projects(kw, limit=MAX_RESULTS_PER_KEYWORD)
        all_pis.extend(pis)
        if len(all_pis) >= TARGET_LEADS * 2:
            break

    unique_pis = []
    seen = set()
    for pi in all_pis:
        norm = normalize_text(pi["full_name"])
        if norm and norm not in seen and norm not in dedup:
            seen.add(norm)
            unique_pis.append(pi)

    print(f"\n[PI POOL] Found {len(unique_pis):,} unique grant PIs. Enriching emails...", flush=True)

    collected_leads = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(find_pi_email, pi): pi for pi in unique_pis}
        for future in as_completed(future_map):
            pi = future_map[future]
            try:
                email = future.result()
            except Exception:
                email = ""

            if email and email not in dedup:
                dedup.add(email)
                lead = {
                    "full_name": pi["full_name"],
                    "email": email,
                    "organization": pi["organization"],
                    "city": pi["city"],
                    "state": pi["state"],
                    "award_amount": f"${pi['award_amount']:,}" if isinstance(pi["award_amount"], (int, float)) else str(pi["award_amount"]),
                    "project_title": pi["project_title"],
                    "fiscal_year": pi["fiscal_year"],
                    "field_keyword": pi["keyword"],
                    "source": "NIH_RePORTER_Grant",
                    "date_collected": TODAY_STR
                }
                collected_leads.append(lead)
                trial_engine.record_verified_lead(1)

                with print_lock:
                    print(f"  [FOUND] {pi['full_name']} <{email}> | {pi['organization'][:30]} | {lead['award_amount']}", flush=True)

            if len(collected_leads) >= TARGET_LEADS:
                print(f"\n🎯 TARGET REACHED: {TARGET_LEADS} funded PI leads collected!", flush=True)
                break

    if collected_leads:
        fieldnames = [
            "full_name", "email", "organization", "city", "state",
            "award_amount", "project_title", "fiscal_year", "field_keyword",
            "source", "date_collected"
        ]
        with open(EXPORT_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(collected_leads)

        master_exists = CENTRAL_MASTER_FILE.exists()
        with open(CENTRAL_MASTER_FILE, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not master_exists:
                writer.writeheader()
            writer.writerows(collected_leads)

        print("\n" + "=" * 70, flush=True)
        print(f"✅ EXPORT COMPLETE: {len(collected_leads)} funded PI leads saved!", flush=True)
        print(f"📁 Daily Export: {EXPORT_CSV}", flush=True)
        print("=" * 70, flush=True)
    else:
        print("\n[INFO] No verified emails found for this batch. Try different keywords.", flush=True)


def run(keyword="cell biology", target_leads=100):
    global KEYWORDS, TARGET_LEADS
    if keyword:
        KEYWORDS = [str(keyword).strip()]
    if target_leads:
        TARGET_LEADS = min(int(target_leads), remaining_today)
    main()


if __name__ == "__main__":
    kw = sys.argv[1].strip() if len(sys.argv) > 1 and sys.argv[1].strip() else "cell biology"
    tgt = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 100
    run(kw, tgt)
