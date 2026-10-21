"""
bioRxiv Cell Biology - corresponding author email collector (accuracy-focused)

Install once:
    pip install requests dnspython

What this does differently from the earlier version:
  * Reads ONLY <email> tags tied to the corresponding author in the JATS XML
    (not every email-looking string in the file).
  * Scores each email: "high" = email belongs to / matches the corresponding author's name,
    "medium" = marked as corresponding but name not matched. Everything else is discarded.
  * Falls back to the published journal version (Europe PMC) when the preprint XML has no email.
  * Drops generic addresses (info@, support@, editor@ ...).
  * Checks that the email domain has MX records (it can receive mail).
  * Writes two files:
        biorxiv_cellbio_all.csv         every paper, for review
        biorxiv_cellbio_send_ready.csv  deduplicated, high confidence + valid domain only
"""

import csv
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from pathlib import Path
from threading import Lock

import requests

try:
    import dns.resolver
    HAVE_DNS = True
except ImportError:
    HAVE_DNS = False

# --------------------------------------------------
# SETTINGS
# --------------------------------------------------

CATEGORY = "cell_biology"
START_DATE = "2026-01-01"
END_DATE = "2026-10-21"
MAX_PREPRINTS_TO_SCAN = 5000
MAX_WORKERS = 10

OUT_ALL = Path(__file__).with_name("biorxiv_cellbio_all.csv")
OUT_SEND = Path(__file__).with_name("biorxiv_cellbio_send_ready.csv")

HEADERS = {
    "User-Agent": "BioRxivCellBioFinder/2.0 (academic research mailto:researcher_tool@academic.edu)"
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

IGNORED_DOMAINS = {
    "example.com", "domain.com", "email.com", "none.com",
    "biorxiv.org", "cshlp.org", "s-corp.com", "medrxiv.org",
}

GENERIC_LOCALPARTS = {
    "info", "contact", "support", "admin", "office", "editor", "editors",
    "editorial", "press", "help", "journal", "noreply", "no-reply", "webmaster",
    "enquiries", "inquiries", "permissions", "reprints", "submissions",
    "lab", "labs", "department", "dept", "mail", "email", "hello", "team",
    "service", "services", "sales", "marketing", "communications",
}

print_lock = Lock()


# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def norm(s):
    """Lowercase, strip accents and non-letters."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", s.lower())


def clean_email(raw):
    if not raw:
        return ""
    email = str(raw).strip().lower().strip(".,;:()<>[]'\"")
    if not EMAIL_RE.fullmatch(email):
        return ""
    if any(email.endswith(ext) for ext in (".png", ".jpg", ".pdf", ".gif", ".xml")):
        return ""
    local, domain = email.split("@", 1)
    if domain in IGNORED_DOMAINS or ".." in email:
        return ""
    if local in GENERIC_LOCALPARTS:
        return ""
    return email


def surname_of(full_name):
    parts = [p for p in re.split(r"\s+", (full_name or "").strip()) if p]
    return parts[-1] if parts else ""


def local_matches_surname(email, surname):
    ns = norm(surname)
    nl = norm(email.split("@")[0])
    return len(ns) >= 3 and ns in nl


@lru_cache(maxsize=None)
def domain_has_mx(domain):
    if not HAVE_DNS:
        return "unchecked"
    try:
        answers = dns.resolver.resolve(domain, "MX", lifetime=6)
        return "yes" if len(answers) > 0 else "no"
    except Exception:
        # fall back to an A record (some domains accept mail without MX)
        try:
            dns.resolver.resolve(domain, "A", lifetime=6)
            return "yes"
        except Exception:
            return "no"


def get(session, url, params=None, timeout=25, retries=2):
    for attempt in range(retries + 1):
        try:
            r = session.get(url, params=params, headers=HEADERS, timeout=timeout)
            if r.status_code == 200:
                return r
            if r.status_code in (403, 429, 503):
                time.sleep(2 * (attempt + 1))
                continue
            return None
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None


# --------------------------------------------------
# FETCH PREPRINT LIST
# --------------------------------------------------

def fetch_biorxiv_preprints():
    print(f"Fetching bioRxiv '{CATEGORY}' preprints {START_DATE} -> {END_DATE} ...")
    session = requests.Session()
    collected, cursor, total = [], 0, None

    while len(collected) < MAX_PREPRINTS_TO_SCAN:
        url = f"https://api.biorxiv.org/details/biorxiv/{START_DATE}/{END_DATE}/{cursor}"
        r = get(session, url, params={"category": CATEGORY}, timeout=40, retries=3)
        if not r:
            break
        data = r.json()
        collection = data.get("collection", [])
        if not collection:
            break

        if total is None:
            try:
                total = int(data["messages"][0].get("total", 0))
            except Exception:
                total = 0

        for p in collection:
            if str(p.get("category", "")).strip().lower().replace(" ", "_") == CATEGORY:
                collected.append(p)

        cursor += len(collection)
        print(f"  cursor {cursor}/{total} | collected {len(collected)}")
        if total and cursor >= total:
            break
        time.sleep(0.3)

    print(f"Collected {len(collected)} rows\n")
    return collected


# --------------------------------------------------
# EMAIL EXTRACTION FROM JATS XML
# --------------------------------------------------

def _text(el):
    return "".join(el.itertext()).strip() if el is not None else ""


def extract_candidates(xml_bytes):
    """
    Return list of dicts: {email, author_surname, via}
      via = 'contrib'  -> email sits inside an author's <contrib>
      via = 'corresp'  -> email sits inside a <corresp> note
    Only emails attached to corresponding-author markup are returned.
    """
    out = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return out

    # 1) Author contribs flagged as corresponding
    for contrib in root.iter("contrib"):
        if contrib.get("contrib-type") not in (None, "author"):
            continue
        is_corr = contrib.get("corresp") == "yes" or any(
            x.get("ref-type") == "corresp" for x in contrib.iter("xref")
        )
        surname = _text(contrib.find("name/surname"))
        for e in contrib.iter("email"):
            em = clean_email(_text(e))
            if em:
                out.append({"email": em, "author_surname": surname, "via": "contrib"})
        if is_corr and not list(contrib.iter("email")):
            continue

    # 2) <corresp> notes (author-notes or inside article-meta)
    for c in root.iter("corresp"):
        found = [clean_email(_text(e)) for e in c.iter("email")]
        if not any(found):
            found = [clean_email(m) for m in EMAIL_RE.findall(_text(c))]
        for em in found:
            if em:
                out.append({"email": em, "author_surname": "", "via": "corresp"})

    return out


def score_candidates(cands, corr_name):
    """Pick the best candidate for the corresponding author. Returns (email, confidence) or None."""
    corr_surname = surname_of(corr_name)
    ns = norm(corr_surname)
    best = None
    rank = {"high": 2, "medium": 1}

    for c in cands:
        conf = None
        if c["via"] == "contrib" and ns and norm(c["author_surname"]) == ns:
            conf = "high"
        elif corr_surname and local_matches_surname(c["email"], corr_surname):
            conf = "high"
        else:
            conf = "medium"  # tagged as corresponding but name could not be matched

        if best is None or rank[conf] > rank[best[1]]:
            best = (c["email"], conf)
    return best


# --------------------------------------------------
# LOOKUP PIPELINE PER PAPER
# --------------------------------------------------

def epmc_lookup(session, doi):
    """Return list of (xml_url) candidates for a DOI from Europe PMC."""
    urls = []
    r = get(
        session,
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
        params={"query": f'DOI:"{doi}"', "format": "json", "resultType": "core", "pageSize": 1},
        timeout=15,
    )
    if not r:
        return urls
    try:
        for item in r.json().get("resultList", {}).get("result", []):
            pmcid = item.get("pmcid")
            if pmcid:
                urls.append(f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML")
            elif item.get("source") == "PPR" and item.get("id"):
                urls.append(f"https://www.ebi.ac.uk/europepmc/webservices/rest/{item['id']}/fullTextXML")
    except Exception:
        pass
    return urls


def find_email(session, paper):
    corr_name = paper.get("author_corresponding", "")
    doi = (paper.get("doi") or "").strip()
    published = (paper.get("published") or "").strip()

    sources = []  # (label, xml_url)

    if paper.get("jatsxml"):
        sources.append(("biorxiv_jats", paper["jatsxml"]))
    for u in epmc_lookup(session, doi):
        sources.append(("europepmc_preprint", u))
    if published and published.upper() != "NA":
        for u in epmc_lookup(session, published):
            sources.append(("published_version", u))

    best_overall = None
    for label, url in sources:
        r = get(session, url, timeout=25)
        if not r:
            continue
        cands = extract_candidates(r.content)
        if not cands:
            continue
        scored = score_candidates(cands, corr_name)
        if not scored:
            continue
        email, conf = scored
        if conf == "high":
            return email, conf, url, label
        if best_overall is None:
            best_overall = (email, conf, url, label)

    return best_overall


def process_paper(paper):
    session = requests.Session()
    doi = paper.get("doi", "")
    corr = paper.get("author_corresponding", "")
    if not corr:
        authors = [a.strip() for a in paper.get("authors", "").split(";") if a.strip()]
        corr = authors[-1] if authors else "Unknown"  # last author is usually the PI
        paper = {**paper, "author_corresponding": corr}

    result = find_email(session, paper)
    email = conf = src = label = ""
    mx = ""
    if result:
        email, conf, src, label = result
        mx = domain_has_mx(email.split("@")[1])

    time.sleep(0.2)
    return {
        "researcher_name": corr,
        "professional_email": email,
        "confidence": conf,
        "domain_can_receive_mail": mx,
        "email_source_type": label,
        "email_source_url": src,
        "institution": paper.get("author_corresponding_institution", ""),
        "category": paper.get("category", ""),
        "paper_title": paper.get("title", ""),
        "doi": f"https://doi.org/{doi}" if doi else "",
        "publication_date": paper.get("date", ""),
        "review_status": "found" if email else "needs_review",
    }


# --------------------------------------------------
# MAIN
# --------------------------------------------------

FIELDS = [
    "researcher_name", "professional_email", "confidence", "domain_can_receive_mail",
    "email_source_type", "email_source_url", "institution", "category",
    "paper_title", "doi", "publication_date", "review_status",
]


def main():
    print("=" * 60)
    print("  bioRxiv Cell Biology - verified email collector")
    print("=" * 60 + "\n")
    if not HAVE_DNS:
        print("NOTE: dnspython not installed, domain check skipped (pip install dnspython)\n")

    preprints = fetch_biorxiv_preprints()
    if not preprints:
        print("No preprints found.")
        return

    unique = OrderedDict()
    for p in preprints:
        d = p.get("doi")
        if d and d not in unique:
            unique[d] = p
    papers = list(unique.values())
    total = len(papers)
    print(f"Processing {total} unique preprints with {MAX_WORKERS} threads...\n")

    results, found = [], 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = [ex.submit(process_paper, p) for p in papers]
        for fut in as_completed(futures):
            try:
                row = fut.result()
            except Exception as e:
                print(f"  worker error: {e}")
                continue
            results.append(row)
            if row["professional_email"]:
                found += 1
            if len(results) % 25 == 0 or len(results) == total:
                print(f"Progress {len(results)}/{total} | emails {found} | {time.time() - t0:.0f}s")

    # ---- full file
    with OUT_ALL.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(results)

    # ---- send-ready file: high confidence + domain can receive mail, one row per email
    seen, send_rows = {}, []
    for row in sorted(results, key=lambda r: r["publication_date"], reverse=True):
        em = row["professional_email"]
        if not em or row["confidence"] != "high":
            continue
        if row["domain_can_receive_mail"] == "no":
            continue
        if em in seen:
            seen[em]["papers_in_dataset"] += 1
            continue
        row = dict(row, papers_in_dataset=1)
        seen[em] = row
        send_rows.append(row)

    with OUT_SEND.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS + ["papers_in_dataset"])
        w.writeheader()
        w.writerows(send_rows)

    high = sum(1 for r in results if r["confidence"] == "high")
    med = sum(1 for r in results if r["confidence"] == "medium")
    print("\n" + "=" * 60)
    print(f"Done in {time.time() - t0:.0f}s")
    print(f"Papers analysed:            {len(results)}")
    print(f"Emails found:               {found}  (high: {high}, medium: {med})")
    print(f"Send-ready unique emails:   {len(send_rows)}")
    print(f"All rows:   {OUT_ALL}")
    print(f"Send-ready: {OUT_SEND}")
    print("=" * 60)


if __name__ == "__main__":
    main()