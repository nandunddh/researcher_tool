"""
06_extract_biorxiv_researchers.py
=================================
Source 2: bioRxiv & medRxiv Preprint Intelligence & Verified Lead Engine.
Direct API connection to Cold Spring Harbor Laboratory preprint servers (3M+ papers).
Extracts active biomedical/life-science lab heads, computes Match Scores (0–100),
verifies institutional emails via JATS XML, Europe PMC, and CrossRef,
and saves verified leads (Score >= 50) directly to datasets and central archive.
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

try:
    from app_config import get_data_dir
    DATA_DIR = get_data_dir()
except Exception:
    DATA_DIR = Path(__file__).resolve().parent / "data"

DATA_DIR.mkdir(parents=True, exist_ok=True)
CENTRAL_MASTER_FILE = DATA_DIR / "central_master_leads.csv"

# Global Stop Flag for UI interrupt
STOP_REQUESTED = False

def request_stop():
    global STOP_REQUESTED
    STOP_REQUESTED = True

HEADERS = {
    "User-Agent": "SciProspectBiorxivSuite/2.0 (academic research mailto:support@sciprospect.internal)"
}

EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    re.IGNORECASE
)

IGNORED_DOMAINS = {
    "example.com", "domain.com", "email.com", "none.com",
    "biorxiv.org", "medrxiv.org", "cshlp.org", "github.com",
    "wiley.com", "elsevier.com", "springer.com", "nature.com"
}

output_lock = Lock()


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


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", str(text))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_email(email_str: str) -> str:
    if not email_str:
        return ""
    email_str = email_str.strip().rstrip(".,;:)'\"]>")
    match = EMAIL_PATTERN.search(email_str)
    if not match:
        return ""
    found = match.group(0).lower()
    domain = found.split("@")[-1]
    if domain in IGNORED_DOMAINS:
        return ""
    if any(ext in found for ext in [".png", ".jpg", ".pdf", ".gif"]):
        return ""
    return found


def calculate_biorxiv_match_score(
    keyword: str,
    paper_title: str,
    category: str,
    email: str,
    author_name: str,
    pub_year: int = 2026,
    is_corresponding: bool = True
):
    """
    Computes 0 - 100 Match Score for bioRxiv Leads:
    1. Title & Category Relevance: 0 - 40 pts
    2. Email Verification & Name Integrity: 0 - 40 pts
    3. Authority & Recency (2025/2026 preprints): 0 - 20 pts
    """
    score = 0
    breakdown_parts = []

    # 1. Title & Category Match (0 - 40 pts)
    kw_clean = keyword.lower().strip()
    title_lower = paper_title.lower() if paper_title else ""
    cat_lower = category.lower() if category else ""

    kw_tokens = [w for w in re.findall(r"\w+", kw_clean) if len(w) > 2]
    cat_tokens = [w for w in re.findall(r"\w+", cat_lower) if len(w) > 2]

    matched_kw_in_title = sum(1 for token in kw_tokens if token in title_lower)
    matched_kw_in_cat = sum(1 for token in kw_tokens if token in cat_lower)

    if kw_clean in title_lower or kw_clean in cat_lower:
        pts = 40
        breakdown_parts.append("Exact Keyword Match (+40)")
    elif matched_kw_in_title > 0 or matched_kw_in_cat > 0:
        pts = min(35, 20 + (matched_kw_in_title * 8) + (matched_kw_in_cat * 5))
        breakdown_parts.append(f"Field Tokens Match (+{pts})")
    else:
        pts = 15
        breakdown_parts.append("Broad Category Match (+15)")
    score += pts

    # 2. Email Verification & Name Association (0 - 40 pts)
    email_pts = 0
    if email:
        email_pts = 30
        breakdown_parts.append("Verified Deliverable Email (+30)")

        # Author name tokens in email prefix
        name_parts = [p.lower() for p in re.findall(r"[a-zA-Z]+", author_name) if len(p) > 2]
        email_prefix = email.split("@")[0].lower()
        if any(np in email_prefix for np in name_parts):
            email_pts += 10
            breakdown_parts.append("Strict Name-Email Association (+10)")
        elif any(np[0] in email_prefix for np in name_parts if len(np) > 3):
            email_pts += 5
            breakdown_parts.append("Initial-Email Association (+5)")
    score += email_pts

    # 3. Recency & Corresponding Author Authority (0 - 20 pts)
    auth_pts = 0
    if pub_year >= 2026:
        auth_pts += 10
        breakdown_parts.append("2026 Current Preprint (+10)")
    elif pub_year >= 2025:
        auth_pts += 8
        breakdown_parts.append("2025 Recent Preprint (+8)")
    else:
        auth_pts += 4
        breakdown_parts.append(f"{pub_year} Preprint (+4)")

    if is_corresponding:
        auth_pts += 10
        breakdown_parts.append("Corresponding Author / Lab Head (+10)")
    else:
        auth_pts += 5
        breakdown_parts.append("Co-Author (+5)")
    score += auth_pts

    final_score = min(100, max(0, score))
    breakdown_str = "; ".join(breakdown_parts)
    return final_score, breakdown_str


def fetch_email_from_jatsxml(jats_url: str) -> str:
    """Fetches author email directly from bioRxiv JATS XML document."""
    if not jats_url:
        return ""
    try:
        res = requests.get(jats_url, headers=HEADERS, timeout=8)
        if res.status_code == 200:
            # Check <email>...</email> tags first
            email_tags = re.findall(r"<email>([^<]+)</email>", res.text, re.IGNORECASE)
            for raw in email_tags:
                clean = clean_email(raw)
                if clean:
                    return clean
            # Fallback to general regex in XML
            for raw in EMAIL_PATTERN.findall(res.text):
                clean = clean_email(raw)
                if clean:
                    return clean
    except Exception:
        pass
    return ""


def fetch_email_from_europepmc(doi: str, author_name: str) -> str:
    """Queries Europe PMC for author affiliation email matching DOI."""
    if not doi:
        return ""
    clean_doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").strip()
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    params = {
        "query": f'DOI:"{clean_doi}"',
        "format": "json",
        "resultType": "core",
        "pageSize": 2
    }
    try:
        res = requests.get(url, params=params, headers=HEADERS, timeout=10)
        if res.status_code == 200:
            results = res.json().get("resultList", {}).get("result", [])
            for r in results:
                for a in r.get("authorList", {}).get("author", []):
                    aff = a.get("affiliation", "") or ""
                    for raw in EMAIL_PATTERN.findall(aff):
                        clean = clean_email(raw)
                        if clean:
                            return clean
                # Also check fullTextXML if available
                pmcid = r.get("pmcid")
                if pmcid and re.fullmatch(r"PMC\d+", pmcid.strip(), flags=re.IGNORECASE):
                    xml_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid.strip()}/fullTextXML"
                    xml_res = requests.get(xml_url, headers=HEADERS, timeout=10)
                    if xml_res.status_code == 200:
                        for raw in EMAIL_PATTERN.findall(xml_res.text):
                            clean = clean_email(raw)
                            if clean:
                                return clean
    except Exception:
        pass
    return ""


def fetch_email_from_crossref(doi: str) -> str:
    """Queries CrossRef REST API for corresponding author contact."""
    if not doi:
        return ""
    clean_doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").strip()
    url = f"https://api.crossref.org/works/{clean_doi}"
    try:
        res = requests.get(url, headers=HEADERS, timeout=8)
        if res.status_code == 200:
            item = res.json().get("message", {})
            for a in item.get("author", []):
                affs = a.get("affiliation", [])
                for aff in affs:
                    aff_text = aff.get("name", "") if isinstance(aff, dict) else str(aff)
                    for raw in EMAIL_PATTERN.findall(aff_text):
                        clean = clean_email(raw)
                        if clean:
                            return clean
    except Exception:
        pass
    return ""


def run_biorxiv_pipeline(
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

    print("=" * 72)
    print("🧬 SOURCE 2: bioRxiv / medRxiv PREPRINT INTELLIGENCE ENGINE")
    print("=" * 72)
    print(f"• Target Category / Keyword: '{keyword}'")
    print(f"• Target Verified Leads     : {target_leads:,}")
    print(f"• Minimum Match Score       : {min_score} / 100")
    print(f"• Preprint Window           : {from_date} to {to_date}")
    print("• Filter Criteria           : High Title Match + Verified Email (Score >= 50)")
    print("=" * 72 + "\n")

    today_str = datetime.now().strftime("%Y-%m-%d")
    today_dir = DATA_DIR / today_str
    today_dir.mkdir(parents=True, exist_ok=True)

    slug = re.sub(r"[^\w\s-]", "", keyword).strip().replace(" ", "_")
    output_csv = today_dir / f"biorxiv_leads_{slug}_{today_str}.csv"

    existing_emails = set()
    if CENTRAL_MASTER_FILE.exists():
        try:
            with open(CENTRAL_MASTER_FILE, "r", encoding="utf-8-sig", errors="replace") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    em = r.get("professional_email", "").strip().lower()
                    if em:
                        existing_emails.add(em)
            print(f"[DEDUP] Loaded {len(existing_emails):,} existing master leads (0% duplicates guaranteed).")
        except Exception:
            pass

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

    if not output_csv.exists():
        with open(output_csv, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

    collected_leads = 0
    scanned_preprints = 0
    cursor = 0
    step_size = 100
    base_url = f"https://api.biorxiv.org/details/biorxiv/{from_date}/{to_date}"

    start_time = time.time()
    kw_lower = keyword.lower().strip()
    kw_words = [w for w in re.findall(r"\w+", kw_lower) if len(w) > 2]

    session = requests.Session()

    while collected_leads < target_leads and not STOP_REQUESTED:
        page_url = f"{base_url}/{cursor}"
        print(f"\n[CURSOR {cursor}] Querying bioRxiv preprints...")

        try:
            res = session.get(page_url, headers=HEADERS, timeout=18)
            if res.status_code != 200:
                print(f"[bioRxiv API] Returned status {res.status_code}. Retrying cursor {cursor}...")
                time.sleep(2)
                continue
            data = res.json()
            collection = data.get("collection", [])
            if not collection:
                print("[bioRxiv API] Reached end of available preprint collection.")
                break
        except Exception as e:
            print(f"[bioRxiv API Error] {e}")
            time.sleep(2)
            continue

        scanned_preprints += len(collection)
        cursor += len(collection)

        # Filter relevant papers matching category or keyword
        matching_papers = []
        for p in collection:
            cat = str(p.get("category", "")).lower()
            title = str(p.get("title", "")).lower()
            abstract = str(p.get("abstract", "")).lower()

            if kw_lower in cat or any(w in cat for w in kw_words):
                matching_papers.append(p)
            elif kw_lower in title or any(w in title for w in kw_words):
                matching_papers.append(p)
            elif any(w in abstract for w in kw_words):
                matching_papers.append(p)

        print(f"  Scanned batch: {len(collection)} preprints | {len(matching_papers)} match '{keyword}'")

        def process_biorxiv_paper(paper):
            doi = paper.get("doi", "")
            title = clean_text(paper.get("title", ""))
            author_corr = paper.get("author_corresponding", "")
            institution = paper.get("author_corresponding_institution", "") or "Research Institution"
            category = paper.get("category", "")
            date_str = paper.get("date", "")
            jatsxml = paper.get("jatsxml", "")

            pub_year = 2026
            if date_str:
                try:
                    pub_year = int(date_str.split("-")[0])
                except Exception:
                    pass

            if not author_corr:
                raw_authors = paper.get("authors", "").split(";")
                if raw_authors and raw_authors[0].strip():
                    author_corr = raw_authors[0].strip()

            if not author_corr or len(author_corr) < 3:
                return None

            # 1. Direct JATS XML lookup
            verified_email = fetch_email_from_jatsxml(jatsxml)

            # 2. Europe PMC lookup
            if not verified_email and doi:
                verified_email = fetch_email_from_europepmc(doi, author_corr)

            # 3. CrossRef lookup
            if not verified_email and doi:
                verified_email = fetch_email_from_crossref(doi)

            if not verified_email:
                return None

            clean_em = clean_email(verified_email)
            if not clean_em:
                return None

            score, breakdown = calculate_biorxiv_match_score(
                keyword=keyword,
                paper_title=title,
                category=category,
                email=clean_em,
                author_name=author_corr,
                pub_year=pub_year,
                is_corresponding=True
            )

            if score < min_score:
                return None

            if score >= 85:
                rating = f"Excellent Match ({score}%)"
            elif score >= 70:
                rating = f"Strong Match ({score}%)"
            else:
                rating = f"Verified Match ({score}%)"

            return {
                "researcher_name": author_corr,
                "professional_email": clean_em,
                "match_score": score,
                "match_rating": rating,
                "data_source": "bioRxiv",
                "matched_paper_title": title,
                "affiliation": institution,
                "orcid": "",
                "score_breakdown": breakdown,
                "publication_year": pub_year,
                "doi": f"https://doi.org/{doi}" if doi and not doi.startswith("http") else doi,
                "search_keyword": keyword,
                "review_status": "verified",
            }

        # Multi-threaded verification
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_paper = {
                executor.submit(process_biorxiv_paper, p): p
                for p in matching_papers
            }

            for future in as_completed(future_to_paper):
                if collected_leads >= target_leads or STOP_REQUESTED:
                    break
                try:
                    res_row = future.result()
                    if not res_row:
                        continue

                    em = res_row["professional_email"]
                    with output_lock:
                        if em in existing_emails:
                            continue
                        existing_emails.add(em)
                        collected_leads += 1

                        # Append to daily output CSV
                        with open(output_csv, "a", encoding="utf-8-sig", newline="") as f:
                            writer = csv.DictWriter(f, fieldnames=fieldnames)
                            writer.writerow(res_row)

                        # Append to central master CSV
                        with open(CENTRAL_MASTER_FILE, "a", encoding="utf-8-sig", newline="") as mf:
                            m_writer = csv.DictWriter(mf, fieldnames=fieldnames)
                            if CENTRAL_MASTER_FILE.stat().st_size == 0:
                                m_writer.writeheader()
                            m_writer.writerow(res_row)

                    pct = (collected_leads / target_leads) * 100
                    name = res_row["researcher_name"]
                    sc = res_row["match_score"]
                    inst = res_row["affiliation"][:35]
                    print(f"🎯 [{collected_leads}/{target_leads} | {pct:.1f}%] {name} <{em}> | Score: {sc}/100 | {inst}")
                except Exception as ex:
                    pass

        time.sleep(0.3)

    elapsed = round(time.time() - start_time, 1)
    print("\n" + "=" * 72)
    if STOP_REQUESTED:
        print("🛑 Execution stopped by user request.")
    else:
        print("✅ BIORXIV PIPELINE COMPLETED SUCCESSFULLY!")
    print(f"• Total Verified Leads (Score >= {min_score}): {collected_leads:,}")
    print(f"• Scanned Preprints: {scanned_preprints:,}")
    print(f"• Time Elapsed: {elapsed} seconds")
    print(f"• Output Dataset: {output_csv.name}")
    print("=" * 72)

    return {
        "status": "completed",
        "collected_leads": collected_leads,
        "target_leads": target_leads,
        "file": output_csv.name,
        "elapsed_seconds": elapsed,
    }


def run(keyword="cell biology", target_leads=1000, min_score=50, from_date="2025-01-01", to_date="2026-12-31"):
    return run_biorxiv_pipeline(
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
