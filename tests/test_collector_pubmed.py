"""PubMed source: parsing, attribution rules, query building and the run loop (no network)."""
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/collector_sources")]

from collect_all import load_source  # noqa: E402

pm = load_source("07_extract_pubmed_researchers.py").__globals__

XML = """<PubmedArticleSet><PubmedArticle>
<MedlineCitation><PMID>111</PMID><Article><Journal><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal>
<ArticleTitle>Single-cell genomics of liver regeneration</ArticleTitle><Abstract><AbstractText>We map cells.</AbstractText></Abstract>
<AuthorList>
 <Author><LastName>Rao</LastName><ForeName>Aisha</ForeName><Identifier Source="ORCID">https://orcid.org/0000-0002-4417-0913</Identifier>
   <AffiliationInfo><Affiliation>Department of Genetics, University of Toronto, Canada. Electronic address: aisha.rao@utoronto.ca.</Affiliation></AffiliationInfo></Author>
 <Author><LastName>Chen</LastName><ForeName>Lin</ForeName><AffiliationInfo><Affiliation>Tsinghua University, Beijing. lab@tsinghua.edu.cn</Affiliation></AffiliationInfo></Author>
 <Author><LastName>Rossi</LastName><ForeName>Marco</ForeName><AffiliationInfo><Affiliation>University of Milan. lab@tsinghua.edu.cn</Affiliation></AffiliationInfo></Author>
 <Author><LastName>Mensah</LastName><ForeName>Kofi</ForeName><AffiliationInfo><Affiliation>University of Ghana. k.mensah@ug.edu.gh; kofi2@ug.edu.gh</Affiliation></AffiliationInfo></Author>
 <Author><CollectiveName>The Consortium</CollectiveName></Author>
 <Author><LastName>Silva</LastName><ForeName>Ana</ForeName><AffiliationInfo><Affiliation>University of Lisbon, Portugal.</Affiliation></AffiliationInfo></Author>
</AuthorList></Article></MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="doi">10.1000/xyz</ArticleId></ArticleIdList></PubmedData>
</PubmedArticle></PubmedArticleSet>"""


class PubMedTests(unittest.TestCase):
    def test_parse_and_attribution_rules(self):
        article = pm["parse_articles"](XML)[0]
        self.assertEqual((article["pmid"], article["year"], article["doi"]), ("111", 2026, "10.1000/xyz"))
        self.assertEqual([a["name"] for a in article["authors"]], ["Aisha Rao", "Lin Chen", "Marco Rossi", "Kofi Mensah", "Ana Silva"])  # collective name dropped
        rows = pm["leads_from_article"](article, "single-cell genomics", 50)
        # Rao: one own address. Chen/Rossi share one address and it matches neither name: both skipped.
        # Mensah has two addresses (ambiguous): skipped. Silva has none.
        self.assertEqual([r["researcher_name"] for r in rows], ["Aisha Rao"])
        row = rows[0]
        self.assertEqual((row["professional_email"], row["orcid"], row["data_source"], row["review_status"]), ("aisha.rao@utoronto.ca", "0000-0002-4417-0913", "PubMed", "author_linked"))
        self.assertEqual(row["affiliation"], "Department of Genetics, University of Toronto, Canada")  # address and label removed
        self.assertEqual(row["doi"], "https://doi.org/10.1000/xyz")
        self.assertGreaterEqual(row["match_score"], 80)

    def test_min_score_and_bad_xml(self):
        article = pm["parse_articles"](XML)[0]
        off_topic = pm["leads_from_article"](article, "quantum chemistry", 90)  # broad match scores 75
        self.assertEqual(off_topic, [])
        self.assertEqual(len(pm["leads_from_article"](article, "quantum chemistry", 70)), 1)
        self.assertEqual(pm["parse_articles"]("<not xml"), [])

    def test_query_requires_every_word(self):
        self.assertEqual(pm["build_term"]("single-cell genomics"), "single[tiab] AND cell[tiab] AND genomics[tiab]")
        self.assertEqual(pm["build_term"]("the biology of cells"), "biology[tiab] AND cells[tiab]")
        self.assertEqual(pm["build_term"]('"cell biology"[tiab]'), '"cell biology"[tiab]')  # PubMed syntax passes through

    def test_run_saves_through_the_archive_and_dedupes(self):
        class FakeArchive:
            cancelled = threading.Event()
            saved = []
            def save(self, row):
                self.saved.append(row["professional_email"])
                return True
        archive = FakeArchive()
        article = pm["parse_articles"](XML)[0]
        with patch.dict(pm, search_ids=lambda *a: (["111", "111"], 2), fetch_articles=lambda ids: [article, article], DELAY=0):
            result = pm["run"](keyword="single-cell genomics", target_leads=5, from_date="2026-01-01", to_date="2026-11-23", archive=archive)
        self.assertEqual(archive.saved, ["aisha.rao@utoronto.ca"])  # same email twice -> once
        self.assertEqual(result["collected"], 1)


if __name__ == "__main__":
    unittest.main()
