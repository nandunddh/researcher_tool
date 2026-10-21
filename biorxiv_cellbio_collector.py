import csv
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

import requests

# --------------------------------------------------
# SETTINGS
# --------------------------------------------------

OUTPUT_FILE = Path(__file__).with_name("biorxiv_cellbio_researchers.csv")

# Categories to target
TARGET_CATEGORIES = {
    "cell biology",
    "molecular biology",
    "cancer biology",
    "developmental biology",
    "biochemistry",
}

# Date window: recent 2024-2026 preprints
START_DATE = "2024-01-01"
END_DATE = "2026-10-21"

# How many bioRxiv preprints to fetch (100 per API page)
MAX_PREPRINTS_TO_SCAN = 1000

MAX_WORKERS = 10

HEADERS = {
    "User-Agent": "BioRxivCellBioFinder/1.0 (academic research mailto:researcher_tool@academic.edu)"
}

EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

IGNORED_DOMAINS = {
    "example.com", "domain.com", "email.com", "none.com",
    "biorxiv.org", "cshlp.org", "s-corp.com"
}

print_lock = Lock()


def clean_email(email_str):
    if not email_str:
        return ""
    email = str(email_str).strip().lower().rstrip(".,;:)'\"")
    if not EMAIL_RE.fullmatch(email):
        return ""
    if any(email.endswith(ext) for ext in (".png", ".jpg", ".pdf", ".gif")):
        return ""
    domain = email.split("@")[-1]
    if domain in IGNORED_DOMAINS or ".." in email:
        return ""
    return email


def get_email_from_epmc_preprint(session, doi, author_name):
    """Fetch preprint XML from Europe PMC to extract corresponding author email."""
    if not doi:
        return None
    clean_doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").strip()
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    params = {
        "query": f'DOI:"{clean_doi}"',
        "format": "json",
        "pageSize": 2
    }
    try:
        res = session.get(url, params=params, headers=HEADERS, timeout=12)
        if res.status_code == 200:
            results = res.json().get("resultList", {}).get("result", [])
            for r in results:
                # Check author list affiliation strings
                for a in r.get("authorList", {}).get("author", []):
                    aff = a.get("affiliation", "") or ""
                    for raw in EMAIL_RE.findall(aff):
                        email = clean_email(raw)
                        if email:
                            return email, f"https://doi.org/{clean_doi}"
                # Check PMC fullTextXML if available
                pmcid = r.get("pmcid")
                if pmcid and re.fullmatch(r"PMC\d+", pmcid.strip(), flags=re.IGNORECASE):
                    xml_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid.strip()}/fullTextXML"
                    xml_res = session.get(xml_url, headers=HEADERS, timeout=12)
                    if xml_res.status_code == 200:
                        for raw in EMAIL_RE.findall(xml_res.text):
                            email = clean_email(raw)
                            if email:
                                return email, f"https://doi.org/{clean_doi}"
    except Exception:
        pass
    return None


def fetch_biorxiv_preprints():
    """Fetch recent preprints from the bioRxiv API matching target categories."""
    print(f"Fetching recent bioRxiv preprints between {START_DATE} and {END_DATE}...")
    base_url = f"https://api.biorxiv.org/details/biorxiv/{START_DATE}/{END_DATE}"
    cursor = 0
    collected = []

    session = requests.Session()

    while cursor < MAX_PREPRINTS_TO_SCAN:
        url = f"{base_url}/{cursor}"
        try:
            res = session.get(url, headers=HEADERS, timeout=20)
            if res.status_code != 200:
                print(f"  bioRxiv API returned status {res.status_code}")
                break

            data = res.json()
            collection = data.get("collection", [])
            if not collection:
                break

            for paper in collection:
                cat = str(paper.get("category", "")).strip().lower()
                if cat in TARGET_CATEGORIES:
                    collected.append(paper)

            print(f"  Scanned {cursor + len(collection)} preprints | Found {len(collected)} in {TARGET_CATEGORIES}...")
            cursor += len(collection)

            if len(collection) < 100:
                break

            time.sleep(0.3)
        except Exception as e:
            print(f"  Error querying bioRxiv: {e}")
            break

    print(f"Total matching CellBio/MolBio preprints collected: {len(collected)}\n")
    return collected


def process_paper(paper):
    """Extract corresponding author and lookup their email."""
    session = requests.Session()

    doi = paper.get("doi", "")
    title = paper.get("title", "")
    author_corr = paper.get("author_corresponding", "")
    institution = paper.get("author_corresponding_institution", "")
    category = paper.get("category", "")
    date = paper.get("date", "")

    # Fallback to first author if author_corresponding is empty
    if not author_corr:
        authors_list = [a.strip() for a in paper.get("authors", "").split(";") if a.strip()]
        author_corr = authors_list[0] if authors_list else "Unknown"

    email = ""
    source_url = ""

    # Query Europe PMC / BioRxiv XML for the corresponding email
    res = get_email_from_epmc_preprint(session, doi, author_corr)
    if res:
        email, source_url = res

    return {
        "researcher_name": author_corr,
        "professional_email": email,
        "email_source_url": source_url,
        "institution": institution,
        "category": category,
        "paper_title": title,
        "doi": f"https://doi.org/{doi}" if doi else "",
        "publication_date": date,
        "review_status": "found" if email else "needs_review",
    }


def main():
    print("=========================================================")
    print("  bioRxiv Cell Biology Researcher & Email Collector")
    print("=========================================================\n")

    preprints = fetch_biorxiv_preprints()
    if not preprints:
        print("No preprints found. Exiting.")
        return

    # Deduplicate by DOI to avoid duplicate versions
    unique_papers = {}
    for p in preprints:
        doi = p.get("doi")
        if doi and doi not in unique_papers:
            unique_papers[doi] = p

    paper_list = list(unique_papers.values())
    total = len(paper_list)
    print(f"Processing {total} unique preprints with {MAX_WORKERS} concurrent threads...")

    fieldnames = [
        "researcher_name",
        "professional_email",
        "email_source_url",
        "institution",
        "category",
        "paper_title",
        "doi",
        "publication_date",
        "review_status",
    ]

    results = []
    found_count = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_paper, paper): i
            for i, paper in enumerate(paper_list)
        }

        for future in as_completed(futures):
            res = future.result()
            results.append(res)
            if res.get("professional_email"):
                found_count += 1
                with print_lock:
                    name = res.get("researcher_name")
                    em = res.get("professional_email")
                    inst = res.get("institution")
                    print(f"  [+] Found email: {name} ({inst}) -> {em}")

            if len(results) % 25 == 0 or len(results) == total:
                elapsed = time.time() - start_time
                pct = len(results) / total * 100
                print(f"Progress: {len(results)}/{total} ({pct:.1f}%) | Emails found: {found_count} | Elapsed: {elapsed:.1f}s")

    # Write output to CSV
    with OUTPUT_FILE.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    print("\n=========================================================")
    print(f"Completed in {time.time() - start_time:.1f}s!")
    print(f"Total Preprints Analyzed: {total}")
    print(f"Researchers with Verified Email: {found_count} (Hit Rate: {found_count/total*100:.1f}%)")
    print(f"Saved to: {OUTPUT_FILE}")
    print("=========================================================")


if __name__ == "__main__":
    main()
