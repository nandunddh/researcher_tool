# Global Research Databases & Free API Catalog
**Automated Academic & Clinical Researcher Outreach Directory**

This catalog outlines all 21 verified scientific databases, preprint servers, and government grant registries offering free API access for extracting researcher contacts, affiliations, and verified institutional emails.

---

## 📊 Master Database Matrix

| # | Source / Database | Status | Best Fields / Category | Database Size | Free API Access & Limits | Key Email / Contact Advantage |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **OpenAlex** | `ACTIVE (01)` | Universal (Chemistry, Physics, Materials, AI, Bio) | 250M+ | 100,000 / day (Free) | Largest database globally; clean author IDs & ORCIDs |
| **2** | **ORCID Public API** | `ACTIVE (02)` | All Disciplines | 18M+ authors | ~24 / sec (No key needed) | 100% direct personal emails registered by researchers |
| **3** | **Crossref REST API** | `ACTIVE (02)` | Peer-Reviewed Journals (ACS, RSC, Wiley, Elsevier) | 150M+ | Polite pool (Free email header) | Official corresponding author contact from publishers |
| **4** | **Europe PMC** | `ACTIVE (02)` | Biology, Chemistry, Medicine | 45M+ | Unlimited (No key needed) | Full-text XML manuscript author emails |
| **5** | **bioRxiv / medRxiv** | `ACTIVE (Script)` | Cell Biology, Cancer, Genetics, COVID | 3M+ | Free public API | Fresh preprints weeks before peer-reviewed publication |
| **6** | **PubMed / NCBI** | `CAN ADD` | Medicine, Clinical Trials, Pharma, Oncology | 36M+ | 10 / sec (Free instant API key) | Extremely high email density in author affiliations |
| **7** | **NIH RePORTER** | `CAN ADD` | Biomedical, Chemistry, Biotech, Health Grants | $30B+ in Grants | 100% Free (`api.reporter.nih.gov`) | Gives direct Principal Investigator (PI) emails with active grant money! |
| **8** | **ClinicalTrials.gov** | `CAN ADD` | Clinical Medicine, Oncology, Vaccines, Pharma | 450k+ Trials | 100% Free REST API (v2) | Contains direct Study Director emails and phone numbers |
| **9** | **ChemRxiv** | `CAN ADD` | Physical Chemistry, Organic, Polymers, Nano | 250k+ | Free public API (No key needed) | Dedicated pure chemistry preprints from ACS & RSC |
| **10** | **ScienceDirect** | `CAN ADD` | Materials, Chemical Physics, Energy, Engineering | 19M+ | Free API key (`dev.elsevier.com`) | Official correspondence records directly from Elsevier journals |
| **11** | **arXiv** | `CAN ADD` | Physics, Quantum, Math, AI, Comp Chem | 2.4M+ | Free public API (Cornell Univ) | Direct author emails from top institutes (MIT, Stanford, Cambridge) |
| **12** | **Semantic Scholar** | `CAN ADD` | AI, Neuroscience, Computer Science | 215M+ | Free API key (Allen Institute) | AI-powered author disambiguation & verified profile links |
| **13** | **CORE** | `CAN ADD` | All Sciences (Global University Repositories) | 200M+ | Free API key (10 calls/sec) | Full-text papers harvested directly from university library servers |
| **14** | **CORDIS** | `CAN ADD` | EU Research (Horizon Europe, Clean Energy, Nano) | 150k+ Projects | 100% Free Open Data API | Direct contact details for funded European research coordinators |
| **15** | **Unpaywall** | `CAN ADD` | All Sciences (Open-Access link finder) | 50M+ | 50,000 / day (Free) | Finds free legal full-text XML/PDF links for paywalled DOIs |
| **16** | **Springer Nature** | `CAN ADD` | Nature journals, Springer, BioMed Central | 15M+ | Free API key (`dev.springernature.com`) | Official correspondence data from Nature & Springer journals |
| **17** | **DOAJ** | `CAN ADD` | Global Open Access Journals (130 countries) | 10M+ Articles | 100% Free Public API (`doaj.org/api`) | High-quality open-access journal metadata and author contacts |
| **18** | **IEEE Xplore** | `CAN ADD` | Electrical Engineering, Robotics, AI, Nanotech | 5M+ | Free API key (`developer.ieee.org`) | The #1 global database for engineering and technology papers |
| **19** | **HAL Archives** | `CAN ADD` | European Science (France, CNRS, EU projects) | 3.5M+ | 100% Free Public API | Official EU/French national research papers with author emails |
| **20** | **Zenodo** | `CAN ADD` | CERN Physics, Space, Data Science, Chemistry | 3M+ | 100% Free REST API (CERN) | Direct researcher and lab contact details from CERN-hosted research |
| **21** | **The Lens** | `CAN ADD` | Patents & Academic Papers Linked | 200M+ | Free Scholarly API (50 calls/min) | Connects university researchers directly to their commercial patents |

---

## 🎯 Strategic Breakdown by Outreach Value

### Tier 1: Highest Conversion & Budget-Funded Decision Makers
* **NIH RePORTER (`api.reporter.nih.gov`):** Principal Investigators who hold active $500K–$2M US government grants. They have travel and conference attendance budgets explicitly allocated.
* **ClinicalTrials.gov (API v2):** Study Directors and Chief Medical Officers overseeing clinical trials.
* **CORDIS (EU Commission):** Project coordinators and consortium heads for EU Horizon Europe multi-million euro grants.

### Tier 2: Universal High-Volume Journal Paper Authors
* **OpenAlex + Crossref + Europe PMC:** The primary engine currently powering `01_extract_researchers.py` and `02_collect_scholarly_emails.py`. High throughput (~100,000 calls/day free) across all academic disciplines.
* **ORCID Public API:** Authoritative self-maintained personal researcher profiles.

### Tier 3: Field-Specific Publishers & Preprints
* **Physical Chemistry & Nano:** ChemRxiv, ScienceDirect (Elsevier), arXiv (Cornell).
* **Biology & Medicine:** bioRxiv, medRxiv, PubMed / NCBI, Springer Nature.
* **Engineering & Technology:** IEEE Xplore, The Lens (Patents + Papers).
