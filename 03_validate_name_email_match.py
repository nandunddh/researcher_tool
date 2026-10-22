import csv
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

# --------------------------------------------------
# SETTINGS
# --------------------------------------------------

FOLDER = Path(__file__).parent / "data"

# Can accept either .xlsx or .csv:
DEFAULT_INPUT = FOLDER / "Physical_Chemistry_22_10_2026.xlsx"
OUTPUT_FILE = FOLDER / "Physical_Chemistry_22_10_2026_verified.csv"


def load_xlsx(file_path):
    """Pure Python reader for .xlsx without requiring openpyxl or pandas."""
    with zipfile.ZipFile(file_path, "r") as z:
        shared_strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in tree.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                text = "".join(
                    t.text or ""
                    for t in si.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                )
                shared_strings.append(text)

        sheet_tree = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        ns = {"ns": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        raw_rows = []
        for row in sheet_tree.findall(".//ns:row", ns):
            row_vals = {}
            for c in row.findall("ns:c", ns):
                col_ref = re.sub(r"[0-9]", "", c.get("r", ""))
                t = c.get("t")
                v = c.find("ns:v", ns)
                val = v.text if v is not None else ""
                if t == "s" and val.isdigit() and int(val) < len(shared_strings):
                    val = shared_strings[int(val)]
                row_vals[col_ref] = val
            raw_rows.append(row_vals)

    if not raw_rows:
        return [], []

    col_order = sorted(raw_rows[0].keys(), key=lambda x: (len(x), x))
    headers = [raw_rows[0].get(c, "").strip() for c in col_order]

    data_rows = []
    for r in raw_rows[1:]:
        data_rows.append({headers[i]: r.get(c, "").strip() for i, c in enumerate(col_order)})

    return headers, data_rows


def load_csv(file_path):
    """Standard CSV reader."""
    with file_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = list(reader.fieldnames or [])
        rows = list(reader)
    return headers, rows


def normalize_text(text):
    """Lowercase and remove accents/diacritics (e.g., Joaquín -> joaquin)."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", str(text))
    ascii_text = normalized.encode("ASCII", "ignore").decode("utf-8")
    return ascii_text.lower().strip()


def extract_name_parts(full_name):
    """Extract clean first, last, and middle tokens and initials from author name."""
    clean = normalize_text(full_name)
    clean = re.sub(r"\b(dr|prof|phd|md|bsc|msc|mr|mrs|ms)\b\.?", "", clean)
    words = re.findall(r"[a-z]+", clean)

    if not words:
        return "", "", [], ""

    first_name = words[0]
    last_name = words[-1]
    # Collect initials: e.g. for ['william', 'h', 'green'] -> 'wh'
    initials = "".join(w[0] for w in words[:-1])
    return first_name, last_name, words, initials


def check_name_email_match(name, email, affiliations=""):
    """
    Check if the researcher's name matches the email address handle.
    Returns (status, match_reason)
    """
    if not email or str(email).lower() in {"nan", "none", "null", ""}:
        return "no_email", "No email present"

    email_list = [e.strip().lower() for e in str(email).split(";") if "@" in e]
    if not email_list:
        return "invalid_email", "Malformed email string"

    first_name, last_name, name_tokens, initials = extract_name_parts(name)
    if not last_name:
        return "unverified", "Could not parse author name"

    for single_email in email_list:
        handle, _, domain = single_email.partition("@")
        clean_handle = re.sub(r"[^a-z]", "", normalize_text(handle))

        # 1. Exact or partial Last Name match (e.g. green, whgreen, green.w)
        if last_name in clean_handle:
            if first_name and first_name in clean_handle:
                return "matched", f"Exact: Both '{first_name}' and '{last_name}' in handle"
            if initials and (initials + last_name) in clean_handle:
                return "matched", f"Exact: Initials+Last '{initials + last_name}' in handle"
            return "matched", f"Strong: Last name '{last_name}' found in handle"

        # 2. First initial + Last Name (e.g. 'jbarroso', 'wgreen')
        if first_name:
            initial_last = first_name[0] + last_name
            if initial_last in clean_handle:
                return "matched", f"Strong: Initial+Last '{initial_last}' in handle"

            last_initial = last_name + first_name[0]
            if last_initial in clean_handle:
                return "matched", f"Strong: Last+Initial '{last_initial}' in handle"

        # 3. Check any token of a compound name (e.g., 'Barroso-Flores' -> 'barroso' or 'flores')
        for token in name_tokens:
            if len(token) >= 4 and token in clean_handle:
                return "matched", f"Partial: Name token '{token}' in handle"

        # 4. Check if First Name is prominent (e.g. 'ralfk@hawaii.edu' for Ralf I. Kaiser)
        if first_name and len(first_name) >= 3 and first_name in clean_handle:
            return "matched", f"Moderate: First name '{first_name}' in handle"

    # 5. Domain / Institution match check (lab/coauthor correspondence)
    clean_affils = normalize_text(affiliations)
    domain_root = domain.split(".")[-2] if "." in domain else ""
    if len(domain_root) >= 4 and domain_root in clean_affils:
        return "coauthor_or_lab", f"Institution domain '{domain_root}' matches affiliation, but handle is different"

    return "unmatched", "Handle does not contain author name (likely paper co-author/PI email)"


def main():
    input_path = DEFAULT_INPUT
    if not input_path.exists():
        # Fallback to finding the newest file in data folder
        candidates = sorted(FOLDER.glob("Physical_Chemistry*"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidates:
            candidates = sorted(FOLDER.glob("researchers_with_emails*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidates:
            raise SystemExit(f"No input file found in {FOLDER}")
        input_path = candidates[0]

    print(f"Reading: {input_path}")
    print(f"Output will be saved to: {OUTPUT_FILE}")

    # Load file based on extension
    if input_path.suffix.lower() == ".xlsx":
        fieldnames, rows = load_xlsx(input_path)
    else:
        fieldnames, rows = load_csv(input_path)

    # Add new verification columns
    new_cols = ["name_email_match", "match_confidence_reason"]
    for col in new_cols:
        if col not in fieldnames:
            fieldnames.append(col)

    total = len(rows)
    matched_count = 0
    coauthor_count = 0
    unmatched_count = 0
    no_email_count = 0

    for row in rows:
        name = row.get("researcher_name", "")
        email = row.get("professional_email", "")
        affils = row.get("affiliations_seen_on_matching_papers", "")

        status, reason = check_name_email_match(name, email, affils)
        row["name_email_match"] = status
        row["match_confidence_reason"] = reason

        if status == "matched":
            matched_count += 1
        elif status == "coauthor_or_lab":
            coauthor_count += 1
        elif status == "unmatched":
            unmatched_count += 1
        elif status == "no_email":
            no_email_count += 1

    with OUTPUT_FILE.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    emails_total = matched_count + coauthor_count + unmatched_count

    print("\n" + "=" * 55)
    print("NAME & EMAIL MATCH VERIFICATION COMPLETE")
    print("=" * 55)
    print(f"Total Researchers in File   : {total}")
    print(f"Total with Email Present    : {emails_total}")
    print(f"  -> Direct Name Matched    : {matched_count} ({matched_count/max(emails_total,1)*100:.1f}%)")
    print(f"  -> Lab/Co-Author Domain   : {coauthor_count}")
    print(f"  -> Unmatched / PI Email   : {unmatched_count}")
    print(f"No Email Found              : {no_email_count}")
    print("=" * 55)
    print(f"Results saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
