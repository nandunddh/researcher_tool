```mermaid
flowchart TD
    classDef done fill:#1b5e20,stroke:#4caf50,stroke-width:2px,color:#ffffff;
    classDef output fill:#0d47a1,stroke:#2196f3,stroke-width:2px,color:#ffffff;

    subgraph STAGE_1 ["Stage 1: OpenAlex Extraction (01_extract_researchers.py)"]
        A1["Search OpenAlex (API Key Auth) for papers<br/>(2021-2026) by Conference Topic"]:::done --> A2["Group & Deduplicate Authors Across Papers"]:::done
        A2 --> A3["Extract Author Affiliations & Footnote Emails"]:::done
        A3 --> A4["Output: openalex_researchers.csv"]:::output
    end

    subgraph STAGE_2 ["Stage 2: Verified Scholarly Enrichment (02_collect_scholarly_emails.py)"]
        B1["Input: All Extracted Researchers"]:::done --> B2["Check Public ORCID API Profiles"]:::done
        B2 --> B3["Crossref & Europe PMC Full-Text XML<br/>Lookup via DOIs & Paper Titles"]:::done
        B3 --> B4["Multi-threaded Parallel Checking (10 Workers)"]:::done
        B4 --> B5["Output: researchers_with_emails.csv<br/>★ Verified Academic Emails Ready to Send ★"]:::output
    end

    A4 --> B1
```

---

## The 2-Step Production Pipeline

### **Stage 1: Candidate Discovery & Extraction**
* **File:** `01_extract_researchers.py`
* **What it does:**
  1. Queries the OpenAlex Works API (with your API key) for papers in your conference topics.
  2. Extracts author metadata: names, OpenAlex IDs, ORCID links, and universities.
  3. Deduplicates authors across multiple papers into unique researcher records.
  4. Parses paper affiliation strings for publisher-printed corresponding author emails.
* **Output:** `openalex_researchers.csv`

---

### **Stage 2: Verified Scholarly Enrichment**
* **File:** `02_collect_scholarly_emails.py`
* **What it does:**
  1. Preserves existing emails from Stage 1.
  2. Queries the **ORCID Public API** for verified public profile emails (100% genuine).
  3. Queries **Crossref & Europe PMC full-text XML** by DOIs and titles.
  4. Multi-threaded processing finishes thousands of researchers in 2–3 minutes.
* **Output:** `researchers_with_emails.csv`

---

## How to Run for Any Conference

```powershell
# Step 1: Extract candidate researchers from OpenAlex
python 01_extract_researchers.py

# Step 2: Enrich with verified scholarly emails
python 02_collect_scholarly_emails.py
```

