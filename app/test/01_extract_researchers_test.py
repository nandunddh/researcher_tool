"""
01_extract_researchers_test.py
==============================
Evaluation Edition - Stage 1: Candidate Discovery & Extraction.
Extracts 5,000 to 10,000 candidate researchers from OpenAlex into the topic queue.
Enforces 7-day trial validity before executing.
"""

import calendar
import csv
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

# Import trial controller
from trial_manager import trial_engine

status = trial_engine.check_status()
if not status["active"]:
    print("\n" + "!" * 60)
    print("❌ TRIAL EXPIRED")
    print(f"Reason: {status.get('reason')}")
    print("Please contact support to upgrade to a commercial license.")
    print("!" * 60 + "\n")
    sys.exit(1)

SEARCH_TERMS = ["Physical Chemistry"]

# Date filter
FROM_DATE = "2026-01-01"
TO_DATE = "2026-01-31"

# Scale settings for 5,000 - 10,000 candidate pool:
PER_PAGE = 200
MAX_PAGES_PER_TERM = 35  # ~7,000 candidates per term

BASE_URL = "https://api.openalex.org/works"
API_KEY = os.environ.get("OPENALEX_API_KEY", "")

from app_config import get_data_dir

DATA_DIR = get_data_dir()
TODAY_DIR = DATA_DIR / datetime.now().strftime("%Y-%m-%d")
TODAY_DIR.mkdir(parents=True, exist_ok=True)
TIMESTAMP = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
STOP_REQUESTED = False


def request_stop():
    global STOP_REQUESTED
    STOP_REQUESTED = True


def reset_stop():
    global STOP_REQUESTED
    STOP_REQUESTED = False


def build_date_filter(from_d, to_d=""):
    from_str = str(from_d).strip() if from_d else ""
    to_str = str(to_d).strip() if to_d else ""

    if re.fullmatch(r"\d{4}", from_str):
        y1 = int(from_str)
        if not to_str or to_str == from_str:
            return f"publication_year:{y1}"
        if re.fullmatch(r"\d{4}", to_str):
            y2 = int(to_str)
            return f"from_publication_date:{min(y1, y2)}-01-01,to_publication_date:{max(y1, y2)}-12-31"

    if re.fullmatch(r"\d{4}-\d{2}", from_str):
        y, m = map(int, from_str.split("-"))
        _, last_day = calendar.monthrange(y, m)
        return f"from_publication_date:{y:04d}-{m:02d}-01,to_publication_date:{y:04d}-{m:02d}-{last_day:02d}"

    if not to_str:
        to_str = from_str
    return f"from_publication_date:{from_str},to_publication_date:{to_str}"


def main():
    reset_stop()
    print("=" * 65)
    print("STAGE 1: RESEARCHER CANDIDATE EXTRACTION (EVALUATION BUILD)")
    print(f"Trial Remaining: {status['days_left']} days (Expires: {status['expires_on']})")
    print(f"Target Discovery Pool: 5,000 – 10,000 candidate researchers")
    print(f"Topic: {SEARCH_TERMS[0]} | Date Range: {FROM_DATE} to {TO_DATE}")
    print("=" * 65)

    headers = {
        "User-Agent": "ResearcherTool-Eval/1.0 (academic research mailto:evaluation@openalex-tool.org)",
        "api_key": API_KEY,
    }

    date_filter = build_date_filter(FROM_DATE, TO_DATE)
    researchers = {}

    for term in SEARCH_TERMS:
        print(f"\nSearching OpenAlex for '{term}'...")
        cursor = "*"
        page = 1

        while page <= MAX_PAGES_PER_TERM:
            if STOP_REQUESTED:
                print("\n[Stopped] Discovery halted by user request.")
                break

            params = {
                "search": term,
                "filter": date_filter,
                "per-page": PER_PAGE,
                "cursor": cursor,
            }
            data = None
            max_retries = 3
            for attempt in range(1, max_retries + 1):
                try:
                    resp = requests.get(BASE_URL, headers=headers, params=params, timeout=45)
                    if resp.status_code == 200:
                        data = resp.json()
                        break
                    elif resp.status_code == 429:
                        print(f"  [Rate Limit] OpenAlex 429 received. Backing off (attempt {attempt}/{max_retries})...")
                        time.sleep(attempt * 4)
                    else:
                        print(f"  [Warn] OpenAlex responded with status {resp.status_code} (attempt {attempt}/{max_retries})")
                        time.sleep(attempt * 2)
                except requests.exceptions.Timeout:
                    print(f"  [Warn] Request timed out on page {page} (attempt {attempt}/{max_retries}). Retrying...")
                    time.sleep(attempt * 3)
                except Exception as e:
                    print(f"  [Warn] Request connection issue (attempt {attempt}/{max_retries}): {e}")
                    time.sleep(attempt * 2)

            if not data:
                print(f"[Error] Unable to retrieve page {page} from OpenAlex after {max_retries} attempts.")
                break

            results = data.get("results", [])
            if not results:
                print(f"No further results found for '{term}' at page {page}.")
                break

            for work in results:
                title = work.get("title") or "Untitled"
                doi = work.get("doi") or ""
                year = work.get("publication_year")

                for authorship in work.get("authorships", []):
                    author = authorship.get("author", {})
                    author_id = author.get("id")
                    name = author.get("display_name")
                    orcid = author.get("orcid") or ""

                    if not author_id or not name:
                        continue

                    institutions = [
                        inst.get("display_name")
                        for inst in authorship.get("institutions", [])
                        if inst.get("display_name")
                    ]

                    rec = researchers.setdefault(author_id, {
                        "name": name,
                        "orcid": set(),
                        "institutions": set(),
                        "search_terms": set(),
                        "papers": {},
                        "emails": set(),
                        "email_source": "",
                    })

                    if orcid:
                        rec["orcid"].add(orcid)
                    rec["institutions"].update(institutions)
                    rec["search_terms"].add(term)

                    if work.get("id") and work["id"] not in rec["papers"]:
                        rec["papers"][work["id"]] = {
                            "title": title,
                            "doi": doi,
                            "year": year,
                        }

            print(f"Page {page}/{MAX_PAGES_PER_TERM} scanned. Total unique candidates so far: {len(researchers):,}")
            cursor = data.get("meta", {}).get("next_cursor")
            if not cursor:
                break
            page += 1
            time.sleep(0.15)

    # Output results
    topic_raw = SEARCH_TERMS[0] if SEARCH_TERMS else "researchers"
    topic_slug = re.sub(r"[^A-Za-z0-9]+", "_", topic_raw).strip("_") or "researchers"
    needto_file = DATA_DIR / f"{topic_slug}_needto_extract.csv"

    columns = [
        "researcher_name",
        "openalex_author_id",
        "orcid",
        "affiliations_seen_on_matching_papers",
        "matched_search_terms",
        "matching_paper_count",
        "latest_matching_paper_year",
        "example_papers",
        "example_paper_dois",
        "professional_email",
        "email_source_url",
        "review_status",
    ]

    existing_ids = set()
    if needto_file.exists():
        try:
            with needto_file.open("r", encoding="utf-8-sig") as nf:
                for r in csv.DictReader(nf):
                    aid = r.get("openalex_author_id")
                    if aid:
                        existing_ids.add(aid)
        except Exception:
            pass

    added = 0
    needto_exists = needto_file.exists()
    with needto_file.open("a" if needto_exists else "w", newline="", encoding="utf-8-sig") as nf:
        writer = csv.DictWriter(nf, fieldnames=columns)
        if not needto_exists:
            writer.writeheader()

        for author_id, rec in researchers.items():
            if author_id not in existing_ids:
                papers = sorted(rec["papers"].values(), key=lambda p: p["year"] or 0, reverse=True)
                writer.writerow({
                    "researcher_name": rec["name"],
                    "openalex_author_id": author_id,
                    "orcid": "; ".join(sorted(rec["orcid"])),
                    "affiliations_seen_on_matching_papers": "; ".join(sorted(rec["institutions"])),
                    "matched_search_terms": "; ".join(sorted(rec["search_terms"])),
                    "matching_paper_count": len(papers),
                    "latest_matching_paper_year": max((p["year"] or 0 for p in papers), default=""),
                    "example_papers": "; ".join(p["title"] for p in papers[:3] if p["title"]),
                    "example_paper_dois": "; ".join(p["doi"] for p in papers[:3] if p.get("doi")),
                    "professional_email": "",
                    "email_source_url": "",
                    "review_status": "needs_review",
                })
                existing_ids.add(author_id)
                added += 1

    trial_engine.record_extracted_candidates(added)
    print("\n" + "=" * 65)
    if len(existing_ids) == 0 and added == 0:
        print("⚠️ STAGE 1 WARNING: 0 CANDIDATES EXTRACTED")
        print("No candidates were added to the pool.")
        print("This typically happens if the OpenAlex API connection timed out")
        print("or if no publications matched your date range/keyword.")
        print("👉 Please check your network connection and click 'Run OpenAlex Discovery' again.")
        print("=" * 65 + "\n")
    else:
        print("STAGE 1 COMPLETED SUCCESSFULLY")
        print(f"Added {added:,} new candidate researchers to the pool.")
        print(f"Total candidates ready for verification: {len(existing_ids):,}")
        print(f"Saved to: {needto_file.name}")
        print("=" * 65)
        print("\n👉 Next Step: Run Tool 02 to enrich with verified scholarly emails (1,000/day trial allowance).\n")


def run(keyword="Physical Chemistry", pages=25, from_date="2026-01-01", to_date="2026-01-31"):
    global SEARCH_TERMS, MAX_PAGES_PER_TERM, FROM_DATE, TO_DATE
    if keyword:
        SEARCH_TERMS = [str(keyword).strip()]
    if pages:
        MAX_PAGES_PER_TERM = int(pages)
    if from_date:
        FROM_DATE = str(from_date).strip()
    if to_date:
        TO_DATE = str(to_date).strip()
    main()


if __name__ == "__main__":
    k = sys.argv[1].strip() if len(sys.argv) > 1 and sys.argv[1].strip() else "Physical Chemistry"
    p = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 25
    f = sys.argv[3].strip() if len(sys.argv) > 3 and sys.argv[3].strip() else "2026-01-01"
    t = sys.argv[4].strip() if len(sys.argv) > 4 and sys.argv[4].strip() else "2026-01-31"
    run(k, p, f, t)
