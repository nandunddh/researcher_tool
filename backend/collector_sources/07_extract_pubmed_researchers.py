"""SOURCE: PubMed (NCBI E-utilities, free). Finds papers on a topic and keeps an author's email only when it is written in
that author's own affiliation line of the record (many journals print "Electronic address: ..." or a plain address there),
exactly one address per author, and not shared with another author of the same paper."""
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from threading import Lock

import requests

STOP_REQUESTED = False
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
# NCBI asks tools to identify themselves; no personal contact details are sent. An API key (optional) raises the limit to 10/s.
TOOL = {"tool": "sciprospect"}
HEADERS = {"User-Agent": "SciProspectPubMed/1.0 (academic research)"}
PAGE = 100
MAX_OFFSET = 9900  # esearch cannot page past 10,000 results
DELAY = 0.12 if os.environ.get("NCBI_API_KEY") else 0.4  # 10 requests/s with a key, 3/s without

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", re.IGNORECASE)
IGNORED_DOMAINS = {"example.com", "domain.com", "email.com", "none.com", "ncbi.nlm.nih.gov", "nlm.nih.gov", "github.com"}
output_lock = Lock()


def request_stop():
    global STOP_REQUESTED
    STOP_REQUESTED = True


def clean_email(value):
    match = EMAIL_PATTERN.search((value or "").strip().rstrip(".,;:)'\"]>"))
    if not match:
        return ""
    found = match.group(0).lower().rstrip(".")
    return "" if found.split("@")[-1] in IGNORED_DOMAINS else found


def _text(node):
    return " ".join("".join(node.itertext()).split()) if node is not None else ""


def parse_articles(xml_text):
    """PubMed efetch XML -> [{pmid, title, abstract, year, doi, authors: [{name, orcid, affiliations}]}]."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    articles = []
    for art in root.iter("PubmedArticle"):
        citation = art.find("MedlineCitation")
        if citation is None:
            continue
        article = citation.find("Article")
        year = (article.findtext("Journal/JournalIssue/PubDate/Year") or article.findtext("ArticleDate/Year") or "") if article is not None else ""
        doi = next((_text(i) for i in art.iterfind("PubmedData/ArticleIdList/ArticleId") if i.get("IdType") == "doi"), "")
        authors = []
        for au in (article.iterfind("AuthorList/Author") if article is not None else []):
            last, first = _text(au.find("LastName")), _text(au.find("ForeName"))
            if not last or not first:
                continue  # collective names and single-name entries cannot be matched to a person
            orcid = next((_text(i).replace("https://orcid.org/", "") for i in au.iterfind("Identifier") if i.get("Source") == "ORCID"), "")
            authors.append({"name": f"{first} {last}", "orcid": orcid, "affiliations": [_text(a) for a in au.iterfind("AffiliationInfo/Affiliation")]})
        articles.append({"pmid": _text(citation.find("PMID")), "title": _text(article.find("ArticleTitle")) if article is not None else "",
                         "abstract": _text(article.find("Abstract")) if article is not None else "", "year": int(year) if year.isdigit() else 0,
                         "doi": doi, "authors": authors})
    return articles


def _strip_email(affiliation):
    """The affiliation text without the address and its 'Electronic address:' label."""
    text = EMAIL_PATTERN.sub("", affiliation)
    text = re.sub(r"(?i)\b(electronic address|e-?mail|correspondence|corresponding author)\b\s*:?", "", text)
    return re.sub(r"\s+", " ", text).strip(" .;,:-")


def match_score(keyword, title, abstract, year, own_line_email, name_matches):
    """0-100: topic relevance (0-40), email integrity (0-40), recency and authority (0-20)."""
    tokens = [w for w in re.findall(r"\w+", keyword.lower()) if len(w) > 2]
    t, a = title.lower(), abstract.lower()
    parts = []
    if keyword.lower().strip() in t:
        pts = 40; parts.append("Exact keyword in title (+40)")
    elif any(w in t for w in tokens):
        pts = min(35, 20 + 8 * sum(w in t for w in tokens)); parts.append(f"Keyword words in title (+{pts})")
    elif any(w in a for w in tokens):
        pts = 20; parts.append("Keyword words in abstract (+20)")
    else:
        pts = 15; parts.append("Broad topic match (+15)")
    score = pts
    if own_line_email:
        score += 30; parts.append("Email in the author's own affiliation (+30)")
    if name_matches:
        score += 10; parts.append("Email matches the author's name (+10)")
    recent = 10 if year >= datetime.now().year else 8 if year >= datetime.now().year - 1 else 4
    score += recent + 10  # a printed address marks the corresponding author
    parts.append(f"Recent paper (+{recent}); Corresponding author (+10)")
    return min(100, score), "; ".join(parts)


def leads_from_article(article, keyword, min_score):
    """Contacts of one paper: authors with exactly one own address that no other author of the paper claims."""
    claimed = {}
    for au in article["authors"]:
        for e in {clean_email(m) for m in EMAIL_PATTERN.findall(" ".join(au["affiliations"]))} - {""}:
            claimed.setdefault(e, set()).add(au["name"])
    from collector_identity import name_matches_email
    rows = []
    for au in article["authors"]:
        mine = {e for e, names in claimed.items() if au["name"] in names}
        if len(mine) != 1:
            continue
        email = next(iter(mine))
        if len(claimed[email]) > 1 and not name_matches_email(au["name"], email):
            continue  # shared by several authors and not clearly this person's
        score, breakdown = match_score(keyword, article["title"], article["abstract"], article["year"], True, name_matches_email(au["name"], email))
        if score < min_score:
            continue
        affiliation = " | ".join(x for x in (_strip_email(a) for a in au["affiliations"]) if x)[:300] or "Research institution"
        rows.append({
            "researcher_name": au["name"], "professional_email": email, "affiliation": affiliation, "orcid": au["orcid"],
            "match_score": score, "match_rating": f"{'Excellent' if score >= 85 else 'Strong' if score >= 70 else 'Candidate'} Match ({score}/100)",
            "score_breakdown": breakdown, "data_source": "PubMed", "matched_paper_title": article["title"], "publication_year": article["year"] or "",
            "doi": f"https://doi.org/{article['doi']}" if article["doi"] else "", "search_keyword": keyword, "review_status": "author_linked",
            "email_source_url": f"https://pubmed.ncbi.nlm.nih.gov/{article['pmid']}/",
        })
    return rows


def _get(path, params):
    for attempt in range(3):
        resp = requests.get(f"{EUTILS}/{path}", params={**TOOL, **({"api_key": os.environ["NCBI_API_KEY"]} if os.environ.get("NCBI_API_KEY") else {}), **params},
                            headers=HEADERS, timeout=30)
        if resp.status_code == 429:
            time.sleep(1.5 * (attempt + 1)); continue
        resp.raise_for_status()
        return resp
    raise RuntimeError("PubMed is rate limiting requests; partial results retained")


STOP_WORDS = {"and", "or", "not", "the", "of", "in", "for", "with", "on", "a", "an", "to", "by"}


def build_term(keyword):
    """Every word of the topic must be in the title or abstract (PubMed's default term mapping is far looser).
    Text that already uses PubMed syntax (quotes or [fields]) is passed through unchanged."""
    if any(c in keyword for c in '"['):
        return keyword
    words = [w for w in re.findall(r"[A-Za-z0-9]+", keyword) if w.lower() not in STOP_WORDS][:6]
    return " AND ".join(f"{w}[tiab]" for w in words) or keyword


def search_ids(keyword, from_date, to_date, offset):
    """(ids, total) for one page of papers whose publication date is in the window, newest first."""
    term = f'({build_term(keyword)}) AND ("{from_date.replace("-", "/")}"[PDAT] : "{to_date.replace("-", "/")}"[PDAT])'
    data = _get("esearch.fcgi", {"db": "pubmed", "term": term, "retmax": PAGE, "retstart": offset, "sort": "pub_date", "retmode": "json"}).json()["esearchresult"]
    return data.get("idlist", []), int(data.get("count", 0))


def fetch_articles(ids):
    return parse_articles(_get("efetch.fcgi", {"db": "pubmed", "id": ",".join(ids), "retmode": "xml"}).text)


def run(keyword="cell biology", target_leads=1000, min_score=50, from_date="2025-01-01", to_date="2026-12-31", archive=None, institution=""):
    # institution is applied by archive.save (affiliation match); PubMed records have no country field.
    global STOP_REQUESTED
    STOP_REQUESTED = False
    target_leads, min_score = int(target_leads), int(min_score)
    from_date, to_date = str(from_date)[:10], str(to_date)[:10]
    print(f"[PubMed] '{keyword}' {from_date} to {to_date}, target {target_leads}", flush=True)
    existing, found, offset, scanned = set(), [], 0, 0
    cancelled = lambda: STOP_REQUESTED or (archive is not None and archive.cancelled.is_set())  # noqa: E731
    while len(found) < target_leads and offset <= MAX_OFFSET and not cancelled():
        ids, total = search_ids(keyword, from_date, to_date, offset)
        if not ids:
            break
        time.sleep(DELAY)
        for article in fetch_articles(ids):
            scanned += 1
            for row in leads_from_article(article, keyword, min_score):
                if len(found) >= target_leads or cancelled():
                    break
                with output_lock:
                    if row["professional_email"] in existing:
                        continue
                    existing.add(row["professional_email"])
                    if archive is not None and not archive.save(row):
                        continue
                    found.append(row)
                print(f"[PubMed] {len(found)}/{target_leads} {row['researcher_name']} <{row['professional_email']}> | {row['affiliation'][:40]}", flush=True)
        offset += PAGE
        print(f"[PubMed] scanned {scanned} of {total} papers", flush=True)
        if offset >= total:
            break
        time.sleep(DELAY)
    print(f"[PubMed] Saved {len(found)} contacts", flush=True)
    return {"collected": len(found), "scanned": scanned, "contacts": found if archive is None else []}
