
import csv
import os
import re
import time
from pathlib import Path

import requests

# 1. Customize these terms for your conference.
SEARCH_TERMS = [
    "machine learning in healthcare",
    "medical image analysis",
    "clinical artificial intelligence",
]

# Focus on recent work. Change these years as needed.
START_YEAR = 2021
END_YEAR = 2026

# Start small; each term can return up to 300 papers.
PER_PAGE = 100
MAX_PAGES_PER_TERM = 3

# Automated Email Enrichment Configuration
# Set to True to query ORCID and Europe PMC for researchers where OpenAlex
# didn't contain an email in raw affiliation strings.
ENRICH_EMAILS_ONLINE = True
# Limit external API calls to top N researchers to keep execution fast
MAX_ENRICH_CANDIDATES = 50

BASE_URL = "https://api.openalex.org/works"
API_KEY = "5h8s0xhGxE1uL0ZJ5CdsT5"

OUTPUT_FILE = Path(__file__).with_name(
    "openalex_researchers.csv"
)

EMAIL_REGEX = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
)

IGNORED_EMAIL_DOMAINS = {
    "example.com", "domain.com", "email.com", "none.com",
    "s-corp.com", "github.com", "openalex.org"
}


def clean_email(email_str):
    """Sanitize and validate extracted email address."""
    if not email_str:
        return ""
    email = email_str.strip(".,;:()<>[]'\"").lower()
    if not EMAIL_REGEX.match(email):
        return ""
    domain = email.split("@")[-1]
    if domain in IGNORED_EMAIL_DOMAINS or domain.endswith((".png", ".jpg", ".gif")):
        return ""
    return email


def fetch_email_from_orcid(session, orcid_url):
    """Attempt to fetch public email from the ORCID Public API."""
    if not orcid_url:
        return None
    # Extract ORCID ID from URL (e.g. https://orcid.org/0000-0001-2345-6789)
    orcid_id = orcid_url.rstrip("/").split("/")[-1]
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/email"
    headers = {"Accept": "application/json"}
    try:
        res = session.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
            email_entries = data.get("email", [])
            for entry in email_entries:
                email = clean_email(entry.get("email"))
                if email:
                    return email, orcid_url
    except Exception:
        pass
    return None


def fetch_email_from_europepmc(session, doi, author_name):
    """Attempt to query Europe PMC for corresponding author email on this DOI."""
    if not doi:
        return None
    # Clean doi string
    clean_doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "")
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    params = {
        "query": f'DOI:"{clean_doi}"',
        "format": "json",
        "resultType": "core",
    }
    try:
        res = session.get(url, params=params, timeout=10)
        if res.status_code == 200:
            results = res.json().get("resultList", {}).get("result", [])
            if not results:
                return None
            result = results[0]
            # Check authorList
            author_list = (
                result.get("authorList", {}).get("author", [])
            )
            for a in author_list:
                # Compare surname / full name if possible
                author_full = f"{a.get('firstName', '')} {a.get('lastName', '')}".strip()
                aff_string = a.get("affiliation", "") or ""
                emails_in_aff = EMAIL_REGEX.findall(aff_string)
                for raw_email in emails_in_aff:
                    email = clean_email(raw_email)
                    if email:
                        # If author name matches or is the only author with email
                        if not author_name or a.get("lastName", "").lower() in author_name.lower():
                            return email, f"https://doi.org/{clean_doi}"
    except Exception:
        pass
    return None


def get_works(session, term):
    """Fetch a limited set of works matching a search term with polite pool & retry."""
    for page in range(1, MAX_PAGES_PER_TERM + 1):
        params = {
            "search": term,
            "filter": (
                f"publication_year:{START_YEAR}-{END_YEAR}"
            ),
            "per-page": PER_PAGE,
            "page": page,
            "select": (
                "id,title,publication_year,doi,"
                "authorships,topics"
            ),
            # Joins OpenAlex Polite Pool (10 req/sec, no 429 throttling)
            "email": "research_contact_team@gmail.com",
        }

        if API_KEY:
            params["api_key"] = API_KEY

        # Retry loop for rate-limiting (429) or transient errors
        results = []
        for attempt in range(5):
            try:
                response = session.get(
                    BASE_URL,
                    params=params,
                    timeout=30,
                )
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 5
                    print(f"  [Rate limit 429] Waiting {wait_time}s before retrying page {page}...")
                    time.sleep(wait_time)
                    continue
                response.raise_for_status()
                results = response.json().get("results", [])
                break
            except requests.RequestException as e:
                if attempt == 4:
                    print(f"  Failed page {page} for '{term}': {e}")
                    raise
                time.sleep(3)

        for work in results:
            yield work

        if len(results) < PER_PAGE:
            break

        time.sleep(0.5)


def main():
    # Keyed by OpenAlex author ID to avoid duplicate people.
    researchers = {}

    with requests.Session() as session:
        session.headers.update({
            "User-Agent": "ResearcherDataTool/1.0 (mailto:researcher_tool@academic.edu)"
        })

        for term in SEARCH_TERMS:
            print(f"\nSearching: {term}")

            try:
                for work in get_works(session, term):
                    work_id = work.get("id")
                    title = work.get("title") or ""
                    year = work.get("publication_year")
                    doi = work.get("doi") or ""

                    paper = {
                        "title": title,
                        "year": year,
                        "doi": doi,
                    }

                    for authorship in (
                        work.get("authorships") or []
                    ):
                        author = (
                            authorship.get("author") or {}
                        )
                        author_id = author.get("id")

                        if not author_id:
                            continue

                        if author_id not in researchers:
                            researchers[author_id] = {
                                "name": "",
                                "orcid": set(),
                                "institutions": set(),
                                "search_terms": set(),
                                "papers": {},
                                "emails": set(),
                                "email_source": "",
                            }

                        record = researchers[author_id]

                        if author.get("display_name"):
                            record["name"] = (
                                author["display_name"]
                            )

                        if author.get("orcid"):
                            record["orcid"].add(
                                author["orcid"]
                            )

                        record["search_terms"].add(term)

                        # These are affiliations listed on
                        # matching papers, not guaranteed
                        # current employment.
                        for institution in (
                            authorship.get("institutions")
                            or []
                        ):
                            institution_name = (
                                institution.get("display_name")
                            )
                            if institution_name:
                                record["institutions"].add(
                                    institution_name
                                )

                        # 1. Fast regex extraction from OpenAlex affiliation strings
                        raw_affils = (
                            authorship.get("raw_affiliation_strings")
                            or []
                        )
                        raw_single = authorship.get("raw_affiliation_string")
                        if raw_single and raw_single not in raw_affils:
                            raw_affils.append(raw_single)

                        for aff in raw_affils:
                            for raw_email in EMAIL_REGEX.findall(aff):
                                email = clean_email(raw_email)
                                if email:
                                    record["emails"].add(email)
                                    if not record["email_source"]:
                                        record["email_source"] = (
                                            doi or work_id or ""
                                        )

                        if work_id:
                            record["papers"][work_id] = paper

            except requests.RequestException as error:
                print(f"Request failed for '{term}': {error}")
                continue

        # Sort researchers by paper count & name
        sorted_records = sorted(
            researchers.items(),
            key=lambda item: (
                len(item[1]["papers"]),
                item[1]["name"].lower(),
            ),
            reverse=True,
        )

        # 2. Automated fallback enrichment via ORCID and Europe PMC
        if ENRICH_EMAILS_ONLINE and sorted_records:
            target_count = min(len(sorted_records), MAX_ENRICH_CANDIDATES)
            print(
                f"\nChecking ORCID & Europe PMC for top {target_count} candidates..."
            )
            for i, (author_id, record) in enumerate(
                sorted_records[:target_count], 1
            ):
                if record["emails"]:
                    continue  # Already extracted from paper affiliations

                author_name = record["name"]

                # Try ORCID
                for orcid_url in record["orcid"]:
                    orcid_res = fetch_email_from_orcid(session, orcid_url)
                    if orcid_res:
                        email, source = orcid_res
                        record["emails"].add(email)
                        record["email_source"] = source
                        print(f"  [{i}/{target_count}] Found via ORCID for {author_name}: {email}")
                        break

                # Try Europe PMC on their top matching papers by DOI
                if not record["emails"]:
                    for paper_info in record["papers"].values():
                        paper_doi = paper_info.get("doi")
                        if paper_doi:
                            pmc_res = fetch_email_from_europepmc(
                                session, paper_doi, author_name
                            )
                            if pmc_res:
                                email, source = pmc_res
                                record["emails"].add(email)
                                record["email_source"] = source
                                print(f"  [{i}/{target_count}] Found via Europe PMC for {author_name}: {email}")
                                break

                time.sleep(0.1)

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

    with OUTPUT_FILE.open(
        "w", newline="", encoding="utf-8-sig"
    ) as file:
        writer = csv.DictWriter(
            file, fieldnames=columns
        )
        writer.writeheader()

        for author_id, record in sorted_records:
            papers = sorted(
                record["papers"].values(),
                key=lambda p: p["year"] or 0,
                reverse=True,
            )

            latest_year = max(
                (p["year"] or 0 for p in papers),
                default=0,
            )

            examples = "; ".join(
                f"{p['year'] or 'Year unknown'}: {p['title']}"
                for p in papers[:5]
                if p["title"]
            )

            primary_email = (
                "; ".join(sorted(record["emails"]))
                if record["emails"]
                else ""
            )
            email_source = record["email_source"] if primary_email else ""
            status = "found" if primary_email else "needs_review"

            dois = "; ".join(
                p["doi"] for p in papers[:5] if p.get("doi")
            )

            writer.writerow({
                "researcher_name": record["name"],
                "openalex_author_id": author_id,
                "orcid": "; ".join(
                    sorted(record["orcid"])
                ),
                "affiliations_seen_on_matching_papers":
                    "; ".join(sorted(record["institutions"])),
                "matched_search_terms": "; ".join(
                    sorted(record["search_terms"])
                ),
                "matching_paper_count": len(papers),
                "latest_matching_paper_year":
                    latest_year or "",
                "example_papers": examples,
                "example_paper_dois": dois,
                "professional_email": primary_email,
                "email_source_url": email_source,
                "review_status": status,
            })

    print(f"\nUnique researcher candidates: {len(researchers)}")
    print(f"Output saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
