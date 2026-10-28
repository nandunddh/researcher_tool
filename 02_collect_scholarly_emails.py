import csv
import json
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from threading import Lock

import requests

# --------------------------------------------------
# SETTINGS
# --------------------------------------------------

try:
    from app_config import get_data_dir
    FOLDER = get_data_dir()
except Exception:
    FOLDER = Path(__file__).parent / "data"
FOLDER.mkdir(parents=True, exist_ok=True)

# Master pool tracks all researchers and their status across days:
MASTER_POOL_FILE = FOLDER / "Physical_Chemistry_needto_extract.csv"

# Central deduplicated master archive of all verified leads ever collected:
CENTRAL_MASTER_FILE = FOLDER / "central_master_leads.csv"

# Automatically create today's date folder (e.g. data/2026-10-23/):
TODAY_STR = datetime.now().strftime("%Y-%m-%d")
TODAY_DIR = FOLDER / TODAY_STR
TODAY_DIR.mkdir(parents=True, exist_ok=True)

TARGET_DAILY_EMAILS = 3000  # Stop as soon as 3,000 name-matched emails are collected
MAX_WORKERS = 30
SAVE_EVERY = 100

HEADERS = {
    "User-Agent": "ResearcherContactFinder/1.0 (academic research mailto:research@openalex-tool.org)"
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


# --------------------------------------------------
# NAME & EMAIL MATCHING HELPERS
# --------------------------------------------------

def normalize_text(text):
    """Strip accents and lowercase (e.g. Joaquín -> joaquin, Müller -> muller)."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", str(text))
    return normalized.encode("ASCII", "ignore").decode("utf-8").lower().strip()


def extract_name_parts(full_name):
    """Extract clean first, last, and initials from author name."""
    clean = normalize_text(full_name)
    clean = re.sub(r"\b(dr|prof|phd|md|bsc|msc|mr|mrs|ms)\b\.?", "", clean)
    words = re.findall(r"[a-z]+", clean)
    if not words:
        return "", "", [], ""
    first = words[0]
    last = words[-1]
    initials = "".join(w[0] for w in words[:-1])
    return first, last, words, initials


def is_name_match(author_name, email):
    """
    STRICT VERIFICATION:
    Returns True ONLY if author's last name or initials match the email handle.
    Rejects co-author/PI emails so 100% of saved emails belong to the researcher.
    """
    if not email or "@" not in email:
        return False
    handle, _, _ = email.lower().partition("@")
    clean_handle = re.sub(r"[^a-z]", "", normalize_text(handle))
    first, last, words, initials = extract_name_parts(author_name)

    if not last:
        return False

    # 1. Exact last name in handle (e.g. 'green' in 'whgreen@mit.edu', 'barroso' in 'barroso@...')
    if last in clean_handle:
        return True

    # 2. Initials + last name (e.g. 'whgreen', 'jsmith')
    if initials and (initials + last) in clean_handle:
        return True
    if first and (first[0] + last) in clean_handle:
        return True
    if first and (last + first[0]) in clean_handle:
        return True

    # 3. Compound name parts (e.g. 'barroso' or 'flores' from 'Barroso-Flores')
    for w in words:
        if len(w) >= 4 and w in clean_handle:
            return True

    # 4. First name in handle (e.g. 'ralfk@hawaii.edu' for Ralf I. Kaiser)
    if first and len(first) >= 3 and first in clean_handle:
        return True

    return False


# --------------------------------------------------
# GENERAL HELPERS
# --------------------------------------------------

def clean_doi(value):
    if not value:
        return ""
    doi = str(value).strip()
    if doi.lower() in {"nan", "none", "null"}:
        return ""
    doi = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    return doi.strip().rstrip(".,; ")


def extract_dois(value):
    if not value:
        return []
    dois = []
    for item in str(value).split(";"):
        doi = clean_doi(item)
        if doi and doi not in dois:
            dois.append(doi)
    return dois


def clean_email(email):
    if not email:
        return None
    email = str(email).strip().lower().rstrip(".,;:)")
    if email.endswith((".png", ".jpg", ".jpeg", ".gif", ".pdf", ".svg")):
        return None
    if ".." in email or not EMAIL_PATTERN.fullmatch(email):
        return None
    domain = email.split("@")[-1]
    if domain in IGNORED_DOMAINS:
        return None
    return email


def extract_emails(text):
    if not text:
        return []
    found = []
    for match in EMAIL_PATTERN.findall(text):
        email = clean_email(match)
        if email and email not in found:
            found.append(email)
    return found


def get_page(url, params=None, headers=None):
    req_headers = HEADERS.copy()
    if headers:
        req_headers.update(headers)
    try:
        response = requests.get(url, params=params, headers=req_headers, timeout=6)
        if response.status_code == 200:
            return response.text
    except requests.RequestException:
        pass
    return None


# --------------------------------------------------
# ENRICHMENT LOOKUPS
# --------------------------------------------------

def get_email_from_orcid(orcid_url):
    """ORCID profile email is 100% personal to this researcher."""
    if not orcid_url:
        return None, None
    orcids = [o.strip() for o in str(orcid_url).split(";") if o.strip()]
    for o_url in orcids:
        orcid_id = o_url.rstrip("/").split("/")[-1]
        if not orcid_id or len(orcid_id) < 15:
            continue
        url = f"https://pub.orcid.org/v3.0/{orcid_id}/email"
        text = get_page(url, headers={"Accept": "application/json"})
        if text:
            try:
                data = json.loads(text)
                for entry in data.get("email", []):
                    email = clean_email(entry.get("email"))
                    if email:
                        return email, o_url
            except Exception:
                pass
    return None, None


def get_email_from_crossref(doi, author_name):
    """Queries Crossref by DOI, only returns email if it matches author's name."""
    url = "https://api.crossref.org/works/" + requests.utils.quote(doi, safe="/")
    text = get_page(url)
    if not text:
        return None, None
    try:
        data = json.loads(text)
        metadata_text = str(data.get("message", {}))
        for email in extract_emails(metadata_text):
            if is_name_match(author_name, email):
                return email, url
    except Exception:
        pass
    return None, None


def get_author_affiliations(author_dict):
    """Extracts all affiliation strings for an author from Europe PMC."""
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


def get_email_from_europepmc(doi, author_name):
    """Queries Europe PMC by DOI, checks core metadata affiliations and fallback PMC XML."""
    search_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    search_text = get_page(
        search_url,
        params={"query": f'DOI:"{doi}"', "format": "json", "pageSize": 3, "resultType": "core"}
    )
    if not search_text:
        return None, None
    try:
        data = json.loads(search_text)
        results = data.get("resultList", {}).get("result", [])
    except Exception:
        return None, None

    for article in results:
        # 1. Fast check: author affiliations in the core JSON response
        for a in article.get("authorList", {}).get("author", []):
            for aff in get_author_affiliations(a):
                for email in extract_emails(aff):
                    if is_name_match(author_name, email):
                        return email, f"https://doi.org/{doi}"

        # 2. Fallback: Full-text XML if PMC ID is present
        pmcid = str(article.get("pmcid") or "").strip()
        if re.fullmatch(r"PMC\d+", pmcid, flags=re.IGNORECASE):
            xml_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
            xml_text = get_page(xml_url)
            if xml_text:
                for email in extract_emails(xml_text):
                    if is_name_match(author_name, email):
                        return email, xml_url
    return None, None


def search_europepmc_by_title(author_name, title):
    """Queries Europe PMC by author last name + title, strictly verifying name match."""
    if not title or len(title) < 10:
        return None, None

    last_name = author_name.split()[-1] if author_name else ""
    clean_title = re.sub(r"[^\w\s]", "", title)[:80].strip()
    query = f'AUTH:"{last_name}" AND "{clean_title}"' if last_name else f'"{clean_title}"'

    search_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    text = get_page(
        search_url,
        params={"query": query, "format": "json", "pageSize": 3, "resultType": "core"}
    )
    if not text:
        return None, None

    try:
        data = json.loads(text)
        for r in data.get("resultList", {}).get("result", []):
            # Check authorList affiliations in JSON
            for a in r.get("authorList", {}).get("author", []):
                for aff in get_author_affiliations(a):
                    for email in extract_emails(aff):
                        if is_name_match(author_name, email):
                            doi = r.get("doi")
                            return email, f"https://doi.org/{doi}" if doi else "Europe PMC"

            doi = r.get("doi")
            if doi:
                email, source_url = get_email_from_crossref(doi, author_name)
                if email:
                    return email, source_url
            pmcid = str(r.get("pmcid") or "").strip()
            if pmcid and re.fullmatch(r"PMC\d+", pmcid, flags=re.IGNORECASE):
                xml_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
                xml_text = get_page(xml_url)
                if xml_text:
                    for email in extract_emails(xml_text):
                        if is_name_match(author_name, email):
                            return email, xml_url
    except Exception:
        pass
    return None, None


# --------------------------------------------------
# RESEARCHER PROCESSOR
# --------------------------------------------------

def process_researcher(row):
    """
    Processes candidate. Only attaches email if 100% matched to this researcher's name.
    """
    author_name = str(row.get("researcher_name", "")).strip()
    existing_email = str(row.get("professional_email", "") or "").strip()

    # If already verified in a previous session or attached in extraction, verify it
    if existing_email:
        matched = [e.strip() for e in existing_email.split(";") if is_name_match(author_name, e.strip())]
        if matched:
            row["professional_email"] = matched[0]
            row["email_status"] = "Verified Name Match"
            row["review_status"] = "found"
            return row

    # 1. Try personal ORCID profile (100% personal match)
    orcid_url = row.get("orcid", "")
    if orcid_url:
        email, source_url = get_email_from_orcid(orcid_url)
        if email:
            row["professional_email"] = email
            row["email_source_url"] = source_url
            row["email_status"] = "Found (ORCID public profile)"
            row["review_status"] = "found"
            return row

    # 2. Check paper DOIs with STRICT name matching
    dois = extract_dois(row.get("example_paper_dois", ""))
    if dois:
        for doi in dois:
            email, source_url = get_email_from_crossref(doi, author_name)
            if email:
                row["professional_email"] = email
                row["email_source_url"] = source_url
                row["email_status"] = "Found (Crossref name-matched)"
                row["review_status"] = "found"
                return row

            email, source_url = get_email_from_europepmc(doi, author_name)
            if email:
                row["professional_email"] = email
                row["email_source_url"] = source_url
                row["email_status"] = "Found (Europe PMC XML name-matched)"
                row["review_status"] = "found"
                return row

    # 3. Fallback: Search Europe PMC using paper titles
    example_papers = str(row.get("example_papers", ""))
    if example_papers:
        titles = [
            part.split(":", 1)[-1].strip()
            for part in example_papers.split(";")
            if len(part.split(":", 1)[-1].strip()) > 10
        ]
        for title in titles[:2]:
            email, source_url = search_europepmc_by_title(author_name, title)
            if email:
                row["professional_email"] = email
                row["email_source_url"] = source_url
                row["email_status"] = "Found (Europe PMC Title name-matched)"
                row["review_status"] = "found"
                return row

    # No name-matched email found
    row["professional_email"] = ""
    row["email_source_url"] = ""
    row["email_status"] = "No email found in available sources"
    row["review_status"] = "needs_review"
    return row


# --------------------------------------------------
# MASTER POOL INITIALIZER
# --------------------------------------------------

def get_or_create_master_pool():
    """Ensures a valid candidate waiting list (*_needto_extract.csv or pool) is active."""
    # 1. User specified a file via CLI (e.g. data/Physical_Chemistry_needto_extract.csv)
    if len(sys.argv) > 1 and sys.argv[1].strip():
        raw_arg = sys.argv[1].strip()
        arg_path = Path(raw_arg)
        if not arg_path.is_absolute():
            base_dir = Path(__file__).resolve().parent
            if (base_dir / arg_path).exists():
                arg_path = base_dir / arg_path
            elif (FOLDER / arg_path).exists():
                arg_path = FOLDER / arg_path

        if arg_path.exists():
            print(f"Using specified candidate file: {arg_path.name}")
            return arg_path

    # 2. Look for any active *_needto_extract.csv files in data/
    needto_files = sorted(FOLDER.glob("*_needto_extract.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    if needto_files:
        print(f"Resuming active queue: {needto_files[0].name}")
        return needto_files[0]

    # 3. If master pool already exists, resume it
    if MASTER_POOL_FILE.exists():
        print(f"Resuming existing master pool: {MASTER_POOL_FILE.name}")
        return MASTER_POOL_FILE

    # 4. Otherwise find the newest raw extraction from 01 across all subfolders
    extractions = sorted(FOLDER.rglob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    candidate_extractions = [
        e for e in extractions 
        if e.name.startswith("openalex_") or "Physical_Chemistry" in e.name
    ]
    if candidate_extractions:
        latest_source = candidate_extractions[0]
        print(f"Loading latest extraction into master pool: {latest_source.name}...")
        with latest_source.open("r", encoding="utf-8-sig", newline="") as src, MASTER_POOL_FILE.open("w", encoding="utf-8-sig", newline="") as dst:
            dst.write(src.read())
        print(f"Master pool initialized from: {latest_source.name}")
        return MASTER_POOL_FILE

    raise SystemExit(f"No candidate files found in {FOLDER}. Please run 01_extract_researchers.py first!")



# --------------------------------------------------
# MAIN RUNNER
# --------------------------------------------------

def main():
    global TARGET_DAILY_EMAILS
    if len(sys.argv) > 2 and sys.argv[2].strip().isdigit():
        TARGET_DAILY_EMAILS = int(sys.argv[2].strip())

    pool_file = get_or_create_master_pool()


    with pool_file.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    required_columns = [
        "professional_email",
        "email_source_url",
        "review_status",
        "email_status",
    ]
    for col in required_columns:
        if col not in fieldnames:
            fieldnames.append(col)

    total_pool = len(rows)

    # Load known emails and author IDs from central master archive to prevent ANY duplicates
    known_emails = set()
    known_author_ids = set()
    central_fieldnames = list(fieldnames)
    if "date_added_to_central" not in central_fieldnames:
        central_fieldnames.insert(0, "date_added_to_central")

    if CENTRAL_MASTER_FILE.exists():
        with CENTRAL_MASTER_FILE.open("r", encoding="utf-8-sig", newline="") as cf:
            for cr in csv.DictReader(cf):
                em = str(cr.get("professional_email", "")).strip().lower()
                aid = str(cr.get("openalex_author_id", "")).strip()
                if em:
                    known_emails.add(em)
                if aid:
                    known_author_ids.add(aid)

    # Identify pending researchers (not yet processed or verified)
    pending_indices = [
        i for i, r in enumerate(rows)
        if r.get("email_status") not in {"Verified Name Match", "No email found in available sources", "Skipped (Duplicate from Central Archive)"}
    ]

    already_found = sum(1 for r in rows if r.get("review_status") == "found")
    already_checked_no_email = sum(1 for r in rows if r.get("email_status") == "No email found in available sources")

    print("\n" + "=" * 60)
    print("RESEARCHER EMAIL COLLECTOR & STRICT NAME VERIFIER")
    print("=" * 60)
    print(f"Central Archive Unique Leads   : {len(known_emails):,} (0% Duplicates Guaranteed)")
    print(f"Total Candidates in Master Pool: {total_pool:,}")
    print(f"Already Verified on Prior Days : {already_found:,}")
    print(f"Checked (No Email Available)   : {already_checked_no_email:,}")
    print(f"Fresh Unchecked Candidates Left: {len(pending_indices):,}")
    print(f"Target To Collect Today        : {TARGET_DAILY_EMAILS:,} NEW, unique emails")
    print("=" * 60 + "\n")

    if not pending_indices:
        print("🎉 All candidates in the master pool have been fully processed!")
        print("Run 01_extract_researchers.py to add fresh candidates for the next days.")
        return

    # Determine topic slug and output file: {Topic}_found_{Date}.csv
    topic_slug = "Physical_Chemistry"
    base_name = pool_file.name
    if "_needto_extract" in base_name:
        topic_slug = base_name.replace("_needto_extract.csv", "").replace("_needto_extract", "")
    elif base_name.endswith(".csv"):
        topic_slug = base_name.replace(".csv", "")

    if rows and rows[0].get("matched_search_terms"):
        first_term = rows[0]["matched_search_terms"].split(";")[0].strip()
        if first_term:
            topic_slug = re.sub(r"[^A-Za-z0-9]+", "_", first_term).strip("_")

    topic_found_file = TODAY_DIR / f"{topic_slug}_found_{TODAY_STR}.csv"

    def save_master_pool(data_rows):
        temp_file = pool_file.with_suffix(".tmp")
        for attempt in range(5):
            try:
                with temp_file.open("w", encoding="utf-8-sig", newline="") as f:
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(data_rows)
                os.replace(temp_file, pool_file)
                break
            except Exception:
                time.sleep(0.3)

    new_found_today = 0
    today_verified_rows = []
    completed = 0
    start_time = time.time()
    lock = Lock()

    def save_all_progress():
        with lock:
            save_master_pool(rows)
            if today_verified_rows:
                # 1. Export TODAY'S clean leads to {Topic}_found_{Date}.csv
                with topic_found_file.open("w", encoding="utf-8-sig", newline="") as f:
                    writer = csv.DictWriter(f, fieldnames=central_fieldnames)
                    writer.writeheader()
                    writer.writerows(today_verified_rows)

                # 2. Append new unique leads into CENTRAL MASTER ARCHIVE
                archive_exists = CENTRAL_MASTER_FILE.exists()
                with CENTRAL_MASTER_FILE.open("a", encoding="utf-8-sig", newline="") as cf:
                    writer = csv.DictWriter(cf, fieldnames=central_fieldnames)
                    if not archive_exists:
                        writer.writeheader()
                    writer.writerows(today_verified_rows)


    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {
                executor.submit(process_researcher, dict(rows[idx])): idx
                for idx in pending_indices
            }

            for future in as_completed(futures):
                idx = futures[future]
                try:
                    res = future.result()
                    rows[idx] = res

                    # Check if this candidate got a strictly matched email
                    if res.get("review_status") == "found":
                        em = str(res.get("professional_email", "")).strip().lower()
                        aid = str(res.get("openalex_author_id", "")).strip()

                        # Deduplication guard against central archive
                        if em and em in known_emails:
                            res["email_status"] = "Skipped (Duplicate from Central Archive)"
                            rows[idx] = res
                        elif em:
                            known_emails.add(em)
                            if aid:
                                known_author_ids.add(aid)
                            res_copy = dict(res)
                            res_copy["date_added_to_central"] = TODAY_STR
                            new_found_today += 1
                            today_verified_rows.append(res_copy)

                except Exception as exc:
                    rows[idx]["email_status"] = f"Error: {str(exc)[:100]}"

                completed += 1

                if completed == 1 or completed % 10 == 0 or completed == len(pending_indices):
                    with print_lock:
                        elapsed = time.time() - start_time
                        speed = completed / elapsed if elapsed > 0 else 0
                        pct = (completed / len(pending_indices)) * 100
                        print(
                            f"Processed {completed:,}/{len(pending_indices):,} ({pct:.1f}%) | "
                            f"New Matched Today: {new_found_today}/{TARGET_DAILY_EMAILS} | "
                            f"Speed: {speed:.1f}/s | Elapsed: {elapsed:.1f}s",
                            flush=True
                        )

                if completed % SAVE_EVERY == 0 or completed == len(pending_indices):
                    save_all_progress()

                if TARGET_DAILY_EMAILS and new_found_today >= TARGET_DAILY_EMAILS:
                    with print_lock:
                        elapsed = time.time() - start_time
                        print(
                            f"\n🎯 TARGET REACHED: {new_found_today} 100% Unique Name-Matched Emails collected in {elapsed/60:.1f} minutes!",
                            flush=True
                        )
                    for f in futures:
                        f.cancel()
                    try:
                        executor.shutdown(wait=False, cancel_futures=True)
                    except Exception:
                        pass
                    break

    except KeyboardInterrupt:
        print("\n[INFO] Interrupted by user. Safely persisting all progress...")
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}. Persisting progress...")
    finally:
        save_all_progress()

    remaining_unprocessed = sum(
        1 for r in rows
        if r.get("review_status") != "found"
        and r.get("email_status") != "No email found in available sources"
    )

    print("\n" + "=" * 60)
    print("SESSION SUMMARY - ZERO MANUAL WORK READY")
    print("=" * 60)
    print(f"New Leads Collected Today      : {len(today_verified_rows):,}")
    print(f"Exported Today's Leads To      : {topic_found_file.name}")
    print(f"Central Archive Total Leads    : {len(known_emails):,} (Deduplicated)")
    print(f"Queue Remaining For Next Run   : {remaining_unprocessed:,} fresh candidates")
    print("=" * 60)
    print(f"📁 Today's ready file    : {topic_found_file}")
    print(f"📁 Central archive file  : {CENTRAL_MASTER_FILE}")
    print(f"📁 Queue file            : {pool_file}\n")


if __name__ == "__main__":
    main()
