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

FOLDER = Path(__file__).parent
INPUT_FILE = FOLDER / "openalex_researchers.csv"
OUTPUT_FILE = FOLDER / "researchers_with_emails.csv"

MAX_WORKERS = 10
SAVE_EVERY = 50

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
# GENERAL HELPERS
# --------------------------------------------------

def clean_doi(value):
    """Convert DOI URLs or DOI strings to a plain DOI."""
    if not value:
        return ""

    doi = str(value).strip()

    if doi.lower() in {"nan", "none", "null"}:
        return ""

    doi = re.sub(
        r"^https?://(?:dx\.)?doi\.org/",
        "",
        doi,
        flags=re.IGNORECASE
    )

    return doi.strip().rstrip(".,; ")


def extract_dois(value):
    """Read semicolon-separated DOIs from the CSV."""
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

    # Reject obvious placeholders and invalid-looking values.
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
    """Make a polite request and return text, or None on failure."""
    req_headers = HEADERS.copy()
    if headers:
        req_headers.update(headers)
    try:
        response = requests.get(
            url,
            params=params,
            headers=req_headers,
            timeout=15
        )
        if response.status_code == 200:
            return response.text
    except requests.RequestException:
        pass

    return None


# --------------------------------------------------
# ORCID LOOKUP
# --------------------------------------------------

def get_email_from_orcid(orcid_url):
    """Check ORCID Public API for verified public email."""
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


# --------------------------------------------------
# CROSSREF LOOKUP
# --------------------------------------------------

def get_email_from_crossref(doi):
    """
    Crossref metadata can occasionally contain an author email.
    """
    url = "https://api.crossref.org/works/" + requests.utils.quote(
        doi, safe="/"
    )

    text = get_page(url)

    if not text:
        return None, None

    try:
        data = json.loads(text)
        message = data.get("message", {})
        metadata_text = str(message)

        emails = extract_emails(metadata_text)

        if emails:
            return emails[0], url

    except (ValueError, TypeError):
        pass

    return None, None


# --------------------------------------------------
# EUROPE PMC LOOKUP
# --------------------------------------------------

def get_email_from_europepmc(doi):
    """
    Search Europe PMC for the DOI. If full text is available,
    inspect the article XML for email addresses.
    """
    search_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

    search_text = get_page(
        search_url,
        params={
            "query": f'DOI:"{doi}"',
            "format": "json",
            "pageSize": 5
        }
    )

    if not search_text:
        return None, None

    try:
        data = json.loads(search_text)
        results = data.get("resultList", {}).get("result", [])
    except (ValueError, TypeError):
        return None, None

    for article in results:
        pmcid = article.get("pmcid")

        if not pmcid:
            continue

        pmcid = pmcid.strip()

        # Only use the PMC identifier returned by Europe PMC.
        if not re.fullmatch(r"PMC\d+", pmcid, flags=re.IGNORECASE):
            continue

        xml_url = (
            "https://www.ebi.ac.uk/europepmc/webservices/rest/"
            + pmcid
            + "/fullTextXML"
        )

        xml_text = get_page(xml_url)

        if not xml_text:
            continue

        emails = extract_emails(xml_text)

        if emails:
            return emails[0], xml_url

    return None, None


def search_europepmc_by_title(author_name, title):
    """Search Europe PMC by author and paper title to extract email."""
    if not title or len(title) < 10:
        return None, None

    last_name = author_name.split()[-1] if author_name else ""
    clean_title = re.sub(r"[^\w\s]", "", title)[:80].strip()
    query = f'AUTH:"{last_name}" AND "{clean_title}"' if last_name else f'"{clean_title}"'

    search_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    text = get_page(search_url, params={"query": query, "format": "json", "pageSize": 3})
    if not text:
        return None, None

    try:
        data = json.loads(text)
        results = data.get("resultList", {}).get("result", [])
        for r in results:
            doi = r.get("doi")
            if doi:
                res_email, res_url = get_email_from_crossref(doi)
                if res_email:
                    return res_email, res_url
            pmcid = r.get("pmcid")
            if pmcid and re.fullmatch(r"PMC\d+", pmcid.strip(), flags=re.IGNORECASE):
                xml_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid.strip()}/fullTextXML"
                xml_text = get_page(xml_url)
                if xml_text:
                    emails = extract_emails(xml_text)
                    if emails:
                        return emails[0], xml_url
    except Exception:
        pass
    return None, None


# --------------------------------------------------
# RESEARCHER PROCESSING
# --------------------------------------------------

def process_researcher(row):
    """
    Keep an existing email if present. Otherwise, check ORCID,
    Crossref, and Europe PMC using DOIs or paper titles.
    """
    existing_email = str(
        row.get("professional_email", "") or ""
    ).strip()

    if existing_email.lower() in {"nan", "none", "null"}:
        existing_email = ""

    if existing_email:
        row["email_status"] = (
            row.get("email_status")
            or "Existing email - review needed"
        )
        return row

    author_name = str(row.get("researcher_name", "")).strip()

    # 1. Try ORCID
    orcid_url = row.get("orcid", "")
    if orcid_url:
        email, source_url = get_email_from_orcid(orcid_url)
        if email:
            row["professional_email"] = email
            row["email_source_url"] = source_url
            row["email_status"] = "Found (ORCID public profile)"
            row["review_status"] = "found"
            return row

    # 2. Check example paper DOIs
    doi_values = row.get("example_paper_dois", "")
    dois = extract_dois(doi_values)

    if dois:
        for doi in dois:
            email, source_url = get_email_from_crossref(doi)
            if email:
                row["professional_email"] = email
                row["email_source_url"] = source_url
                row["email_status"] = "Candidate found (Crossref; verify identity)"
                row["review_status"] = "found"
                return row

            email, source_url = get_email_from_europepmc(doi)
            if email:
                row["professional_email"] = email
                row["email_source_url"] = source_url
                row["email_status"] = "Candidate found (Europe PMC XML; verify identity)"
                row["review_status"] = "found"
                return row
            time.sleep(0.05)

    # 3. Fallback: Search Europe PMC using example paper titles
    example_papers = str(row.get("example_papers", ""))
    if example_papers:
        titles = []
        for part in example_papers.split(";"):
            t = part.split(":", 1)[-1].strip()
            if len(t) > 10:
                titles.append(t)

        for title in titles[:2]:
            email, source_url = search_europepmc_by_title(author_name, title)
            if email:
                row["professional_email"] = email
                row["email_source_url"] = source_url
                row["email_status"] = "Candidate found (Europe PMC by Title)"
                row["review_status"] = "found"
                return row
            time.sleep(0.05)

    row["professional_email"] = ""
    row["email_source_url"] = ""
    row["email_status"] = "No email found in available sources"

    return row


def main():
    print(f"Reading: {INPUT_FILE}")

    if not INPUT_FILE.exists():
        raise SystemExit(f"Missing input file: {INPUT_FILE}")

    with INPUT_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    required_columns = [
        "professional_email",
        "email_source_url",
        "review_status",
        "example_paper_dois",
        "email_status",
    ]

    for col in required_columns:
        if col not in fieldnames:
            fieldnames.append(col)

    total = len(rows)
    print(f"Researchers loaded: {total}")

    def save_checkpoint(data_rows):
        with OUTPUT_FILE.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data_rows)

    save_checkpoint(rows)

    results = [None] * total
    completed = 0
    lock = Lock()
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_researcher, dict(row)): i
            for i, row in enumerate(rows)
        }

        for future in as_completed(futures):
            index = futures[future]

            try:
                results[index] = future.result()
            except Exception as exc:
                failed_row = dict(rows[index])
                failed_row["email_status"] = (
                    "Processing error: " + str(exc)[:200]
                )
                results[index] = failed_row

            completed += 1

            if completed % 25 == 0 or completed == total:
                with print_lock:
                    found_so_far = sum(
                        1 for r in results
                        if r and str(r.get("professional_email", "")).strip()
                    )
                    elapsed = time.time() - start_time
                    print(
                        f"Processed {completed}/{total} ({completed/total*100:.1f}%) | "
                        f"Found: {found_so_far} | Elapsed: {elapsed:.1f}s"
                    )

            if completed % SAVE_EVERY == 0 or completed == total:
                with lock:
                    checkpoint = [
                        results[i] if results[i] is not None
                        else rows[i]
                        for i in range(total)
                    ]
                    save_checkpoint(checkpoint)

    final_rows = [
        results[i] if results[i] is not None else rows[i]
        for i in range(total)
    ]
    save_checkpoint(final_rows)

    found = sum(
        1 for r in final_rows
        if str(r.get("professional_email", "")).strip()
    )

    print("\nFinished!")
    print(f"Total researchers: {total}")
    print(f"Researchers with an email value: {found}")
    print(f"Output saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
