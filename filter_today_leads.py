import csv
import sys
from pathlib import Path

# Force UTF-8 stdout on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

biorxiv_file = Path("data/2026-10-22/biorxiv_cellbio_send_ready.csv")
today_file = Path("data/2026-10-22/daily_verified_leads_2026-10-22.csv")

clean_today_file = Path("data/2026-10-22/daily_verified_leads_2026-10-22_deduped_only_today.csv")
removed_dups_file = Path("data/2026-10-22/removed_biorxiv_duplicates.csv")

print(f"Reading bioRxiv leads from: {biorxiv_file}")
biorxiv_emails = set()
biorxiv_rows = 0

with open(biorxiv_file, mode="r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.DictReader(f)
    for row in reader:
        biorxiv_rows += 1
        email = (row.get("professional_email") or "").strip().lower()
        if email:
            biorxiv_emails.add(email)

print(f"-> Total bioRxiv rows: {biorxiv_rows}")
print(f"-> Total unique bioRxiv emails: {len(biorxiv_emails)}")

print(f"\nReading Today's verified leads from: {today_file}")
today_clean_rows = []
today_removed_dups = []
seen_today_emails = set()
today_internal_dups = 0
header = None

with open(today_file, mode="r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.DictReader(f)
    header = reader.fieldnames
    total_today_rows = 0
    for row in reader:
        total_today_rows += 1
        email = (row.get("professional_email") or "").strip().lower()
        
        # Check if already seen within today's file itself
        if email in seen_today_emails:
            today_internal_dups += 1
            continue
        seen_today_emails.add(email)
        
        # Check against bioRxiv
        if email in biorxiv_emails:
            today_removed_dups.append(row)
        else:
            today_clean_rows.append(row)

print(f"-> Total Today's rows read: {total_today_rows}")
print(f"-> Internal duplicates within today's file: {today_internal_dups}")
print(f"-> Overlapping bioRxiv duplicates detected: {len(today_removed_dups)}")
print(f"-> Pure today-only verified leads remaining: {len(today_clean_rows)}")

# Write clean today-only file
with open(clean_today_file, mode="w", newline="", encoding="utf-8-sig") as f:
    writer = csv.DictWriter(f, fieldnames=header)
    writer.writeheader()
    writer.writerows(today_clean_rows)

print(f"\nSuccessfully wrote {len(today_clean_rows)} clean leads to:")
print(f"  {clean_today_file.resolve()}")

# Write removed duplicates file for transparency
if today_removed_dups:
    with open(removed_dups_file, mode="w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(today_removed_dups)
    print(f"\nSuccessfully wrote {len(today_removed_dups)} removed duplicate records to:")
    print(f"  {removed_dups_file.resolve()}")

print("\n--- Summary of Removed bioRxiv Leads ---")
for i, r in enumerate(today_removed_dups, 1):
    print(f"{i}. {r.get('researcher_name')} <{r.get('professional_email')}> | {r.get('affiliations_seen_on_matching_papers')}")
