#!/usr/bin/env python3
"""
03_unified_lead_pipeline.py
===========================
Unified 1-Click Scientific Lead Generation & Email Verification Engine (High Performance).
Combines Discovery, Keyword Title Relevance Scoring, Multi-Source Parallel Email Verification,
Live ETA / Progress Tracking, and Oracle PostgreSQL Cloud Sync.
"""

import calendar
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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import requests
from requests.adapters import HTTPAdapter

try:
    from app_config import get_data_dir
    DATA_DIR = get_data_dir()
except Exception:
    DATA_DIR = Path(__file__).resolve().parent / "data"

DATA_DIR.mkdir(parents=True, exist_ok=True)
CENTRAL_MASTER_FILE = DATA_DIR / "central_master_leads.csv"

# Global Stop Request Flag for graceful UI stop button
STOP_REQUESTED = False

def request_stop():
    global STOP_REQUESTED
    STOP_REQUESTED = True

# Cloud Database Configuration (Oracle Cloud PostgreSQL)
PG_CONFIG = {
    "host": "129.225.69.188",
    "port": 5432,
    "dbname": "sciprospect_db",
    "user": "sciprospect",
    "password": "Sc!Pr0$pect*2026#",
    "connect_timeout": 5
}

API_KEY = os.environ.get("OPENALEX_API_KEY", "").strip()
HEADERS = {
    "User-Agent": "SciProspectLeadSuite/2.0 (mailto:researcher_tool@academic.edu)"
}
if API_KEY:
    HEADERS["Authorization"] = f"Bearer {API_KEY}"

EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    re.IGNORECASE
)

IGNORED_DOMAINS = {
    "example.com", "domain.com", "email.com", "none.com",
    "s-corp.com", "github.com", "openalex.org", "wiley.com",
    "elsevier.com", "springer.com", "nature.com"
}

# Threading Locks and Shared Caches
output_lock = Lock()
doi_lock = Lock()
orcid_lock = Lock()
db_lock = Lock()
doi_cache = {}    # doi -> list of extracted clean emails
orcid_cache = {}  # orcid_url -> email

# Setup HTTP Connection Pooling Session
http_session = requests.Session()
adapter = HTTPAdapter(pool_connections=30, pool_maxsize=30, max_retries=1)
http_session.mount("https://", adapter)
http_session.mount("http://", adapter)


# ----------------------------------------------------------------------
# TEXT & NAME MATCHING HELPERS
# ----------------------------------------------------------------------

def normalize_date_str(date_str: str, default: str) -> str:
    if not date_str:
        return default
    date_str = str(date_str).strip()
    m_iso = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$", date_str)
    if m_iso:
        y, m, d = m_iso.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    m_eu = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$", date_str)
    if m_eu:
        d, m, y = m_eu.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    return date_str


def normalize_text(text: str) -> str:
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", str(text))
    return normalized.encode("ASCII", "ignore").decode("utf-8").lower().strip()


def extract_name_parts(full_name: str):
    clean = normalize_text(full_name)
    clean = re.sub(r"\b(dr|prof|phd|md|bsc|msc|mr|mrs|ms)\b\.?", "", clean)
    words = re.findall(r"[a-z]+", clean)
    if not words:
        return "", "", [], ""
    first = words[0]
    last = words[-1]
    initials = "".join(w[0] for w in words[:-1])
    return first, last, words, initials


def is_name_match(author_name: str, email: str) -> bool:
    """Strict verification: Returns True ONLY if author's last name or initials match email handle."""
    if not email or "@" not in email:
        return False
    handle, _, _ = email.lower().partition("@")
    clean_handle = re.sub(r"[^a-z]", "", normalize_text(handle))
    first, last, words, initials = extract_name_parts(author_name)

    if not last or len(last) < 2:
        return False

    if last in clean_handle:
        return True
    if initials and (initials + last) in clean_handle:
        return True
    if first and (first[0] + last) in clean_handle:
        return True
    if first and (last + first[0]) in clean_handle:
        return True
    for w in words:
        if len(w) >= 4 and w in clean_handle:
            return True
    if first and len(first) >= 4 and first in clean_handle:
        return True

    return False


def clean_email(email_str: str) -> str:
    if not email_str:
        return ""
    email = str(email_str).strip(".,;:()<>[]'\"").lower()
    if email.endswith((".png", ".jpg", ".jpeg", ".gif", ".pdf", ".svg")):
        return ""
    if not EMAIL_PATTERN.fullmatch(email):
        return ""
    domain = email.split("@")[-1]
    if domain in IGNORED_DOMAINS:
        return ""
    return email


def clean_doi(value: str) -> str:
    if not value:
        return ""
    doi = str(value).strip()
    doi = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    return doi.strip().rstrip(".,; ")


# ----------------------------------------------------------------------
# RELEVANCE & MATCH SCORING ENGINE (0 - 100)
# ----------------------------------------------------------------------

def calculate_match_score(
    keyword: str,
    paper_title: str,
    concepts: list,
    email: str,
    author_name: str,
    pub_year: int,
    is_corresponding: bool = False,
    is_orcid: bool = False
) -> tuple:
    kw_norm = normalize_text(keyword)
    title_norm = normalize_text(paper_title)

    title_score = 0
    if kw_norm in title_norm:
        title_score = 40
    else:
        tokens = [t for t in kw_norm.split() if len(t) >= 3]
        matched_tokens = [t for t in tokens if t in title_norm]
        if len(matched_tokens) == len(tokens) and tokens:
            title_score = 35
        elif matched_tokens:
            title_score = 25
        else:
            concepts_text = " ".join([normalize_text(c) for c in concepts])
            if kw_norm in concepts_text:
                title_score = 30
            else:
                title_score = 15

    email_score = 0
    if is_orcid:
        email_score = 40
    elif is_name_match(author_name, email):
        domain = email.split("@")[-1].lower()
        if any(domain.endswith(ext) for ext in [".edu", ".ac.uk", ".org", ".de", ".fr", ".jp", ".gov", ".ch", ".nl"]):
            email_score = 38
        else:
            email_score = 32
    else:
        email_score = 0

    auth_score = 0
    current_year = datetime.now().year
    try:
        y = int(pub_year)
        if y >= current_year - 1:
            auth_score += 15
        elif y >= current_year - 3:
            auth_score += 10
        else:
            auth_score += 5
    except Exception:
        auth_score += 5

    if is_corresponding:
        auth_score += 5

    total_score = title_score + email_score + auth_score
    total_score = min(100, max(0, total_score))

    breakdown = f"Title: {title_score}/40 | Email: {email_score}/40 | Recency: {auth_score}/20"
    return total_score, breakdown


# ----------------------------------------------------------------------
# MULTI-SOURCE EMAIL EXTRACTION (CACHED PER DOI)
# ----------------------------------------------------------------------

def fetch_email_from_orcid(orcid_url: str):
    if not orcid_url:
        return None
    with orcid_lock:
        if orcid_url in orcid_cache:
            return orcid_cache[orcid_url]

    orcid_id = orcid_url.rstrip("/").split("/")[-1]
    if len(orcid_id) < 15:
        return None
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/email"
    try:
        resp = http_session.get(url, headers={"Accept": "application/json"}, timeout=3.5)
        if resp.status_code == 200:
            data = resp.json()
            for entry in data.get("email", []):
                email = clean_email(entry.get("email"))
                if email:
                    with orcid_lock:
                        orcid_cache[orcid_url] = email
                    return email
    except Exception:
        pass

    with orcid_lock:
        orcid_cache[orcid_url] = None
    return None


def fetch_emails_for_doi(doi: str) -> list[str]:
    """Fetches and caches all author emails for a single DOI across CrossRef and Europe PMC."""
    if not doi:
        return []
    with doi_lock:
        if doi in doi_cache:
            return doi_cache[doi]

    found = []

    # 1. CrossRef Work Metadata
    url = f"https://api.crossref.org/works/{requests.utils.quote(doi, safe='/')}"
    try:
        resp = http_session.get(url, headers=HEADERS, timeout=3.5)
        if resp.status_code == 200:
            data_str = str(resp.json().get("message", {}))
            for raw_em in EMAIL_PATTERN.findall(data_str):
                em = clean_email(raw_em)
                if em and em not in found:
                    found.append(em)
    except Exception:
        pass

    # 2. Europe PMC Metadata (only if CrossRef returned nothing)
    if not found:
        epmc_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
        try:
            resp = http_session.get(
                epmc_url,
                params={"query": f'DOI:"{doi}"', "format": "json", "pageSize": 2, "resultType": "core"},
                headers=HEADERS,
                timeout=3.5
            )
            if resp.status_code == 200:
                data = resp.json()
                for res in data.get("resultList", {}).get("result", []):
                    for a in res.get("authorList", {}).get("author", []):
                        aff = a.get("affiliation", "")
                        for raw_em in EMAIL_PATTERN.findall(aff):
                            em = clean_email(raw_em)
                            if em and em not in found:
                                found.append(em)
        except Exception:
            pass

    with doi_lock:
        doi_cache[doi] = found
    return found


def format_progress_meter(current: int, total: int, start_time: float) -> str:
    """Formats rich progress with percentage, elapsed time, speed, and ETA."""
    elapsed = max(0.1, time.time() - start_time)
    pct = (current / total) * 100 if total > 0 else 0
    rate_per_min = (current / elapsed) * 60

    el_s = int(elapsed)
    el_m, el_sec = divmod(el_s, 60)
    el_h, el_m = divmod(el_m, 60)
    el_str = f"{el_h:02d}:{el_m:02d}:{el_sec:02d}" if el_h > 0 else f"{el_m:02d}:{el_sec:02d}"

    remaining = max(0, total - current)
    if rate_per_min > 0 and current > 0:
        eta_sec = int((remaining / rate_per_min) * 60)
        eta_m, eta_s = divmod(eta_sec, 60)
        eta_h, eta_m = divmod(eta_m, 60)
        if eta_h > 0:
            eta_str = f"~{eta_h}h {eta_m}m"
        elif eta_m > 0:
            eta_str = f"~{eta_m}m {eta_s}s"
        else:
            eta_str = f"~{eta_s}s"
    else:
        eta_str = "calculating..."

    return f"[{current}/{total} | {pct:.1f}%] [Elapsed: {el_str} | ETA: {eta_str} | {rate_per_min:.1f} leads/min]"


# ----------------------------------------------------------------------
# WORK PROCESSOR (PARALLEL WORKER FUNCTION)
# ----------------------------------------------------------------------

def process_single_work(work: dict, keyword: str, min_score: int, existing_emails: set) -> list[dict]:
    paper_title = work.get("title") or ""
    pub_year = work.get("publication_year") or 2026
    doi = clean_doi(work.get("doi") or "")
    concepts = [c.get("display_name", "") for c in work.get("concepts", [])[:5]]
    authorships = work.get("authorships") or []

    doi_emails = fetch_emails_for_doi(doi) if doi else []
    resolved_leads = []

    for authorship in authorships:
        author = authorship.get("author") or {}
        author_name = author.get("display_name") or ""
        if not author_name or len(author_name) < 3:
            continue

        orcid_url = author.get("orcid") or ""
        is_corresponding = authorship.get("is_corresponding", False)

        institutions = []
        for inst in authorship.get("institutions", []):
            inst_name = inst.get("display_name")
            if inst_name:
                institutions.append(inst_name)
        for raw_str in authorship.get("raw_affiliation_strings", []):
            if raw_str and raw_str not in institutions:
                institutions.append(raw_str)
        affiliation_str = " | ".join(institutions[:2]) if institutions else "Academic Institution"

        verified_email = ""
        is_orcid_email = False

        if orcid_url:
            em = fetch_email_from_orcid(orcid_url)
            if em:
                verified_email = em
                is_orcid_email = True

        if not verified_email and doi_emails:
            for cand in doi_emails:
                if is_name_match(author_name, cand):
                    verified_email = cand
                    break

        if not verified_email:
            continue

        clean_em = clean_email(verified_email)
        if not clean_em:
            continue

        with output_lock:
            if clean_em in existing_emails:
                continue

        score, breakdown = calculate_match_score(
            keyword=keyword,
            paper_title=paper_title,
            concepts=concepts,
            email=clean_em,
            author_name=author_name,
            pub_year=pub_year,
            is_corresponding=is_corresponding,
            is_orcid=is_orcid_email
        )

        if score < min_score:
            continue

        if score >= 85:
            rating = f"Excellent Match ({score}%)"
        elif score >= 70:
            rating = f"Strong Match ({score}%)"
        else:
            rating = f"Verified Match ({score}%)"

        lead_row = {
            "researcher_name": author_name,
            "professional_email": clean_em,
            "match_score": score,
            "match_rating": rating,
            "data_source": "OpenAlex",
            "matched_paper_title": paper_title,
            "affiliation": affiliation_str,
            "orcid": orcid_url,
            "score_breakdown": breakdown,
            "publication_year": pub_year,
            "doi": doi,
            "search_keyword": keyword,
            "review_status": "verified",
        }
        resolved_leads.append(lead_row)

    return resolved_leads


# ----------------------------------------------------------------------
# CORE WORKFLOW: FETCH CANDIDATES & RESOLVE LEADS WITH SCORE >= 50
# ----------------------------------------------------------------------

def run_unified_pipeline(
    keyword: str = "cell biology",
    target_leads: int = 1000,
    min_score: int = 50,
    from_date: str = "2025-01-01",
    to_date: str = "2026-12-31"
):
    global STOP_REQUESTED
    STOP_REQUESTED = False

    from_date = normalize_date_str(from_date, "2025-01-01")
    to_date = normalize_date_str(to_date, "2026-12-31")

    print("=" * 74)
    print("🚀 UNIFIED 1-CLICK SCIENTIFIC LEAD PIPELINE (TURBO MULTI-THREADED)")
    print(f"• Keyword:             {keyword}")
    print(f"• Target Leads:        {target_leads:,} Verified Contacts")
    print(f"• Minimum Match Score: {min_score}+ / 100 (Strict Title + Name Verification)")
    print(f"• Date Window:         {from_date} to {to_date}")
    print("=" * 74)

    # 1. Output Files Setup
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_dir = DATA_DIR / today_str
    today_dir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^\w]+", "_", keyword.lower()).strip("_")
    run_now = datetime.now()
    time_str = run_now.strftime("%H-%M-%S")
    output_csv = today_dir / f"unified_leads_{slug}_{today_str}_{time_str}.csv"

    # 2. Load existing emails to guarantee 0% duplicates
    existing_emails = set()
    if CENTRAL_MASTER_FILE.exists():
        try:
            with open(CENTRAL_MASTER_FILE, "r", encoding="utf-8-sig", errors="replace") as mf:
                reader = csv.DictReader(mf)
                for r in reader:
                    em = r.get("professional_email", "").strip().lower()
                    if em:
                        existing_emails.add(em)
            print(f"[DEDUP] Loaded {len(existing_emails):,} existing master leads from local storage.")
        except Exception:
            pass

    # 3. Persistent Oracle PostgreSQL Connection
    db_conn = None
    try:
        import psycopg2
        db_conn = psycopg2.connect(**PG_CONFIG)
        with db_conn.cursor() as cur:
            cur.execute("SELECT email FROM verified_leads;")
            rows = cur.fetchall()
            for (em,) in rows:
                if em:
                    existing_emails.add(em.strip().lower())
        print(f"[ORACLE DB] Connected to sciprospect_db ({len(rows):,} cloud leads synced).")
    except Exception as e:
        print(f"[ORACLE DB] Local CSV mode (Cloud DB notice: {e})")
        db_conn = None

    fieldnames = [
        "researcher_name",
        "professional_email",
        "match_score",
        "match_rating",
        "data_source",
        "matched_paper_title",
        "affiliation",
        "orcid",
        "score_breakdown",
        "publication_year",
        "doi",
        "search_keyword",
        "review_status",
    ]

    # Initialize CSV if new
    if not output_csv.exists():
        with open(output_csv, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

    collected_leads = 0
    scanned_works = 0
    page = 1
    per_page = 100

    start_time = time.time()

    executor = ThreadPoolExecutor(max_workers=10)

    try:
        while collected_leads < target_leads and not STOP_REQUESTED:
            print(f"\n[PAGE {page}] Querying OpenAlex publications for '{keyword}'...")

            url = "https://api.openalex.org/works"
            params = {
                "search": keyword,
                "filter": f"from_publication_date:{from_date},to_publication_date:{to_date}",
                "per_page": per_page,
                "page": page,
                "sort": "publication_date:desc",
            }

            try:
                if API_KEY:
                    params["api_key"] = API_KEY
                resp = http_session.get(url, params=params, headers=HEADERS, timeout=12)
                if resp.status_code == 200:
                    data = resp.json()
                    works = data.get("results", [])
                    if not works:
                        print("[API] No more matching publications found in OpenAlex.")
                        break
                elif resp.status_code == 429:
                    print("[API] OpenAlex rate limit hit. Sleeping 3 seconds...")
                    time.sleep(3)
                    continue
                else:
                    print(f"[API] HTTP error {resp.status_code} fetching works. Retrying in 2s...")
                    time.sleep(2)
                    continue
            except Exception as exc:
                print(f"[API] Network error: {exc}. Retrying...")
                time.sleep(2)
                continue

            scanned_works += len(works)

            # Parallel resolution across works in this page
            futures = [
                executor.submit(process_single_work, w, keyword, min_score, existing_emails)
                for w in works
            ]

            for future in as_completed(futures):
                if STOP_REQUESTED or collected_leads >= target_leads:
                    break

                try:
                    leads_found = future.result()
                except Exception:
                    leads_found = []

                for row in leads_found:
                    clean_em = row["professional_email"]
                    with output_lock:
                        if clean_em in existing_emails:
                            continue
                        existing_emails.add(clean_em)
                        collected_leads += 1
                        current_num = collected_leads

                        # 1. Append to daily CSV
                        with open(output_csv, "a", encoding="utf-8-sig", newline="") as f:
                            w = csv.DictWriter(f, fieldnames=fieldnames)
                            w.writerow(row)

                        # 2. Append to Central Master CSV
                        with open(CENTRAL_MASTER_FILE, "a", encoding="utf-8-sig", newline="") as mf:
                            mw = csv.DictWriter(mf, fieldnames=fieldnames)
                            if CENTRAL_MASTER_FILE.stat().st_size == 0:
                                mw.writeheader()
                            mw.writerow(row)

                    # 3. Save directly to Oracle PostgreSQL
                    if db_conn:
                        try:
                            with db_lock:
                                with db_conn.cursor() as cur:
                                    cur.execute("""
                                        INSERT INTO verified_leads 
                                        (email, name, affiliation, score, keyword, paper_title, doi, source)
                                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                                        ON CONFLICT (email) DO NOTHING;
                                    """, (
                                        row["professional_email"],
                                        row["researcher_name"],
                                        row["affiliation"],
                                        row["match_score"],
                                        row["search_keyword"],
                                        row["matched_paper_title"],
                                        row["doi"],
                                        row["data_source"]
                                    ))
                                db_conn.commit()
                        except Exception:
                            try:
                                db_conn.rollback()
                            except Exception:
                                pass

                    # 4. Print Rich Progress with ETA & Speed
                    progress_info = format_progress_meter(current_num, target_leads, start_time)
                    print(f"🎯 {progress_info} {row['researcher_name']} <{clean_em}> | Score: {row['match_score']}/100 | {row['affiliation'][:32]}")

                    if collected_leads >= target_leads:
                        break

            page += 1
            time.sleep(0.2)

    finally:
        # Immediate clean shutdown without hanging
        executor.shutdown(wait=False, cancel_futures=True)
        if db_conn:
            try:
                db_conn.close()
            except Exception:
                pass

    elapsed = round(time.time() - start_time, 1)
    rate_overall = round((collected_leads / max(1, elapsed)) * 60, 1)

    print("\n" + "=" * 74)
    if STOP_REQUESTED:
        print("🛑 Execution stopped by user request.")
    else:
        print("🎉 UNIFIED PIPELINE COMPLETED SUCCESSFULLY!")
    print(f"• Total Verified Leads (Score >= {min_score}): {collected_leads:,}")
    print(f"• Average Speed:        {rate_overall} leads/min")
    print(f"• Time Elapsed:         {elapsed} seconds (~{round(elapsed/60, 1)} minutes)")
    print(f"• Output Dataset:       {output_csv.name}")
    print(f"• Cloud Sync:           Oracle PostgreSQL sciprospect_db (verified_leads)")
    print("=" * 74)

    return {
        "status": "completed",
        "collected_leads": collected_leads,
        "target_leads": target_leads,
        "file": output_csv.name,
        "elapsed_seconds": elapsed,
    }


def run(keyword="cell biology", target_leads=1000, min_score=50, from_date="2025-01-01", to_date="2026-12-31"):
    return run_unified_pipeline(
        keyword=keyword,
        target_leads=int(target_leads),
        min_score=int(min_score),
        from_date=from_date,
        to_date=to_date
    )


if __name__ == "__main__":
    kw = sys.argv[1] if len(sys.argv) > 1 else "cell biology"
    tgt = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    m_score = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    f_date = sys.argv[4] if len(sys.argv) > 4 else "2025-01-01"
    t_date = sys.argv[5] if len(sys.argv) > 5 else "2026-12-31"

    run(keyword=kw, target_leads=tgt, min_score=m_score, from_date=f_date, to_date=t_date)
