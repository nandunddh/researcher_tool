import csv
import re
import socket
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

import requests
from bs4 import BeautifulSoup

FOLDER = Path(__file__).parent
INPUT_FILE = FOLDER / "researchers_with_emails.csv"
OUTPUT_FILE = FOLDER / "researchers_with_emails.csv"

MAX_WORKERS = 8
SAVE_EVERY = 25

EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

IGNORED_DOMAINS = {
    "example.com", "domain.com", "email.com", "none.com",
    "s-corp.com", "github.com", "openalex.org", "wiley.com",
    "elsevier.com", "springer.com", "nature.com", "pubmed.ncbi.nlm.nih.gov",
    "frontiersin.org", "mdpi.com", "sciencedirect.com", "biorxiv.org",
    "medrxiv.org", "researchgate.net", "academia.edu", "linkedin.com",
    "twitter.com", "facebook.com", "google.com", "duckduckgo.com"
}

IGNORED_EXTENSIONS = (
    ".png", ".jpg", ".jpeg", ".gif", ".pdf", ".svg", ".webp", ".css", ".js"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

print_lock = Lock()
file_lock = Lock()


def clean_email(email_str):
    if not email_str:
        return ""
    email = str(email_str).strip().lower().rstrip(".,;:)'\"")
    if not EMAIL_RE.fullmatch(email):
        return ""
    if any(email.endswith(ext) for ext in IGNORED_EXTENSIONS):
        return ""
    domain = email.split("@")[-1]
    if domain in IGNORED_DOMAINS or ".." in email:
        return ""
    return email


def extract_emails_from_html(html_text):
    if not html_text:
        return []
    soup = BeautifulSoup(html_text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    found = set()
    # Check mailto: links first
    for a in soup.select('a[href^="mailto:"]'):
        href = a.get("href", "")[7:].split("?")[0]
        cleaned = clean_email(href)
        if cleaned:
            found.add(cleaned)

    # Check visible page text
    text = soup.get_text(" ", strip=True)
    for raw in EMAIL_RE.findall(text):
        cleaned = clean_email(raw)
        if cleaned:
            found.add(cleaned)

    return list(found)


def quick_domain_check(email):
    """Check if the email domain has active DNS MX/A records (will not bounce on bad host)."""
    try:
        domain = email.split("@")[-1]
        socket.gethostbyname(domain)
        return True
    except Exception:
        return False


def search_institutional_profile(session, researcher_name, institution):
    """Search for the researcher's official profile page and extract their email."""
    if not researcher_name or not institution:
        return None, None

    # Clean query terms
    clean_inst = institution.split(";")[0].strip()
    # Remove bracketed country names or punctuation
    clean_inst = re.sub(r"\(.*?\)", "", clean_inst).strip()
    query = f'"{researcher_name}" "{clean_inst}" email OR faculty OR contact'
    encoded_query = urllib.parse.quote_plus(query)

    # Use DuckDuckGo HTML endpoint for free search
    search_url = f"https://html.duckduckgo.com/html/?q={encoded_query}"

    try:
        res = session.get(search_url, headers=HEADERS, timeout=12)
        if res.status_code != 200:
            return None, None

        soup = BeautifulSoup(res.text, "html.parser")
        results = soup.select(".result__url")
        urls_to_check = []

        for r in results[:4]:
            link = r.get("href", "").strip()
            if not link:
                raw_text = r.get_text(strip=True)
                if "http" in raw_text:
                    link = raw_text
            if link and not any(ign in link.lower() for ign in IGNORED_DOMAINS):
                if not link.startswith("http"):
                    link = "https://" + link
                urls_to_check.append(link)

        # Also search snippet text for email directly
        snippets = soup.select(".result__snippet")
        for s in snippets:
            snippet_text = s.get_text()
            emails = EMAIL_RE.findall(snippet_text)
            for raw_e in emails:
                cleaned = clean_email(raw_e)
                if cleaned and quick_domain_check(cleaned):
                    return cleaned, "DuckDuckGo Profile Snippet"

        # Fetch top candidate profile pages
        last_name = researcher_name.split()[-1].lower()
        for page_url in urls_to_check[:2]:
            try:
                page_res = session.get(page_url, headers=HEADERS, timeout=10)
                if page_res.status_code == 200 and "text/html" in page_res.headers.get("Content-Type", ""):
                    page_emails = extract_emails_from_html(page_res.text)
                    for email in page_emails:
                        # Validate that email belongs to researcher or institution
                        local_part = email.split("@")[0]
                        if last_name in local_part or len(page_emails) == 1:
                            if quick_domain_check(email):
                                return email, page_url
            except Exception:
                continue

    except Exception:
        pass

    return None, None


def process_row(row):
    """Enrich missing emails from institutional web profiles."""
    current_email = str(row.get("professional_email", "") or "").strip()
    if current_email and current_email.lower() not in {"nan", "none", "null"}:
        return row, False

    name = str(row.get("researcher_name", "")).strip()
    institutions = str(row.get("affiliations_seen_on_matching_papers", "")).strip()

    if not name or not institutions:
        return row, False

    session = requests.Session()
    email, source = search_institutional_profile(session, name, institutions)

    if email:
        row["professional_email"] = email
        row["email_source_url"] = source
        row["email_status"] = "Found (Institutional Profile)"
        row["review_status"] = "found"
        return row, True

    return row, False


def main():
    print(f"Reading: {INPUT_FILE}")
    if not INPUT_FILE.exists():
        raise SystemExit(f"Missing file: {INPUT_FILE}")

    with INPUT_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    total = len(rows)
    existing_count = sum(
        1 for r in rows if str(r.get("professional_email", "")).strip()
    )
    missing_indices = [
        i for i, r in enumerate(rows)
        if not str(r.get("professional_email", "")).strip()
    ]

    print(f"Total researchers: {total}")
    print(f"Already have email: {existing_count}")
    print(f"To search via University Profiles: {len(missing_indices)}")
    print(f"Running multi-threaded discovery ({MAX_WORKERS} workers)...\n")

    found_new = 0
    completed = 0
    start_time = time.time()

    def save_file():
        with file_lock:
            with OUTPUT_FILE.open("w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_idx = {
            executor.submit(process_row, rows[i]): i
            for i in missing_indices
        }

        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            completed += 1

            try:
                updated_row, was_found = future.result()
                rows[idx] = updated_row
                if was_found:
                    found_new += 1
                    with print_lock:
                        name = updated_row.get("researcher_name", "")
                        email = updated_row.get("professional_email", "")
                        print(f"  [+] Found profile for {name}: {email}")
            except Exception:
                pass

            if completed % 25 == 0 or completed == len(missing_indices):
                with print_lock:
                    elapsed = time.time() - start_time
                    current_total = existing_count + found_new
                    pct = (completed / len(missing_indices)) * 100
                    print(
                        f"Progress: {completed}/{len(missing_indices)} ({pct:.1f}%) | "
                        f"New found: {found_new} | Total overall: {current_total}/{total} | Elapsed: {elapsed:.1f}s"
                    )

            if completed % SAVE_EVERY == 0 or completed == len(missing_indices):
                save_file()

    save_file()

    total_final = existing_count + found_new
    print("\n==========================================")
    print(f"Institutional Profile Search Complete!")
    print(f"Newly discovered emails: {found_new}")
    print(f"Final Total with verified email: {total_final} / {total} ({total_final/total*100:.1f}%)")
    print(f"Saved to: {OUTPUT_FILE}")
    print("==========================================")


if __name__ == "__main__":
    main()
