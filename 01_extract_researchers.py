import calendar
import csv
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

SEARCH_TERMS = [
    "Physical Chemistry",
]

# Date filter: Can be YYYY-MM-DD to YYYY-MM-DD, a month (YYYY-MM), or a year (YYYY)
FROM_DATE = "2026-01-01"
TO_DATE = "2026-01-31"


def build_date_filter(from_d, to_d=""):
    """
    Constructs an OpenAlex filter string supporting:
    - Specific Year (e.g. 2026 -> publication_year:2026)
    - Specific Month (e.g. 2026-01 -> 2026-01-01 to 2026-01-31)
    - Custom Date Range (e.g. 2026-01-01 to 2026-03-31)
    """
    from_str = str(from_d).strip() if from_d else ""
    to_str = str(to_d).strip() if to_d else ""

    # 1. Whole Year check (e.g. "2026")
    if re.fullmatch(r"\d{4}", from_str):
        y1 = int(from_str)
        if not to_str or to_str == from_str:
            return f"publication_year:{y1}"
        if re.fullmatch(r"\d{4}", to_str):
            y2 = int(to_str)
            return f"from_publication_date:{min(y1, y2)}-01-01,to_publication_date:{max(y1, y2)}-12-31"

    # 2. Month check (e.g. "2026-01")
    if re.fullmatch(r"\d{4}-\d{2}", from_str):
        y, m = map(int, from_str.split("-"))
        _, last_day = calendar.monthrange(y, m)
        return f"from_publication_date:{y:04d}-{m:02d}-01,to_publication_date:{y:04d}-{m:02d}-{last_day:02d}"

    # 3. Standard YYYY-MM-DD range
    if not to_str:
        to_str = from_str
    return f"from_publication_date:{from_str},to_publication_date:{to_str}"



# Scale settings:
PER_PAGE = 200
MAX_PAGES_PER_TERM = 25

ENRICH_EMAILS_ONLINE = True
MAX_ENRICH_CANDIDATES = 50

BASE_URL = "https://api.openalex.org/works"
API_KEY = os.environ.get("OPENALEX_API_KEY", "")

try:
    from app_config import get_data_dir
    DATA_DIR = get_data_dir()
except Exception:
    DATA_DIR = Path(__file__).resolve().parent / "data"
TODAY_DIR = DATA_DIR / datetime.now().strftime("%Y-%m-%d")
TODAY_DIR.mkdir(parents=True, exist_ok=True)
TIMESTAMP = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
OUTPUT_FILE = TODAY_DIR / f"openalex_researchers_{TIMESTAMP}.csv"

EMAIL_REGEX = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
)

IGNORED_EMAIL_DOMAINS = {
    "example.com", "domain.com", "email.com", "none.com",
    "s-corp.com", "github.com", "openalex.org"
}


def clean_email(email_str):
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
    if not orcid_url:
        return None
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
    if not doi:
        return None
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
            author_list = (
                result.get("authorList", {}).get("author", [])
            )
            for a in author_list:
                aff_string = a.get("affiliation", "") or ""
                emails_in_aff = EMAIL_REGEX.findall(aff_string)
                for raw_email in emails_in_aff:
                    email = clean_email(raw_email)
                    if email:
                        if not author_name or a.get("lastName", "").lower() in author_name.lower():
                            return email, f"https://doi.org/{clean_doi}"
    except Exception:
        pass
    return None


def get_works(session, term):
    date_filter = build_date_filter(FROM_DATE, TO_DATE)
    clean_term = term.replace("_", " ")
    print(f"  [OpenAlex] Using date filter: {date_filter}", flush=True)


    for page in range(1, MAX_PAGES_PER_TERM + 1):
        print(f"  [OpenAlex] Fetching page {page}/{MAX_PAGES_PER_TERM} for '{clean_term}'...", flush=True)
        params = {
            "search": clean_term,
            "filter": date_filter,
            "per-page": PER_PAGE,
            "page": page,
            "select": (
                "id,title,publication_year,doi,"
                "authorships,topics"
            ),
            "mailto": "research_contact_team@gmail.com",
        }

        if API_KEY:
            params["api_key"] = API_KEY

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

        time.sleep(0.3)

def main():
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

        sorted_records = sorted(
            researchers.items(),
            key=lambda item: (
                len(item[1]["papers"]),
                item[1]["name"].lower(),
            ),
            reverse=True,
        )

        if ENRICH_EMAILS_ONLINE and sorted_records:
            target_count = min(len(sorted_records), MAX_ENRICH_CANDIDATES)
            print(
                f"\nChecking ORCID & Europe PMC for top {target_count} candidates..."
            )
            for i, (author_id, record) in enumerate(
                sorted_records[:target_count], 1
            ):
                if record["emails"]:
                    continue

                author_name = record["name"]

                for orcid_url in record["orcid"]:
                    orcid_res = fetch_email_from_orcid(session, orcid_url)
                    if orcid_res:
                        email, source = orcid_res
                        record["emails"].add(email)
                        record["email_source"] = source
                        print(f"  [{i}/{target_count}] Found via ORCID for {author_name}: {email}")
                        break

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

    topic_raw = SEARCH_TERMS[0] if SEARCH_TERMS else "researchers"
    topic_slug = re.sub(r"[^A-Za-z0-9]+", "_", topic_raw).strip("_") or "researchers"
    today_str = datetime.now().strftime("%Y-%m-%d")

    # 1. Output file for this specific extraction: data/YYYY-MM-DD/{Topic}_{YYYY-MM-DD}.csv
    output_file = TODAY_DIR / f"{topic_slug}_{today_str}.csv"

    # 2. Topic queue: data/{Topic}_needto_extract.csv
    needto_file = DATA_DIR / f"{topic_slug}_needto_extract.csv"

    written_rows = []
    with output_file.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
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

            row_data = {
                "researcher_name": record["name"],
                "openalex_author_id": author_id,
                "orcid": "; ".join(sorted(record["orcid"])),
                "affiliations_seen_on_matching_papers": "; ".join(sorted(record["institutions"])),
                "matched_search_terms": "; ".join(sorted(record["search_terms"])),
                "matching_paper_count": len(papers),
                "latest_matching_paper_year": latest_year or "",
                "example_papers": examples,
                "example_paper_dois": dois,
                "professional_email": primary_email,
                "email_source_url": email_source,
                "review_status": status,
            }
            writer.writerow(row_data)
            written_rows.append(row_data)

    print(f"\nUnique researcher candidates: {len(researchers)}")
    print(f"📁 Daily extraction saved to: {output_file}")

    # Synchronize with topic queue: data/{Topic}_needto_extract.csv
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

    needto_exists = needto_file.exists()
    added_to_needto = 0
    with needto_file.open("a" if needto_exists else "w", newline="", encoding="utf-8-sig") as nf:
        writer_need = csv.DictWriter(nf, fieldnames=columns)
        if not needto_exists:
            writer_need.writeheader()

        for r in written_rows:
            if r["openalex_author_id"] not in existing_ids:
                writer_need.writerow(r)
                existing_ids.add(r["openalex_author_id"])
                added_to_needto += 1

    print(f"📁 Topic queue updated: {needto_file.name} (Added {added_to_needto:,} fresh candidates, Total: {len(existing_ids):,})")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1].strip():
        SEARCH_TERMS = [sys.argv[1].strip()]
    if len(sys.argv) > 2 and sys.argv[2].isdigit():
        MAX_PAGES_PER_TERM = int(sys.argv[2])
    if len(sys.argv) > 3 and sys.argv[3].strip():
        FROM_DATE = sys.argv[3].strip()
    if len(sys.argv) > 4 and sys.argv[4].strip():
        TO_DATE = sys.argv[4].strip()
    main()


